// One look for everyone (DECISIONS #97).
// Light/dark mode: "system" (default) follows the device; "light"/"dark" are saved choices.
// index.html applies both before the first paint; keep the storage keys in sync with it.
export type Mode = 'system' | 'light' | 'dark'

const MODE_KEY = 'thongyod-mode'

export function getMode(): Mode {
  try {
    const saved = localStorage.getItem(MODE_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}

export function setMode(mode: Mode): void {
  try {
    if (mode === 'system') localStorage.removeItem(MODE_KEY)
    else localStorage.setItem(MODE_KEY, mode)
  } catch {
    // Storage blocked: the mode still applies for this visit.
  }
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.mode = dark ? 'dark' : 'light'
}
