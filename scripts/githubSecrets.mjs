/**
 * Updates a GitHub Actions repo secret via the REST API. Used by sync.mjs
 * to persist the rotated Graph refresh token after every run — Microsoft
 * invalidates the previous refresh token each time a new one is issued, so
 * without this the delegated auth flow would stop working within one cycle.
 *
 * Requires a GitHub token with "Secrets: read and write" permission for
 * this repo (a fine-grained PAT scoped to just this repo is recommended —
 * see SETUP.md). Encryption uses libsodium's sealed-box construction, which
 * is what GitHub's API requires (https://docs.github.com/en/rest/actions/secrets).
 */
import sodium from 'libsodium-wrappers';

export async function updateRepoSecret({ owner, repo, token, secretName, secretValue }) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const pkRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/secrets/public-key`,
    { headers },
  );
  if (!pkRes.ok) {
    throw new Error(`Failed to fetch repo public key (${pkRes.status}): ${await pkRes.text()}`);
  }
  const { key, key_id } = await pkRes.json();

  await sodium.ready;
  const binKey = sodium.from_base64(key, sodium.base64_variants.ORIGINAL);
  const binSecret = sodium.from_string(secretValue);
  const encryptedBytes = sodium.crypto_box_seal(binSecret, binKey);
  const encrypted_value = sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);

  const putRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/secrets/${secretName}`,
    {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ encrypted_value, key_id }),
    },
  );
  if (!putRes.ok) {
    throw new Error(`Failed to update secret ${secretName} (${putRes.status}): ${await putRes.text()}`);
  }
}
