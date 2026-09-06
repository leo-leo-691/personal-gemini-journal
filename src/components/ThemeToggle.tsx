'use client';

import { useCallback, useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'pgj-theme';

/**
 * Light/dark toggle.
 *
 * Deliberately reads only `document.documentElement.classList` — the initial
 * resolution (including `prefers-color-scheme`) happens in the pre-hydration
 * script in layout.tsx. No `matchMedia` call here, so the component mounts
 * cleanly under jsdom in the existing Sidebar test.
 */
export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains('theme-light'));
  }, []);

  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains('theme-light');
    document.documentElement.classList.toggle('theme-light', next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'light' : 'dark');
    } catch {
      /* storage unavailable — the class change still applies for this session */
    }
    setLight(next);
  }, []);

  const Icon = light ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={light ? 'Switch to dark theme' : 'Switch to light theme'}
      title={light ? 'Dark theme' : 'Light theme'}
      className="grid h-8 w-8 place-items-center rounded-md text-ink-3 transition-colors duration-fast hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focusring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}
