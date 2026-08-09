/**
 * Theme registry + persistence. Actual color values live in src/index.css
 * as [data-theme="..."] CSS-variable overrides — this module just knows
 * the list of valid theme ids and how to apply/persist one.
 *
 * Switching reloads the page (see applyTheme). A live in-place switch was
 * tried first but hit a Chromium repaint bug: `border-color: var(...)` on
 * elements using `backdrop-filter` (our .glass-panel) doesn't repaint when
 * only the referenced custom property changes — everything else on the
 * page (backgrounds, text, KPI colors) updates live correctly, but that
 * one property sticks to the previous theme even after forcing reflow,
 * toggling backdrop-filter, and pushing the resolved value as a literal
 * inline style. A fresh navigation always renders every theme perfectly
 * (confirmed), so reload is the reliable choice over a visibly broken
 * border color. index.html's inline head script applies the saved theme
 * before first paint, so there's no flash back to the default theme.
 */
export interface ThemeDef {
  id: string;
  name: string;
  category: 'dark' | 'light';
  /** Small swatch colors for the picker UI: [background, accent]. */
  swatch: [string, string];
}

export const THEMES: ThemeDef[] = [
  { id: 'toyota-red', name: 'Toyota Red', category: 'dark', swatch: ['#0b0e14', '#ff1f39'] },
  { id: 'cyber-violet', name: 'Cyber Violet', category: 'dark', swatch: ['#0d0a1a', '#b537f2'] },
  { id: 'neon-cyan', name: 'Neon Cyan', category: 'dark', swatch: ['#060f14', '#00e5ff'] },
  { id: 'toyota-light', name: 'Toyota Light', category: 'light', swatch: ['#f4f5f7', '#eb0a1e'] },
  { id: 'solar-amber', name: 'Solar Amber', category: 'light', swatch: ['#fbf7f0', '#e8790a'] },
  { id: 'pearl-blue', name: 'Pearl Blue', category: 'light', swatch: ['#f2f6fb', '#0071e3'] },
];

/** "toyota-red" is the original/default look — matches src/index.css's un-overridden @theme values. */
export const DEFAULT_THEME_ID = 'toyota-red';

const STORAGE_KEY = 'ptd-dashboard-theme';

export function getStoredThemeId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.some((t) => t.id === stored)) return stored;
  } catch {
    // localStorage unavailable (private mode, etc.) — fall through to default
  }
  return DEFAULT_THEME_ID;
}

/** Persists the choice and reloads so every theme renders pixel-correct (see file header). No-op if already the active theme. */
export function applyTheme(id: string): void {
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
  const wasAlready = getStoredThemeId() === theme.id;
  if (wasAlready) return;

  try {
    localStorage.setItem(STORAGE_KEY, theme.id);
    window.location.reload();
  } catch {
    // Storage blocked (private mode, etc.) — can't persist across reload,
    // so reloading would just lose the pick. Nothing more we can do here.
  }
}
