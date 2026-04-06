import {
  SURFACE_THRESHOLD, TERRAIN_SURFACE_Y, CHUNK_SIZE,
  WORLD_CHUNKS_Y, PATHFIND_STEP, PATHFIND_MARGIN,
  DEBRIS_PATHFIND_BLOCK_DEPTH,
} from '../core/Config.js';
import chunkStore from '../voxel/ChunkStore.js';
import debrisSystem from './DebrisSystem.js';

const MAX_PROBE_Y = TERRAIN_SURFACE_Y + 8;
const MIN_PROBE_Y = 0;

/**
 * Scan downward to find the terrain surface at (wx, wz).
 * Returns { y, normal } or null if no surface found.
 * The returned y is the world-space Y of the top of the first solid voxel.
 */
export function surfaceProbe(wx, wz) {
  // Scan from above the surface downward
  let prevDensity = 0;
  for (let wy = MAX_PROBE_Y; wy >= MIN_PROBE_Y; wy--) {
    const { density } = chunkStore.getVoxel(Math.floor(wx), wy, Math.floor(wz));
    if (density >= SURFACE_THRESHOLD && prevDensity < SURFACE_THRESHOLD) {
      // Found transition from air to solid — surface is at this Y
      const normal = _computeNormal(Math.floor(wx), wy, Math.floor(wz));
      return { y: wy + 1, normal };
    }
    prevDensity = density;
  }
  return null;
}

/**
 * Scan downward starting from a specific Y (for probing inside carved areas).
 */
export function surfaceProbeFrom(wx, startY, wz) {
  let prevDensity = 0;
  for (let wy = Math.floor(startY); wy >= MIN_PROBE_Y; wy--) {
    const { density } = chunkStore.getVoxel(Math.floor(wx), wy, Math.floor(wz));
    if (density >= SURFACE_THRESHOLD && prevDensity < SURFACE_THRESHOLD) {
      const normal = _computeNormal(Math.floor(wx), wy, Math.floor(wz));
      return { y: wy + 1, normal };
    }
    prevDensity = density;
  }
  return null;
}

function _computeNormal(wx, wy, wz) {
  // Gradient of density field — points from solid toward air
  const dx = _getDensity(wx + 1, wy, wz) - _getDensity(wx - 1, wy, wz);
  const dy = _getDensity(wx, wy + 1, wz) - _getDensity(wx, wy - 1, wz);
  const dz = _getDensity(wx, wy, wz + 1) - _getDensity(wx, wy, wz - 1);

  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 0.001) return { x: 0, y: 1, z: 0 };

  // Normal points from high density to low density (toward air)
  return { x: -dx / len, y: -dy / len, z: -dz / len };
}

function _getDensity(wx, wy, wz) {
  return chunkStore.getVoxel(wx, wy, wz).density;
}

/**
 * Get the material at a world position.
 */
export function getMaterialAt(wx, wy, wz) {
  return chunkStore.getVoxel(Math.floor(wx), Math.floor(wy), Math.floor(wz)).material;
}

/**
 * A* pathfinding on the terrain surface.
 * Returns an array of {x, y, z} waypoints or null if no path exists.
 */
export function findPath(fromX, fromZ, toX, toZ, maxSlopeDeg, stepSize) {
  stepSize = stepSize || PATHFIND_STEP;
  const maxSlopeTan = Math.tan(maxSlopeDeg * Math.PI / 180);

  // Build grid bounds
  const minX = Math.floor(Math.min(fromX, toX)) - PATHFIND_MARGIN;
  const maxX = Math.ceil(Math.max(fromX, toX)) + PATHFIND_MARGIN;
  const minZ = Math.floor(Math.min(fromZ, toZ)) - PATHFIND_MARGIN;
  const maxZ = Math.ceil(Math.max(fromZ, toZ)) + PATHFIND_MARGIN;

  // Grid dimensions — cap to prevent huge allocations on distant targets
  const gridW = Math.min(Math.ceil((maxX - minX) / stepSize) + 1, 80);
  const gridH = Math.min(Math.ceil((maxZ - minZ) / stepSize) + 1, 80);

  // Build surface height grid
  const heights = new Float32Array(gridW * gridH);
  const valid = new Uint8Array(gridW * gridH);

  for (let gz = 0; gz < gridH; gz++) {
    for (let gx = 0; gx < gridW; gx++) {
      const wx = minX + gx * stepSize;
      const wz = minZ + gz * stepSize;
      const probe = surfaceProbe(wx, wz);
      const idx = gx + gz * gridW;
      if (probe) {
        heights[idx] = probe.y;
        // Check if debris blocks this cell
        const debrisDepth = debrisSystem.getDebrisDepth(wx, wz);
        if (debrisDepth >= DEBRIS_PATHFIND_BLOCK_DEPTH) {
          valid[idx] = 0; // blocked by debris
        } else {
          valid[idx] = 1;
        }
      }
    }
  }

  // Snap from/to to grid coords
  const startGX = Math.round((fromX - minX) / stepSize);
  const startGZ = Math.round((fromZ - minZ) / stepSize);
  const endGX = Math.round((toX - minX) / stepSize);
  const endGZ = Math.round((toZ - minZ) / stepSize);

  // Validate start/end
  const startIdx = startGX + startGZ * gridW;
  const endIdx = endGX + endGZ * gridW;
  if (!valid[startIdx] || !valid[endIdx]) return null;
  if (startGX < 0 || startGX >= gridW || startGZ < 0 || startGZ >= gridH) return null;
  if (endGX < 0 || endGX >= gridW || endGZ < 0 || endGZ >= gridH) return null;

  // A* with 8-directional movement
  const DIRS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  const gScore = new Float32Array(gridW * gridH).fill(Infinity);
  const fScore = new Float32Array(gridW * gridH).fill(Infinity);
  const cameFrom = new Int32Array(gridW * gridH).fill(-1);

  gScore[startIdx] = 0;
  fScore[startIdx] = _heuristic(startGX, startGZ, endGX, endGZ, stepSize);

  // Simple binary heap (min-heap on fScore)
  const open = [startIdx];
  const inOpen = new Uint8Array(gridW * gridH);
  inOpen[startIdx] = 1;
  const closed = new Uint8Array(gridW * gridH);

  while (open.length > 0) {
    // Find node with lowest fScore (linear scan — fine for small grids)
    let bestI = 0;
    for (let i = 1; i < open.length; i++) {
      if (fScore[open[i]] < fScore[open[bestI]]) bestI = i;
    }
    const current = open[bestI];
    open[bestI] = open[open.length - 1];
    open.pop();
    inOpen[current] = 0;

    if (current === endIdx) {
      return _reconstructPath(cameFrom, current, gridW, minX, minZ, stepSize, heights);
    }

    closed[current] = 1;
    const cx = current % gridW;
    const cz = Math.floor(current / gridW);

    for (const [dx, dz] of DIRS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nx >= gridW || nz < 0 || nz >= gridH) continue;

      const nIdx = nx + nz * gridW;
      if (!valid[nIdx] || closed[nIdx]) continue;

      // Slope check
      const dy = Math.abs(heights[nIdx] - heights[current]);
      const dist = Math.sqrt(dx * dx + dz * dz) * stepSize;
      if (dy / dist > maxSlopeTan) continue;

      const tentG = gScore[current] + dist + dy * 0.5; // penalize elevation changes slightly
      if (tentG < gScore[nIdx]) {
        cameFrom[nIdx] = current;
        gScore[nIdx] = tentG;
        fScore[nIdx] = tentG + _heuristic(nx, nz, endGX, endGZ, stepSize);
        if (!inOpen[nIdx]) {
          open.push(nIdx);
          inOpen[nIdx] = 1;
        }
      }
    }
  }

  return null; // No path found
}

function _heuristic(ax, az, bx, bz, stepSize) {
  const dx = (ax - bx) * stepSize;
  const dz = (az - bz) * stepSize;
  return Math.sqrt(dx * dx + dz * dz);
}

function _reconstructPath(cameFrom, endIdx, gridW, minX, minZ, stepSize, heights) {
  const path = [];
  let current = endIdx;
  while (current !== -1) {
    const gx = current % gridW;
    const gz = Math.floor(current / gridW);
    path.push({
      x: minX + gx * stepSize,
      y: heights[current],
      z: minZ + gz * stepSize,
    });
    current = cameFrom[current];
  }
  path.reverse();
  return path;
}
