/* The atlas figure: all 24 vertebrae, laid on their side, tinted by region.
   They arrive already positioned in patient space, so this is the real column,
   not an arrangement. */

import {
  THREE, createStage, createScene, loadEnvironment, surfaceMaterial,
  outlineMaterial, refreshOutlineColor, updateOutlineThickness, fitOrtho,
  projectedBounds,
} from './viewer-core.js';
import { loadBlob } from './binio.js';
import { buildAtlasGeometries, atlasCentre, regionColor } from './atlas-data.js';

export function createAtlasViewer({ container, atlas, labelEl }) {
  const stage = createStage(container, { onFrame, onResize, radius: 300 });
  if (!stage) return null;

  const meshes = [];
  const outlines = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered = null;
  let pointerInside = false;
  let halfW = 1;
  let halfH = 1;

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
      const m = new THREE.Mesh(geometry, surfaceMaterial({ color: regionColor(item.label) }));
      m.userData = item;
      meshes.push(m);
      group.add(m);

      const o = new THREE.Mesh(geometry, outlineMaterial(0.3));
      outlines.push(o);
      outlineGroup.add(o);
    }

    stage.scene.add(group, outlineGroup);
    frame();
  }

  /**
   * Lateral view with the column running across the screen. Looking down -X
   * with +Y up puts the superior end (cervical) on the left, which is how a
   * spine is conventionally drawn.
   */
  function frame() {
    const c = atlasCentre(atlas);
    halfW = atlas.bboxSize[2] / 2;
    halfH = atlas.bboxSize[1] / 2;
    stage.controls.target.copy(c);
    stage.camera.position.copy(c).add(new THREE.Vector3(1, 0, 0).multiplyScalar(halfW * 8));
    stage.camera.up.set(0, 1, 0);
    stage.camera.near = 0.01;
    stage.camera.far = halfW * 40;
    fitOrtho(stage.camera, container, halfW, halfH);
    stage.controls.update();
    stage.invalidate();
  }

  function onResize() {
    if (meshes.length) fitOrtho(stage.camera, container, halfW, halfH);
  }

  /* ------------------------------------------------------------- hovering -- */

  function onPointerMove(event) {
    const rect = container.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    pointerInside = true;
    stage.invalidate();
  }

  /** Under the vertebra and centred on it, at any camera orientation. */
  function placeLabel(mesh) {
    const b = projectedBounds(mesh.geometry, stage.camera, container);
    labelEl.style.left = `${b.cx}px`;
    labelEl.style.top = `${b.bottom}px`;
  }

  function onPointerLeave() {
    pointerInside = false;
    setHovered(null);
  }

  function setHovered(mesh) {
    if (hovered === mesh) return;
    if (hovered) hovered.material.emissive.setHex(0x000000);
    hovered = mesh;
    if (hovered) {
      // A whisper, not a highlight: the label does the naming.
      hovered.material.emissive.setRGB(0.04, 0.04, 0.04);
      labelEl.textContent = hovered.userData.name;
      placeLabel(hovered);
      labelEl.hidden = false;
    } else {
      labelEl.hidden = true;
    }
    stage.invalidate();
  }

  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerleave', onPointerLeave);

  function onFrame() {
    for (const o of outlines) {
      const r = o.geometry.boundingSphere?.radius;
      if (r && updateOutlineThickness(o, stage.camera, r)) stage.invalidate();
    }
    if (pointerInside && meshes.length) {
      raycaster.setFromCamera(pointer, stage.camera);
      const hit = raycaster.intersectObjects(meshes, false)[0];
      setHovered(hit ? hit.object : null);
    }
    if (hovered) placeLabel(hovered);
    return false;
  }

  return {
    stage,
    load,
    refreshTheme() {
      outlines.forEach((o) => refreshOutlineColor(o.material));
      stage.invalidate();
    },
    dispose() {
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
      stage.dispose();
    },
  };
}
