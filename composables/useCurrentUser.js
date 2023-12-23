export function useCurrentUser() {
  const user = useSupabaseUser();
  return user;
}
