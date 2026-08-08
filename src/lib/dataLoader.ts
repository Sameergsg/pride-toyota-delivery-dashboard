import type { DataFile } from '../types';

export type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: DataFile };

/** Fetches public/data.json with a cache-busting param so "Refresh" is meaningful. */
export async function fetchDataFile(): Promise<DataFile> {
  const url = `${import.meta.env.BASE_URL}data.json?t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load data.json (HTTP ${res.status})`);
  }
  const json = (await res.json()) as DataFile;
  if (!json || !Array.isArray(json.rows)) {
    throw new Error('data.json is malformed (missing rows[])');
  }
  return json;
}
