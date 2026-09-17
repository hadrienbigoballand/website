/* Reading the packed binaries produced by web_export/export_web.py.
   Every asset is one file; the manifest carries {offset, count, type} per
   buffer, so a fetch is one request and a view is a zero-copy subarray. */

import { assetURL } from './asset-base.js';

const TYPES = {
  uint8: Uint8Array,
  uint16: Uint16Array,
  uint32: Uint32Array,
  float32: Float32Array,
};

const cache = new Map();

export async function loadManifest(base = 'data') {
  if (!cache.has('__manifest')) {
    cache.set('__manifest', fetch(`${base}/manifest.json`).then((r) => {
      if (!r.ok) throw new Error(`manifest: HTTP ${r.status}`);
      return r.json();
    }));
  }
  return cache.get('__manifest');
}

export async function loadBlob(file, base = 'data') {
  if (!cache.has(file)) {
    cache.set(file, fetch(assetURL(`${base}/${file}`)).then(async (r) => {
      if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
      return r.arrayBuffer();
    }));
  }
  return cache.get(file);
}

/** A typed view on one named buffer, without copying. */
export function view(buffer, spec) {
  const Ctor = TYPES[spec.type];
  if (!Ctor) throw new Error(`unknown buffer type ${spec.type}`);
  return new Ctor(buffer, spec.offset, spec.count);
}

/** uint16 -> millimetres, straight into `out` so we never allocate per frame. */
export function dequantise(q, bboxMin, bboxSize, out) {
  const sx = bboxSize[0] / 65535, sy = bboxSize[1] / 65535, sz = bboxSize[2] / 65535;
  const ox = bboxMin[0], oy = bboxMin[1], oz = bboxMin[2];
  for (let i = 0, n = q.length; i < n; i += 3) {
    out[i] = q[i] * sx + ox;
    out[i + 1] = q[i + 1] * sy + oy;
    out[i + 2] = q[i + 2] * sz + oz;
  }
  return out;
}

/** Linear blend of two quantised states, decoded in one pass. */
export function dequantiseLerp(qa, qb, t, bboxMin, bboxSize, out) {
  const sx = bboxSize[0] / 65535, sy = bboxSize[1] / 65535, sz = bboxSize[2] / 65535;
  const ox = bboxMin[0], oy = bboxMin[1], oz = bboxMin[2];
  const u = 1 - t;
  for (let i = 0, n = qa.length; i < n; i += 3) {
    out[i] = (qa[i] * u + qb[i] * t) * sx + ox;
    out[i + 1] = (qa[i + 1] * u + qb[i + 1] * t) * sy + oy;
    out[i + 2] = (qa[i + 2] * u + qb[i + 2] * t) * sz + oz;
  }
  return out;
}

export function lerpU8ToFloat(a, b, t, out, scale = 1 / 255) {
  const u = 1 - t;
  for (let i = 0, n = a.length; i < n; i++) out[i] = (a[i] * u + b[i] * t) * scale;
  return out;
}
