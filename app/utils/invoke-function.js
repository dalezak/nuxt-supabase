// Invokes a Supabase Edge Function by name with the given body.
// Throws on error, returns data on success.
//
// When the function returns a non-2xx, Supabase wraps the original Response
// on `error.context`. We attempt to read its JSON body and surface the
// function's `error` field as the thrown error's message — so callers see
// the user-facing reason ("Topic too short", "Generation timed out") rather
// than a generic "Edge Function returned a non-2xx status code". The original
// error is preserved on `.cause` for debugging.
export default async function invokeFunction(name, body = {}) {
  const Supabase = useSupabaseClient();
  const { data, error } = await Supabase.functions.invoke(name, { body });
  if (error) {
    const payload = await error.context?.json?.().catch(() => null);
    if (payload?.error) {
      const friendly = new Error(payload.error);
      friendly.cause = error;
      throw friendly;
    }
    throw error;
  }
  return data;
}
