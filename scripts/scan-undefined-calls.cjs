#!/usr/bin/env node
// Dev tool: find a function that is CALLED in a .vue file but defined nowhere.
//
// Run from the app's root, after `nuxi prepare` (it reads .nuxt/imports.d.ts):
//
//   node ../nuxt-supabase/scripts/scan-undefined-calls.cjs app/pages/tabs/growth/index.vue
//   node ../nuxt-supabase/scripts/scan-undefined-calls.cjs $(find app/pages app/components -name '*.vue')
//
// WHY THIS EXISTS. A page rewrite once sliced out three loaders and left their
// call sites in a `Promise.all`. A bare identifier is a valid global reference
// to every compiler in the stack, so the SFC built clean; at runtime the
// ReferenceError rejected the batch, the loading wrapper swallowed it, and
// every loader queued after it never ran. It read as a product gap — empty
// cards — for several commits rather than as an error.
//
// Calls are read from source with comments and string literals stripped, so
// prose never looks like a call. Definitions are looked for in the RAW source,
// because stripping is lossy and a missed definition here is a false alarm
// that teaches people to ignore the tool.
//
// Exits non-zero when anything is unaccounted for.
// The app's own compiler, so the script needs nothing installed beside it.
const { parse } = require('module').createRequire(require('path').join(process.cwd(), 'package.json'))('@vue/compiler-sfc');
const fs = require('fs');
const path = require('path');

const REGISTRY = path.join(process.cwd(), '.nuxt/imports.d.ts');
const autoImports = fs.existsSync(REGISTRY) ? fs.readFileSync(REGISTRY, 'utf8') : '';
if (!autoImports) {
  console.log('! no .nuxt/imports.d.ts — run the dev server once, or auto-imports will read as undefined\n');
}

// Comments and literals out, so "(up to three)" is not a call to `up`.
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\[\s\S]|\$\{[^{}]*\}|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

const MACROS = new Set(['defineProps', 'defineEmits', 'defineExpose', 'defineModel', 'defineOptions', 'withDefaults', 'defineSlots']);
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof', 'await', 'new', 'delete', 'void', 'throw', 'do', 'else', 'in', 'of', 'yield', 'async', 'get', 'set', 'super', 'import', 'instanceof']);
// Browser and JS globals a .vue file may call without importing anything.
const GLOBALS = new Set(['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'fetch', 'alert', 'confirm', 'prompt', 'queueMicrotask', 'structuredClone', 'encodeURIComponent', 'decodeURIComponent', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'atob', 'btoa']);

let missing = 0;
for (const file of process.argv.slice(2)) {
  let descriptor;
  try {
    ({ descriptor } = parse(fs.readFileSync(file, 'utf8'), { filename: file }));
  } catch (error) {
    console.log(`! ${file}: ${error.message}`);
    continue;
  }
  const raw = descriptor.scriptSetup?.content ?? descriptor.script?.content ?? '';
  if (!raw) continue;
  const code = strip(raw);
  const called = new Set([...code.matchAll(/(?<![.\w$])([a-z][A-Za-z0-9_]*)\s*\(/g)].map(m => m[1]));
  for (const name of called) {
    if (KEYWORDS.has(name) || MACROS.has(name) || GLOBALS.has(name)) continue;
    const defined =
      new RegExp(`(?:function|const|let|var|class)\\s+${name}\\b`).test(raw) ||
      new RegExp(`\\b${name}\\s*[:=]\\s*(?:async\\s*)?(?:function\\b|\\(|[A-Za-z_$])`).test(raw) ||
      new RegExp(`[{,:]\\s*${name}\\s*[,}]`).test(raw) ||         // destructured, incl. renamed (`{ load: loadUsage }`)
      new RegExp(`\\b${name}\\b`).test(autoImports);              // Nuxt auto-import
    if (!defined) {
      console.log(`UNDEFINED  ${file}  ${name}`);
      missing += 1;
    }
  }
}
console.log(missing ? `\n${missing} call${missing === 1 ? '' : 's'} with no definition.` : 'No undefined calls.');
process.exit(missing ? 1 : 0);
