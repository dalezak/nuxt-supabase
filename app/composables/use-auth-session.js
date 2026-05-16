// Module-level ref — shared across the entire app, survives multiple composable calls.
// Updated directly by onAuthStateChange which is reliable in both web and Capacitor.
const _isAuthenticated = ref(false);
let _initialized = false;

// Synchronous setter for callers that just completed a login/signup/logout and
// can't afford to wait for Supabase's onAuthStateChange event (which fires a
// microtask later). Prevents a brief "logged-out tabs" flash during navigation
// right after signInWithPassword resolves.
export function setAuthenticated(value) {
  _isAuthenticated.value = !!value;
}

export function useAuthSession() {
  // useSupabaseUser() works on both server and client via @nuxtjs/supabase
  const user = useSupabaseUser();
  _isAuthenticated.value = !!user.value;

  if (import.meta.client && !_initialized) {
    _initialized = true;
    const supabase = useSupabaseClient();
    // Stay in sync on every auth change
    supabase.auth.onAuthStateChange((_event, session) => {
      _isAuthenticated.value = !!session?.user;
    });
  }

  return { isAuthenticated: _isAuthenticated };
}
