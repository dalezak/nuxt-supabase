import SupaModel from './SupaModel';
import { setAuthenticated } from '../composables/use-auth-session';

export default class User extends SupaModel {

  id = null;

  name = null;
  email = null;
  avatar_url = null;

  subscription_status = 'free';
  subscription_expires_at = null;
  subscription_platform = null;

  created_at = null;
  updated_at = null;

  constructor(data = {}) {
    super(data);
    Object.assign(this, data);
  }

  // Persists this user to local storage under 'users/{id}'.
  async store() {
    return await this.storeModel(`users/${this.id}`);
  }

  // Reads a user from local storage by id (cache lookup).
  // Returns null on cache miss — call load() as fallback.
  static async restore(id) {
    return await this.restoreModel(User, `users/${id}`);
  }

  // Loads a user from Supabase by id.
  // Try restore() first to avoid the DB round-trip.
  static async load(id) {
    return await this.loadModel(User, "users", { id: id });
  }

  // Upserts this user to Supabase (id, name, email, avatar_url).
  // Returns a fresh User from the DB response, or null on error.
  async save() {
    return this.saveModel(User, "users", ["id", "name", "email", "avatar_url"]);
  }

  // Returns the best available avatar URL: uploaded photo, then Gravatar, then null.
  static async avatarUrl(email, uploadedUrl = null) {
    if (uploadedUrl) return uploadedUrl;
    return gravatarUrl(email);
  }

  // Uploads a file to the avatars bucket and updates avatar_url in the DB.
  // Returns the public URL on success, null on error.
  async uploadAvatar(file) {
    const Supabase = useSupabaseClient();
    const ext = file.name.split('.').pop();
    const path = `${this.id}/avatar.${ext}`;
    const { error: uploadError } = await Supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });
    if (uploadError) { consoleError('User.uploadAvatar', uploadError); return null; }
    const { data } = Supabase.storage.from('avatars').getPublicUrl(path);
    const url = `${data.publicUrl}?t=${Date.now()}`;
    this.avatar_url = url;
    await this.save();
    return url;
  }

  // Initiates Google OAuth sign-in (redirect flow).
  // On success returns a User populated from the OAuth response.
  // Note: auth.user may not be present immediately in the redirect flow —
  // call profile() after the OAuth callback instead.
  static async google() {
    const Supabase = useSupabaseClient();
    const { data: auth, error } = await Supabase.auth.signInWithOAuth({
      provider: 'google'
    });
    if (error) {
      consoleError("User.google", error);
      return null;
    }
    else if (auth && auth.user) {
      consoleLog("User.google", auth);
      let user = new User();
      user.id = auth.user.id;
      user.email = auth.user.email;
      user.created_at = auth.user.created_at;
      user.updated_at = auth.user.updated_at;
      return user;
    }
    return null;
  }

  // Loads the current user by user_id: checks local storage first (restore),
  // falls back to Supabase (load). Returns null if user_id is falsy.
  static async profile(user_id) {
    if (!user_id) return null;
    let user = await User.restore(user_id) || await User.load(user_id);
    consoleLog("User.profile", user);
    return user;
  }

  // Signs in with email + password via Supabase.
  // Returns a User on success, null on error or if no user is returned.
  static async login(email, password) {
    const Supabase = useSupabaseClient();
    const { data: auth, error } = await Supabase.auth.signInWithPassword({
      email: email,
      password: password
    });
    if (error) {
      consoleError("User.login", error);
      return null;
    }
    else if (auth && auth.user) {
      consoleLog("User.login", auth);
      // Update synchronously so callers that navigate immediately (e.g.
      // showPageIndex) see the authenticated tab set on the first read.
      setAuthenticated(true);
      let user = new User();
      user.id = auth.user.id;
      user.email = auth.user.email;
      user.created_at = auth.user.created_at;
      user.updated_at = auth.user.updated_at;
      return user;
    }
    return null;
  }

  // Creates a new Supabase auth account with email + password.
  // name is stored on the returned User but not saved to DB here —
  // call user.save() after signup to persist the profile row.
  // Returns a User on success. Throws the Supabase AuthApiError on failure
  // (e.g. "User already registered", "Password should be at least…") so
  // callers can match `error.code` / `error.message` for tailored UX.
  static async signup(email, password, name) {
    const Supabase = useSupabaseClient();
    const { data: auth, error } = await Supabase.auth.signUp({
      email: email,
      password: password
    });
    if (error) {
      consoleError("User.signup", error);
      throw error;
    }
    if (auth?.user) {
      consoleLog("User.signup", auth);
      // Update synchronously so callers that navigate immediately (e.g.
      // showPageIndex) see the authenticated tab set on the first read.
      setAuthenticated(true);
      let user = new User();
      user.id = auth.user.id;
      user.email = auth.user.email;
      user.name = name;
      user.created_at = auth.user.created_at;
      user.updated_at = auth.user.updated_at;
      return user;
    }
    return null;
  }

  // Clears all local storage then signs out of Supabase.
  // Returns true on success, false if any step throws.
  static async logout() {
    try {
      const Storage = useStorage();
      await Storage.clear();
      consoleLog("User.logout", "store cleared");

      const Supabase = useSupabaseClient();
      await Supabase.auth.signOut();
      consoleLog("User.logout", "session cleared");

      // Symmetric to login — flip synchronously so the tab bar swaps to the
      // public set immediately, not after onAuthStateChange fires.
      setAuthenticated(false);

      return true;
    }
    catch (error){
      consoleError("User.logout", error);
      return false;
    }
  }

  // Sends a password reset email to the user.
  // Redirect URL is built from runtimeConfig.public.url — ensure APP_URL is set.
  // Returns true on success, false on error.
  static async resetPassword(email) {
    const Supabase = useSupabaseClient();
    const { data, error } = await Supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${useRuntimeConfig().public.url}/reset?email=${email}`,
    });
    if (error) {
      consoleError("User.resetPassword", error);
      return false;
    }
    else if (data) {
      consoleLog("User.resetPassword", data);
      return true;
    }
    return false;
  }

  // Updates subscription fields for a user by id (called from webhook).
  static async updateSubscription(userId, status, expiresAt, platform) {
    const Supabase = useSupabaseClient();
    const { error } = await Supabase
      .from('users')
      .update({ subscription_status: status, subscription_expires_at: expiresAt, subscription_platform: platform })
      .eq('id', userId);
    if (error) consoleError('User.updateSubscription', error);
    return !error;
  }

  // Updates the password for the currently authenticated user.
  // Returns true on success, false on error.
  static async updatePassword(password) {
    const Supabase = useSupabaseClient();
    const { data, error } = await Supabase.auth.updateUser({ password: password });
    if (error) {
      consoleError("User.updatePassword", error);
      return false;
    }
    else if (data) {
      consoleLog("User.updatePassword", data);
      return true;
    }
    return false;
  }

}
