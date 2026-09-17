/* The vertebra picker: a real spine seen from the side, not a stack of bars.
   It reuses atlas.bin, so it costs one extra draw pass and no extra download. */

import {
  THREE, createStage, createScene, loadEnvironment, surfaceMaterial,
  outlineMaterial, refreshOutlineColor, updateOutlineThickness, fitOrtho, srcColor,
  projectedBounds, boneColor,
} from './viewer-core.js';
import { loadBlob } from './binio.js';
import { buildAtlasGeometries, atlasCentre } from './atlas-data.js';

/** Per-second rate of the colour blend; the highlight travels, never snaps. */
const HIGHLIGHT_EASE = 13;

/** ms of stillness on one vertebra before a drag actually loads it. */
const COMMIT_DELAY = 90;

/** How far to either side of the column still counts as pointing at it. */
const BAND_MARGIN_PX = 30;

export function createSpineSelector({ container, atlas, labelEl, onSelect }) {
  const stage = createStage(container, { onFrame, onResize, radius: 300 });
  if (!stage) return null;

  const entries = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerInside = false;
  let hovered = null;
  let selectedLabel = null;
  let committedLabel = null;
  let dragging = false;
  let commitTimer = null;
  let halfW = 1;
  let halfH = 1;
  let labelKey = null;
  const at = { x: 0, y: 0 };

  loadEnvironment(stage.renderer).then((env) => {
    createScene(env).children.slice().forEach((c) => stage.scene.add(c));
    if (env) {
      stage.scene.environment = env;
      stage.scene.environmentIntensity = 1.2;
    }
    stage.invalidate();
  });

  async function load() {
    const buffer = await loadBlob(atlas.file);
    const group = new THREE.Group();
    const outlineGroup = new THREE.Group();

    for (const { item, geometry } of buildAtlasGeometries(buffer, atlas)) {
      const mesh = new THREE.Mesh(geometry, surfaceMaterial({ color: boneColor() }));
      mesh.userData = item;
      group.add(mesh);

      const outline = new THREE.Mesh(geometry, outlineMaterial(0.3));
      outlineGroup.add(outline);

      entries.push({ item, mesh, outline, mix: 0 });
    }
    stage.scene.add(group, outlineGroup);
    frame();
    if (selectedLabel != null) paint();
  }

  /** Lateral view: superior to the left, exactly how a sagittal figure reads. */
  function frame() {
    const c = atlasCentre(atlas);
    halfW = atlas.bboxSize[1] / 2;  // anterior-posterior runs across the column
    halfH = atlas.bboxSize[2] / 2;  // superior-inferior runs down it
    stage.controls.target.copy(c);
    stage.camera.position.copy(c).add(new THREE.Vector3(1, 0, 0).multiplyScalar(halfH * 8));
    stage.camera.up.set(0, 0, 1);
    stage.camera.near = 0.01;
    stage.camera.far = halfH * 40;
    fitOrtho(stage.camera, container, halfW, halfH, 1.04);
    stage.controls.update();
    stage.controls.enabled = false; // it is a picker, not a viewer
    stage.invalidate();
  }

  function onResize() {
    if (!entries.length) return;
    fitOrtho(stage.camera, container, halfW, halfH, 1.04);
    placeLabel(currentEntry());
  }

  /**
   * Colour is the only variable; everything stays fully opaque.
   *
   * Dimming the unselected with material opacity let the opaque contour shell
   * read through the surface, which also cost proper depth sorting between
   * overlapping vertebrae. Hover previews in red, as the filmstrip does.
   *
   * The blend itself is eased in onFrame rather than written here: dragging
   * down the column then reads as one highlight travelling, which is what the
   * horizontal filmstrip does when its morph eases between steps. Setting the
   * colours outright made a 24-frame flicker-book of it.
   */
  function paint() {
    stage.invalidate();
  }

  /**
   * Which vertebra the pointer means, in client pixels.
   *
   * A raycast on its own answers "none" in the gap between two vertebrae, and
   * the label then fell back to whatever was selected -- so running down the
   * column made the name jump back and forth at every interstice. The column
   * is read vertically, so a miss resolves to the nearest vertebra by screen
   * height instead, provided the pointer is beside the column at all.
   *
   * `byHeight` drops the raycast entirely, and a drag uses it. Pointing is
   * precise and should hit the bone under the cursor; dragging is a slider and
   * has to be monotonic in position. Raycasting a drag was not: a spinous
   * process overhangs its neighbour, so sweeping down the column returned
   * ... T8, T7, T9 ... -- anatomically right, and read as a stutter.
   * Height alone also keeps tracking once the pointer leaves the column, the
   * way the horizontal filmstrip keeps scrubbing past its own ends.
   */
  function resolveAt(clientX, clientY, { byHeight = false } = {}) {
    if (!entries.length) return null;
    // A pointer event can land before the first render, or after the camera
    // was reframed but before the loop next drew -- and the camera's world
    // inverse is only refreshed by a render. Projecting against a stale one
    // put a vertebra 2000 px off a 115 px-wide container, so every pointerdown
    // resolved to nothing and the drag never started.
    stage.camera.updateMatrixWorld();
    const rect = container.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    pointer.x = (px / rect.width) * 2 - 1;
    pointer.y = -(py / rect.height) * 2 + 1;

    if (!byHeight) {
      raycaster.setFromCamera(pointer, stage.camera);
      const hit = raycaster.intersectObjects(entries.map((e) => e.mesh), false)[0];
      if (hit) return entries.find((e) => e.mesh === hit.object) || null;
    }

    let best = null;
    let bestDy = Infinity;
    let beside = false;
    for (const e of entries) {
      const b = projectedBounds(e.mesh.geometry, stage.camera, container);
      if (px >= b.left - BAND_MARGIN_PX && px <= b.right + BAND_MARGIN_PX) beside = true;
      // Distance to the centre, not to the band: centres are ordered down the
      // column, so nearest-centre is monotonic in y where nearest-edge ties.
      const dy = Math.abs(py - b.cy);
      if (dy < bestDy) { bestDy = dy; best = e; }
    }
    return (byHeight || beside) ? best : null;
  }

  /**
   * The name sits just off the right-hand silhouette of the column, at the
   * height of its own vertebra, so it tracks the curve of the spine rather
   * than floating in a fixed gutter.
   *
   * Right, unless right does not fit. On the wide layout the column has a
   * whole gutter beside it; on a phone it is the last thing before the edge of
   * the page, and the page clips its own overflow, so a name set off the right
   * silhouette can end up half a letter into nothing. Measured rather than
   * assumed from the breakpoint: at 375 px the widest of these names clears the
   * edge by about six pixels, which is inside the margin of error of a font
   * that has not finished loading, and at 320 px it does not clear it at all.
   * So it is placed, measured once, and flipped only if it actually crossed.
   */
  function placeLabel(entry) {
    if (!labelEl) return;
    if (!entry) {
      labelEl.dataset.shown = 'false';
      labelKey = null;
      return;
    }
    const { item, mesh } = entry;
    const b = projectedBounds(mesh.geometry, stage.camera, container);
    const key = `${item.label}:${b.right.toFixed(1)}:${b.cy.toFixed(1)}`;
    if (key === labelKey) return;
    labelKey = key;
    labelEl.textContent = item.name;
    labelEl.style.top = `${b.cy}px`;
    labelEl.dataset.shown = 'true';

    // offsetWidth and arithmetic, NOT getBoundingClientRect after the move:
    // `left` is transitioned, so the rect right after the assignment still
    // reports where the label is coming FROM, and the test would answer for
    // the previous vertebra. The width is not animated, so it can be trusted;
    // it already includes the 7 px that holds the name off the bone.
    labelEl.dataset.side = 'right';
    const originX = container.getBoundingClientRect().left;
    const fits = originX + b.right + labelEl.offsetWidth
      <= document.documentElement.clientWidth - 4;
    labelEl.dataset.side = fits ? 'right' : 'left';
    labelEl.style.left = `${fits ? b.right : b.left}px`;
  }

  function currentEntry() {
    if (hovered) return entries.find((e) => e.item === hovered) || null;
    return entries.find((e) => e.item.label === selectedLabel) || null;
  }

  function setHovered(item) {
    if (hovered === item) return;
    hovered = item;
    // Not while dragging: the cursor is 'grabbing' for the whole gesture, and
    // letting the hover state rewrite it made it flicker on every vertebra
    // crossed.
    if (!dragging) container.style.cursor = item ? 'pointer' : 'default';
    placeLabel(currentEntry());
    paint();
  }

  container.addEventListener('pointermove', (event) => {
    at.x = event.clientX;
    at.y = event.clientY;
    pointerInside = true;
    if (dragging) aim(resolveAt(at.x, at.y, { byHeight: true }));
    stage.invalidate();
  });

  container.addEventListener('pointerleave', () => {
    if (dragging) return;          // a capture keeps the drag alive off-canvas
    pointerInside = false;
    setHovered(null);
  });

  // pointerdown, not click: it is the same event for mouse, pen and touch, it
  // arrives before any movement so a tap is never dead, and it is where a drag
  // has to begin.
  container.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    at.x = event.clientX;
    at.y = event.clientY;
    const entry = resolveAt(at.x, at.y);
    if (!entry) return;
    dragging = true;
    pointerInside = true;
    try { container.setPointerCapture(event.pointerId); } catch { /* no capture */ }
    container.style.cursor = 'grabbing';
    aim(entry);
    event.preventDefault();
  });

  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    try { container.releasePointerCapture(event.pointerId); } catch { /* gone */ }
    container.style.cursor = hovered ? 'pointer' : 'default';
    commitNow();                   // whatever it landed on, load it now
  };
  container.addEventListener('pointerup', endDrag);
  container.addEventListener('pointercancel', endDrag);

  /**
   * Point at a vertebra: highlight and label move at once, the asset load
   * waits.
   *
   * Every vertebra is its own ~1 MB file, so committing on each one crossed
   * would fire two dozen fetches for a single sweep of the column. The delay
   * means a slow drag loads as it goes and a fast one loads only where it
   * stops -- and the release always commits, so nothing is ever left pointing
   * at something it did not load.
   */
  function aim(entry) {
    if (!entry) return;
    setSelection(entry.item.label);
    clearTimeout(commitTimer);
    commitTimer = setTimeout(commitNow, COMMIT_DELAY);
  }

  function setSelection(label) {
    if (selectedLabel === label) return;
    selectedLabel = label;
    placeLabel(currentEntry());
    paint();
  }

  function commitNow() {
    clearTimeout(commitTimer);
    commitTimer = null;
    if (selectedLabel == null || selectedLabel === committedLabel) return;
    committedLabel = selectedLabel;
    onSelect?.(committedLabel);
  }

  function select(label) {
    setSelection(label);
    commitNow();
  }

  function onFrame(dt) {
    for (const e of entries) {
      const r = e.outline.geometry.boundingSphere?.radius;
      if (r && updateOutlineThickness(e.outline, stage.camera, r)) stage.invalidate();
    }
    if (pointerInside && entries.length) {
      // A drag resolves by height here for the same reason the drag itself
      // does: pointing is precise and should hit the bone under the cursor,
      // dragging is a slider and has to be monotonic in position.
      //
      // Resolving during a drag at all is what keeps the name travelling with
      // the pointer. currentEntry() prefers `hovered` over the selection, so
      // leaving it stale for the length of the gesture pinned the label to
      // whichever vertebra the drag happened to start on, while the highlight
      // moved on without it.
      const entry = resolveAt(at.x, at.y, dragging ? { byHeight: true } : undefined);
      // Off the column mid-drag, keep the last one rather than blanking the
      // label: byHeight tracks past the ends, so a null here means the pointer
      // has gone somewhere the gesture does not care about.
      if (entry || !dragging) setHovered(entry ? entry.item : null);
    }
    if (entries.length) placeLabel(currentEntry());

    // The travelling highlight.  Returning true keeps the loop rendering for
    // as long as a blend is still moving, and no longer.
    const bone = boneColor();
    const src = srcColor();
    const k = Math.min(1, dt * HIGHLIGHT_EASE);
    let moving = false;
    for (const e of entries) {
      const goal = (e.item.label === selectedLabel || e.item === hovered) ? 1 : 0;
      if (Math.abs(goal - e.mix) > 1e-3) {
        e.mix += (goal - e.mix) * k;
        moving = true;
      } else if (e.mix !== goal) {
        e.mix = goal;
        moving = true;
      }
      e.mesh.material.color.copy(bone).lerp(src, e.mix);
    }
    return moving;
  }

  return {
    stage,
    load,
    select,
    get selected() { return selectedLabel; },
    refreshTheme() {
      entries.forEach((e) => refreshOutlineColor(e.outline.material));
      stage.invalidate();
    },
    dispose() { stage.dispose(); },
  };
}
