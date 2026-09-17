/* Screen 3: one vertebra, its 16 registration steps, and the spine selector. */

import {
  THREE, createStage, createScene, loadEnvironment, surfaceMaterial,
  outlineMaterial, refreshOutlineColor, computeNormals, srcColor, tgtColor,
  updateOutlineThickness, setMatrix3Rows,
} from './viewer-core.js';
import { loadBlob, view, dequantise, dequantiseLerp, lerpU8ToFloat } from './binio.js';

const STEP_SECONDS = 0.42;

export function createVertebraViewer({ container, manifest, ui }) {
  // Reframing on resize is not optional: centreOn writes the orthographic
  // bounds from the container's aspect, and without this they kept whatever
  // aspect the vertebra happened to load at -- a wide-then-narrow window left
  // the bone outside its own frustum and the canvas simply went black.
  const stage = createStage(container, {
    onFrame,
    radius: 40,
    onResize: () => { if (asset) centreOn(asset); },
  });
  if (!stage) return null;

  let env = null;
  let asset = null;        // the vertebra currently loaded
  let states = [];         // Uint16Array per state
  let aoStates = [];       // Uint8Array per state
  let positions, normals, ao, index;
  let geometry, mesh, outline, targetMesh;
  let srcPivot = null, tgtPivot = null, srcCentre = null, tgtCentre = null;
  let bboxMin, bboxSize;

  let pos = 0;             // continuous position in [0, nSteps]
  let goal = 0;
  let playing = false;
  let loadToken = 0;

  loadEnvironment(stage.renderer).then((e) => {
    env = e;
    const lit = createScene(e);
    lit.children.slice().forEach((c) => stage.scene.add(c));
    if (e) {
      stage.scene.environment = e;
      stage.scene.environmentIntensity = 1.2;
    }
    stage.invalidate();
  });

  /* ------------------------------------------------------------- loading -- */

  async function load(entry) {
    const token = ++loadToken;
    const buffer = await loadBlob(entry.file);
    if (token !== loadToken) return; // a faster click won

    asset = entry;
    bboxMin = entry.bboxMin;
    bboxSize = entry.bboxSize;

    const b = entry.buffers;
    const nV = entry.nVerts;
    index = view(buffer, b.faces);
    const allPos = view(buffer, b.positions);
    const allAo = view(buffer, b.ao);
    states = [];
    aoStates = [];
    for (let s = 0; s < entry.nStates; s++) {
      states.push(allPos.subarray(s * nV * 3, (s + 1) * nV * 3));
      aoStates.push(allAo.subarray(s * nV, (s + 1) * nV));
    }

    positions = new Float32Array(nV * 3);
    normals = new Float32Array(nV * 3);
    ao = new Float32Array(nV);

    disposeMeshes();

    geometry = new THREE.BufferGeometry();
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    const posAttr = new THREE.BufferAttribute(positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    const nrmAttr = new THREE.BufferAttribute(normals, 3);
    nrmAttr.setUsage(THREE.DynamicDrawUsage);
    const aoAttr = new THREE.BufferAttribute(ao, 1);
    aoAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', posAttr);
    geometry.setAttribute('normal', nrmAttr);
    geometry.setAttribute('aAo', aoAttr);

    // aFeat has to exist at compile time even when the vertebra carries no
    // colours, or a placeholder would need a second program; it is simply zero
    // there and uFeatMix never leaves 0.
    const feat = new Float32Array(nV * 3);
    if (b.fpfhColor) {
      const u8 = view(buffer, b.fpfhColor);
      for (let i = 0; i < feat.length; i++) feat[i] = u8[i] / 255;
    }
    geometry.setAttribute('aFeat', new THREE.BufferAttribute(feat, 3));
    geometry.setAttribute('aBothPart', new THREE.BufferAttribute(
      b.bothPart ? Float32Array.from(view(buffer, b.bothPart)) : new Float32Array(nV * 3), 3));

    mesh = new THREE.Mesh(geometry, surfaceMaterial({
      color: srcColor(), kernel: true, features: true,
    }));
    outline = new THREE.Mesh(geometry, outlineMaterial(0.1));

    // Each bone hangs under a group parked on its own centre, with the mesh
    // pushed back by that centre inside it. Rotating the group then spins the
    // bone in place -- which is what "side by side, same rotation" has to mean:
    // orbiting the camera would swing around the PAIR and slide them past each
    // other instead of turning each one where it stands.
    srcCentre = new THREE.Vector3(
      entry.bboxMin[0] + entry.bboxSize[0] / 2,
      entry.bboxMin[1] + entry.bboxSize[1] / 2,
      entry.bboxMin[2] + entry.bboxSize[2] / 2,
    );
    srcPivot = new THREE.Group();
    srcPivot.position.copy(srcCentre);
    mesh.position.copy(srcCentre).negate();
    outline.position.copy(mesh.position);
    srcPivot.add(mesh, outline);
    stage.scene.add(srcPivot);

    buildTarget(buffer, entry);
    if (featureView && !hasFeatures()) { featureView = false; stage.controls.enabled = true; }
    pushFeatureFit(entry);
    if (mesh.material.userData.uFeatMode) {
      mesh.material.userData.uFeatMode.value = featMode;
      targetMesh.material.userData.uFeatMode.value = featMode;
    }
    // A new vertebra arrives already in whatever view is open. Resetting to 0
    // here and letting onFrame ease back to 1 replayed the whole separation on
    // every click of the spine selector -- the move is a transition BETWEEN two
    // views, not a property of loading, and seeing it again says nothing.
    spread = featureView && hasFeatures() ? 1 : 0;
    spreadSide = false;
    featMix = spread;
    applySpread(spread);
    centreOn(entry, spread);

    pos = 0;
    goal = 0;
    playing = false;
    applyPosition(true);
    ui.onLoaded(entry);
    stage.invalidate();
  }

  function buildTarget(buffer, entry) {
    const b = entry.buffers;
    const tv = entry.target.nVerts;
    const tp = new Float32Array(tv * 3);
    dequantise(view(buffer, b.targetPositions), bboxMin, bboxSize, tp);
    const tn = new Float32Array(tv * 3);
    const ti = view(buffer, b.targetFaces);
    computeNormals(tp, ti, tn);
    const tao = new Float32Array(tv);
    lerpU8ToFloat(view(buffer, b.targetAo), view(buffer, b.targetAo), 0, tao);

    const g = new THREE.BufferGeometry();
    g.setIndex(new THREE.BufferAttribute(ti, 1));
    g.setAttribute('position', new THREE.BufferAttribute(tp, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(tn, 3));
    g.setAttribute('aAo', new THREE.BufferAttribute(tao, 1));
    const tfeat = new Float32Array(tv * 3);
    if (b.targetFpfhColor) {
      const u8 = view(buffer, b.targetFpfhColor);
      for (let i = 0; i < tfeat.length; i++) tfeat[i] = u8[i] / 255;
    }
    g.setAttribute('aFeat', new THREE.BufferAttribute(tfeat, 3));
    g.setAttribute('aBothPart', new THREE.BufferAttribute(
      b.targetBothPart ? Float32Array.from(view(buffer, b.targetBothPart))
                       : new Float32Array(tv * 3), 3));

    // Backfaces only, like Blender's blue cage: the target reads as an
    // envelope around the moving source instead of a film in front of it.
    targetMesh = new THREE.Mesh(g, surfaceMaterial({
      color: tgtColor(), opacity: 0.42, features: true,
    }));
    targetMesh.material.side = THREE.BackSide;
    targetMesh.material.depthWrite = false;
    targetMesh.renderOrder = -1;

    const box = new THREE.Box3().setFromBufferAttribute(g.attributes.position);
    tgtCentre = box.getCenter(new THREE.Vector3());
    tgtPivot = new THREE.Group();
    tgtPivot.position.copy(tgtCentre);
    targetMesh.position.copy(tgtCentre).negate();
    tgtPivot.add(targetMesh);
    stage.scene.add(tgtPivot);
  }

  function disposeMeshes() {
    [mesh, outline, targetMesh].forEach((m) => {
      if (!m) return;
      m.parent?.remove(m);
      m.material.dispose();
    });
    [srcPivot, tgtPivot].forEach((g) => g && stage.scene.remove(g));
    srcPivot = tgtPivot = null;
    if (geometry) geometry.dispose();
    if (targetMesh) targetMesh.geometry.dispose();
    mesh = outline = targetMesh = geometry = null;
  }

  /** `t` is the separation, 0 superimposed to 1 fully apart, so the reframing
   *  travels with the move instead of cutting at either end. */
  function centreOn(entry, t = spread) {
    const c = new THREE.Vector3(
      entry.bboxMin[0] + entry.bboxSize[0] / 2,
      entry.bboxMin[1] + entry.bboxSize[1] / 2,
      entry.bboxMin[2] + entry.bboxSize[2] / 2,
    );
    // The orthographic box is r tall and r * aspect wide, so on a portrait
    // canvas -- a phone -- the width is the smaller of the two and the bone
    // loses its transverse processes off both sides. Divide by the aspect when
    // it is under 1 and the fit covers whichever dimension is tighter. On a
    // wide canvas this is exactly the old value.
    const aspectNow = (container.clientWidth || 1) / (container.clientHeight || 1);
    let r = Math.max(...entry.bboxSize) * 0.62 / Math.min(1, aspectNow);
    if (t > 0) {
      // Recentre between the two, then widen only if the pair does not already
      // fit: at this aspect it very nearly does, and scaling r for its own sake
      // would shrink both bones to buy margin nothing needs.
      const dx = entry.bboxSize[0] * FEATURE_GAP * t;
      c.x += dx / 2;
      const aspect0 = (container.clientWidth || 1) / (container.clientHeight || 1);
      const need = (dx + entry.bboxSize[0]) / 2 * 1.06;
      r = Math.max(r, need / aspect0);
    }
    stage.controls.target.copy(c);
    const dir = new THREE.Vector3(0, Math.sin(THREE.MathUtils.degToRad(20)), Math.cos(THREE.MathUtils.degToRad(20)));
    stage.camera.position.copy(c).addScaledVector(dir, r * 8);
    stage.camera.near = 0.01;
    stage.camera.far = r * 40;
    const aspect = (container.clientWidth || 1) / (container.clientHeight || 1);
    stage.camera.top = r;
    stage.camera.bottom = -r;
    stage.camera.left = -r * aspect;
    stage.camera.right = r * aspect;
    stage.camera.zoom = 1;
    stage.camera.updateProjectionMatrix();
    stage.controls.update();
  }

  /* ------------------------------------------------------------ features -- */

  /** How far apart the pair sits, as a fraction of the bone's own width. */
  const FEATURE_GAP = 1.06;
  /** Seconds the pair takes to move apart, and to come back together. */
  const FEATURE_MOVE_S = 0.75;
  /** Video 1's own order: coordinates, then FPFH, then the full vector. */
  const FEATURE_MODES = ['coordinates', 'FPFH', 'the full feature vector'];

  let featureView = false;
  let featMix = 0;           // the colouring's own fade, seeded on load
  let featMode = 2;
  let spread = 0;            // 0 superimposed, 1 fully apart; eased
  let spreadSide = false;    // whether the target is currently drawn solid

  /** Push the exported PCA fits into both materials. Without these the two live
   *  colourings would draw from an identity matrix and come out grey. */
  function pushFeatureFit(entry) {
    const fit = entry.featureFit;
    if (!fit) return;
    for (const m of [mesh.material, targetMesh.material]) {
      const u = m.userData;
      setMatrix3Rows(u.uXyzComps.value, fit.xyz.comps);
      u.uXyzMu.value.fromArray(fit.xyz.mu);
      u.uXyzLo.value.fromArray(fit.xyz.lo);
      u.uXyzHi.value.fromArray(fit.xyz.hi);
      setMatrix3Rows(u.uBothPos.value, fit.both.compsPos);
      setMatrix3Rows(u.uBothNrm.value, fit.both.compsNrm);
      u.uBothMuPos.value.fromArray(fit.both.muPos);
      u.uBothMuNrm.value.fromArray(fit.both.muNrm);
      u.uBothLo.value.fromArray(fit.both.lo);
      u.uBothHi.value.fromArray(fit.both.hi);
      u.uBothWn.value = fit.both.wn;
    }
  }

  /** Whether this vertebra carries the FPFH colours at all. Only the real
   *  label does: they are computed once per registration run, and the other
   *  twenty-three are placeholders with no run behind them. */
  function hasFeatures() {
    return !!(asset && asset.buffers && asset.buffers.fpfhColor);
  }

  /** One frame of the separation, at `t` in [0, 1]. Everything that can be
   *  interpolated is; `side` and `depthWrite` cannot be, so they flip once the
   *  two are far enough apart that the flip is not what the eye is watching.
   *  Flipping them at t = 0 would have the target swallow the source whole for
   *  a frame, which is the one thing the move is meant to avoid. */
  function applySpread(t) {
    if (!targetMesh || !asset) return;
    const dx = asset.bboxSize[0] * FEATURE_GAP;
    tgtPivot.position.x = tgtCentre.x + dx * t;
    const m = targetMesh.material;
    m.opacity = 0.42 + 0.58 * t;
    const solid = t > 0.35;
    if (solid !== spreadSide) {
      spreadSide = solid;
      // Side by side the target is an object in its own right; superimposed it
      // plays an envelope around the source, which is why it is drawn backfaces
      // only and does not write depth.
      m.side = solid ? THREE.FrontSide : THREE.BackSide;
      m.depthWrite = solid;
      targetMesh.renderOrder = solid ? 0 : -1;
      m.needsUpdate = true;
    }
    centreOn(asset, t);
  }

  /* -------------------------------------------------------------- kernel -- */

  const IDENTITY_Q = new THREE.Quaternion();

  /* Linked rotation. In the side-by-side view the camera is frozen and a drag
   * turns the two bones instead, by the SAME quaternion about each one's own
   * centre -- pyvista's link_views, and the same reason the hero shot turns its
   * subject rather than its camera: a fixed camera keeps the lighting fixed, so
   * the same facet does not change brightness as it comes round. */
  let turning = false;
  const turnAt = { x: 0, y: 0 };

  function onTurnDown(ev) {
    if (!featureView || !srcPivot) return;
    turning = true;
    turnAt.x = ev.clientX;
    turnAt.y = ev.clientY;
    try { stage.renderer.domElement.setPointerCapture(ev.pointerId); } catch { /* none */ }
  }

  function onTurnMove(ev) {
    if (!turning || !srcPivot) return;
    const dx = ev.clientX - turnAt.x;
    const dy = ev.clientY - turnAt.y;
    turnAt.x = ev.clientX;
    turnAt.y = ev.clientY;
    // Yaw about the camera's up, pitch about its right: the drag reads the same
    // way whichever face is towards the viewer.
    const up = stage.camera.up;
    const right = new THREE.Vector3().setFromMatrixColumn(stage.camera.matrixWorld, 0);
    const q = new THREE.Quaternion()
      .setFromAxisAngle(up, dx * 0.008)
      .multiply(new THREE.Quaternion().setFromAxisAngle(right, dy * 0.008));
    srcPivot.quaternion.premultiply(q);
    tgtPivot.quaternion.copy(srcPivot.quaternion);
    stage.invalidate();
  }

  function onTurnUp(ev) {
    if (!turning) return;
    turning = false;
    try { stage.renderer.domElement.releasePointerCapture(ev.pointerId); } catch { /* gone */ }
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let kernelOn = false;
  let pointerInside = false;
  let kernelMix = 0;          // eased, so the halo does not pop on and off
  let kernelHit = false;

  /** r for the step the timeline is sitting on. Piecewise constant on purpose:
   *  the real run holds one radius for four iterations and then drops to the
   *  next scale, so the halo should jump where the scale jumps. Interpolating
   *  would draw radii the algorithm never used. */
  function kernelRadiusAt(p) {
    const steps = manifest.steps;
    if (!steps || !steps.length) return 10;
    const i = Math.max(0, Math.min(steps.length - 1, Math.floor(p)));
    return steps[i].kernel_radius_r;
  }

  function traceKernel() {
    if (!mesh) return;
    const u = mesh.material.userData;
    kernelHit = false;
    if (!kernelOn || !pointerInside) return;
    raycaster.setFromCamera(ndc, stage.camera);
    const hit = raycaster.intersectObject(mesh, false)[0];
    if (!hit) return;
    // The mesh sits at identity, but going through worldToLocal keeps this
    // correct if it is ever parented or moved: vKernelPos is object space.
    mesh.worldToLocal(u.uKernelCentre.value.copy(hit.point));
    u.uKernelRadius.value = kernelRadiusAt(pos);
    kernelHit = true;
  }

  function onPointerMove(ev) {
    const r = stage.renderer.domElement.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    pointerInside = true;
    if (kernelOn) stage.invalidate();
  }

  function onPointerLeave() {
    pointerInside = false;
    if (kernelOn) stage.invalidate();
  }

  stage.renderer.domElement.addEventListener('pointermove', onPointerMove);
  stage.renderer.domElement.addEventListener('pointerleave', onPointerLeave);
  stage.renderer.domElement.addEventListener('pointerdown', onTurnDown);
  stage.renderer.domElement.addEventListener('pointermove', onTurnMove);
  stage.renderer.domElement.addEventListener('pointerup', onTurnUp);
  stage.renderer.domElement.addEventListener('pointercancel', onTurnUp);

  /* ------------------------------------------------------------ stepping -- */

  /** Where along the trajectory step `p` sits, and between which two states. */
  function resolve(p) {
    const nSteps = manifest.nSteps;
    const clamped = Math.max(0, Math.min(nSteps, p));
    if (asset.mode === 'steps') {
      const i = Math.min(Math.floor(clamped), asset.nStates - 2);
      return { a: i, b: i + 1, t: clamped - i };
    }
    // Placeholder: two stored states, paced by the real run's arc length.
    const prof = manifest.progressProfile;
    const i = Math.min(Math.floor(clamped), prof.length - 2);
    const local = clamped - i;
    const u = prof[i] * (1 - local) + prof[i + 1] * local;
    return { a: 0, b: 1, t: u };
  }

  function applyPosition(force = false) {
    if (!asset) return;
    const { a, b, t } = resolve(pos);
    dequantiseLerp(states[a], states[b], t, bboxMin, bboxSize, positions);
    lerpU8ToFloat(aoStates[a], aoStates[b], t, ao);
    computeNormals(positions, index, normals);
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;
    geometry.attributes.aAo.needsUpdate = true;
    // The raycast tests the bounding sphere before it tests any triangle, so a
    // sphere left over from the rest pose makes the halo drop out at the edges
    // once the mesh has moved. Cheap enough at 10 k vertices to just redo it.
    if (force || kernelOn) geometry.computeBoundingSphere();
    ui.onPosition(pos);
    stage.invalidate();
  }

  function onFrame(dt) {
    let busy = false;

    const spreadWant = featureView ? 1 : 0;
    if (spread !== spreadWant) {
      const step = dt / FEATURE_MOVE_S;
      spread = spreadWant > spread
        ? Math.min(spreadWant, spread + step)
        : Math.max(spreadWant, spread - step);
      // smoothstep, so the pair leaves and arrives at rest rather than
      // starting and stopping at full speed.
      applySpread(spread * spread * (3 - 2 * spread));
      busy = true;
    }
    // Coming back together, the two rotations unwind to the opening pose.
    if (!featureView && srcPivot && srcPivot.quaternion.w < 0.99999) {
      const k = Math.min(1, dt * 6);
      srcPivot.quaternion.slerp(IDENTITY_Q, k);
      tgtPivot.quaternion.copy(srcPivot.quaternion);
      busy = true;
    }

    const featWant = featureView && hasFeatures() ? 1 : 0;
    if (Math.abs(featWant - featMix) > 1e-3) {
      featMix += (featWant - featMix) * Math.min(1, dt * 7);
      busy = true;
    } else {
      featMix = featWant;
    }
    if (mesh && mesh.material.userData.uFeatMix) {
      mesh.material.userData.uFeatMix.value = featMix;
      targetMesh.material.userData.uFeatMix.value = featMix;
    }
    if (mesh && mesh.material.userData.uKernelMix) {
      traceKernel();
      const want = kernelHit ? 1 : 0;
      if (Math.abs(want - kernelMix) > 1e-3) {
        kernelMix += (want - kernelMix) * Math.min(1, dt * 14);
        busy = true;
      } else {
        kernelMix = want;
      }
      mesh.material.userData.uKernelMix.value = kernelMix;
      if (kernelOn) mesh.material.userData.uKernelRadius.value = kernelRadiusAt(pos);
    }
    if (outline && geometry.boundingSphere) {
      if (updateOutlineThickness(outline, stage.camera, geometry.boundingSphere.radius)) {
        stage.invalidate();
      }
    }
    if (!asset) return busy;

    if (playing) {
      pos += dt / STEP_SECONDS;
      if (pos >= manifest.nSteps) {
        pos = manifest.nSteps;
        playing = false;
        ui.onPlayState(false);
      }
      applyPosition();
      return true;
    }
    if (Math.abs(goal - pos) > 1e-3) {
      pos += (goal - pos) * Math.min(1, dt * 9);
      applyPosition();
      return true;
    }
    if (pos !== goal) {
      pos = goal;
      applyPosition();
    }
    return busy;
  }

  /* ----------------------------------------------------------------- api -- */

  return {
    stage,
    load,
    get asset() { return asset; },
    get position() { return pos; },
    /** Geometry the filmstrip needs to draw the same mesh at another size. */
    get frameData() {
      return asset ? { index, nVerts: asset.nVerts, bboxMin, bboxSize } : null;
    },
    /** Decode one whole step into caller-owned buffers. */
    sampleState(step, outPos, outAo) {
      if (!asset) return;
      const { a, b, t } = resolve(step);
      dequantiseLerp(states[a], states[b], t, bboxMin, bboxSize, outPos);
      lerpU8ToFloat(aoStates[a], aoStates[b], t, outAo);
    },
    goTo(p) { goal = Math.max(0, Math.min(manifest.nSteps, p)); playing = false; ui.onPlayState(false); },
    togglePlay() {
      if (playing) { playing = false; }
      else { if (pos >= manifest.nSteps - 1e-3) { pos = 0; } playing = true; }
      ui.onPlayState(playing);
      stage.invalidate();
    },
    setTargetVisible(v) { if (targetMesh) { targetMesh.visible = v; stage.invalidate(); } },
    setKernelVisible(v) {
      kernelOn = v;
      if (!v) pointerInside = false;
      if (v && geometry) geometry.computeBoundingSphere();
      stage.invalidate();
    },
    /** The radius the halo is drawing right now, for the caption. */
    get kernelRadius() { return kernelRadiusAt(pos); },
    get hasFeatures() { return hasFeatures(); },
    setFeatureView(v) {
      featureView = v;
      // The orbit would swing the camera around the pair; here the bones turn
      // and the camera holds still.
      stage.controls.enabled = !v;
      stage.invalidate();
    },
    get featureMode() { return FEATURE_MODES[featMode]; },
    cycleFeatureMode() {
      featMode = (featMode + 1) % FEATURE_MODES.length;
      if (mesh && mesh.material.userData.uFeatMode) {
        mesh.material.userData.uFeatMode.value = featMode;
        targetMesh.material.userData.uFeatMode.value = featMode;
      }
      stage.invalidate();
      return FEATURE_MODES[featMode];
    },
    refreshTheme() { if (outline) { refreshOutlineColor(outline.material); stage.invalidate(); } },
    dispose() {
      stage.renderer.domElement.removeEventListener('pointermove', onPointerMove);
      stage.renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      stage.renderer.domElement.removeEventListener('pointerdown', onTurnDown);
      stage.renderer.domElement.removeEventListener('pointermove', onTurnMove);
      stage.renderer.domElement.removeEventListener('pointerup', onTurnUp);
      stage.renderer.domElement.removeEventListener('pointercancel', onTurnUp);
      disposeMeshes();
      stage.dispose();
    },
  };
}
