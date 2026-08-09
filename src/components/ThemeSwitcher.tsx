import { useEffect, useRef, useState } from 'react';
import { THEMES, applyTheme, getStoredThemeId } from '../lib/theme';

/**
 * Floating theme picker, rendered at the App root so it's visible on
 * every screen (gate/sign-in included, not just the post-login dashboard).
 * Picking a theme reloads the page (see applyTheme's doc comment for why)
 * — `current` here is read-only display state, not something we re-apply
 * on mount (index.html's inline head script already did that pre-paint).
 */
export function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [current] = useState(getStoredThemeId());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const darkThemes = THEMES.filter((t) => t.category === 'dark');
  const lightThemes = THEMES.filter((t) => t.category === 'light');

  return (
    <div ref={ref} className="fixed top-3 right-3 z-50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Change theme"
        aria-label="Change theme"
        className="w-9 h-9 rounded-full glass-panel flex items-center justify-center text-text-secondary hover:text-toyota-red hover:border-toyota-red/50 transition-colors duration-200 shadow-lg"
      >
        <PaletteIcon />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 glass-panel rounded-lg shadow-2xl py-2 z-50">
          <p className="px-3 pt-1 pb-2 text-[11px] font-display font-semibold uppercase tracking-widest text-text-muted">
            Theme
          </p>

          <ThemeGroup label="Dark" themes={darkThemes} current={current} onSelect={applyTheme} />
          <div className="hairline my-1.5" />
          <ThemeGroup label="Light" themes={lightThemes} current={current} onSelect={applyTheme} />
        </div>
      )}
    </div>
  );
}

function ThemeGroup({
  label,
  themes,
  current,
  onSelect,
}: {
  label: string;
  themes: typeof THEMES;
  current: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <p className="px-3 pb-1 text-[10px] uppercase tracking-widest text-text-muted">{label}</p>
      {themes.map((theme) => {
        const active = theme.id === current;
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => onSelect(theme.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors duration-150 ${
              active ? 'text-text-primary bg-toyota-red/10' : 'text-text-secondary hover:bg-toyota-red/5 hover:text-text-primary'
            }`}
          >
            <span
              className="w-4 h-4 rounded-full border border-white/10 shrink-0"
              style={{
                background: `linear-gradient(135deg, ${theme.swatch[0]} 50%, ${theme.swatch[1]} 50%)`,
              }}
            />
            <span className="flex-1 text-left">{theme.name}</span>
            {active && (
              <svg className="w-3.5 h-3.5 text-toyota-red" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.704 5.29a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L4.296 9.5a.75.75 0 111.06-1.06l3.53 3.53 6.72-6.72a.75.75 0 011.098.04z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PaletteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.1 0 2-.9 2-2 0-.52-.2-.99-.53-1.34-.32-.34-.52-.8-.52-1.31 0-1.1.9-2 2-2h2.35c2.85 0 5.15-2.3 5.15-5.15C22.45 5.4 17.75 2 12 2z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="6.8" cy="12" r="1.4" fill="currentColor" />
      <circle cx="9.2" cy="7.2" r="1.4" fill="currentColor" />
      <circle cx="14.8" cy="7.2" r="1.4" fill="currentColor" />
      <circle cx="17.2" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}
