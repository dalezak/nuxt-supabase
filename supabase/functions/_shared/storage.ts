// storage — Supabase Storage helpers for Edge Functions.
//
// `removeStoragePrefix` deletes every object under a folder, at any depth.
// Supabase's `list()` is one level only and returns folders as entries with no
// `id`, so it walks them; `remove()` then takes the collected paths in chunks.
//
//   import { removeStoragePrefix } from "../_shared/storage.ts";
//   await removeStoragePrefix(supabaseAdmin, "avatars", `${userId}/`);
//
// A bucket that doesn't exist counts as empty (returns 0): an app that never
// created it has nothing stored there. Any other error throws.

const LIST_PAGE = 1000;
const REMOVE_CHUNK = 1000;

// "user-1" and "user-10" share a prefix; a trailing slash keeps a folder
// delete from reaching its neighbour.
export function folderPrefix(prefix: string): string {
  const trimmed = prefix.replace(/^\/+/, "");
  if (!trimmed) throw new Error("Refusing to remove an empty prefix (the whole bucket)");
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function isMissingBucket(error: { message?: string; statusCode?: string | number } | null): boolean {
  return !!error && (/bucket not found/i.test(error.message ?? "") || String(error.statusCode) === "404");
}

/** Every object path under `prefix` (a folder), recursively. */
// deno-lint-ignore no-explicit-any
export async function listStoragePrefix(supabaseAdmin: any, bucket: string, prefix: string): Promise<string[]> {
  const folder = folderPrefix(prefix).replace(/\/$/, "");
  const paths: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .list(folder, { limit: LIST_PAGE, offset });
    if (isMissingBucket(error)) return [];
    if (error) throw new Error(`list ${bucket}/${folder}: ${error.message}`);
    for (const entry of data ?? []) {
      const path = `${folder}/${entry.name}`;
      if (entry.id) paths.push(path);
      else paths.push(...await listStoragePrefix(supabaseAdmin, bucket, `${path}/`));
    }
    if ((data ?? []).length < LIST_PAGE) break;
  }
  return paths;
}

/** Delete everything under `prefix` in `bucket`. Returns the object count. */
// deno-lint-ignore no-explicit-any
export async function removeStoragePrefix(supabaseAdmin: any, bucket: string, prefix: string): Promise<number> {
  const paths = await listStoragePrefix(supabaseAdmin, bucket, prefix);
  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const { error } = await supabaseAdmin.storage.from(bucket).remove(paths.slice(i, i + REMOVE_CHUNK));
    if (error) throw new Error(`remove ${bucket}/${prefix}: ${error.message}`);
  }
  return paths.length;
}
