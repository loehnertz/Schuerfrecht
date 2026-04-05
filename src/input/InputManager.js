import * as THREE from 'three';
import sceneManager from '../rendering/SceneManager.js';
import { getState } from '../core/GameState.js';

class InputManager {
  constructor() {
    this._raycaster = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
    this._onCarve = null;
  }

  init(camera, onCarve) {
    this._camera = camera;
    this._onCarve = onCarve;

    window.addEventListener('click', (e) => this._onClick(e));
    // Prevent context menu on right-click
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _onClick(e) {
    // Ignore clicks on UI elements
    if (e.target.closest('#depth-panel')) return;
    // Ignore non-left-click and modifier keys (Ctrl+click = orbit)
    if (e.button !== 0) return;
    if (e.ctrlKey || e.metaKey) return;

    // Normalize mouse to NDC
    this._mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this._mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    this._raycaster.setFromCamera(this._mouse, this._camera);

    const meshes = sceneManager.getTerrainMeshes();
    const intersections = this._raycaster.intersectObjects(meshes);

    // Only hit geometry that is at or below the cutaway plane — terrain above
    // the cutaway is visually clipped but still exists in the scene for
    // raycasting purposes, so we must filter it out manually.
    const cutawayDepth = getState().cutawayDepth;
    const hit = intersections.find(i => i.point.y <= cutawayDepth);

    if (hit && this._onCarve) {
      this._onCarve(hit.point.x, hit.point.y, hit.point.z);
    }
  }
}

export default new InputManager();
