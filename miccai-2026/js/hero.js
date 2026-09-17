/* The hero loop: a cloud of vertebrae condenses into one mean shape, and the
 * mean shapes assemble into the spine.
 *
 * Four beats, looping:
 *   0.0 - 3.2 s   scattered ghosts, slowly turning
 *   3.2 - 6.4 s   they draw together and their shapes converge on the mean
 *   6.4 - 8.6 s   the ghosts fade out under the solid mean shape
 *   8.6 - 14.0 s  the mean pulls back and the other 23 fly into the column
 *
 * Lit exactly like the pickers: fixed camera on the vertical selector's
 * viewpoint, subject turned rather than camera moved, so the shading never
 * shifts as the shot rotates.
 */

import {
  THREE, createStage, createScene, loadEnvironment, surfaceMaterial,
  outlineMaterial, computeNormals, srcColor, boneColor, fitOrtho,
  OUTLINE_FRACTION,
} from './viewer-core.js';
import { loadManifest, loadBlob, view } from './binio.js';
import { buildAtlasGeometries, atlasCentre, regionColor } from './atlas-data.js';

const BEATS = { scatter: 3.2, converge: 6.4, solidify: 8.6, assemble: 14.0 };
const LOOP = BEATS.assemble;

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const phase = (t, a, b) => clamp01((t - a) / (b - a));

/** Soft round points, the same treatment the lung trees use. */
function ghostMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: color },
      uSize: { value: 2.4 },
      uOpacity: { value: 0.5 },
      uPixelRatio: { value: 1 },
    },
    vertexShader: `
      uniform float uSize;
      uniform float uPixelRatio;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * uPixelRatio;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        gl_FragColor = vec4(uColor, uOpacity * smoothstep(0.5, 0.3, d));
      }`,
  });
}

export async function createHero({ container }) {
  const stage = createStage(container, { onFrame, onResize, radius: 100 });
  if (!stage) return null;

  let ghosts, ghostGeom, ghostPoints;
  let scatter, meanPoints, nGhosts, nPoints;
  let meanMesh, meanOutline, meanPivot;
  let column = [], columnPivot;
  let bboxMin, bboxSize, centre = new THREE.Vector3();
  let radius = 100, spineHalfW = 1, spineHalfH = 1;
  let clock = 0;
  let ready = false;

  loadEnvironment(stage.renderer).then((env) => {
    createScene(env).children.slice().forEach((c) => stage.scene.add(c));
    if (env) {
      stage.scene.environment = env;
      stage.scene.environmentIntensity = 1.2;
    }
    stage.invalidate();
  });

  /* ---------------------------------------------------------------- load -- */

  async function load() {
    const [ghostManifest, manifest] = await Promise.all([
      fetch('data/hero_ghosts/manifest.json').then((r) => r.json()),
      loadManifest(),
    ]);
    const entry = ghostManifest.labels[0];
    if (ghostManifest.synthetic) {
      console.warn('[hero] ghost cloud is SYNTHETIC:', ghostManifest.warning);
    }

    const raw = await loadBlob(ghostManifest.file, 'data/hero_ghosts');
    bboxMin = entry.bboxMin;
    bboxSize = entry.bboxSize;
    nGhosts = entry.nSubjects;
    nPoints = entry.nPoints;
    scatter = entry.scatter;

    const decode = (spec) => {
      const q = view(raw, spec);
      const out = new Float32Array(q.length);
      for (let i = 0; i < q.length; i += 3) {
        out[i] = q[i] / 65535 * bboxSize[0] + bboxMin[0];
        out[i + 1] = q[i + 1] / 65535 * bboxSize[1] + bboxMin[1];
        out[i + 2] = q[i + 2] / 65535 * bboxSize[2] + bboxMin[2];
      }
      return out;
    };

    ghosts = decode(entry.positions);
    meanPoints = decode(entry.meanPositions);

    // One buffer for every ghost, rewritten each frame as they converge.
    const live = new Float32Array(nGhosts * nPoints * 3);
    ghostGeom = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(live, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    ghostGeom.setAttribute('position', attr);

    ghostPoints = new THREE.Points(ghostGeom, ghostMaterial(srcColor()));
    ghostPoints.material.uniforms.uPixelRatio.value = stage.renderer.getPixelRatio();
    ghostPoints.frustumCulled = false;

    await buildColumn(manifest);

    meanPivot = new THREE.Group();
    meanPivot.add(ghostPoints);
    stage.scene.add(meanPivot);

    centre.set(
      bboxMin[0] + bboxSize[0] / 2,
      bboxMin[1] + bboxSize[1] / 2,
      bboxMin[2] + bboxSize[2] / 2,
    );
    radius = 0.5 * Math.hypot(...bboxSize);
    ready = true;
    stage.invalidate();
  }

  /** The 24 atlas vertebrae, plus the one that doubles as the mean shape. */
  async function buildColumn(manifest) {
    const atlas = manifest.atlas;
    const buffer = await loadBlob(atlas.file);
    columnPivot = new THREE.Group();

    for (const { item, geometry } of buildAtlasGeometries(buffer, atlas)) {
      const mesh = new THREE.Mesh(geometry, surfaceMaterial({ color: regionColor(item.label) }));
      const outline = new THREE.Mesh(geometry, outlineMaterial(0.3));
      outline.material.uniforms.uThickness.value =
        OUTLINE_FRACTION * geometry.boundingSphere.radius;

      const home = new THREE.Vector3(...item.centroid);
      const g = new THREE.Group();
      g.add(mesh, outline);
      mesh.position.copy(home).negate();
      outline.position.copy(home).negate();
      g.position.copy(home);
      g.userData = { home, item };
      columnPivot.add(g);
      column.push({ group: g, mesh, outline, home, item });

      if (item.label === 22) {
        meanMesh = mesh;
        meanOutline = outline;
      }
    }

    const c = atlasCentre(atlas);
    spineHalfW = atlas.bboxSize[2] / 2;
    spineHalfH = atlas.bboxSize[1] / 2;
    columnPivot.userData.centre = c;
    stage.scene.add(columnPivot);
  }

  /* -------------------------------------------------------------- frames -- */

  const tmp = new THREE.Vector3();

  function writeGhosts(convergence, spreadFactor) {
    const live = ghostGeom.attributes.position.array;
    for (let g = 0; g < nGhosts; g++) {
      const ox = scatter[g][0] * spreadFactor;
      const oy = scatter[g][1] * spreadFactor;
      const oz = scatter[g][2] * spreadFactor;
      const base = g * nPoints * 3;
      for (let i = 0; i < nPoints * 3; i += 3) {
        const j = base + i;
        live[j] = (ghosts[j] + (meanPoints[i] - ghosts[j]) * convergence) + ox;
        live[j + 1] = (ghosts[j + 1] + (meanPoints[i + 1] - ghosts[j + 1]) * convergence) + oy;
        live[j + 2] = (ghosts[j + 2] + (meanPoints[i + 2] - ghosts[j + 2]) * convergence) + oz;
      }
    }
    ghostGeom.attributes.position.needsUpdate = true;
  }

  function onFrame(dt) {
    if (!ready) return false;
    clock = (clock + dt) % LOOP;
    const t = clock;

    // Ghosts hand over to the solid shape.
    const solid = easeInOut(phase(t, BEATS.converge, BEATS.solidify));

    // 80 x 1500 points is worth rewriting only while the cloud is on screen.
    if (solid < 0.99) {
      const converge = easeInOut(phase(t, BEATS.scatter, BEATS.converge));
      writeGhosts(converge, 1 - converge);
    }
    ghostPoints.material.uniforms.uOpacity.value = 0.5 * (1 - solid);
    ghostPoints.visible = solid < 0.99;

    // Column: only the mean vertebra is up during the first three beats; the
    // rest fly home from their scattered positions during the last.
    const assemble = easeInOut(phase(t, BEATS.solidify, BEATS.assemble));
    for (const c of column) {
      const isMean = c.item.label === 22;
      c.mesh.visible = isMean ? solid > 0.01 : assemble > 0.01;
      c.outline.visible = c.mesh.visible;
      if (isMean) {
        c.group.position.copy(c.home);
      } else {
        // Drift in from above/below along the column's own axis.
        const away = (c.item.label - 22) * 26;
        tmp.copy(c.home);
        tmp.z += away * (1 - assemble);
        c.group.position.copy(tmp);
      }
    }

    // Frame: tight on one vertebra, widening to the whole spine.
    const wide = easeInOut(phase(t, BEATS.solidify, BEATS.assemble));
    const target = columnPivot.userData.centre;
    stage.controls.target.lerpVectors(centre, target, wide);
    // The scattered cloud is wider than one vertebra, so the frame opens up for
    // the first beats and closes back in as the ghosts gather.
    const cloud = radius * (1 + 0.95 * (1 - easeInOut(phase(t, BEATS.scatter, BEATS.converge))));
    const halfW = cloud * 1.05 + (spineHalfW - cloud * 1.05) * wide;
    const halfH = cloud * 1.05 + (spineHalfH - cloud * 1.05) * wide;

    stage.camera.up.set(0, wide > 0.5 ? 1 : 0, wide > 0.5 ? 0 : 1);
    stage.camera.position.copy(stage.controls.target)
      .add(new THREE.Vector3(1, 0, 0).multiplyScalar(Math.max(halfW, halfH) * 8));
    stage.camera.lookAt(stage.controls.target);
    stage.camera.near = 0.01;
    stage.camera.far = Math.max(halfW, halfH) * 40;
    fitOrtho(stage.camera, container, halfW, halfH, 1.08);

    // Slow turn throughout, easing off once the column is assembled.
    const spin = t * 0.16 * (1 - 0.7 * wide);
    meanPivot.rotation.z = spin;
    columnPivot.rotation.z = spin * (1 - wide);

    return true;
  }

  function onResize() {
    if (ready) stage.invalidate();
  }

  stage.controls.enabled = false;
  await load();
  return { stage, dispose: () => stage.dispose() };
}
