import Users from "../models/Users";
import User from "../models/User";

export const useUsersStore = createSupaStore('users', User, Users, ({ item, items }) => {
  const profile = ref(null);

  // Pass `refresh: true` to bypass both the in-memory ref AND the local-storage
  // cache and re-fetch the row from the DB (then re-store it). Needed when a
  // caller suspects the cached profile is stale relative to the DB — e.g. the
  // onboarding gate, where a pre-onboarding cached row would otherwise re-show
  // the mandatory modal forever. Default (false) keeps the cheap cached path.
  async function loadProfile(refresh = false) {
    try {
      if (profile.value && !refresh) return profile.value;
      const client = useSupabaseClient();
      const { data: { user: authUser } } = await client.auth.getUser();
      const user_id = authUser?.id;
      if (!user_id) return null;
      let user = refresh ? await User.load(user_id) : await User.profile(user_id);
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
      if (user && !user.confirmationPending) {
        // The public.users profile row is created server-side by the
        // signup_user trigger (synchronous with the auth.users insert), so
        // there's no client-side insert here — that step used to race the
        // session + the authenticated-only RLS policy and fail signup even
        // though the auth account was created. Reload the row so the cached
        // profile matches the DB (the users SELECT policy allows the read);
        // best-effort, falling back to the auth-derived user if it lags.
        // Skipped when confirmation is pending — there's no session yet, so
        // the read would fail and there's no authenticated profile to cache.
        const full = await User.load(user.id).catch(() => null);
        user = full ?? user;
        user = await user.store();
        profile.value = user;
      }
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
      // User.resetPassword returns false on failure rather than throwing, so
      // reject on a falsy result — otherwise callers can't tell a failed
      // request from a successful one and show a false "check your email".
      const ok = await User.resetPassword(email);
      if (!ok) return Promise.reject(new Error("Password reset request failed"));
      return ok;
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

  // Atomically merge a single setting key (set_user_setting RPC), then
  // mirror it onto the in-memory profile + refresh the local-storage cache —
  // otherwise loadProfile would restore the pre-toggle row on next load.
  async function setSetting(key, value) {
    const ok = await User.setSetting(key, value);
    if (ok && profile.value) {
      profile.value.settings = { ...(profile.value.settings ?? {}), [key]: value };
      await profile.value.store();
    }
    return ok;
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
    setSetting,
  };
});
