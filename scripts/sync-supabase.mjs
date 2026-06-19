#!/usr/bin/env node
// Generic Supabase sync for any app that extends the nuxt-* layers.
//
// Run it FROM an app directory (it uses `process.cwd()` as the app root):
//   "supabase": "node ../nuxt-supabase/scripts/sync-supabase.mjs"
// then `supabase db reset` to apply.
//
// What it does:
//   1. Reads the app's `nuxt.config.ts` `extends` — the single source of truth
//      for which layers the app consumes — and copies every `supabase/migrations/
//      *.sql` from each into the app's `supabase/migrations/`. Add a layer to
//      `extends` and its migrations sync automatically; nothing else to update.
//      Layers without a migrations dir (e.g. a pure-UI layer) are skipped.
//   2. Copies every layer's `supabase/functions/_shared/*.ts` (shared edge
//      helpers). Filenames are globally unique across layers — that uniqueness
//      IS the namespace — so this is collision-free; a same-name/different-
//      content clash is loudly warned (and is a convention violation to fix).
//   3. Applies the app's per-app choices from a `"supabaseSync"` field in its
//      `package.json` — kept beside the `"supabase"` script that runs this:
//        "supabaseSync": {
//          // per-function edge functions to adopt from layers — each source
//          // dir's *.ts copies into `supabase/functions/<dir-name>/`. Explicit
//          // because an app can OWN a function of the same name as a layer's
//          // (e.g. notify-reminders), so this can't be blindly auto-derived.
//          "functions": ["../nuxt-friends/supabase/functions/invite-send"]
//        }
//      (Course RLS is NOT here — each app owns its chosen nuxt-courses RLS
//      template variant as a normal migration on its reserved date, the same
//      way apps own any other base-layer extension migration. Copy the variant
//      you want from `nuxt-courses/supabase/migrations/templates/` once.)
//   4. SELF-CLEANS: records every file written to `supabase/.sync-manifest.json`.
//      Next run, anything in the manifest no longer produced by any source (a
//      renamed/removed migration or function) is deleted. App-OWNED files (the
//      app's own seeds, its own edge functions not listed above) are never
//      written here, so they're never in the manifest and never touched.
//
// Pure `node:fs` — no `copyfiles`/binary dependency.

import {
  readdirSync, mkdirSync, copyFileSync, existsSync, statSync, rmSync,
  readFileSync, writeFileSync,
} from 'node:fs';
import { basename, join, relative } from 'node:path';

const APP_ROOT = process.cwd();
const SIBLINGS = join(APP_ROOT, '..');
const MANIFEST = join(APP_ROOT, 'supabase/.sync-manifest.json');

// ── Layers from the app's nuxt.config `extends` ────────────────────────────
function layersFromConfig() {
  const path = join(APP_ROOT, 'nuxt.config.ts');
  if (!existsSync(path)) throw new Error(`No nuxt.config.ts in ${APP_ROOT}`);
  const block = readFileSync(path, 'utf8').match(/extends\s*:\s*\[([\s\S]*?)\]/);
  if (!block) throw new Error('Could not find `extends: [ ... ]` in nuxt.config.ts');
  // Match quoted "../nuxt-foo" entries; take the layer dir name.
  return [...block[1].matchAll(/['"]\.\.\/([^'"/]+)['"]/g)].map((m) => m[1]);
}

// ── Per-app choices from package.json "supabaseSync" (beside the script) ───
function appConfig() {
  const pkg = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8'));
  return pkg.supabaseSync ?? {};
}

// ── Build the copy plan ────────────────────────────────────────────────────
const layers = layersFromConfig();
const { functions = [] } = appConfig();
const plan = [];

// migrations from every consumed layer (a layer without a migrations dir is
// normal — skip it silently via `optional`)
for (const layer of layers) {
  plan.push({ fromDir: join(SIBLINGS, layer, 'supabase/migrations'), ext: '.sql', to: join(APP_ROOT, 'supabase/migrations'), optional: true });
}
// shared edge-function helpers from every consumed layer — filenames are
// globally unique across layers, so this is collision-free (clashes warn).
for (const layer of layers) {
  plan.push({ fromDir: join(SIBLINGS, layer, 'supabase/functions/_shared'), ext: '.ts', to: join(APP_ROOT, 'supabase/functions/_shared'), optional: true });
}
// per-function edge functions (each → supabase/functions/<dir-name>/) — explicit,
// so a missing source dir warns.
for (const fn of functions) {
  plan.push({ fromDir: join(APP_ROOT, fn), ext: '.ts', to: join(APP_ROOT, 'supabase/functions', basename(fn)) });
}

// ── Execute, recording every file written (app-relative paths) ─────────────
const written = new Set();
const sameContent = (a, b) => existsSync(b) && readFileSync(a).equals(readFileSync(b));

for (const e of plan) {
  mkdirSync(e.to, { recursive: true });
  if (e.file) {
    if (!existsSync(e.file)) { console.warn(`! skip missing file: ${relative(APP_ROOT, e.file)}`); continue; }
    const dest = join(e.to, basename(e.file));
    copyFileSync(e.file, dest);
    written.add(relative(APP_ROOT, dest));
    console.log(`  ${relative(APP_ROOT, e.file)} → ${relative(APP_ROOT, dest)}`);
  } else {
    if (!existsSync(e.fromDir)) {
      if (!e.optional) console.warn(`! skip missing dir: ${relative(APP_ROOT, e.fromDir)}`);
      continue;
    }
    let n = 0;
    for (const name of readdirSync(e.fromDir)) {
      const src = join(e.fromDir, name);
      if (!name.endsWith(e.ext) || !statSync(src).isFile()) continue;
      const dest = join(e.to, name);
      const rel = relative(APP_ROOT, dest);
      // Surface a real clash: two sources writing the same filename with
      // DIFFERENT content (e.g. divergent _shared helpers) — last-wins would
      // hide a bug. Identical re-copies are silent.
      if (written.has(rel) && !sameContent(src, dest)) {
        console.warn(`! conflict: ${rel} written by an earlier source with different content (overwriting)`);
      }
      copyFileSync(src, dest);
      written.add(rel);
      n += 1;
    }
    console.log(`  ${relative(SIBLINGS, e.fromDir)}/*${e.ext} → ${relative(APP_ROOT, e.to)} (${n})`);
  }
}

// ── Remove orphans: files we wrote last time but no source produces now ────
let previous = [];
try { previous = JSON.parse(readFileSync(MANIFEST, 'utf8')); } catch { /* first run */ }
for (const rel of previous) {
  if (written.has(rel)) continue;
  const abs = join(APP_ROOT, rel);
  if (existsSync(abs)) { rmSync(abs); console.log(`  removed stale (gone from all layers): ${rel}`); }
}

writeFileSync(MANIFEST, `${JSON.stringify([...written].sort(), null, 2)}\n`);
console.log(`\n✓ synced ${written.size} files from ${layers.length} layers`);
