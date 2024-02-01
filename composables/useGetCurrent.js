export function useGetCurrent() {
  const user = ref(null);
  const userStore = useUserStore();
  const { currentUser } = userStore;
  const getCurrentUser = async () => {
    user.value = await currentUser();
  }
  getCurrentUser();
  return user;
}
