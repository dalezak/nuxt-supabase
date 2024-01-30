export async function useCurrentUser() {
  const userStore = useUserStore();
  const { getCurrent } = storeToRefs(userStore);
  const { currentUser } = userStore;
  if (getCurrent == null) {
    await currentUser();
  }
  return getCurrent;
}
