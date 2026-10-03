import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { applyTheme, loadTheme, type ThemeChoice } from '../theme';

const OPTIONS: { value: ThemeChoice; label: string; icon: ReactNode }[] = [
  {
    value: 'system',
    label: 'System theme',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
        <rect x="2" y="4" width="20" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
  {
    value: 'light',
    label: 'Light theme',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: 'Dark theme',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    ),
  },
];

/**
 * Segmented System / Light / Dark control. "System" tracks the OS setting
 * live; the choice persists in localStorage and is applied by toggling the
 * .dark class on <html>, which flips every design token in styles.css.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeChoice>(loadTheme);

  // While on "system", follow the OS as it changes (e.g. auto dark at sunset).
  useEffect(() => {
    if (theme !== 'system' || typeof matchMedia !== 'function') return;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  function select(choice: ThemeChoice) {
    setTheme(choice);
    applyTheme(choice);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="flex shrink-0 gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={theme === option.value}
          title={option.label}
          onClick={() => select(option.value)}
          className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
            theme === option.value
              ? 'bg-surface text-ink shadow-sm'
              : 'text-ink-3 hover:text-ink-2'
          }`}
        >
          {option.icon}
          <span className="sr-only">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
