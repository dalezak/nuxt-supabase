// Invokes a Supabase Edge Function by name with the given body.
// Throws on error, returns data on success.
export default async function invokeFunction(name, body = {}) {
  const Supabase = useSupabaseClient();
  const { data, error } = await Supabase.functions.invoke(name, { body });
  if (error) throw error;
  return data;
}
