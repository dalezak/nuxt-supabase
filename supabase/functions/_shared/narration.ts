// Narration engine (ElevenLabs) — turns a script of segments into stitched,
// background-safe mp3 files. Table-agnostic: the caller decides where the
// script comes from and where the returned `voices` / `variants` are saved.
//
// Lifted 2026-11-04 from nuxt-meditations' `meditation-audio.ts` so a second
// kind of script (AnyLearn's lesson recaps) could use it without the meditation
// tables. nuxt-meditations' factories now wrap this.
//
// For each segment it fetches an ElevenLabs mp3 clip, strips its ID3 tag (so
// frames concatenate cleanly), and stitches one file per length variant — clips
// fixed, silence (one second encoded once via lamejs, repeated) scaled by
// `gapMult`. Each variant is a single continuous file, so it plays through a
// locked screen / in the background (per-segment + JS timer stalls when the
// phone sleeps). PCM is ElevenLabs Pro-only, so we stitch mp3. Also records
// each segment's start second per variant (`segment_starts`) for read-along
// captions.
//
// Segments are `{ text, seconds?, pause? }`:
//   - `seconds` — the segment's whole length; the silence after the clip is
//     whatever the spoken line leaves of it (meditations: spaciousness).
//   - `pause`   — explicit silence after the clip, in seconds. Wins over
//     `seconds` (recaps: a beat between ideas, whatever the line's length).
//   - no `text` — a pure pause of `seconds`.
//
// Usage:
//   const voice = resolveVoice({ voiceId: "…", bucket: "lesson-audio" });
//   const { voices, variants } = await narrateSegments(supabaseAdmin,
//     { path: `lessons/${id}`, segments }, voice, apiKey);
//
// Files go through `audio-store.ts` (Cloudflare R2 when its five `R2_*` secrets
// are set, the Supabase bucket otherwise).

import { audioStore } from "./audio-store.ts";
import { Mp3Encoder } from "npm:@breezystack/lamejs";

const SAMPLE_RATE = 44100;                       // ElevenLabs default mp3 is mp3_44100_128
const MP3_KBPS = 128;
const MP3_BYTES_PER_SEC = (MP3_KBPS * 1000) / 8; // 16000 — CBR, for clip-length estimate

const DEFAULT_VARIANTS = [
  { slug: "short", label: "Short", gapMult: 1 },
  { slug: "medium", label: "Medium", gapMult: 1.5 },
  { slug: "long", label: "Long", gapMult: 2 },
];

export interface VoiceConfig {
  voiceId: string;
  voiceSlug?: string;
  voiceName?: string;
  modelId?: string;
  voiceSettings?: Record<string, unknown>;
  // Storage bucket (Supabase) — R2 uses its own `R2_AUDIO_BUCKET` instead.
  bucket: string;
  variants?: { slug: string; label: string; gapMult: number }[];
}

export interface ResolvedVoice {
  voiceId: string;
  voiceSlug: string;
  voiceName: string;
  modelId: string;
  voiceSettings: Record<string, unknown>;
  bucket: string;
  variantDefs: { slug: string; label: string; gapMult: number }[];
}

export function resolveVoice(config: VoiceConfig): ResolvedVoice {
  return {
    voiceId: config.voiceId,
    voiceSlug: config.voiceSlug ?? "studio",
    voiceName: config.voiceName ?? "Studio",
    modelId: config.modelId ?? "eleven_multilingual_v2",
    voiceSettings: config.voiceSettings ?? { stability: 0.5, similarity_boost: 0.75 },
    bucket: config.bucket,
    variantDefs: config.variants ?? DEFAULT_VARIANTS,
  };
}

export type NarrationSegment = { text?: string; seconds?: number; pause?: number };

export type NarrationVariant = {
  slug: string;
  label: string;
  audio_url: string;
  seconds: number;
  segment_starts: number[];
};

export type NarrationOutput = {
  // `[{ slug, name, gender, audio_url, segment_urls, variants }]` — the shape
  // nuxt-meditations' player reads; `audio_url` is the medium (else first)
  // variant.
  voices: Record<string, unknown>[];
  variants: NarrationVariant[];
  segmentUrls: string[];
};

// `{ stage: "voice" | "mix", done, total }` — spoken lines narrated so far.
export type NarrationProgress = (progress: { stage: string; done: number; total: number }) => Promise<void> | void;

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

// Strip ID3 tags so only raw MPEG frames remain — essential before concatenating
// (ElevenLabs/Lavf prefixes each clip with an ID3v2 tag; left mid-stream they
// break frame-sync and players stop early).
function stripId3(b: Uint8Array): Uint8Array {
  let start = 0;
  if (b.length > 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {   // "ID3"
    const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
    start = 10 + size;
  }
  let end = b.length;
  if (end - start >= 128 && b[end - 128] === 0x54 && b[end - 127] === 0x41 && b[end - 126] === 0x47) {   // "TAG"
    end -= 128;
  }
  return b.subarray(start, end);
}

// Remove a leading Xing/Info/VBRI header frame. ElevenLabs/LAME prefixes each mp3
// clip with a metadata-only frame whose tag declares that CLIP's frame count.
// Concatenated, the first clip's tag ends up at the front of the stitched file,
// so players read the whole file's duration as just the first clip (a few
// seconds) — audio keeps playing but currentTime/duration cap there, freezing
// the timer and captions. Dropping the tag frame makes players fall back to CBR
// estimation (fileSize / bitrate) = the true duration. Called on every clip so no
// stray tag frames survive mid-stream either.
const MPEG1_L3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG1_SR = [44100, 48000, 32000, 0];
function stripXing(b: Uint8Array): Uint8Array {
  if (b.length < 4 || b[0] !== 0xff || (b[1] & 0xe0) !== 0xe0) return b;
  const version = (b[1] >> 3) & 0x3;                 // 3 = MPEG1
  const kbps = MPEG1_L3_KBPS[(b[2] >> 4) & 0xf] * 1000;
  const sr = MPEG1_SR[(b[2] >> 2) & 0x3];
  const padding = (b[2] >> 1) & 0x1;
  if (version !== 3 || !kbps || !sr) return b;
  const frameLen = Math.floor((144 * kbps) / sr) + padding;
  if (frameLen <= 0 || frameLen > b.length) return b;
  const region = b.subarray(0, Math.min(frameLen, 200));
  const tags = [[0x58, 0x69, 0x6e, 0x67], [0x49, 0x6e, 0x66, 0x6f], [0x56, 0x42, 0x52, 0x49]]; // Xing / Info / VBRI
  for (let i = 0; i + 4 <= region.length; i += 1) {
    for (const t of tags) {
      if (region[i] === t[0] && region[i + 1] === t[1] && region[i + 2] === t[2] && region[i + 3] === t[3]) {
        return b.subarray(frameLen);   // drop the whole tag frame
      }
    }
  }
  return b;
}

// One second of silent mp3 (same format as the clips) — repeated to build gaps.
function silentSecondMp3(): Uint8Array {
  const enc = new Mp3Encoder(1, SAMPLE_RATE, MP3_KBPS);
  const block = new Int16Array(1152);   // zeros
  const out: Uint8Array[] = [];
  const frames = Math.ceil(SAMPLE_RATE / 1152);
  for (let i = 0; i < frames; i += 1) {
    const b = enc.encodeBuffer(block);
    if (b.length > 0) out.push(new Uint8Array(b));
  }
  const f = enc.flush();
  if (f.length > 0) out.push(new Uint8Array(f));
  return concatBytes(out);
}

async function elevenLabsMp3(
  text: string,
  apiKey: string,
  voiceId: string,
  modelId: string,
  voiceSettings: Record<string, unknown>,
): Promise<Uint8Array> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", "Accept": "audio/mpeg" },
    body: JSON.stringify({ text, model_id: modelId, voice_settings: voiceSettings }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  return new Uint8Array(await res.arrayBuffer());
}

// Spoken characters in a script — what ElevenLabs bills, for logging.
export function narrationCharacters(segments: NarrationSegment[]): number {
  return segments.reduce((n, seg) => n + String(seg?.text ?? "").trim().length, 0);
}

// Narrate `segments` under storage prefix `path` and stitch the variants.
// Throws on failure; nothing is saved to any table — that's the caller's.
export async function narrateSegments(
  supabaseAdmin: any,
  script: { path: string; segments: NarrationSegment[] },
  voice: ResolvedVoice,
  apiKey: string,
  {
    // Re-stitch from the clips already in storage instead of narrating again.
    // Use when only the PAUSES change — the spoken lines are identical, so
    // re-narrating would spend the character pool to reproduce them exactly.
    reuseClips = false,
    onProgress,
  }: { reuseClips?: boolean; onProgress?: NarrationProgress } = {},
): Promise<NarrationOutput> {
  const { voiceId, voiceSlug, voiceName, modelId, voiceSettings, bucket, variantDefs } = voice;
  const segments = Array.isArray(script.segments) ? script.segments : [];

  // Cache-bust: object paths are stable, so a re-generation would be masked by
  // the browser's cached copy. A per-run version query forces a fresh fetch.
  const version = Date.now();
  // R2 when configured, Supabase Storage otherwise — see audio-store.ts.
  const store = audioStore(supabaseAdmin, bucket);
  const pub = (path: string) => `${store.url(path)}?v=${version}`;

  const silence1s = silentSecondMp3();
  const segmentUrls: string[] = [];
  const clips: { frames: Uint8Array; baseGap: number }[] = [];

  // Counted in SPOKEN lines — a silent segment is a pause, not a line.
  const total = segments.filter((seg) => String(seg?.text ?? "").trim()).length;
  let done = 0;
  await onProgress?.({ stage: "voice", done, total });

  for (let i = 0; i < segments.length; i += 1) {
    const segText = String(segments[i]?.text ?? "").trim();
    const segSeconds = Math.max(0, Number(segments[i]?.seconds) || 0);
    const segPause = segments[i]?.pause;

    if (!segText) {
      clips.push({ frames: new Uint8Array(0), baseGap: Math.round(segSeconds) });
      segmentUrls.push("");
      continue;
    }

    const clipPath = `${script.path}/${voiceSlug}/${i}.mp3`;

    // RESTITCH: reuse the clip already in storage rather than narrating again.
    //
    // The spoken lines are unchanged when only the SILENCE between them is
    // being retuned, and re-narrating to change a pause would spend the
    // ElevenLabs character pool to produce identical audio. Clip paths are
    // stable (`path/voice/i.mp3`), so they can simply be read back.
    //
    // Throws on a missing clip rather than substituting silence: a "restitch"
    // that quietly dropped a line would be far worse than a failed one.
    let mp3: Uint8Array;
    if (reuseClips) {
      try {
        mp3 = await store.get(clipPath);
      } catch {
        throw new Error(`restitch: clip ${i} missing at ${clipPath} — narrate normally first`);
      }
      segmentUrls.push(pub(clipPath));
    } else {
      mp3 = await elevenLabsMp3(segText, apiKey, voiceId, modelId, voiceSettings);
      await store.put(clipPath, mp3);
      segmentUrls.push(pub(clipPath));
    }

    const clipSec = mp3.length / MP3_BYTES_PER_SEC;
    const baseGap = typeof segPause === "number"
      ? Math.max(0, Math.round(segPause))
      : Math.max(0, Math.round(segSeconds - clipSec));
    // stripXing after stripId3: the per-segment clips (segmentUrls, above) keep
    // their own valid header, but the STITCHED frames must not, or the first
    // clip's tag caps the whole file's duration.
    clips.push({ frames: stripXing(stripId3(mp3)), baseGap });
    done += 1;
    await onProgress?.({ stage: "voice", done, total });
  }

  await onProgress?.({ stage: "mix", done, total });

  // Stitch each length variant: clips fixed, silence scaled by gapMult.
  const variants: NarrationVariant[] = [];
  for (const v of variantDefs) {
    const parts: Uint8Array[] = [];
    // `segment_starts[i]` = the second at which segment i begins in this
    // variant's audio — used to sync the read-along caption to playback.
    const segmentStarts: number[] = [];
    let cumSec = 0;
    for (const c of clips) {
      segmentStarts.push(Math.round(cumSec));
      if (c.frames.length) parts.push(c.frames);
      cumSec += c.frames.length / MP3_BYTES_PER_SEC;   // actual clip duration
      const gap = Math.round(c.baseGap * v.gapMult);
      for (let s = 0; s < gap; s += 1) parts.push(silence1s);
      cumSec += gap;
    }
    const stitched = concatBytes(parts);
    const path = `${script.path}/${voiceSlug}-${v.slug}.mp3`;
    await store.put(path, stitched);
    variants.push({ slug: v.slug, label: v.label, audio_url: pub(path), seconds: Math.round(stitched.length / MP3_BYTES_PER_SEC), segment_starts: segmentStarts });
  }

  const defaultUrl = (variants.find((v) => v.slug === "medium") ?? variants[0]).audio_url;
  const voices = [{ slug: voiceSlug, name: voiceName, gender: null, audio_url: defaultUrl, segment_urls: segmentUrls, variants }];

  return { voices, variants, segmentUrls };
}

// Join files the engine already wrote into ONE continuous mp3 — a playlist
// (AnyLearn plays a course's lesson recaps back to back). No TTS: the clips
// are read back from storage, stripped like any clip, and stitched with
// `gapSeconds` of silence between them. One file for the same reason a
// narration is one file: it keeps playing with the screen locked, where
// chaining separate files on the device stalls.
//
// `starts[i]` is the second input i begins at (exact, from byte lengths), so
// a caller can shift each input's own `segment_starts` into the joined file.
export async function joinNarrations(
  supabaseAdmin: any,
  { bucket, inputs, outPath, gapSeconds = 3 }: { bucket: string; inputs: string[]; outPath: string; gapSeconds?: number },
): Promise<{ audio_url: string; seconds: number; starts: number[] }> {
  const store = audioStore(supabaseAdmin, bucket);
  const silence1s = silentSecondMp3();
  const parts: Uint8Array[] = [];
  const starts: number[] = [];
  let cumSec = 0;
  for (let i = 0; i < inputs.length; i += 1) {
    if (i > 0) {
      for (let s = 0; s < gapSeconds; s += 1) parts.push(silence1s);
      cumSec += gapSeconds;
    }
    starts.push(cumSec);
    const frames = stripXing(stripId3(await store.get(inputs[i])));
    parts.push(frames);
    cumSec += frames.length / MP3_BYTES_PER_SEC;
  }
  const joined = concatBytes(parts);
  await store.put(outPath, joined);
  return {
    audio_url: `${store.url(outPath)}?v=${Date.now()}`,
    seconds: Math.round(joined.length / MP3_BYTES_PER_SEC),
    starts,
  };
}
