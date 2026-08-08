/**
 * Small helper shared by get-token.mjs and sync.mjs to update key=value
 * pairs in .env.local without clobbering the rest of the file.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ENV_LOCAL_PATH = path.join(__dirname, '..', '.env.local');

export async function upsertEnvLocal(updates) {
  let content = '';
  try {
    content = await readFile(ENV_LOCAL_PATH, 'utf8');
  } catch {
    // .env.local doesn't exist yet — that's fine, we'll create it.
  }
  const lines = content.split('\n').filter(Boolean);
  const keys = Object.keys(updates);
  const seen = new Set();
  const nextLines = lines.map((line) => {
    const key = line.split('=')[0];
    if (keys.includes(key)) {
      seen.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });
  for (const key of keys) {
    if (!seen.has(key)) nextLines.push(`${key}=${updates[key]}`);
  }
  await writeFile(ENV_LOCAL_PATH, nextLines.join('\n') + '\n', 'utf8');
}
