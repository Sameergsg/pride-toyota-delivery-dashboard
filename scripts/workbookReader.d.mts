// Type declarations for workbookReader.mjs — this file is imported directly
// from the browser bundle (src/lib/liveGraph.ts) as well as run under
// plain Node (scripts/sync.mjs, azure-function/), so it stays untyped
// JS at runtime; this .d.mts sits alongside it purely so TypeScript's
// build (tsc -b, used by the frontend) can type-check the parts the
// frontend actually consumes.
import type { VehicleRow } from '../src/types';

export interface FetchWorkbookRowsResult {
  rows: VehicleRow[];
  driveId: string;
  itemId: string;
  fileName: string;
  sourceName: string;
}

export function fetchWorkbookRows(token: string, shareUrl: string): Promise<FetchWorkbookRowsResult>;

export function base64UrlEncodeShareUrl(url: string): string;
export function resolveDriveItem(token: string, shareUrl: string): Promise<unknown>;
export function findWorksheetAndTable(token: string, driveId: string, itemId: string): Promise<unknown>;
export function graphGet(token: string, url: string): Promise<unknown>;
export function buildColumnMapping(headers: unknown[]): unknown[];
export function normalizeHeader(h: unknown): string;
export const HEADER_MAP: ReadonlyArray<readonly [string, string, boolean]>;
