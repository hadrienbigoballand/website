/* The Blender look, in WebGL.
 *
 * Everything here is a deliberate match for blender/miccai_style.py:
 *   VIEW_TRANSFORM "AgX"           -> THREE.AgXToneMapping
 *   world forest.exr @ 1.2         -> the same EXR through PMREM, intensity 1.2
 *   Principled, roughness .7       -> MeshStandardMaterial, metalness 0
 *   patte_tail() AO multiply @ .5  -> baseColor *= (0.5 + 0.5 * ao), baked
 *   mat_contour() inverted hull    -> BackSide shell pushed along the normal
 *   ortho cam, 20 deg tilt         -> OrthographicCamera, same default pose
 *
 * The one honest divergence: Cycles bounces light between parts and we do not,
 * so there is no colour bleeding.  On roughness-0.7 dielectrics under an HDRI
 * that is invisible.  The AO term is what carries the read, and it is baked.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { assetURL } from './asset-base.js';

export const CAM_TILT_DEG = 20.0;
export const ROUGHNESS = 0.7;
export const AO_MIX = 0.5;
export const WORLD_STRENGTH = 1.2;
export const TRAIT_FRACTION = 1.15 / 348.267; // contour thickness / frame height

// SRC_BASE_LINEAR pushed through HueSaturation(saturation=1.3) in Blender.
export const SRC_LINEAR = [1.0, 0.0, 0.008];
export const TGT_HEX = 0x1f77b4;
export const CONTOUR_DAY = 0x15151a;   // CONTOUR_HEX
export const CONTOUR_NIGHT = 0xe8e8ec; // HUD_HEX: a near-black rim vanishes on #18181a

// Every picker draws unselected anatomy in this tone and the selection in
// SRC red, so the vertical selector and the filmstrip share one grammar.
export const BONE_HEX = 0xb9b2a6;

let envPromise = null;

export function isNight() {
  return document.body.classList.contains('night');
}

export function srcColor() {
  return new THREE.Color().setRGB(...SRC_LINEAR, THREE.LinearSRGBColorSpace);
}

export function tgtColor() {
  return new THREE.Color().setHex(TGT_HEX, THREE.SRGBColorSpace);
}

export function boneColor() {
  return new THREE.Color().setHex(BONE_HEX, THREE.SRGBColorSpace);
}

/* ------------------------------------------------------------- renderer -- */

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,          // film_transparent: the page shows through
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearAlpha(0);
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  return renderer;
}

/**
 * forest.exr, the same file Blender lights these renders with.
 *
 * The EXR itself is fetched and parsed once -- that part is CPU data and is
 * shared.  The PMREM cube is NOT: it is a GPU texture owned by the renderer
 * that produced it, and each stage on this page has its own WebGLRenderer and
 * so its own GL context.  Handing one stage's cube to another samples an
 * unbound texture: no image-based light at all, leaving only the directional
 * key, which is why the atlas rendered as a black spine with a lit top edge.
 */
function loadEquirect() {
  if (!envPromise) {
    envPromise = new Promise((resolve) => {
      new EXRLoader().load(
        assetURL('assets/forest.exr'),
        (texture) => resolve(texture),
        undefined,
        () => resolve(null), // no HDRI: the lights below still give a readable image
      );
    });
  }
  return envPromise;
}

const envByRenderer = new WeakMap();

export async function loadEnvironment(renderer) {
  if (envByRenderer.has(renderer)) return envByRenderer.get(renderer);
  const texture = await loadEquirect();
  if (!texture) return null;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const env = pmrem.fromEquirectangular(texture).texture;
  pmrem.dispose();
  envByRenderer.set(renderer, env);
  return env;
}

export function createScene(env) {
  const scene = new THREE.Scene();
  if (env) {
    scene.environment = env;
    scene.environmentIntensity = WORLD_STRENGTH;
  }
  // SUN_ENERGY 2.0, small angle: a crisp key from above-front.
  const key = new THREE.DirectionalLight(0xffffff, env ? 1.4 : 2.6);
  key.position.set(0.35, 0.9, 0.6);
  scene.add(key);
  if (!env) {
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a46, 1.1));
  }
  return scene;
}

/* --------------------------------------------------------------- camera -- */

/** Orthographic, like Cam_Src: it also makes the outline a constant width. */
export function createCamera(aspect, radius) {
  const h = radius * 1.25;
  const cam = new THREE.OrthographicCamera(-h * aspect, h * aspect, h, -h, 0.01, radius * 40);
  const a = THREE.MathUtils.degToRad(CAM_TILT_DEG);
  cam.position.set(0, Math.sin(a) * radius * 6, Math.cos(a) * radius * 6);
  cam.lookAt(0, 0, 0);
  return cam;
}

export function frameHeight(camera) {
  return (camera.top - camera.bottom) / camera.zoom;
}

/**
 * Fit an orthographic camera around a half-extent, honouring BOTH axes.
 *
 * Sizing from the vertical alone is fine for a subject that is roughly square,
 * but the atlas laid on its side is 576 mm long and 115 mm deep: driven by its
 * height it would run off both edges. Whichever axis is tighter wins.
 */
export function fitOrtho(camera, container, halfW, halfH, margin = 1.06) {
  const w = container.clientWidth || 1;
  const h = container.clientHeight || 1;
  const aspect = w / h;
  const half = Math.max(halfH * margin, (halfW * margin) / aspect);
  camera.top = half;
  camera.bottom = -half;
  camera.left = -half * aspect;
  camera.right = half * aspect;
  camera.updateProjectionMatrix();
  return half;
}

export function createControls(camera, dom) {
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.enablePan = false;
  controls.zoomSpeed = 0.7;
  controls.rotateSpeed = 0.8;

  /* Touch is set up by armTouch() on the stage, not here: on a phone what one
   * finger does depends on whether the reader has asked for the model, and
   * that is a piece of state, not a constant. The mouse is untouched. */
  return controls;
}

/* One finger, but only once you have asked for it.
 *
 * OrbitControls' default is one-finger rotate. On a page that scrolls, that is
 * a trap: a reader who puts a thumb on the vertebra to get past it spins the
 * bone instead and never reaches the document -- and three of these screens are
 * most of a canvas. The first fix here was to give ONE to the page and rotation
 * to two fingers. Safe, and nearly invisible: nobody guesses a two-finger
 * gesture on a still image, so most visitors would never learn the model turns
 * at all.
 *
 * So the stage is inert until it is tapped, and then one finger rotates it,
 * until a tap lands somewhere else. Two states, each with a visible label, and
 * a way out that does not require knowing anything.
 *
 * `click`, not `pointerdown`, is what arms it: a click only follows a tap that
 * did NOT become a drag, so a finger that sweeps across the figure to scroll
 * past it leaves the stage exactly as it was.
 *
 * touch-action has to be written on the element, not in the sheet, because
 * OrbitControls sets `style.touchAction = 'none'` on its own dom element in the
 * constructor -- an inline style no rule in the stylesheet can outrank. Left as
 * it found it, the idle stage would swallow the scroll gesture AND do nothing
 * with it, which is the trap again with extra steps.
 */
export function armTouch(container, controls) {
  const canvas = controls.domElement;
  let armed = null;

  const set = (on) => {
    if (on === armed) return;
    armed = on;
    container.dataset.touch = on ? 'armed' : 'idle';
    controls.touches = on
      ? { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }
      : { ONE: null, TWO: THREE.TOUCH.ROTATE };
    canvas.style.touchAction = on ? 'none' : 'pan-y';
  };
  set(false);

  container.addEventListener('click', () => set(true));
  // Capture, so it still fires when the tap lands on a control that stops the
  // event -- Play, a filmstrip frame, the spine.
  document.addEventListener('pointerdown', (e) => {
    if (!container.contains(e.target)) set(false);
  }, true);

  return { release: () => set(false) };
}

/* ------------------------------------------------------------ materials -- */

/** Principled + the baked AO multiply.  Needs an `aAo` float attribute. */
/* The kernel halo of video 2, as a shader.
 *
 * In Blender it is a per-vertex scalar, k_j = exp(-|q_j - q_w| / r) with q_w a
 * witness point, pushed through a colour ramp and into both base colour and
 * emission. Here q_w is wherever the pointer is, so the same quantity follows
 * the mouse -- and because the viewer re-uploads `position` on every morph
 * frame, the distance is measured on the CURRENT deformed geometry, which is
 * what the Blender script does too ("recomputed on the moved points").
 *
 * Euclidean distance, not geodesic: that is what K is in the method, and it
 * means the halo reaches round the bone -- points on the far side of the body
 * light up because they are near in space, not along the surface. It surprises
 * on first sight and it is correct.
 *
 * The ramp is lifted stop for stop from mat_halo(). Its comment explains why
 * it is cool and not warm: a warm ramp on a red bone, next to amber arrows,
 * put 95 % of the delivered frame between luminance 130 and 204 and the halo,
 * the surface and the field read as one smear. Plum -> indigo -> aqua separates
 * it from both, and stop 0 is the mesh's own red so the skirt fades into the
 * surface rather than ending on an edge. Values are linear-light, since that
 * is the space the fragment shader works in. */
const HALO_RAMP = `
vec3 haloRamp(float t) {
  vec3 c0 = vec3(1.0, 0.0345, 0.0424);
  vec3 c1 = vec3(0.26225, 0.04231, 0.10224);
  vec3 c2 = vec3(0.04971, 0.11444, 0.39157);
  vec3 c3 = vec3(0.21223, 0.76815, 0.7454);
  if (t < 0.30) return mix(c0, c1, t / 0.30);
  if (t < 0.62) return mix(c1, c2, (t - 0.30) / 0.32);
  return mix(c2, c3, min((t - 0.62) / 0.38, 1.0));
}
`;

/* The FPFH colouring of video 1.
 *
 * The colours themselves are NOT computed here. They are the joint PCA of the
 * two clouds' FPFH histograms, fitted upstream on the CONCATENATION of source
 * and target -- fitted per cloud, homologous regions cannot come out with
 * comparable colours at all, which is the whole point of showing them. The
 * page receives the finished display values and does two things to them, both
 * of which Blender also does and neither of which is a choice:
 *
 *   srgb -> linear, because the PCA maps to display values and a shader works
 *   in linear; and a saturation of 1.45, the FPFH palette's own, applied in
 *   HSV exactly as Blender's Hue/Saturation node applies it.
 *
 * Reimplementing the projection here instead would let the page and the film
 * drift apart on the one figure whose argument is that the two agree. */
const FEATURE_UNIFORMS = [
  'uFeatMix', 'uFeatMode', 'uXyzComps', 'uXyzMu', 'uXyzLo', 'uXyzHi',
  'uBothPos', 'uBothNrm', 'uBothMuPos', 'uBothMuNrm', 'uBothLo', 'uBothHi',
  'uBothWn',
];

/** Rows of a 3x3 given as [[r0],[r1],[r2]] into a three Matrix3 (column-major
 *  storage, so the rows go in transposed). */
export function setMatrix3Rows(m3, rows) {
  m3.set(rows[0][0], rows[0][1], rows[0][2],
         rows[1][0], rows[1][1], rows[1][2],
         rows[2][0], rows[2][1], rows[2][2]);
  return m3;
}

const FEATURE_COLOUR = `
vec3 featRgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)),
              d / (q.x + 1e-10), q.x);
}
vec3 featHsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
vec3 featureColour(vec3 srgb) {
  vec3 lin = pow(clamp(srgb, 0.0, 1.0), vec3(2.2));
  vec3 hsv = featRgb2hsv(lin);
  hsv.y = clamp(hsv.y * 1.45, 0.0, 1.0);
  return featHsv2rgb(hsv);
}
/* The two LIVE colourings. Each is affine in register.py's feature vector, so
   it is one small matrix per block plus a constant -- which is why the
   coordinate part can read the position the point currently has and the normal
   part the normal it currently has, and the colour really does follow the bone
   as it deforms. Only the 33-dimensional FPFH block is fixed per vertex, folded
   upstream into aBothPart.
   COORD_SATURATION is 1.0 in the film, so unlike the FPFH palette these two get
   no saturation lift: linearise and stop. */
vec3 coordColour(vec3 posMm) {
  vec3 p = uXyzComps * (posMm - uXyzMu);
  return pow(clamp((p - uXyzLo) / (uXyzHi - uXyzLo), 0.0, 1.0), vec3(2.2));
}
vec3 bothColour(vec3 posMm, vec3 nrm) {
  vec3 p = uBothPos * (posMm - uBothMuPos)
         + uBothNrm * (uBothWn * nrm - uBothMuNrm)
         + vBothPart;
  return pow(clamp((p - uBothLo) / (uBothHi - uBothLo), 0.0, 1.0), vec3(2.2));
}
`;

export function surfaceMaterial({
  color, opacity = 1, roughness = ROUGHNESS, kernel = false, features = false,
}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.0,
    transparent: opacity < 1,
    opacity,
    side: THREE.FrontSide,
  });

  // The halo replaces the base colour BEFORE the AO multiply, because in
  // Blender the ramp is what patte_tail() receives -- the modelling darkens the
  // halo as it darkens the bone, and a halo that ignored AO would float.
  // uFeatMode: 0 coordinates, 1 FPFH, 2 the full vector -- video 1's own order.
  const featureBlock = features ? `
  {
    vec3 fc = uFeatMode < 0.5 ? coordColour(vKernelPos)
            : (uFeatMode < 1.5 ? featureColour(vFeat)
                               : bothColour(vKernelPos, normalize(vFeatNormal)));
    diffuseColor.rgb = mix(diffuseColor.rgb, fc, uFeatMix);
  }` : '';

  const haloColour = kernel ? `
  {
    float kd = distance(vKernelPos, uKernelCentre) / max(uKernelRadius, 1e-4);
    float k = pow(exp(-kd), 0.75);
    vKernelShaped = k * uKernelMix;
    diffuseColor.rgb = mix(diffuseColor.rgb, haloRamp(vKernelShaped), uKernelMix);
  }` : '';

  mat.onBeforeCompile = (shader) => {
    if (kernel) {
      shader.uniforms.uKernelCentre = mat.userData.uKernelCentre;
      shader.uniforms.uKernelRadius = mat.userData.uKernelRadius;
      shader.uniforms.uKernelMix = mat.userData.uKernelMix;
    }
    if (features) {
      for (const k of FEATURE_UNIFORMS) shader.uniforms[k] = mat.userData[k];
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aAo;
varying float vAo;\nvarying vec3 vKernelPos;${features ? `
attribute vec3 aFeat;
varying vec3 vFeat;
attribute vec3 aBothPart;
varying vec3 vBothPart;
varying vec3 vFeatNormal;` : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vAo = aAo;\n  vKernelPos = transformed;${features ? `
  vFeat = aFeat;
  vBothPart = aBothPart;
  vFeatNormal = objectNormal;` : ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vAo;
varying vec3 vKernelPos;${features ? `
varying vec3 vFeat;
varying vec3 vBothPart;
varying vec3 vFeatNormal;
uniform float uFeatMix;
uniform float uFeatMode;
uniform mat3 uXyzComps, uBothPos, uBothNrm;
uniform vec3 uXyzMu, uXyzLo, uXyzHi;
uniform vec3 uBothMuPos, uBothMuNrm, uBothLo, uBothHi;
uniform float uBothWn;
${FEATURE_COLOUR}` : ''}${kernel ? `
uniform vec3 uKernelCentre;
uniform float uKernelRadius;
uniform float uKernelMix;
float vKernelShaped;
${HALO_RAMP}` : ''}`)
      // Blender MixRGB MULTIPLY at factor f: A*(1-f) + A*B*f = A*(1-f+f*B).
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>${featureBlock}${haloColour}
  diffuseColor.rgb *= (1.0 - ${AO_MIX.toFixed(3)} + ${AO_MIX.toFixed(3)} * vAo);`,
      );
    if (kernel) {
      // Emission strength 1.1 * k, on the ramp colour: mat_halo() again.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  totalEmissiveRadiance += haloRamp(vKernelShaped) * (vKernelShaped * 1.1);`,
      );
    }
  };
  // Distinct key, or three reuses another material's compiled program -- and
  // the two variants here differ, so the key has to say which one this is.
  mat.customProgramCacheKey = () =>
    `miccai-ao-surface${kernel ? '-kernel' : ''}${features ? '-feat' : ''}`;

  if (kernel) {
    // Held on the material so the caller can write to them before the program
    // exists; onBeforeCompile hands the same objects to the shader.
    mat.userData.uKernelCentre = { value: new THREE.Vector3() };
    mat.userData.uKernelRadius = { value: 10.0 };
    mat.userData.uKernelMix = { value: 0.0 };
  }
  if (features) {
    mat.userData.uFeatMix = { value: 0.0 };
    mat.userData.uFeatMode = { value: 1.0 };
    mat.userData.uXyzComps = { value: new THREE.Matrix3() };
    mat.userData.uBothPos = { value: new THREE.Matrix3() };
    mat.userData.uBothNrm = { value: new THREE.Matrix3() };
    for (const k of ['uXyzMu', 'uXyzLo', 'uXyzHi',
                     'uBothMuPos', 'uBothMuNrm', 'uBothLo', 'uBothHi']) {
      mat.userData[k] = { value: new THREE.Vector3() };
    }
    mat.userData.uBothWn = { value: 1.0 };
  }
  return mat;
}

/** mat_contour(): backfaces of a shell pushed out along the normal. */
export function outlineMaterial(thickness) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uThickness: { value: thickness },
      uColor: { value: new THREE.Color().setHex(isNight() ? CONTOUR_NIGHT : CONTOUR_DAY, THREE.SRGBColorSpace) },
    },
    vertexShader: `
      uniform float uThickness;
      void main() {
        vec3 p = position + normalize(normal) * uThickness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      // No *_pars_fragment includes here: three already prepends them to every
      // ShaderMaterial, and repeating them is a redefinition error.
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
  });
  return mat;
}

/**
 * Screen-constant width, but never wider than the geometry can carry.
 *
 * TRAIT_FRACTION of the frame height is Blender's rule and it holds only while
 * the subject fills the frame.  Framing all 576 mm of spine makes that 2.1 mm
 * of world-space shell, and a 2.1 mm inverted hull around a 4 mm transverse
 * process puts its backfaces in front of the real surface everywhere -- the
 * outline stops being a rim and becomes a black fill.  Clamping to a fraction
 * of the mesh's own radius keeps the drawn look at every framing.
 */
export const OUTLINE_FRACTION = 0.012;

export function updateOutlineThickness(outline, camera, radius) {
  const screen = TRAIT_FRACTION * frameHeight(camera);
  const th = Math.min(screen, OUTLINE_FRACTION * radius);
  if (Math.abs(outline.material.uniforms.uThickness.value - th) < 1e-7) return false;
  outline.material.uniforms.uThickness.value = th;
  return true;
}

export function refreshOutlineColor(mat) {
  mat.uniforms.uColor.value.setHex(isNight() ? CONTOUR_NIGHT : CONTOUR_DAY, THREE.SRGBColorSpace);
}

/* ------------------------------------------------------------- geometry -- */

/** Area-weighted smooth normals, in place. Called on every morph frame. */
export function computeNormals(positions, index, normals) {
  normals.fill(0);
  for (let f = 0, n = index.length; f < n; f += 3) {
    const a = index[f] * 3, b = index[f + 1] * 3, c = index[f + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const e1x = positions[b] - ax, e1y = positions[b + 1] - ay, e1z = positions[b + 2] - az;
    const e2x = positions[c] - ax, e2y = positions[c + 1] - ay, e2z = positions[c + 2] - az;
    // Unnormalised cross product: its length is twice the area, which is the
    // weight we want anyway.
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    normals[a] += nx; normals[a + 1] += ny; normals[a + 2] += nz;
    normals[b] += nx; normals[b + 1] += ny; normals[b + 2] += nz;
    normals[c] += nx; normals[c + 1] += ny; normals[c + 2] += nz;
  }
  for (let i = 0, n = normals.length; i < n; i += 3) {
    const x = normals[i], y = normals[i + 1], z = normals[i + 2];
    const len = Math.hypot(x, y, z);
    if (len > 0) {
      const k = 1 / len;
      normals[i] = x * k; normals[i + 1] = y * k; normals[i + 2] = z * k;
    }
  }
  return normals;
}

/**
 * Where a mesh actually lands on screen, in container pixels.
 *
 * Anchoring a label to a world-space extreme (the lowest Y, say) only reads as
 * "below" while the camera keeps its original orientation; orbit the figure and
 * the label wanders off. Projecting the eight bounding-box corners and taking
 * the screen-space extremes is orientation-proof and costs eight transforms.
 */
const _corner = new THREE.Vector3();

export function projectedBounds(geometry, camera, container) {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const w = container.clientWidth;
  const h = container.clientHeight;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;

  for (let i = 0; i < 8; i++) {
    _corner.set(
      i & 1 ? bb.max.x : bb.min.x,
      i & 2 ? bb.max.y : bb.min.y,
      i & 4 ? bb.max.z : bb.min.z,
    ).project(camera);
    const x = (_corner.x * 0.5 + 0.5) * w;
    const y = (-_corner.y * 0.5 + 0.5) * h;
    if (x < left) left = x;
    if (x > right) right = x;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  return { left, right, top, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2 };
}

/* ---------------------------------------------------------------- stage -- */

/**
 * A viewer bound to one `.stage` element: sized to it, rendered only while it
 * is on screen, and torn down cleanly.  `onFrame(dt)` may return true to ask
 * for another frame when nothing else changed.
 */
export function createStage(container, { onFrame, onResize, radius = 1 } = {}) {
  let renderer;
  try {
    renderer = createRenderer(container);
  } catch (err) {
    container.dataset.failed = 'true';
    container.dataset.failedMessage = 'This figure needs WebGL, which this browser blocked.';
    return null;
  }

  const scene = new THREE.Scene();
  const camera = createCamera(1, radius);
  const controls = createControls(camera, renderer.domElement);
  const touch = matchMedia('(max-width: 820px)').matches
    ? armTouch(container, controls)
    : null;

  const stage = {
    renderer, scene, camera, controls,
    dirty: true,
    visible: false,
    invalidate() { stage.dirty = true; },
    dispose() {
      observer.disconnect();
      resize.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };

  const resize = new ResizeObserver(() => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    if (onResize) {
      onResize(w, h);
    } else {
      const aspect = w / h;
      const half = (camera.top - camera.bottom) / 2;
      camera.left = -half * aspect;
      camera.right = half * aspect;
      camera.updateProjectionMatrix();
    }
    stage.dirty = true;
  });
  resize.observe(container);

  // A stage that is scrolled away costs nothing -- and must not still be
  // holding one finger hostage when the reader comes back to it later.
  const observer = new IntersectionObserver(
    ([e]) => {
      stage.visible = e.isIntersecting;
      stage.dirty = true;
      if (!e.isIntersecting && touch) touch.release();
    },
    { rootMargin: '120px' },
  );
  observer.observe(container);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    if (!stage.visible) return;
    const dt = clock.getDelta();
    const moved = controls.update();
    const wants = onFrame ? onFrame(dt) : false;
    if (stage.dirty || moved || wants) {
      renderer.render(stage.scene, stage.camera);
      stage.dirty = false;
    }
  });

  return stage;
}

export { THREE };
