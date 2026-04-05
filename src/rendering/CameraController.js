import * as THREE from 'three';
import {
  CAMERA_ZOOM, CAMERA_NEAR, CAMERA_FAR,
  CAMERA_ELEVATION, CAMERA_INITIAL_AZIMUTH,
  CAMERA_PAN_SPEED, CAMERA_ZOOM_SPEED,
  CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX,
  CAMERA_ROTATION_LERP, CAMERA_DISTANCE,
  WORLD_CHUNKS_X, WORLD_CHUNKS_Z, CHUNK_SIZE,
} from '../core/Config.js';

// Elevation clamp range (radians) — don't go fully flat or fully top-down
const MIN_ELEVATION = 0.1;
const MAX_ELEVATION = Math.PI / 2 - 0.05;

class CameraController {
  constructor() {
    this.camera = null;
    // Azimuth: rotation around Y axis
    this.azimuth = CAMERA_INITIAL_AZIMUTH;
    this.targetAzimuth = CAMERA_INITIAL_AZIMUTH;
    // Elevation: angle above the horizontal plane
    this.elevation = CAMERA_ELEVATION;
    this.targetElevation = CAMERA_ELEVATION;
    // Zoom (ortho frustum size)
    this.zoom = CAMERA_ZOOM;
    this.targetZoom = CAMERA_ZOOM;
    // Pan offset (world-space look-at target)
    this.panOffset = new THREE.Vector3(
      (WORLD_CHUNKS_X * CHUNK_SIZE) / 2,
      85,
      (WORLD_CHUNKS_Z * CHUNK_SIZE) / 2,
    );
    this.targetPanOffset = this.panOffset.clone();
    this._keysDown = new Set();
    // Drag state
    this._isOrbiting = false;
    this._isPanning = false;
    this._dragStart = new THREE.Vector2();
  }

  init() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(
      -this.zoom * aspect, this.zoom * aspect,
      this.zoom, -this.zoom,
      CAMERA_NEAR, CAMERA_FAR,
    );

    this._updateCameraPosition();

    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this._onKeyUp(e));
    window.addEventListener('wheel', (e) => this._onWheel(e), { passive: true });
    window.addEventListener('mousedown', (e) => this._onMouseDown(e));
    window.addEventListener('mouseup', (e) => this._onMouseUp(e));
    window.addEventListener('mousemove', (e) => this._onMouseMove(e));

    return this.camera;
  }

  _onResize() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.left = -this.zoom * aspect;
    this.camera.right = this.zoom * aspect;
    this.camera.top = this.zoom;
    this.camera.bottom = -this.zoom;
    this.camera.updateProjectionMatrix();
  }

  _onMouseDown(e) {
    // Right-click OR Ctrl+left-click: orbit (free rotation)
    if (e.button === 2 || (e.button === 0 && (e.ctrlKey || e.metaKey))) {
      this._isOrbiting = true;
      this._dragStart.set(e.clientX, e.clientY);
      e.preventDefault();
    }
    // Middle-click: pan
    if (e.button === 1) {
      this._isPanning = true;
      this._dragStart.set(e.clientX, e.clientY);
      e.preventDefault();
    }
  }

  _onMouseUp(e) {
    if (e.button === 2 || e.button === 0) this._isOrbiting = false;
    if (e.button === 1) this._isPanning = false;
  }

  _onMouseMove(e) {
    const dx = e.clientX - this._dragStart.x;
    const dy = e.clientY - this._dragStart.y;

    if (this._isOrbiting) {
      this._dragStart.set(e.clientX, e.clientY);
      // Horizontal drag → azimuth rotation
      this.targetAzimuth -= dx * 0.005;
      // Vertical drag → elevation rotation
      this.targetElevation += dy * 0.005;
      this.targetElevation = Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, this.targetElevation));
    }

    if (this._isPanning) {
      this._dragStart.set(e.clientX, e.clientY);
      this._applyPan(-dx, dy);
    }
  }

  _onKeyDown(e) {
    this._keysDown.add(e.key.toLowerCase());

    if (e.key.toLowerCase() === 'q') {
      this.targetAzimuth += Math.PI / 2;
    }
    if (e.key.toLowerCase() === 'e') {
      this.targetAzimuth -= Math.PI / 2;
    }
  }

  _onKeyUp(e) {
    this._keysDown.delete(e.key.toLowerCase());
  }

  _onWheel(e) {
    // Ctrl+scroll → cutaway depth (handled by DepthSlider)
    if (e.ctrlKey || e.metaKey) return;
    this.targetZoom += e.deltaY * 0.05 * CAMERA_ZOOM_SPEED;
    this.targetZoom = Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, this.targetZoom));
  }

  _applyPan(screenDx, screenDy) {
    const panScale = this.zoom * 0.005 * CAMERA_PAN_SPEED;
    const cosA = Math.cos(this.azimuth);
    const sinA = Math.sin(this.azimuth);

    // Right vector in world XZ plane
    const rx = cosA;
    const rz = -sinA;
    // Forward vector in world XZ plane (into the screen)
    const fx = sinA;
    const fz = cosA;

    this.targetPanOffset.x += (rx * screenDx + fx * screenDy) * panScale;
    this.targetPanOffset.z += (rz * screenDx + fz * screenDy) * panScale;
  }

  update(dt) {
    // Smooth rotation (azimuth)
    this.azimuth += (this.targetAzimuth - this.azimuth) * CAMERA_ROTATION_LERP;

    // Smooth elevation
    this.elevation += (this.targetElevation - this.elevation) * CAMERA_ROTATION_LERP;

    // Smooth zoom
    this.zoom += (this.targetZoom - this.zoom) * 0.1;

    // WASD panning
    const panSpeed = this.zoom * 0.8 * CAMERA_PAN_SPEED * dt;
    if (this._keysDown.has('w') || this._keysDown.has('arrowup')) {
      const fx = Math.sin(this.azimuth);
      const fz = Math.cos(this.azimuth);
      this.targetPanOffset.x -= fx * panSpeed;
      this.targetPanOffset.z -= fz * panSpeed;
    }
    if (this._keysDown.has('s') || this._keysDown.has('arrowdown')) {
      const fx = Math.sin(this.azimuth);
      const fz = Math.cos(this.azimuth);
      this.targetPanOffset.x += fx * panSpeed;
      this.targetPanOffset.z += fz * panSpeed;
    }
    if (this._keysDown.has('a') || this._keysDown.has('arrowleft')) {
      const rx = Math.cos(this.azimuth);
      const rz = -Math.sin(this.azimuth);
      this.targetPanOffset.x -= rx * panSpeed;
      this.targetPanOffset.z -= rz * panSpeed;
    }
    if (this._keysDown.has('d') || this._keysDown.has('arrowright')) {
      const rx = Math.cos(this.azimuth);
      const rz = -Math.sin(this.azimuth);
      this.targetPanOffset.x += rx * panSpeed;
      this.targetPanOffset.z += rz * panSpeed;
    }

    // Smooth pan
    this.panOffset.lerp(this.targetPanOffset, 0.1);

    // Update frustum
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.left = -this.zoom * aspect;
    this.camera.right = this.zoom * aspect;
    this.camera.top = this.zoom;
    this.camera.bottom = -this.zoom;
    this.camera.updateProjectionMatrix();

    this._updateCameraPosition();
  }

  _updateCameraPosition() {
    const cosE = Math.cos(this.elevation);
    const sinE = Math.sin(this.elevation);
    const cosA = Math.cos(this.azimuth);
    const sinA = Math.sin(this.azimuth);

    this.camera.position.set(
      this.panOffset.x + CAMERA_DISTANCE * cosE * sinA,
      this.panOffset.y + CAMERA_DISTANCE * sinE,
      this.panOffset.z + CAMERA_DISTANCE * cosE * cosA,
    );

    this.camera.lookAt(this.panOffset.x, this.panOffset.y, this.panOffset.z);
  }
}

export default new CameraController();
