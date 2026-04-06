import * as THREE from 'three';
import {
  FOG_DENSITY, AMBIENT_COLOR, AMBIENT_INTENSITY,
} from '../core/Config.js';

class SceneManager {
  constructor() {
    this.scene = null;
    this.renderer = null;
    this.terrainMeshes = new Map();
    this.clippingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 128);
    this.terrainMaterial = null;
  }

  init(canvas) {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.localClippingEnabled = true;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x15130f);
    this.scene.fog = new THREE.FogExp2(0x15130f, FOG_DENSITY);

    // Terrain material — Lambert for good visibility + flat shading for rocky feel
    this.terrainMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      clippingPlanes: [this.clippingPlane],
      clipShadows: true,
    });

    window.addEventListener('resize', () => this._onResize());
  }

  _onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  setCutawayDepth(y) {
    this.clippingPlane.constant = y;
  }

  addChunkMesh(key, geometry) {
    // Dispose old mesh if exists
    this.removeChunkMesh(key);

    const mesh = new THREE.Mesh(geometry, this.terrainMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.terrainMeshes.set(key, mesh);
  }

  removeChunkMesh(key) {
    const existing = this.terrainMeshes.get(key);
    if (existing) {
      this.scene.remove(existing);
      existing.geometry.dispose();
      this.terrainMeshes.delete(key);
    }
  }

  getTerrainMeshes() {
    return [...this.terrainMeshes.values()];
  }

  isTerrainMesh(obj) {
    for (const mesh of this.terrainMeshes.values()) {
      if (mesh === obj) return true;
    }
    return false;
  }

  render(camera) {
    this.renderer.render(this.scene, camera);
  }
}

export default new SceneManager();
