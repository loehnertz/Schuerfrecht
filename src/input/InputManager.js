import * as THREE from 'three';
import sceneManager from '../rendering/SceneManager.js';
import machineRegistry from '../machines/MachineRegistry.js';
import eventBus from '../core/EventBus.js';
import { getState } from '../core/GameState.js';

const DRAG_MINE_THROTTLE_MS = 80; // max ~12 drag-mine events per second

class InputManager {
  constructor() {
    this._raycaster = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
    this._camera = null;
  }

  init(camera) {
    this._camera = camera;
    this._rightDownPos = null;
    this._leftDragging = false;
    this._leftDownPos = null;
    this._leftDownShift = false;
    this._leftHitMachine = false;
    this._lastDragMineTime = 0;
    this._suppressNextClick = false;

    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        // Ctrl/Meta+left = camera orbit — never start drag-mine
        if (e.ctrlKey || e.metaKey) {
          this._clearDragState();
          return;
        }
        // Don't start drag-mine tracking on UI elements
        if (e.target.closest && (e.target.closest('#depth-panel') || e.target.closest('#machine-status'))) return;

        this._leftDownPos = { x: e.clientX, y: e.clientY };
        this._leftDownShift = e.shiftKey;
        this._leftDragging = false;
        this._leftHitMachine = false;

        const hit = this._raycast(e);
        if (hit && hit.isMachine) {
          this._leftHitMachine = true;
        }
      }
      if (e.button === 2) {
        this._rightDownPos = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._leftDownPos) return;
      if (this._leftHitMachine) return;
      // Abort if modifier keys pressed mid-drag (user switched to camera orbit)
      if (e.ctrlKey || e.metaKey) {
        this._clearDragState();
        return;
      }

      const dx = e.clientX - this._leftDownPos.x;
      const dy = e.clientY - this._leftDownPos.y;

      if (!this._leftDragging && dx * dx + dy * dy > 16) {
        this._leftDragging = true;
      }

      if (this._leftDragging) {
        // Throttle drag-mine to avoid overwhelming the system
        const now = performance.now();
        if (now - this._lastDragMineTime < DRAG_MINE_THROTTLE_MS) return;
        this._lastDragMineTime = now;
        this._emitDragMine(e);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        if (this._leftDragging) {
          // Set a flag to suppress the upcoming click event (fires after mouseup)
          this._suppressNextClick = true;
        }
        this._clearDragState();
      }
    });

    // Safety: clear drag state if window loses focus
    window.addEventListener('blur', () => this._clearDragState());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._clearDragState();
    });

    window.addEventListener('click', (e) => this._onClick(e));

    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this._rightDownPos) {
        const dx = e.clientX - this._rightDownPos.x;
        const dy = e.clientY - this._rightDownPos.y;
        if (dx * dx + dy * dy < 25) {
          this._onRightClick(e);
        }
      }
      this._rightDownPos = null;
    });
  }

  _clearDragState() {
    this._leftDownPos = null;
    this._leftDragging = false;
    this._leftHitMachine = false;
  }

  _onClick(e) {
    if (this._suppressNextClick) {
      this._suppressNextClick = false;
      return;
    }
    if (e.target.closest && e.target.closest('#depth-panel')) return;
    if (e.target.closest && e.target.closest('#machine-status')) return;
    if (e.button !== 0) return;
    if (e.ctrlKey || e.metaKey) return;

    const hit = this._raycast(e);
    if (!hit) return;

    eventBus.emit('input:click', {
      point: hit.point.clone(),
      normal: hit.worldNormal,
      object: hit.object,
      isTerrain: hit.isTerrain,
      isMachine: hit.isMachine,
      shiftKey: e.shiftKey,
    });
  }

  _emitDragMine(e) {
    const hit = this._raycast(e);
    if (hit && hit.isTerrain) {
      eventBus.emit('input:dragmine', {
        point: hit.point.clone(),
        normal: hit.worldNormal,
        fine: this._leftDownShift,
      });
    }
  }

  _onRightClick(e) {
    if (e.target.closest && e.target.closest('#depth-panel')) return;

    const hit = this._raycast(e);
    if (hit && hit.isTerrain) {
      eventBus.emit('input:rightclick', {
        point: hit.point.clone(),
        normal: hit.worldNormal,
      });
    } else if (!hit) {
      eventBus.emit('input:command', { type: 'cancel' });
    }
  }

  _raycast(e) {
    this._mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this._mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    this._raycaster.setFromCamera(this._mouse, this._camera);

    const terrainMeshes = sceneManager.getTerrainMeshes();

    const terrainHits = this._raycaster.intersectObjects(terrainMeshes);
    const cutawayDepth = getState().cutawayDepth;
    const terrainHit = terrainHits.find(i => i.point.y <= cutawayDepth);

    const machineGroups = machineRegistry.getAllControllers().map(c => c.group);
    for (const g of machineGroups) g.updateMatrixWorld(true);
    const machineHits = this._raycaster.intersectObjects(machineGroups, true);
    const machineHit = machineHits.length > 0 ? machineHits[0] : null;

    if (machineHit && (!terrainHit || machineHit.distance <= terrainHit.distance)) {
      return {
        point: machineHit.point,
        worldNormal: null,
        object: machineHit.object,
        isTerrain: false,
        isMachine: true,
      };
    }

    if (terrainHit) {
      const worldNormal = terrainHit.face
        ? terrainHit.face.normal.clone().transformDirection(terrainHit.object.matrixWorld).normalize()
        : new THREE.Vector3(0, 1, 0);

      return {
        point: terrainHit.point,
        worldNormal,
        object: terrainHit.object,
        isTerrain: true,
        isMachine: false,
      };
    }

    return null;
  }
}

export default new InputManager();
