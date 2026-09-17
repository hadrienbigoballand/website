/* Shared by the atlas figure and the spine selector: both draw the same 24
   meshes from atlas.bin, only the framing and the colouring differ. */

import { THREE, computeNormals } from './viewer-core.js';
import { view, dequantise } from './binio.js';

/** Per-region ramps: cervical cool, thoracic warm, lumbar red. */
const REGIONS = [
  { from: 1, to: 7, a: 0x1c3f74, b: 0xa9d8ea },   // C1..C7
  { from: 8, to: 19, a: 0xb0621b, b: 0xf6e7c8 },  // T1..T12
  { from: 20, to: 24, a: 0x8e1b2e, b: 0xf3c6ce }, // L1..L5
];

export function regionColor(label) {
  const r = REGIONS.find((x) => label >= x.from && label <= x.to) || REGIONS[1];
  const t = r.to === r.from ? 0 : (label - r.from) / (r.to - r.from);
  const a = new THREE.Color().setHex(r.a, THREE.SRGBColorSpace);
  const b = new THREE.Color().setHex(r.b, THREE.SRGBColorSpace);
  return a.lerp(b, t);
}

/** Decode every vertebra into a ready-to-render geometry. */
export function buildAtlasGeometries(buffer, atlas) {
  return atlas.vertebrae.map((item) => {
    const idx = view(buffer, item.buffers.faces);
    const pos = new Float32Array(item.nVerts * 3);
    dequantise(view(buffer, item.buffers.positions), atlas.bboxMin, atlas.bboxSize, pos);
    const nrm = new Float32Array(item.nVerts * 3);
    computeNormals(pos, idx, nrm);

    const aoU8 = view(buffer, item.buffers.ao);
    const ao = new Float32Array(item.nVerts);
    for (let i = 0; i < aoU8.length; i++) ao[i] = aoU8[i] / 255;

    const g = new THREE.BufferGeometry();
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('aAo', new THREE.BufferAttribute(ao, 1));
    g.computeBoundingSphere();
    // Labels anchor to the projected box, so it has to exist up front.
    g.computeBoundingBox();
    return { item, geometry: g };
  });
}

export function atlasCentre(atlas) {
  return new THREE.Vector3(
    atlas.bboxMin[0] + atlas.bboxSize[0] / 2,
    atlas.bboxMin[1] + atlas.bboxSize[1] / 2,
    atlas.bboxMin[2] + atlas.bboxSize[2] / 2,
  );
}
