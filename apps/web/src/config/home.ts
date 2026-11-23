// Home is four clear zones (decision #83, was 8 loose sections in #35/#54). The user can show/hide and
// reorder the zones in Settings; this is the default. Unknown ids from older versions are dropped on load.
export type HomeSectionId = 'today' | 'friends' | 'pet' | 'tools'

// Shortcuts first (#128): they are the main actions, right under the greeting.
export const DEFAULT_HOME_SECTIONS: HomeSectionId[] = ['tools', 'today', 'friends', 'pet']
