/* The 16 steps as 16 thumbnails of the vertebra itself.
 *
 * Drawn live rather than pre-rendered in Blender, for three reasons: it works
 * for all 24 vertebrae with nothing to prepare, it adds no payload because the
 * states are already in memory, and it can follow the main camera -- rotate the
 * vertebra and the whole strip rotates with it, which a baked render cannot do.
 *
 * At this size the shading Blender would add is not resolvable anyway; what
 * survives a 70 px thumbnail is the silhouette and the AO gradient, and both
 * come through the same material path the big view uses.
 *
 * The camera here never moves. It is parked on the vertical selector's own
 * viewpoint, so the world-fixed key and the world-fixed HDRI stand in exactly
 * the relation to it that they do in the column -- shadow on the left, and the
 * same shading whatever angle the user is looking at. Following the main view
 * is done by turning the VERTEBRA instead, which shows the chosen angle without
 * moving anything that lights it. Rotating the camera and counter-rotating the
 * environment was the first attempt; a probe sphere showed the shading still
 * swinging by 60% across angles, so it went.
 */

import {
  THREE, createScene, loadEnvironment, surfaceMaterial, outlineMaterial,
  refreshOutlineColor, computeNormals, srcColor, boneColor, OUTLINE_FRACTION,
} from './viewer-core.js';

// The vertical selector's viewpoint: offset along +X, +Z up. Copied here so a
// thumbnail is lit exactly as a vertebra in the column is.
const REF_OFFSET = new THREE.Vector3(1, 0, 0);
const REF_UP = new THREE.Vector3(0, 0, 1);

const RENDER_PX = 192;   // offscreen square, downsampled into each thumbnail
const REDRAW_DELAY = 140; // ms of camera stillness before the strip re-renders


export function createFilmstrip({ container, manifest, viewer, onSeek }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      // drawImage() reads the drawing buffer after the render call returns.
      preserveDrawingBuffer: true,
    });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(RENDER_PX, RENDER_PX, false);
  renderer.setClearAlpha(0);
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  let ready = false;

  loadEnvironment(renderer).then((env) => {
    createScene(env).children.slice().forEach((c) => scene.add(c));
    if (env) {
      scene.environment = env;
      scene.environmentIntensity = 1.2;
    }
    ready = true;
    schedule();
  });

  /* ------------------------------------------------------------- the row -- */

  const frames = [];
  for (let i = 0; i < manifest.nSteps; i++) {
    const btn = document.createElement('button');
    btn.className = 'frame';
    btn.setAttribute('aria-label', `Step ${i + 1}`);
    const step = manifest.steps[i];
    btn.title = `step ${i + 1} — mean displacement ${step.mean_u_norm.toFixed(2)} mm`;
    const idle = document.createElement('canvas');
    idle.className = 'c-idle';
    const live = document.createElement('canvas');
    live.className = 'c-live';
    btn.append(idle, live);
    btn.addEventListener('click', () => onSeek(i + 1));
    container.appendChild(btn);
    frames.push({
      btn,
      idle, idleCtx: idle.getContext('2d'),
      live, liveCtx: live.getContext('2d'),
    });
  }

  /* ------------------------------------------------------------ geometry -- */

  let geometry, mesh, outline, pivot, positions, normals, ao;

  function ensureGeometry(nVerts, index) {
    if (geometry && positions.length === nVerts * 3 && geometry.index.array === index) return;
    dispose();

    positions = new Float32Array(nVerts * 3);
    normals = new Float32Array(nVerts * 3);
    ao = new Float32Array(nVerts);

    geometry = new THREE.BufferGeometry();
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    const p = new THREE.BufferAttribute(positions, 3); p.setUsage(THREE.DynamicDrawUsage);
    const n = new THREE.BufferAttribute(normals, 3); n.setUsage(THREE.DynamicDrawUsage);
    const a = new THREE.BufferAttribute(ao, 1); a.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', p);
    geometry.setAttribute('normal', n);
    geometry.setAttribute('aAo', a);

    mesh = new THREE.Mesh(geometry, surfaceMaterial({ color: boneColor() }));
    outline = new THREE.Mesh(geometry, outlineMaterial(0.2));
    // The geometry sits in patient coordinates, so it is shifted back to the
    // origin before the pivot can spin it about its own centre.
    pivot = new THREE.Group();
    pivot.add(mesh, outline);
    scene.add(pivot);
  }

  function dispose() {
    [mesh, outline].forEach((m) => { if (m) m.material.dispose(); });
    if (pivot) scene.remove(pivot);
    if (geometry) geometry.dispose();
    geometry = mesh = outline = pivot = null;
  }

  /* -------------------------------------------------------------- render -- */

  const centre = new THREE.Vector3();

  /**
   * Fixed camera, turning subject.
   *
   * Framed on the bounding sphere, so no rotation can push the vertebra out of
   * frame, and identically for all 16 or it would jitter along the strip.
   */
  function aimCamera(data) {
    centre.set(
      data.bboxMin[0] + data.bboxSize[0] / 2,
      data.bboxMin[1] + data.bboxSize[1] / 2,
      data.bboxMin[2] + data.bboxSize[2] / 2,
    );
    const radius = 0.5 * Math.hypot(...data.bboxSize);

    camera.up.copy(REF_UP);
    camera.position.copy(centre).addScaledVector(REF_OFFSET, radius * 6);
    camera.lookAt(centre);
    const half = radius * 0.74;
    camera.left = -half; camera.right = half;
    camera.top = half; camera.bottom = -half;
    camera.near = 0.01;
    camera.far = radius * 30;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // Show what the main view shows: for the subject to face this camera the
    // way it faces the main one, turn it by q_here * q_main^-1.
    pivot.position.copy(centre);
    mesh.position.copy(centre).negate();
    outline.position.copy(centre).negate();
    pivot.quaternion
      .copy(camera.quaternion)
      .multiply(viewer.stage.camera.quaternion.clone().invert());
  }

  function draw() {
    const data = viewer.frameData;
    if (!ready || !data) return;

    ensureGeometry(data.nVerts, data.index);
    aimCamera(data);

    const dpr = Math.min(window.devicePixelRatio, 2);
    const bone = boneColor();
    const src = srcColor();

    for (let i = 0; i < frames.length; i++) {
      viewer.sampleState(i + 1, positions, ao);
      computeNormals(positions, data.index, normals);
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.normal.needsUpdate = true;
      geometry.attributes.aAo.needsUpdate = true;
      geometry.computeBoundingSphere();
      // Set once the sphere exists -- in aimCamera() it is still null on the
      // first pass. Same fraction of the mesh as the column's clamped rule.
      outline.material.uniforms.uThickness.value =
        OUTLINE_FRACTION * geometry.boundingSphere.radius;

      const { btn, idle, idleCtx, live, liveCtx } = frames[i];
      const w = Math.max(1, Math.round(btn.clientWidth * dpr));

      // Same grammar AND the same material state as the vertical selector:
      // unselected bone at 0.72, the pick at full opacity.
      mesh.material.color.copy(bone);
      renderer.render(scene, camera);
      if (idle.width !== w) { idle.width = w; idle.height = w; }
      idleCtx.clearRect(0, 0, w, w);
      idleCtx.drawImage(renderer.domElement, 0, 0, w, w);

      mesh.material.color.copy(src);
      renderer.render(scene, camera);
      if (live.width !== w) { live.width = w; live.height = w; }
      liveCtx.clearRect(0, 0, w, w);
      liveCtx.drawImage(renderer.domElement, 0, 0, w, w);
    }
  }

  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(draw, REDRAW_DELAY);
  }

  // Rotating the big vertebra rotates the strip, once the camera settles.
  viewer.stage.controls.addEventListener('change', schedule);
  window.addEventListener('themechange', () => {
    if (outline) refreshOutlineColor(outline.material);
    schedule();
  });

  const resize = new ResizeObserver(schedule);
  resize.observe(container);

  /* ----------------------------------------------------------------- api -- */

  function render(pos) {
    const current = Math.max(1, Math.ceil(pos - 1e-6)) - 1;
    frames.forEach(({ btn }, i) => {
      btn.setAttribute('aria-current', String(i === current && pos > 0));
      btn.dataset.done = String(i + 1 <= pos + 1e-6);
    });
  }

  function stepAt(clientX) {
    let best = 0;
    let bestDist = Infinity;
    frames.forEach(({ btn }, i) => {
      const r = btn.getBoundingClientRect();
      const d = Math.abs(clientX - (r.left + r.width / 2));
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best + 1;
  }

  return {
    render,
    stepAt,
    get debug() { return { scene, camera, mesh, outline, renderer }; },
    redraw: schedule,
    dispose() {
      resize.disconnect();
      clearTimeout(timer);
      dispose();
      renderer.dispose();
    },
  };
}
