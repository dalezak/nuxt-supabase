export function useLoggedIn() {
  const loggedIn = ref(false);
  const supabaseUser = useSupabaseUser();
  loggedIn.value = supabaseUser.value != null;
  return loggedIn;
}
