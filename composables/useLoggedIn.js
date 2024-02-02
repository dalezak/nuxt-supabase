export function useLoggedIn() {
  const loggedIn = ref(false);
  const supabaseUser = useSupabaseUser();
  consoleLog("useLoggedIn", supabaseUser.value);
  loggedIn.value = supabaseUser.value != null;
  return loggedIn;
}
