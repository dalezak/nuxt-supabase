import Users from "../models/Users";
import User from "../models/User";

export const useUsersStore = createSupaStore('users', User, Users, ({ item, items }) => {
  const profile = ref(null);

  async function loadProfile() {
    try {
      if (profile.value) return profile.value;
      const client = useSupabaseClient();
      const { data: { user: authUser } } = await client.auth.getUser();
      const user_id = authUser?.id;
      if (!user_id) return null;
      let user = await User.profile(user_id);
      if (user?.id) {
        await user.store();
      } else {
        user = null;
      }
      profile.value = user;
      return user;
    } catch (error) {
      consoleError("UsersStore.loadProfile", error);
      return Promise.reject(error);
    }
  }

  async function googleSignin() {
    try {
      let user = await User.google();
      if (user) {
        user = await user.save();
        await user.store();
        user = await User.load(user.id);
      }
      profile.value = user;
      return user;
    } catch (error) {
      consoleError("UsersStore.googleSignin", error);
      return Promise.reject(error);
    }
  }

  async function userLogin({ email, password }) {
    try {
      consoleLog("UsersStore.userLogin", email);
      let user = await User.login(email, password);
      if (user) await user.store();
      profile.value = user;
      return user;
    } catch (error) {
      consoleError("UsersStore.userLogin", error);
      return Promise.reject(error);
    }
  }

  async function userSignup({ name, email, password }) {
    try {
      consoleLog("UsersStore.userSignup", name, email);
      let user = await User.signup(email, password, name);
      if (user) {
        user.name = name;
        user = await user.save();
        user = await user.store();
      }
      profile.value = user;
      return user;
    } catch (error) {
      consoleError("UsersStore.userSignup", error);
      return Promise.reject(error);
    }
  }

  async function userLogout() {
    try {
      await User.logout();
      profile.value = null;
      item.value = null;
      items.value = null;
      consoleLog("UsersStore.userLogout", "done");
    } catch (error) {
      consoleError("UsersStore.userLogout", error);
      return Promise.reject(error);
    }
  }

  async function resetPassword({ email }) {
    try {
      await User.resetPassword(email);
    } catch (error) {
      consoleError("UsersStore.resetPassword", error);
      return Promise.reject(error);
    }
  }

  async function updatePassword({ password }) {
    try {
      await User.updatePassword(password);
    } catch (error) {
      consoleError("UsersStore.updatePassword", error);
      return Promise.reject(error);
    }
  }

  async function avatarUrl(email, uploadedUrl = null) {
    return User.avatarUrl(email, uploadedUrl);
  }

  async function uploadAvatar(userData, file) {
    return new User(userData).uploadAvatar(file);
  }

  // Patch any subset of a user's columns by id. Useful for app-specific
  // fields that the layer's User model doesn't list (e.g. study goals).
  // Refreshes `profile` and the local-storage cache when the patched user
  // is the authed one — without the cache refresh, `loadProfile` would
  // restore the pre-patch row on the next page load.
  async function updateUser(userId, patch) {
    const fresh = await User.update(userId, patch);
    if (fresh && profile.value?.id === userId) {
      profile.value = fresh;
      await fresh.store();
    }
    return fresh;
  }

  // Bulk-load users by id — pass-through to `Users.loadByIds` for surfaces
  // that have a set of user ids and need to render name / email / avatar
  // (activity feeds, leaderboards, comparison strips). `options.select`
  // narrows the projection.
  async function loadByIds(ids, options = {}) {
    return Users.loadByIds(ids, options);
  }

  return {
    profile,
    loadProfile,
    googleSignin,
    userLogin,
    userSignup,
    userLogout,
    resetPassword,
    updatePassword,
    avatarUrl,
    uploadAvatar,
    updateUser,
    loadByIds,
  };
});
