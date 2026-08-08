/**
 * SOFT client-side access gate — see the "Security caveat" section in the
 * README. This is NOT real security: the built site is static and public
 * on GitHub Pages regardless of the source repo's visibility, so anyone
 * who opens devtools can read this file and the hash below. It only
 * deters casual/accidental access (e.g. a stray search-engine crawl or
 * someone bumping into the link).
 *
 * To change the passcode:
 *   1. Open a browser console anywhere and run:
 *        const enc = new TextEncoder().encode('your-new-passcode');
 *        crypto.subtle.digest('SHA-256', enc).then(buf =>
 *          console.log(Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')));
 *   2. Paste the resulting hex string below as PASSCODE_SHA256.
 *
 * Default passcode is: pridetoyota2026
 */
export const PASSCODE_SHA256 =
  'a7ca02a1e873ba7d531d68eb3f7e03e1fb145db283ee16078c0e87e36c73af27';

export const SESSION_STORAGE_KEY = 'ptd-dashboard-unlocked';
