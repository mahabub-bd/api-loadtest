/**
 * Theme persistence + application. Mirrors the inline pre-paint script in
 * index.html — keep the storage key and default in sync with it.
 */

export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme';

export function loadTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    /* storage unavailable (private mode, etc.) — fall back to the OS setting */
    return 'system';
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const dark = choice === 'dark' || (choice === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', dark);
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* persistence is best-effort; the class toggle above still applies */
  }
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}
