// Module-level ref — shared across the entire app, survives multiple composable calls.
// Updated directly by onAuthStateChange which is reliable in both web and Capacitor.
const _isAuthenticated = ref(false);
let _initialized = false;

export function useAuthSession() {
  if (import.meta.client && !_initialized) {
    _initialized = true;
    const supabase = useSupabaseClient();
    // Sync current session immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      _isAuthenticated.value = !!session?.user;
    });
    // Stay in sync on every auth change
    supabase.auth.onAuthStateChange((_event, session) => {
      _isAuthenticated.value = !!session?.user;
    });
  }

  return { isAuthenticated: _isAuthenticated };
}
