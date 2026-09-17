/* Screen 6: the pulmonary vessel tree.  Same algorithm, different primitive --
   curves rather than a surface.  The slider morphs source -> registered, and
   the registered tree is coloured by its residual distance to the target, so
   the slider shows the error rather than just the motion. */

import { THREE, createStage, fitOrtho, srcColor, tgtColor } from './viewer-core.js';
import { loadBlob, view, dequantise } from './binio.js';


/**
 * Round, softened points with a depth fade.
 *
 * THREE.PointsMaterial draws square sprites and gives every point the same
 * weight, which on 43k vessel samples reads as confetti. A disc with a feathered
 * rim, and far points dimmed, lets the tree read as a volume instead.
 */
function dotMaterial(color, { size, opacity }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: color },
      uSize: { value: size },
      uOpacity: { value: opacity },
      uPixelRatio: { value: 1 },
      uNear: { value: 0 },
      uFar: { value: 1 },
    },
    vertexShader: `
      uniform float uSize;
      uniform float uPixelRatio;
      varying float vDepth;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_PointSize = uSize * uPixelRatio;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uNear;
      uniform float uFar;
      varying float vDepth;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float edge = smoothstep(0.5, 0.34, d);
        float depth = mix(0.3, 1.0, smoothstep(uFar, uNear, vDepth));
        gl_FragColor = vec4(uColor, uOpacity * edge * depth);
      }`,
  });
}

export function createLungsViewer({ container, lungs }) {
  const stage = createStage(container, { onFrame, onResize, radius: 200 });
  if (!stage) return null;

  let sourcePos, deformedPos, targetPos, livePos, geometry;
  let lines, sourceDots, targetLines, targetDots;
  let halfW = 1;
  let halfH = 1;
  let blend = 1;
  let target = 1;

  async function load() {
    const buffer = await loadBlob(lungs.file);
    const b = lungs.buffers;
    const n = lungs.sourceTreeVerts;

    sourcePos = new Float32Array(n * 3);
    deformedPos = new Float32Array(n * 3);
    dequantise(view(buffer, b.sourceTreePoints), lungs.bboxMin, lungs.bboxSize, sourcePos);
    dequantise(view(buffer, b.deformedTreePoints), lungs.bboxMin, lungs.bboxSize, deformedPos);
    livePos = new Float32Array(n * 3);

    const idx = view(buffer, b.sourceTreeIndex);

    geometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(livePos, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', posAttr);
    geometry.setIndex(new THREE.BufferAttribute(idx, 1));

    // Source red, target blue: the same two roles as the vertebra screen, so
    // the slider reads as red being carried onto blue. This replaces the
    // residual colourmap that used to tint the tree.
    const src = srcColor();
    const tgt = tgtColor();

    // toneMapped off: these are identity colours, not lit surfaces, and AgX
    // would wash them out.
    // The lines only hold the branching structure together; the dots carry the
    // weight, since WebGL pins line width to 1 px almost everywhere.
    lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
      color: src, transparent: true, opacity: 0.22, toneMapped: false,
    }));
    sourceDots = new THREE.Points(geometry, dotMaterial(src, { size: 2.8, opacity: 0.95 }));
    stage.scene.add(lines, sourceDots);

    // The target, as a quiet ghost to register against.
    const tn = lungs.targetTreeVerts;
    const tp = new Float32Array(tn * 3);
    dequantise(view(buffer, b.targetTreePoints), lungs.bboxMin, lungs.bboxSize, tp);
    targetPos = tp;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
    tg.setIndex(new THREE.BufferAttribute(view(buffer, b.targetTreeIndex), 1));
    targetLines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({
      color: tgt, transparent: true, opacity: 0.16, toneMapped: false,
    }));
    // Wider than the source dots on purpose: once registered the two clouds
    // coincide, and equal sizes would simply hide the target under the source.
    // A blue halo around each red core says "these agree" instead.
    targetDots = new THREE.Points(tg, dotMaterial(tgt, { size: 4.6, opacity: 0.55 }));
    targetDots.renderOrder = -1;
    targetLines.renderOrder = -2;
    stage.scene.add(targetLines, targetDots);

    apply(true);
    frame();
  }

  function frame() {
    // Frame what is actually on screen, not the manifest box. That box is the
    // union of six clouds -- inspiration AND expiration among them -- and those
    // differ a lot cranio-caudally, so it is far taller than anything drawn and
    // it shrank the figure to the middle of the canvas.
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (const arr of [deformedPos, targetPos]) {
      for (let i = 0; i < arr.length; i += 3) box.expandByPoint(v.fromArray(arr, i));
    }
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // Anterior view: world X across the screen, world Z up it.
    halfW = size.x / 2;
    halfH = size.z / 2;
    const d = Math.max(halfW, halfH);
    stage.controls.target.copy(c);
    const a = THREE.MathUtils.degToRad(20);
    stage.camera.position.copy(c).add(new THREE.Vector3(0, -Math.cos(a), Math.sin(a)).multiplyScalar(d * 8));
    stage.camera.up.set(0, 0, 1);
    stage.camera.near = 0.01;
    stage.camera.far = d * 40;
    fitOrtho(stage.camera, container, halfW, halfH, 1.02);

    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    const dist = stage.camera.position.distanceTo(c);
    const pr = stage.renderer.getPixelRatio();
    [sourceDots, targetDots].forEach((p) => {
      if (!p) return;
      p.material.uniforms.uNear.value = dist - radius;
      p.material.uniforms.uFar.value = dist + radius;
      p.material.uniforms.uPixelRatio.value = pr;
    });

    stage.controls.update();
    stage.invalidate();
  }

  function onResize() {
    if (livePos) fitOrtho(stage.camera, container, halfW, halfH, 1.02);
  }

  function apply(force = false) {
    if (!livePos) return;
    const u = 1 - blend;
    for (let i = 0, n = livePos.length; i < n; i++) {
      livePos[i] = sourcePos[i] * u + deformedPos[i] * blend;
    }
    geometry.attributes.position.needsUpdate = true;
    if (force) geometry.computeBoundingSphere();
    stage.invalidate();
  }

  function onFrame(dt) {
    if (Math.abs(target - blend) > 1e-4) {
      blend += (target - blend) * Math.min(1, dt * 12);
      apply();
      return true;
    }
    return false;
  }

  return {
    stage,
    load,
    setBlend(v) { target = Math.max(0, Math.min(1, v)); stage.invalidate(); },
    dispose() { stage.dispose(); },
  };
}
