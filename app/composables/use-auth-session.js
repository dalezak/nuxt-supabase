// Module-level ref — shared across the entire app, survives multiple composable calls.
// Two writers after initialization:
//   - setAuthenticated() — synchronous, called by User.login / signup / logout
//     to flip the value the moment those operations complete
//   - onAuthStateChange() — async, fires on background auth events (token
//     refresh, session expiry, OAuth callback)
const _isAuthenticated = ref(false);
let _initialized = false;
// Resolves once the PERSISTED session has been determined on cold launch (see
// `ready()` below). Lets callers (the auth middleware) wait before deciding
// public vs private, so a launch doesn't flash a public page then correct.
let _ready = null;

// Synchronous setter for callers that just completed a login/signup/logout and
// can't afford to wait for Supabase's onAuthStateChange event (which fires a
// microtask later). Prevents a brief "logged-out tabs" flash during navigation
// right after signInWithPassword resolves.
export function setAuthenticated(value) {
  _isAuthenticated.value = !!value;
}

export function useAuthSession() {
  // Initialize once: seed from `useSupabaseUser()` (the SSR-safe view of the
  // session) and wire the live auth listener. After this first pass,
  // subsequent calls to `useAuthSession()` MUST NOT re-read `user.value` —
  // a freshly-logged-in user's session can take a beat to propagate to the
  // Supabase composable, and re-seeding would clobber the synchronous
  // `setAuthenticated(true)` flip from `User.login`, causing the public-tabs
  // flicker that motivated the synchronous flip in the first place.
  if (!_initialized) {
    _initialized = true;
    const user = useSupabaseUser();
    _isAuthenticated.value = !!user.value;
    if (import.meta.client) {
      const supabase = useSupabaseClient();
      supabase.auth.onAuthStateChange((_event, session) => {
        _isAuthenticated.value = !!session?.user;
      });
      // Cold launch (Capacitor / static SPA) restores the persisted session from
      // storage ASYNCHRONOUSLY — `user.value` is null on the first pass, so a
      // naive read says "logged out" and the app shows a public page before
      // correcting to a private tab (the launch flash). Determine the session up
      // front; `ready()` lets the auth middleware await this before it decides
      // public vs private, so the first paint is already correct.
      _ready = supabase.auth.getSession()
        .then(({ data }) => { _isAuthenticated.value = !!data.session?.user; })
        .catch(() => { /* no / invalid persisted session — treat as logged out */ });
    } else {
      _ready = Promise.resolve();
    }
  }

  // `ready()` — await the initial persisted-session determination (a resolved
  // no-op after the first pass, so it never delays later navigations).
  return { isAuthenticated: _isAuthenticated, ready: () => _ready ?? Promise.resolve() };
}
