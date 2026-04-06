import * as THREE from 'three';
import {
  CHUNK_SIZE, WORLD_CHUNKS_X, WORLD_CHUNKS_Z,
  DEBRIS_MAX_DEPTH, DEBRIS_RENDER_THRESHOLD,
  DEBRIS_BASE_COLOR, DEBRIS_SPREAD_RADIUS,
  MATERIAL_PROPS,
  HERO_CHUNKS_PER_CARVE_MIN, HERO_CHUNKS_PER_CARVE_MAX,
  HERO_CHUNK_MAX, HERO_CHUNK_SIZE_MIN, HERO_CHUNK_SIZE_MAX,
  SETTLE_VELOCITY_THRESHOLD, SETTLE_TIME, MERGE_DURATION,
} from '../core/Config.js';
import sceneManager from '../rendering/SceneManager.js';
import { surfaceProbeFrom } from './Traversability.js';

const WORLD_XZ = WORLD_CHUNKS_X * CHUNK_SIZE; // 128

class DebrisSystem {
  constructor() {
    this._heightmap = new Float32Array(WORLD_XZ * WORLD_XZ);
    // Track dominant material per cell for coloring
    this._materialMap = new Uint8Array(WORLD_XZ * WORLD_XZ);
    // Store base Y (floor level) per cell so we don't re-probe every frame
    this._baseY = new Float32Array(WORLD_XZ * WORLD_XZ);
    this._dirtyColumns = new Set();
    this._meshes = new Map(); // "cx,cz" → THREE.Mesh
    this._scene = null;

    // Hero chunks
    this._physics = null;  // PhysicsWorld ref — null until Rapier loads
    this._heroChunks = [];
    this._groundPlanes = new Map(); // y → body, reusable static planes
  }

  init(scene) {
    this._scene = scene;
  }

  initPhysics(physicsWorld) {
    this._physics = physicsWorld;
  }

  // --- Public API ---

  /**
   * Add debris at a specific XZ cell with gaussian spread.
   * floorY is the Y level of the floor where debris should rest.
   */
  addDebris(wx, wz, volume, material, floorY) {
    const cx = Math.floor(wx);
    const cz = Math.floor(wz);
    const r = DEBRIS_SPREAD_RADIUS;

    // Build gaussian weights
    let totalWeight = 0;
    const cells = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const dist2 = dx * dx + dz * dz;
        if (dist2 > r * r) continue;
        const weight = Math.exp(-dist2 / (r * 0.7));
        totalWeight += weight;
        cells.push({ x: cx + dx, z: cz + dz, weight });
      }
    }

    if (totalWeight <= 0) return;

    for (const cell of cells) {
      if (cell.x < 0 || cell.x >= WORLD_XZ || cell.z < 0 || cell.z >= WORLD_XZ) continue;
      const idx = cell.x + cell.z * WORLD_XZ;
      const addAmount = (volume * cell.weight / totalWeight);
      this._heightmap[idx] = Math.min(this._heightmap[idx] + addAmount, DEBRIS_MAX_DEPTH);

      // Track material — last material wins for coloring (good enough)
      if (material > 0) {
        this._materialMap[idx] = material;
      }

      // Store floor Y if we have one and it's lower/newer than existing
      if (floorY !== undefined) {
        const existing = this._baseY[idx];
        // Use the provided floor Y, or keep existing if it's valid
        if (existing === 0 || floorY < existing) {
          this._baseY[idx] = floorY;
        }
      }

      // Mark the chunk column dirty
      const colKey = Math.floor(cell.x / CHUNK_SIZE) + ',' + Math.floor(cell.z / CHUNK_SIZE);
      this._dirtyColumns.add(colKey);
    }
  }

  /**
   * Add debris below a carve point — finds the floor and deposits there.
   */
  addDebrisBelow(wx, wy, wz, volume, material) {
    // Scan downward from just below the carve point to find the floor
    const probe = surfaceProbeFrom(wx, wy - 1, wz);
    const floorY = probe ? probe.y : wy - 2;

    // Volume is scaled down — not all carved rock becomes debris
    // (some is dust, some compresses)
    this.addDebris(wx, wz, volume * 0.4, material, floorY);
  }

  /**
   * Subtract debris volume at a position (for excavator scoop).
   */
  removeDebris(wx, wz, volume) {
    const cx = Math.floor(wx);
    const cz = Math.floor(wz);
    const r = 2;
    let removed = 0;

    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || x >= WORLD_XZ || z < 0 || z >= WORLD_XZ) continue;

        const idx = x + z * WORLD_XZ;
        const available = this._heightmap[idx];
        if (available <= 0) continue;

        const take = Math.min(available, volume - removed);
        this._heightmap[idx] -= take;
        removed += take;

        const colKey = Math.floor(x / CHUNK_SIZE) + ',' + Math.floor(z / CHUNK_SIZE);
        this._dirtyColumns.add(colKey);

        if (removed >= volume) return removed;
      }
    }
    return removed;
  }

  getDebrisDepth(wx, wz) {
    const x = Math.floor(wx);
    const z = Math.floor(wz);
    if (x < 0 || x >= WORLD_XZ || z < 0 || z >= WORLD_XZ) return 0;
    return this._heightmap[x + z * WORLD_XZ];
  }

  getDebrisMaterial(wx, wz) {
    const x = Math.floor(wx);
    const z = Math.floor(wz);
    if (x < 0 || x >= WORLD_XZ || z < 0 || z >= WORLD_XZ) return 0;
    return this._materialMap[x + z * WORLD_XZ];
  }

  /**
   * Check if there is significant debris near a point.
   */
  hasDebrisNear(wx, wz, radius) {
    const cx = Math.floor(wx);
    const cz = Math.floor(wz);
    const r = Math.ceil(radius);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const depth = this.getDebrisDepth(cx + dx, cz + dz);
        if (depth > DEBRIS_RENDER_THRESHOLD) return true;
      }
    }
    return false;
  }

  // --- Hero chunk update loop ---

  update(dt) {
    if (!this._physics || !this._physics.ready) return;

    for (let i = this._heroChunks.length - 1; i >= 0; i--) {
      const chunk = this._heroChunks[i];

      if (chunk.merging) {
        chunk.mergeProgress += dt / MERGE_DURATION;
        const s = Math.max(0, 1 - chunk.mergeProgress);
        chunk.mesh.scale.setScalar(s);

        if (chunk.mergeProgress >= 1) {
          // Merge volume into heightmap
          const pos = this._physics.getTranslation(chunk.body);
          this.addDebris(pos.x, pos.z, chunk.volume, chunk.material, pos.y);
          this._removeHeroChunk(i);
        }
        continue;
      }

      // Sync mesh to physics body
      const pos = this._physics.getTranslation(chunk.body);
      const rot = this._physics.getRotation(chunk.body);
      chunk.mesh.position.set(pos.x, pos.y, pos.z);
      chunk.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

      // Check settling
      const vel = this._physics.getLinearVelocity(chunk.body);
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);

      if (speed < SETTLE_VELOCITY_THRESHOLD) {
        chunk.settleTimer += dt;
        if (chunk.settleTimer >= SETTLE_TIME) {
          chunk.merging = true;
          chunk.mergeProgress = 0;
        }
      } else {
        chunk.settleTimer = 0;
      }
    }
  }

  /**
   * Spawn hero chunks at a carve point.
   */
  spawnHeroChunks(wx, wy, wz, volume, material) {
    if (!this._physics || !this._physics.ready) return;
    if (volume < 0.1) return;

    // Force-merge oldest chunks if near limit
    while (this._heroChunks.length >= HERO_CHUNK_MAX - 5) {
      this._forceMergeOldest();
    }

    // Ensure a ground plane exists near this Y
    this._ensureGroundPlane(wy);

    // Scale chunk count by volume
    const count = Math.min(
      HERO_CHUNKS_PER_CARVE_MAX,
      Math.max(HERO_CHUNKS_PER_CARVE_MIN, Math.round(volume * 2)),
    );
    const volumePerChunk = volume * 0.6 / count; // 60% goes to hero chunks, rest to heightmap

    // Get material color
    const matProps = MATERIAL_PROPS[material];
    const color = matProps
      ? new THREE.Color(matProps.color[0], matProps.color[1], matProps.color[2])
      : new THREE.Color(DEBRIS_BASE_COLOR[0], DEBRIS_BASE_COLOR[1], DEBRIS_BASE_COLOR[2]);

    for (let i = 0; i < count; i++) {
      const size = HERO_CHUNK_SIZE_MIN + Math.random() * (HERO_CHUNK_SIZE_MAX - HERO_CHUNK_SIZE_MIN);
      const halfSize = size / 2;

      // Slightly irregular box
      const sx = size * (0.7 + Math.random() * 0.6);
      const sy = size * (0.5 + Math.random() * 0.5);
      const sz = size * (0.7 + Math.random() * 0.6);

      // Spawn position: at carve point with random scatter
      const angle = Math.random() * Math.PI * 2;
      const scatter = Math.random() * 1.5;
      const spawnX = wx + Math.cos(angle) * scatter;
      const spawnY = wy + (Math.random() - 0.3) * 1.0;
      const spawnZ = wz + Math.sin(angle) * scatter;

      // Velocity: outward + down
      const velX = Math.cos(angle) * (1 + Math.random() * 2);
      const velY = -1 + Math.random() * 2;
      const velZ = Math.sin(angle) * (1 + Math.random() * 2);

      // Create physics body
      const body = this._physics.createDynamicBody(
        { x: spawnX, y: spawnY, z: spawnZ },
        { x: sx / 2, y: sy / 2, z: sz / 2 },
        { x: velX, y: velY, z: velZ },
      );

      // Create mesh — slightly darkened color with per-chunk variation
      const chunkColor = color.clone();
      chunkColor.offsetHSL(0, 0, (Math.random() - 0.5) * 0.15);

      const geo = new THREE.BoxGeometry(sx, sy, sz);
      const mat = new THREE.MeshLambertMaterial({
        color: chunkColor,
        clippingPlanes: [sceneManager.clippingPlane],
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.position.set(spawnX, spawnY, spawnZ);
      this._scene.add(mesh);

      this._heroChunks.push({
        body,
        mesh,
        volume: volumePerChunk,
        material,
        settleTimer: 0,
        merging: false,
        mergeProgress: 0,
      });
    }
  }

  _ensureGroundPlane(y) {
    // Snap to integer Y for reuse
    const planeY = Math.floor(y) - 1;
    if (this._groundPlanes.has(planeY)) return;

    const body = this._physics.createStaticPlane(planeY);
    this._groundPlanes.set(planeY, body);
  }

  _removeHeroChunk(index) {
    const chunk = this._heroChunks[index];
    this._physics.removeBody(chunk.body);
    this._scene.remove(chunk.mesh);
    chunk.mesh.geometry.dispose();
    chunk.mesh.material.dispose();
    this._heroChunks.splice(index, 1);
  }

  _forceMergeOldest() {
    if (this._heroChunks.length === 0) return;
    const chunk = this._heroChunks[0];
    const pos = this._physics.getTranslation(chunk.body);
    this.addDebris(pos.x, pos.z, chunk.volume, chunk.material, pos.y);
    this._removeHeroChunk(0);
  }

  // --- Mesh rebuilding ---

  updateMeshes() {
    if (!this._scene || this._dirtyColumns.size === 0) return;

    for (const colKey of this._dirtyColumns) {
      this._rebuildColumnMesh(colKey);
    }
    this._dirtyColumns.clear();
  }

  _rebuildColumnMesh(colKey) {
    const [ccx, ccz] = colKey.split(',').map(Number);
    const startX = ccx * CHUNK_SIZE;
    const startZ = ccz * CHUNK_SIZE;

    // Remove old mesh
    const old = this._meshes.get(colKey);
    if (old) {
      this._scene.remove(old);
      old.geometry.dispose();
      this._meshes.delete(colKey);
    }

    // Build a vertex grid (CHUNK_SIZE+1 × CHUNK_SIZE+1) — vertices at cell corners
    // so adjacent cells share edges for a smooth connected surface.
    const gridW = CHUNK_SIZE + 1;
    const vertexY = new Float32Array(gridW * gridW);     // Y heights
    const vertexColor = new Float32Array(gridW * gridW * 3); // RGB per vertex
    const hasDebris = new Uint8Array(gridW * gridW);     // whether this vertex has any debris neighbor

    // First pass: compute vertex heights and colors from neighboring cells
    for (let gz = 0; gz < gridW; gz++) {
      for (let gx = 0; gx < gridW; gx++) {
        const vi = gz * gridW + gx;

        // Average debris depth from up to 4 neighboring cells
        let totalDepth = 0;
        let count = 0;
        let totalBaseY = 0;
        let matR = 0, matG = 0, matB = 0;
        let hasMat = false;

        for (let dz = -1; dz <= 0; dz++) {
          for (let dx = -1; dx <= 0; dx++) {
            const cx = startX + gx + dx;
            const cz = startZ + gz + dz;
            if (cx < 0 || cx >= WORLD_XZ || cz < 0 || cz >= WORLD_XZ) continue;

            const idx = cx + cz * WORLD_XZ;
            const depth = this._heightmap[idx];
            if (depth < DEBRIS_RENDER_THRESHOLD) continue;

            totalDepth += depth;
            totalBaseY += this._baseY[idx];
            count++;

            const mat = MATERIAL_PROPS[this._materialMap[idx]];
            if (mat) {
              matR += mat.color[0];
              matG += mat.color[1];
              matB += mat.color[2];
              hasMat = true;
            }
          }
        }

        if (count > 0) {
          hasDebris[vi] = 1;
          const avgDepth = totalDepth / count;
          const avgBaseY = totalBaseY / count;
          vertexY[vi] = avgBaseY + avgDepth + 0.05; // slight offset above terrain

          // Blend material color with base debris color
          const ci = vi * 3;
          if (hasMat) {
            const mr = matR / count;
            const mg = matG / count;
            const mb = matB / count;
            vertexColor[ci]     = DEBRIS_BASE_COLOR[0] * 0.5 + mr * 0.5;
            vertexColor[ci + 1] = DEBRIS_BASE_COLOR[1] * 0.5 + mg * 0.5;
            vertexColor[ci + 2] = DEBRIS_BASE_COLOR[2] * 0.5 + mb * 0.5;
          } else {
            vertexColor[ci]     = DEBRIS_BASE_COLOR[0];
            vertexColor[ci + 1] = DEBRIS_BASE_COLOR[1];
            vertexColor[ci + 2] = DEBRIS_BASE_COLOR[2];
          }
          // Per-vertex noise
          vertexColor[ci]     += (Math.random() - 0.5) * 0.06;
          vertexColor[ci + 1] += (Math.random() - 0.5) * 0.06;
          vertexColor[ci + 2] += (Math.random() - 0.5) * 0.06;
        }
      }
    }

    // Collect quads where at least one corner has debris
    const quadPositions = [];
    const quadNormals = [];
    const quadColors = [];
    const quadIndices = [];
    let vertCount = 0;

    for (let gz = 0; gz < CHUNK_SIZE; gz++) {
      for (let gx = 0; gx < CHUNK_SIZE; gx++) {
        // Check if this cell has debris
        const wx = startX + gx;
        const wz = startZ + gz;
        if (wx >= WORLD_XZ || wz >= WORLD_XZ) continue;
        const idx = wx + wz * WORLD_XZ;
        if (this._heightmap[idx] < DEBRIS_RENDER_THRESHOLD) continue;

        // 4 corner vertices of this cell
        const corners = [
          gz * gridW + gx,           // v0: (gx, gz)
          gz * gridW + gx + 1,       // v1: (gx+1, gz)
          (gz + 1) * gridW + gx + 1, // v2: (gx+1, gz+1)
          (gz + 1) * gridW + gx,     // v3: (gx, gz+1)
        ];

        // Use stored baseY for corners without debris (edge fading)
        const baseY = this._baseY[idx];

        const base = vertCount;
        for (let c = 0; c < 4; c++) {
          const ci = corners[c];
          const vx = startX + (c === 1 || c === 2 ? gx + 1 : gx);
          const vz = startZ + (c === 2 || c === 3 ? gz + 1 : gz);
          const vy = hasDebris[ci] ? vertexY[ci] : baseY + 0.05;

          quadPositions.push(vx, vy, vz);
          quadNormals.push(0, 1, 0);

          const colIdx = ci * 3;
          if (hasDebris[ci]) {
            quadColors.push(vertexColor[colIdx], vertexColor[colIdx + 1], vertexColor[colIdx + 2]);
          } else {
            quadColors.push(DEBRIS_BASE_COLOR[0], DEBRIS_BASE_COLOR[1], DEBRIS_BASE_COLOR[2]);
          }
        }

        quadIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        vertCount += 4;
      }
    }

    if (vertCount === 0) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(quadPositions), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(quadNormals), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(quadColors), 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(quadIndices), 1));
    geo.computeVertexNormals(); // proper normals for lighting

    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      clippingPlanes: [sceneManager.clippingPlane],
    });

    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    this._scene.add(mesh);
    this._meshes.set(colKey, mesh);
  }
}

export default new DebrisSystem();
