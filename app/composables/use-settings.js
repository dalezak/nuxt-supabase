// useSettings — per-user, account-scoped settings access.
//
// Reads the `settings` jsonb off the loaded profile (so it rides along
// with useProfile — no extra round-trip) and writes one key at a time via
// the atomic merge RPC (set_user_setting), so concurrent toggles never
// clobber the whole blob. Each app declares its toggles in app.config
// `settings`; callers pass the key + the app-declared default so a
// never-set setting reads sensibly.
//
//   const { get, set, enabled } = useSettings();
//   const dark = computed(() => get('dark_mode', false));   // reactive read
//   await set('dark_mode', true);                            // atomic write
//   <some-card v-if="enabled('push_morning')" />            // reactive show/hide

export function useSettings() {
  const usersStore = useUsersStore();
  const { profile } = useProfile();
  const appConfig = useAppConfig();

  // The default declared for `key` in app.config `settings` (scans every
  // section's items), or undefined when the key isn't declared.
  function declaredDefault(key) {
    const sections = appConfig.settings ?? [];
    for (const section of sections) {
      const item = (section.items ?? []).find(i => i.id === key);
      if (item) return item.default;
    }
    return undefined;
  }

  // Reactive read of one setting. Re-evaluates when the profile changes
  // (profile is a reactive ref), so it's safe to call straight in a template
  // or wrap in computed(). Falls back to `fallback`, or — when omitted — to
  // the value declared in app.config `settings`.
  function get(key, fallback = undefined) {
    const stored = profile.value?.settings ?? {};
    if (key in stored) return stored[key];
    return fallback !== undefined ? fallback : declaredDefault(key);
  }

  // Reactive boolean — is this toggle setting on? Pulls the default from the
  // app.config declaration so callers don't repeat it; unknown/unset → false.
  //   <morning-card v-if="enabled('push_morning')" />
  function enabled(key) {
    return !!get(key);
  }

  // Atomic single-key write. Returns true on success; updates the in-memory
  // profile + cache via the store so the new value reads back immediately.
  async function set(key, value) {
    return usersStore.setSetting(key, value);
  }

  return { get, set, enabled };
}
