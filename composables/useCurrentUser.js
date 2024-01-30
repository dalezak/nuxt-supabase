export function useCurrentUser() {
  const user = useSupabaseUser();
  return user;
  // const userStore = useUserStore();
  // const { getCurrent } = storeToRefs(userStore);
  // const { currentUser } = userStore;
  // if (getCurrent == null && currentUser) {
  //   currentUser();
  // }
  // return getCurrent;
}
