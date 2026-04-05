import { CHUNK_SIZE, VOXEL_BYTES } from '../core/Config.js';
import { generateChunk } from './TerrainGenerator.js';

const PADDED = CHUNK_SIZE + 2;

class ChunkStore {
  constructor() {
    this._chunks = new Map();
    this.dirtyChunks = new Set();
  }

  _key(cx, cy, cz) {
    return `${cx},${cy},${cz}`;
  }

  getChunk(cx, cy, cz) {
    const key = this._key(cx, cy, cz);
    if (!this._chunks.has(key)) {
      this._chunks.set(key, generateChunk(cx, cy, cz));
    }
    return this._chunks.get(key);
  }

  _worldToChunkLocal(wx, wy, wz) {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cy = Math.floor(wy / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    // Handle negative coordinates correctly
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = ((wy % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return { cx, cy, cz, lx, ly, lz };
  }

  getVoxel(wx, wy, wz) {
    const { cx, cy, cz, lx, ly, lz } = this._worldToChunkLocal(wx, wy, wz);
    const chunk = this.getChunk(cx, cy, cz);
    const idx = (lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_SIZE) * VOXEL_BYTES;
    return { density: chunk[idx], material: chunk[idx + 1] };
  }

  setVoxel(wx, wy, wz, density, material) {
    const { cx, cy, cz, lx, ly, lz } = this._worldToChunkLocal(wx, wy, wz);
    const chunk = this.getChunk(cx, cy, cz);
    const idx = (lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_SIZE) * VOXEL_BYTES;
    chunk[idx] = density;
    if (material !== undefined) {
      chunk[idx + 1] = material;
    }
    const key = this._key(cx, cy, cz);
    this.dirtyChunks.add(key);

    // Mark neighbor chunks dirty if we're near a border.
    // Marching cubes uses +1 padded overlap, so voxels at positions 0-1 and 14-15
    // affect the neighboring chunk's mesh.
    if (lx <= 1)              this.dirtyChunks.add(this._key(cx - 1, cy, cz));
    if (lx >= CHUNK_SIZE - 2) this.dirtyChunks.add(this._key(cx + 1, cy, cz));
    if (ly <= 1)              this.dirtyChunks.add(this._key(cx, cy - 1, cz));
    if (ly >= CHUNK_SIZE - 2) this.dirtyChunks.add(this._key(cx, cy + 1, cz));
    if (lz <= 1)              this.dirtyChunks.add(this._key(cx, cy, cz - 1));
    if (lz >= CHUNK_SIZE - 2) this.dirtyChunks.add(this._key(cx, cy, cz + 1));
  }

  /**
   * Build an 18x18x18 padded array (with +1 overlap on each side)
   * for seamless marching cubes meshing.
   */
  getChunkWithBorders(cx, cy, cz) {
    const padded = new Uint8Array(PADDED * PADDED * PADDED * VOXEL_BYTES);

    for (let pz = 0; pz < PADDED; pz++) {
      for (let py = 0; py < PADDED; py++) {
        for (let px = 0; px < PADDED; px++) {
          // Map padded coords back to world coords
          const wx = cx * CHUNK_SIZE + (px - 1);
          const wy = cy * CHUNK_SIZE + (py - 1);
          const wz = cz * CHUNK_SIZE + (pz - 1);

          const { density, material } = this.getVoxel(wx, wy, wz);

          const pIdx = (px + py * PADDED + pz * PADDED * PADDED) * VOXEL_BYTES;
          padded[pIdx] = density;
          padded[pIdx + 1] = material;
        }
      }
    }

    return padded;
  }

  markDirty(cx, cy, cz) {
    this.dirtyChunks.add(this._key(cx, cy, cz));
  }

  consumeDirty() {
    const keys = [...this.dirtyChunks];
    this.dirtyChunks.clear();
    return keys;
  }

  hasChunk(cx, cy, cz) {
    return this._chunks.has(this._key(cx, cy, cz));
  }
}

export default new ChunkStore();
