import * as THREE from 'three';
import {
  AMBIENT_COLOR, AMBIENT_INTENSITY,
  SPOT_COLOR, SPOT_INTENSITY, SPOT_ANGLE, SPOT_PENUMBRA,
  WORLD_CHUNKS_X, WORLD_CHUNKS_Z, CHUNK_SIZE,
  TERRAIN_SURFACE_Y,
} from '../core/Config.js';

class LightingSystem {
  constructor() {
    this.ambientLight = null;
    this.hemisphereLight = null;
    this.spotLight = null;
  }

  init(scene) {
    const centerX = (WORLD_CHUNKS_X * CHUNK_SIZE) / 2;
    const centerZ = (WORLD_CHUNKS_Z * CHUNK_SIZE) / 2;

    // Ambient — base visibility for all terrain
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(this.ambientLight);

    // Hemisphere — warm top (surface light) / cool bottom (deep underground)
    this.hemisphereLight = new THREE.HemisphereLight(0xaa9977, 0x334466, 0.6);
    scene.add(this.hemisphereLight);

    // Strong directional — simulates surface daylight filtering down
    this.dirLight = new THREE.DirectionalLight(0xffe8d0, 0.8);
    this.dirLight.position.set(centerX + 50, TERRAIN_SURFACE_Y + 80, centerZ + 30);
    this.dirLight.target.position.set(centerX, 60, centerZ);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.left = -80;
    this.dirLight.shadow.camera.right = 80;
    this.dirLight.shadow.camera.top = 80;
    this.dirLight.shadow.camera.bottom = -80;
    this.dirLight.shadow.camera.near = 1;
    this.dirLight.shadow.camera.far = 300;
    this.dirLight.shadow.bias = -0.002;
    scene.add(this.dirLight);
    scene.add(this.dirLight.target);

    // Spotlight above entrance cavern — warm hero light
    this.spotLight = new THREE.SpotLight(
      SPOT_COLOR,
      3.0,
      200,
      Math.PI / 4,
      0.5,
      1.0,
    );
    this.spotLight.position.set(centerX, TERRAIN_SURFACE_Y + 20, centerZ);
    this.spotLight.target.position.set(centerX, TERRAIN_SURFACE_Y - 40, centerZ);
    this.spotLight.castShadow = true;
    this.spotLight.shadow.mapSize.width = 1024;
    this.spotLight.shadow.mapSize.height = 1024;
    this.spotLight.shadow.camera.near = 1;
    this.spotLight.shadow.camera.far = 200;
    this.spotLight.shadow.bias = -0.002;

    scene.add(this.spotLight);
    scene.add(this.spotLight.target);
  }
}

export default new LightingSystem();
