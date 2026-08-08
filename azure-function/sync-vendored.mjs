#!/usr/bin/env node
/**
 * Azure Functions deployment packages ONLY this azure-function/ folder, so
 * it can't reach up to ../scripts/ at runtime — those files need to be
 * copied in ("vendored") so the deployed package is self-contained.
 *
 * scripts/ remains the single source of truth. Run this after editing
 * scripts/dateParser.mjs, scripts/graphAuth.mjs, or scripts/workbookReader.mjs:
 *
 *   node sync-vendored.mjs
 *
 * The GitHub Actions deploy workflow (.github/workflows/deploy-function.yml)
 * also runs this automatically before packaging, so a forgotten manual run
 * here only affects local `func start` testing, not production.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, '..', 'scripts');
const DEST_DIR = path.join(__dirname, 'shared', 'vendored');

const FILES = ['dateParser.mjs', 'graphAuth.mjs', 'workbookReader.mjs'];

await mkdir(DEST_DIR, { recursive: true });
for (const f of FILES) {
  await copyFile(path.join(SRC_DIR, f), path.join(DEST_DIR, f));
  console.log(`✓ Vendored ${f}`);
}
