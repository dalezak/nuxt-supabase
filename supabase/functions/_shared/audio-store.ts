// Where generated narration audio lives: Cloudflare R2 when configured,
// Supabase Storage otherwise. One interface, so the narration engine
// (`narration.ts`) never knows which. Lifted from nuxt-meditations 2026-11-04
// along with the engine.
//
// WHY R2: audio is the one cost that grows with free users. A sitting is
// ~13 MB per play, and Supabase bills egress past the plan's allowance
// ($0.09/GB uncached). R2 charges nothing for egress, and a bucket on a custom
// domain sits behind Cloudflare's CDN, so plays are cached at the edge too.
//
// CONFIG — all five, as Edge Function secrets (`supabase secrets set …`):
//
//   R2_ACCOUNT_ID         — Cloudflare account id
//   R2_ACCESS_KEY_ID      — R2 API token (Object Read & Write on the bucket)
//   R2_SECRET_ACCESS_KEY
//   R2_AUDIO_BUCKET       — e.g. lovewell-audio
//   R2_AUDIO_PUBLIC_URL   — the bucket's public base, no trailing slash:
//                           https://audio.lovewell.app in prod (custom domain,
//                           CDN-cached); the bucket's r2.dev URL is fine for dev
//                           (rate-limited, not edge-cached — never for launch).
//
// None set → Supabase Storage, exactly as before. That is the local default:
// nothing changes for `supabase start` until an app opts in per environment.
// SOME but not all set → throws: a half-configured store would quietly write
// to one place and point URLs at another.
//
// Object keys are the same in both stores (`<path>/<voice>-<variant>.mp3`,
// `<path>/<voice>/<i>.mp3`), so the snapshot/restore script moves the same
// files between them (nuxt-meditations/scripts/meditation-audio-cache.mjs).

import { AwsClient } from "npm:aws4fetch@1.0.20";
import { folderPrefix, removeStoragePrefix } from "./storage.ts";

export interface AudioStore {
  kind: "r2" | "supabase";
  put(path: string, bytes: Uint8Array): Promise<void>;
  get(path: string): Promise<Uint8Array>;
  /** Public URL for `path`, with no cache-buster (the caller adds `?v=`). */
  url(path: string): string;
  /** Delete every object under the folder `prefix` (account deletion). Returns
   *  the count; a missing folder is 0. */
  removePrefix(prefix: string): Promise<number>;
}

const R2_VARS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_AUDIO_BUCKET",
  "R2_AUDIO_PUBLIC_URL",
] as const;

// Paths are regenerated in place, but every URL carries a fresh `?v=`, so a
// cached copy can never be served for new audio. That makes a year-long,
// immutable cache safe — and the edge cache is what keeps plays off the bucket.
const CACHE_CONTROL = "public, max-age=31536000, immutable";

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

// Each path segment encoded on its own, so the `/` separators survive.
const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

// Local dev: getPublicUrl returns Supabase's INTERNAL docker host
// (http://kong:8000), unreachable from the browser. Rewrite to the host-facing
// API URL. No-op in prod (real project URL is already browser-accessible).
function hostUrl(url: string): string {
  return url.replace("http://kong:8000", "http://127.0.0.1:54321");
}

function r2Store(env: Record<(typeof R2_VARS)[number], string>): AudioStore {
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });
  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_AUDIO_BUCKET}`;
  const publicBase = env.R2_AUDIO_PUBLIC_URL.replace(/\/+$/, "");

  return {
    kind: "r2",
    async put(path, bytes) {
      const res = await client.fetch(`${endpoint}/${encodePath(path)}`, {
        method: "PUT",
        body: bytes,
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": CACHE_CONTROL },
      });
      if (!res.ok) throw new Error(`R2 put ${path}: ${res.status} ${await res.text()}`);
    },
    async get(path) {
      const res = await client.fetch(`${endpoint}/${encodePath(path)}`);
      if (!res.ok) throw new Error(`R2 get ${path}: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    url: (path) => `${publicBase}/${encodePath(path)}`,
    // ListObjectsV2 by prefix, then one DELETE per key. The batch DeleteObjects
    // call needs a Content-MD5 body; per-key deletes are simpler, and a user's
    // own audio is tens of files, not thousands.
    async removePrefix(prefix) {
      const folder = folderPrefix(prefix);
      let removed = 0;
      let token: string | null = null;
      do {
        const query = new URLSearchParams({ "list-type": "2", prefix: folder });
        if (token) query.set("continuation-token", token);
        const res = await client.fetch(`${endpoint}?${query}`);
        if (!res.ok) throw new Error(`R2 list ${folder}: ${res.status} ${await res.text()}`);
        const xml = await res.text();
        const keys = [...xml.matchAll(/<Key>([^<]*)<\/Key>/g)].map((m) => unescapeXml(m[1]));
        for (const key of keys) {
          const del = await client.fetch(`${endpoint}/${encodePath(key)}`, { method: "DELETE" });
          if (!del.ok && del.status !== 404) throw new Error(`R2 delete ${key}: ${del.status}`);
          removed++;
        }
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
          ? unescapeXml(xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/)?.[1] ?? "") || null
          : null;
      } while (token);
      return removed;
    },
  };
}

// deno-lint-ignore no-explicit-any
function supabaseStore(supabaseAdmin: any, bucket: string): AudioStore {
  return {
    kind: "supabase",
    async put(path, bytes) {
      const { error } = await supabaseAdmin.storage
        .from(bucket)
        .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
      if (error) throw new Error(`upload ${path}: ${error.message}`);
    },
    async get(path) {
      const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
      if (error || !data) throw new Error(`download ${path}: ${error?.message ?? "no data"}`);
      return new Uint8Array(await data.arrayBuffer());
    },
    url: (path) => hostUrl(supabaseAdmin.storage.from(bucket).getPublicUrl(path).data.publicUrl),
    removePrefix: (prefix) => removeStoragePrefix(supabaseAdmin, bucket, prefix),
  };
}

/** The store this environment is configured for. `bucket` names the Supabase
 *  bucket used when R2 isn't configured. */
// deno-lint-ignore no-explicit-any
export function audioStore(supabaseAdmin: any, bucket: string): AudioStore {
  const env = Object.fromEntries(R2_VARS.map((k) => [k, Deno.env.get(k)?.trim() ?? ""]));
  const set = R2_VARS.filter((k) => env[k]);
  if (set.length === R2_VARS.length) return r2Store(env as Record<(typeof R2_VARS)[number], string>);
  if (set.length) {
    const missing = R2_VARS.filter((k) => !env[k]).join(", ");
    throw new Error(`R2 audio storage is partly configured — missing ${missing}`);
  }
  return supabaseStore(supabaseAdmin, bucket);
}
