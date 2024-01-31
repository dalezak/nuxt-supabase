export async function useCurrentUser() {
  const userStore = useUserStore();
  const { currentUser } = userStore;
  const user = await currentUser();
  consoleLog("useCurrentUser", user);
  return user;
}
