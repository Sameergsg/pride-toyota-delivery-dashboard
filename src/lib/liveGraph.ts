/**
 * Reads the workbook directly from the browser using the caller's own
 * Graph access token — reuses the exact same worksheet-detection/column-
 * mapping/date-parsing logic as the CLI sync path (scripts/workbookReader.mjs
 * + dateParser.mjs), imported straight from scripts/ since Vite bundles it
 * fine (it's plain browser-safe ESM, no Node APIs).
 */
import { fetchWorkbookRows } from '../../scripts/workbookReader.mjs';
import type { DataFile } from '../types';
import { getAccessToken } from './msalAuth';

const SHARE_URL = import.meta.env.VITE_SHAREPOINT_SHARE_URL || '';

export async function fetchLiveDataFile(): Promise<DataFile> {
  if (!SHARE_URL) {
    throw new Error('VITE_SHAREPOINT_SHARE_URL is not configured.');
  }
  const token = await getAccessToken();
  const { rows } = await fetchWorkbookRows(token, SHARE_URL);
  return { generatedAt: new Date().toISOString(), rows };
}
