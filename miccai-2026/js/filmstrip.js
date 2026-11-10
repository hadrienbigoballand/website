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
 *
 * The strip follows the big view live, frame for frame. What made that too
 * slow to do was never the 32 draws -- at this size they cost about a
 * millisecond -- but decoding the 16 states and recomputing their normals on
 * every pass. Those depend on the vertebra alone, not on the angle, so they are
 * built once per load and a redraw is then only a rotation and the draws.
 */

import {
  THREE, createScene, loadEnvironment, surfaceMaterial, outlineMaterial,
  refreshOutlineColor, computeNormals, srcColor, boneColor, OUTLINE_FRACTION, syncMatcap,
} from './viewer-core.js';

// The vertical selector's viewpoint: offset along +X, +Z up. Copied here so a
// thumbnail is lit exactly as a vertebra in the column is.
const REF_OFFSET = new THREE.Vector3(1, 0, 0);
const REF_UP = new THREE.Vector3(0, 0, 1);

const RENDER_PX = 192;   // offscreen square, downsampled into each thumbnail


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

  let mesh, outline, pivot;
  let states = [];      // { geometry, thickness } per step, built once per load
  let builtFor = null;  // the index array the states were built from

  /** Decode every step of the loaded vertebra into its own static geometry.
   *  The viewer makes a fresh index view on each load, so its identity is the
   *  "has the vertebra changed" test. */
  function ensureStates(data) {
    if (builtFor === data.index) return;
    dispose();
    builtFor = data.index;

    const index = new THREE.BufferAttribute(data.index, 1);
    for (let i = 0; i < frames.length; i++) {
      const positions = new Float32Array(data.nVerts * 3);
      const normals = new Float32Array(data.nVerts * 3);
      const ao = new Float32Array(data.nVerts);
      viewer.sampleState(i + 1, positions, ao);
      computeNormals(positions, data.index, normals);

      const geometry = new THREE.BufferGeometry();
      geometry.setIndex(index);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geometry.setAttribute('aAo', new THREE.BufferAttribute(ao, 1));
      geometry.computeBoundingSphere();
      // Same fraction of the mesh as the column's clamped rule.
      states.push({ geometry, thickness: OUTLINE_FRACTION * geometry.boundingSphere.radius });
    }

    mesh = new THREE.Mesh(states[0].geometry, surfaceMaterial({ color: boneColor() }));
    outline = new THREE.Mesh(states[0].geometry, outlineMaterial(0.2));
    // The geometry sits in patient coordinates, so it is shifted back to the
    // origin before the pivot can spin it about its own centre.
    pivot = new THREE.Group();
    pivot.add(mesh, outline);
    scene.add(pivot);
  }

  function dispose() {
    [mesh, outline].forEach((m) => { if (m) m.material.dispose(); });
    if (pivot) scene.remove(pivot);
    states.forEach(({ geometry }) => geometry.dispose());
    states = [];
    builtFor = null;
    mesh = outline = pivot = null;
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

    ensureStates(data);
    aimCamera(data);
    syncMatcap(renderer, scene, camera);

    const dpr = Math.min(window.devicePixelRatio, 2);
    const bone = boneColor();
    const src = srcColor();

    for (let i = 0; i < frames.length; i++) {
      mesh.geometry = outline.geometry = states[i].geometry;
      outline.material.uniforms.uThickness.value = states[i].thickness;

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

  // At most one redraw per displayed frame, however many 'change' events the
  // controls fire in between: a drag sends one per pointer event.
  let queued = 0;
  function schedule() {
    if (queued) return;
    queued = requestAnimationFrame(() => { queued = 0; draw(); });
  }

  /* Rotating the big vertebra rotates the strip with it -- on release, not
   * during the drag, with a mouse as with a finger. While the pointer is down
   * the strip holds still; it catches up the moment it lifts. (On a phone the
   * live version also made the big view stutter: copying a WebGL canvas into a
   * 2D one makes the GPU finish its frame first, 32 times per frame of a drag.)
   * The controls are damped, so the bone then coasts on a little: one more
   * redraw once it has come to rest, not one per frame of the glide. */
  const SETTLE_MS = 120;
  const controls = viewer.stage.controls;
  let gesture = false;
  let settle = null;

  controls.addEventListener('start', () => {
    gesture = true;
    clearTimeout(settle);
  });
  controls.addEventListener('end', () => {
    if (!gesture) return;
    gesture = false;
    schedule();                                  // on release, straight away
  });
  controls.addEventListener('change', () => {
    if (gesture) return;                         // pointer down: wait for it
    clearTimeout(settle);                        // coasting, or set by code
    settle = setTimeout(schedule, SETTLE_MS);
  });
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
      cancelAnimationFrame(queued);
      clearTimeout(settle);
      dispose();
      renderer.dispose();
    },
  };
}
