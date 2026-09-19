/* Where the heavy binaries live.
 *
 * The quantised meshes (.bin), the environment HDRI (.exr) and the hero videos
 * are ~31 MB: they are kept out of main's history and published separately.
 * Two hosts, because they are read two different ways:
 *
 *   .bin / .exr  read by fetch() and XHR into an ArrayBuffer, so the response
 *                MUST carry CORS headers.  GitHub release assets do not send
 *                any, so these live on the orphan `assets` branch and are
 *                served by jsDelivr, which sends `access-control-allow-origin: *`.
 *                The tag (not a branch name) makes jsDelivr's cache permanent.
 *
 *   videos       loaded by <video>, which needs no CORS, so they are assets of
 *                the GitHub release miccai-2026-assets-v2.  Release assets are
 *                a flat namespace: assets/hero.mp4 is uploaded as
 *                assets__hero.mp4 and mapped back below.
 *
 * Served locally (a dev server, or file://), the files on disk are used as they
 * are -- they are gitignored, not deleted -- so nothing has to be re-published
 * to try a change.
 *
 * To publish a new set: commit on `assets` and bump ASSETS_TAG; upload new
 * videos and bump RELEASE_TAG.
 */

const ASSETS_TAG = 'assets-v1';
const RELEASE_TAG = 'miccai-2026-assets-v2';

const CDN_BASE = `https://cdn.jsdelivr.net/gh/hadrienbigoballand/website@${ASSETS_TAG}/`;
const RELEASE_BASE = `https://github.com/hadrienbigoballand/website/releases/download/${RELEASE_TAG}/`;

const LOCAL = location.protocol === 'file:'
  || ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);

/** A path relative to miccai-2026/ -> the URL to actually fetch. */
export function assetURL(path) {
  if (LOCAL) return path;
  // The ?v= cache busters are for the copy on Pages; elsewhere the tag is the version.
  const clean = path.split('?')[0];
  return /\.(mp4|webm|mov)$/i.test(clean)
    ? RELEASE_BASE + clean.replace(/\//g, '__')
    : CDN_BASE + clean;
}
