export function useProfile() {
  const usersStore = useUsersStore();
  const { loadProfile } = usersStore;
  const { profile } = storeToRefs(usersStore);
  return { loadProfile, profile };
}
