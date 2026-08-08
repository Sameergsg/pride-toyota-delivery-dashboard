import type { DataFile } from '../types';

export type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: DataFile };

/**
 * When set (build-time env var VITE_REALTIME_DATA_URL — see
 * azure-function/README.md), the dashboard polls this instead of the
 * bundled public/data.json: the Azure Function keeps it fresh within
 * seconds of the source Excel workbook being saved, versus the ~30-minute
 * GitHub Actions cron for the bundled fallback file.
 */
export const REALTIME_DATA_URL = import.meta.env.VITE_REALTIME_DATA_URL || null;
export const isRealtimeConfigured = Boolean(REALTIME_DATA_URL);

function parseDataFile(json: unknown): DataFile {
  const data = json as DataFile;
  if (!data || !Array.isArray(data.rows)) {
    throw new Error('data.json is malformed (missing rows[])');
  }
  return data;
}

async function fetchJson(url: string): Promise<DataFile> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return parseDataFile(await res.json());
}

/**
 * Fetches the live data source if configured, transparently falling back
 * to the bundled public/data.json (baked in at the last GitHub Pages
 * deploy) if the real-time endpoint is unreachable — e.g. before the
 * Azure Function has been deployed, or a transient network hiccup. The
 * dashboard is never left blank just because the fast path failed.
 */
export async function fetchDataFile(): Promise<DataFile> {
  const bundledUrl = `${import.meta.env.BASE_URL}data.json?t=${Date.now()}`;

  if (REALTIME_DATA_URL) {
    try {
      return await fetchJson(`${REALTIME_DATA_URL}?t=${Date.now()}`);
    } catch (err) {
      console.warn('Real-time data source unreachable, falling back to bundled data.json:', err);
    }
  }

  try {
    return await fetchJson(bundledUrl);
  } catch (err) {
    throw new Error(`Failed to load data.json (${err instanceof Error ? err.message : String(err)})`);
  }
}
