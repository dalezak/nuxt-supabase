export async function useCurrentUser() {
  const userStore = useUserStore();
  const { currentUser } = userStore;
  return await currentUser;
}
