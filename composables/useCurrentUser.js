export function useCurrentUser() {
  const user = ref(null);
  const userStore = useUserStore();
  const { currentUser } = userStore;
  const getCurrentUser = async () => {
    consoleLog("useCurrentUser", "loading", user.value);
    user.value = await currentUser();
    consoleLog("useCurrentUser", "loaded", user.value);
  }
  getCurrentUser();
  consoleLog("useCurrentUser", "return", user.value);
  return user;
}
