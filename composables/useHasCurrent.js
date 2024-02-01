export function useHasCurrent() {
  const supabaseUser = useSupabaseUser();
  return supabaseUser.value != null;
}
