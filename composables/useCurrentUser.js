export function useCurrentUser() {
  const userStore = useUserStore();
  const { getCurrent } = storeToRefs(userStore);
  const { currentUser } = userStore;
  if (getCurrent == null) {
    currentUser();
  }
  return getCurrent;
}
