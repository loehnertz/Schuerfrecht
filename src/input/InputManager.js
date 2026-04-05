import * as THREE from 'three';
import sceneManager from '../rendering/SceneManager.js';

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
    if (e.target.id === 'depth-slider') return;
    // Ignore non-left-click and modifier keys (Ctrl+click = orbit)
    if (e.button !== 0) return;
    if (e.ctrlKey || e.metaKey) return;

    // Normalize mouse to NDC
    this._mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this._mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    this._raycaster.setFromCamera(this._mouse, this._camera);

    const meshes = sceneManager.getTerrainMeshes();
    const intersections = this._raycaster.intersectObjects(meshes);

    if (intersections.length > 0) {
      const hit = intersections[0].point;
      if (this._onCarve) {
        this._onCarve(hit.x, hit.y, hit.z);
      }
    }
  }
}

export default new InputManager();
