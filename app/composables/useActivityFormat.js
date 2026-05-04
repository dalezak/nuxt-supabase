// Generic activity-formatter dispatch. Apps with activity feeds (friends'
// recent actions, group activity, etc.) declare their own activity types
// and pass them in as a typesMap. The composable returns formatter functions
// that dispatch on `item.type`.
//
// typesMap shape:
//   {
//     [typeKey]: {
//       icon:     IconConstant,           // e.g. ioniconsRocketOutline
//       color:    string,                 // e.g. 'primary' | 'warning'
//       describe: (item) => string,       // human-readable description
//     }
//   }
//
// Example (caller side):
//   const ACTIVITY_TYPES = {
//     reflected: {
//       icon: ioniconsLeafOutline,
//       color: 'primary',
//       describe: (i) => `${i.user?.name} reflected on ${i.habit?.framing}`,
//     },
//     awarded: {
//       icon: ioniconsRibbonOutline,
//       color: 'warning',
//       describe: (i) => `${i.user?.name} earned ${i.badge?.name}`,
//     },
//   };
//   const { activityIcon, activityColor, activityDescription } = useActivityFormat(ACTIVITY_TYPES);
//
// Unknown types fall back to null/empty — safe to use directly in templates
// (Vue handles null icon/color gracefully).

export function useActivityFormat(typesMap = {}) {

  function activityIcon(item) {
    return typesMap[item?.type]?.icon ?? null;
  }

  function activityColor(item) {
    return typesMap[item?.type]?.color ?? 'medium';
  }

  function activityDescription(item) {
    const desc = typesMap[item?.type]?.describe;
    return typeof desc === 'function' ? desc(item) : '';
  }

  return { activityIcon, activityColor, activityDescription };
}
