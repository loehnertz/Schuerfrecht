import * as THREE from 'three';
import {
  CHUNK_SIZE, SURFACE_THRESHOLD, WORKER_COUNT,
  MATERIAL_COLORS, MATERIAL_EMISSIVE, CARVE_RADIUS,
  Material,
} from '../core/Config.js';
import chunkStore from './ChunkStore.js';
import sceneManager from '../rendering/SceneManager.js';
import eventBus from '../core/EventBus.js';

class VoxelWorld {
  constructor() {
    this._workers = [];
    this._workerBusy = [];
    this._taskQueue = [];
    this._pendingChunks = new Set();
  }

  init() {
    // Create worker pool
    for (let i = 0; i < WORKER_COUNT; i++) {
      const worker = new Worker(
        new URL('./mesher.worker.js', import.meta.url),
        { type: 'module' },
      );
      worker.onmessage = (e) => this._onWorkerMessage(i, e);
      this._workers.push(worker);
      this._workerBusy.push(false);
    }
  }

  /**
   * Queue initial chunks for meshing.
   */
  loadInitialChunks(chunksX, chunksY, chunksZ) {
    for (let cz = 0; cz < chunksZ; cz++) {
      for (let cy = 0; cy < chunksY; cy++) {
        for (let cx = 0; cx < chunksX; cx++) {
          const key = `${cx},${cy},${cz}`;
          this._enqueueChunk(key, cx, cy, cz);
        }
      }
    }
    this._dispatchNext();
  }

  /**
   * Remesh all dirty chunks (called after carving).
   */
  remeshDirty() {
    const dirtyKeys = chunkStore.consumeDirty();
    for (const key of dirtyKeys) {
      const [cx, cy, cz] = key.split(',').map(Number);
      this._enqueueChunk(key, cx, cy, cz);
    }
    this._dispatchNext();
  }

  _enqueueChunk(key, cx, cy, cz) {
    // Avoid duplicate entries in the queue
    if (this._pendingChunks.has(key)) return;
    this._pendingChunks.add(key);
    this._taskQueue.push({ key, cx, cy, cz });
  }

  _dispatchNext() {
    for (let i = 0; i < this._workers.length; i++) {
      if (!this._workerBusy[i] && this._taskQueue.length > 0) {
        const task = this._taskQueue.shift();
        this._workerBusy[i] = true;

        // Build padded data on main thread (fast — just array copies)
        const paddedData = chunkStore.getChunkWithBorders(task.cx, task.cy, task.cz);

        this._workers[i].postMessage(
          {
            type: 'mesh',
            chunkKey: task.key,
            paddedData,
            surfaceThreshold: SURFACE_THRESHOLD,
            materialColors: MATERIAL_COLORS,
            materialEmissive: MATERIAL_EMISSIVE,
            chunkWorldX: task.cx * CHUNK_SIZE,
            chunkWorldY: task.cy * CHUNK_SIZE,
            chunkWorldZ: task.cz * CHUNK_SIZE,
          },
          [paddedData.buffer],
        );
      }
    }
  }

  _onWorkerMessage(workerIndex, e) {
    const { type, chunkKey, positions, normals, colors } = e.data;

    if (type === 'meshResult') {
      this._workerBusy[workerIndex] = false;
      this._pendingChunks.delete(chunkKey);

      if (positions.length > 0) {
        // Parse chunk coordinates from key to position mesh in world space
        const [cx, cy, cz] = chunkKey.split(',').map(Number);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        // Translate geometry to world position
        geometry.translate(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
        geometry.computeBoundingSphere();

        sceneManager.addChunkMesh(chunkKey, geometry);
      } else {
        // Empty chunk (all air or all solid) — remove any existing mesh
        sceneManager.removeChunkMesh(chunkKey);
      }

      // Dispatch next task if any
      this._dispatchNext();
    }
  }

  /**
   * Carve a sphere at the given world position.
   */
  carveAt(wx, wy, wz, radius) {
    radius = radius || CARVE_RADIUS;
    const r = Math.ceil(radius) + 1;

    for (let dz = -r; dz <= r; dz++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const vx = Math.floor(wx) + dx;
          const vy = Math.floor(wy) + dy;
          const vz = Math.floor(wz) + dz;

          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > radius + 0.5) continue;

          const { density } = chunkStore.getVoxel(vx, vy, vz);

          // Reduce density based on distance
          let newDensity;
          if (dist < radius * 0.7) {
            newDensity = 0;
          } else {
            const t = (dist - radius * 0.7) / (radius * 0.3);
            newDensity = Math.min(density, Math.floor(t * SURFACE_THRESHOLD));
          }

          if (newDensity < density) {
            chunkStore.setVoxel(vx, vy, vz, newDensity);
          }
        }
      }
    }

    this.remeshDirty();
  }
}

export default new VoxelWorld();
