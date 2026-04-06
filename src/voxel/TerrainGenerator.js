import { createNoise3D } from 'simplex-noise';
import alea from 'alea';
import {
  CHUNK_SIZE, SURFACE_THRESHOLD, Material,
  TERRAIN_SURFACE_Y, DIRT_LAYER_DEPTH, STONE_LAYER_DEPTH,
  ORE_PARAMS,
  ENTRANCE_RADIUS_X, ENTRANCE_RADIUS_Y, ENTRANCE_RADIUS_Z,
  ENTRANCE_FLOOR_HALF_X, ENTRANCE_FLOOR_HALF_Z,
  ENTRANCE_RAMP_WIDTH, ENTRANCE_RAMP_LENGTH,
  WORLD_CHUNKS_X, WORLD_CHUNKS_Z,
} from '../core/Config.js';

let terrainNoise;
let oreNoises = {};
let entranceCenterX;
let entranceCenterY;
let entranceCenterZ;
let entranceFloorY;

export function initTerrain(seed) {
  terrainNoise = createNoise3D(alea(seed + 'terrain'));

  for (const matKey of Object.keys(ORE_PARAMS)) {
    oreNoises[matKey] = createNoise3D(alea(seed + 'ore' + matKey));
  }

  // Entrance pit at the center of the world, near the surface
  entranceCenterX = (WORLD_CHUNKS_X * CHUNK_SIZE) / 2;
  entranceCenterY = TERRAIN_SURFACE_Y - 4;
  entranceCenterZ = (WORLD_CHUNKS_Z * CHUNK_SIZE) / 2;
  entranceFloorY = entranceCenterY - ENTRANCE_RADIUS_Y;
}

// FBM (fractal Brownian motion) — 3 octaves
function fbm3(noiseFn, x, y, z, scale) {
  let value = 0;
  let amplitude = 1;
  let frequency = scale;
  for (let i = 0; i < 3; i++) {
    value += noiseFn(x * frequency, y * frequency, z * frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value;
}

// How much to flatten terrain at a given XZ (0 = normal, 1 = fully flat)
// Covers the entire ramp corridor + a generous area around the exit.
// Without this, terrain noise (±6 voxels) creates "lids" above the corridor
// that surfaceProbe finds instead of the ramp floor, breaking pathfinding.
function getRampExitFlatness(worldX, worldZ) {
  let flatness = 0;

  // --- Along the ramp corridor: suppress noise so the ramp ceiling is never buried ---
  const rampStartX = entranceCenterX + ENTRANCE_FLOOR_HALF_X - 8;
  const rampExitX = entranceCenterX + ENTRANCE_FLOOR_HALF_X + ENTRANCE_RAMP_LENGTH;
  const rampHalfW = ENTRANCE_RAMP_WIDTH / 2;

  if (worldX >= rampStartX && worldX <= rampExitX + 30) {
    const dz = Math.abs(worldZ - entranceCenterZ);
    const innerW = rampHalfW + 8;   // fully flat zone — wider than corridor
    const fadeW = 12;                // transition back to normal terrain

    if (dz < innerW) {
      flatness = 1.0;
    } else if (dz < innerW + fadeW) {
      flatness = 1.0 - (dz - innerW) / fadeW;
    }

    // Fade in at the pit end so the dome terrain isn't affected
    const fromStart = worldX - rampStartX;
    if (fromStart < 10 && flatness > 0) {
      flatness *= fromStart / 10;
    }
  }

  // --- Around the ramp exit: generous circular flat area ---
  const dx = worldX - rampExitX;
  const dz2 = worldZ - entranceCenterZ;
  const exitDist = Math.sqrt(dx * dx + dz2 * dz2);
  const flatRadius = 25;
  const fadeRadius = 15;

  if (exitDist < flatRadius) {
    flatness = 1.0;
  } else if (exitDist < flatRadius + fadeRadius) {
    flatness = Math.max(flatness, 1.0 - (exitDist - flatRadius) / fadeRadius);
  }

  return flatness;
}

function getLayerAndDensity(worldX, worldY, worldZ) {
  // Noise-perturbed layer boundaries — dampened near ramp exit for flat terrain
  const flatness = getRampExitFlatness(worldX, worldZ);
  const boundaryNoise = fbm3(terrainNoise, worldX, 0, worldZ, 0.02) * 6 * (1 - flatness);

  const surfaceY = TERRAIN_SURFACE_Y + boundaryNoise;
  const dirtY = DIRT_LAYER_DEPTH + boundaryNoise * 0.7;
  const stoneY = STONE_LAYER_DEPTH + boundaryNoise * 0.5;

  // Density: positive = solid, centered on surface threshold
  // The further below the surface, the denser
  let density;
  let material;

  if (worldY > surfaceY + 2) {
    // Well above surface — pure air
    density = 0;
    material = Material.AIR;
  } else if (worldY > surfaceY - 2) {
    // Near surface — smooth transition
    const t = (surfaceY - worldY) / 4;
    density = Math.floor(SURFACE_THRESHOLD + t * SURFACE_THRESHOLD);
    density = Math.max(0, Math.min(255, density));
    material = density >= SURFACE_THRESHOLD ? Material.DIRT : Material.AIR;
  } else {
    // Underground — fully solid
    density = 255;

    if (worldY > dirtY) {
      material = Material.DIRT;
    } else if (worldY > stoneY) {
      material = Material.STONE;
    } else {
      material = Material.HARD_ROCK;
    }

    // Add 3D variation to density for organic feel
    const densityNoise = fbm3(terrainNoise, worldX, worldY, worldZ, 0.06);
    density = Math.max(SURFACE_THRESHOLD + 10, Math.min(255,
      density + Math.floor(densityNoise * 30)
    ));
  }

  return { density, material };
}

function applyOreVeins(worldX, worldY, worldZ, baseMaterial) {
  if (baseMaterial === Material.AIR || baseMaterial === Material.DIRT) {
    return baseMaterial;
  }

  for (const [matKey, params] of Object.entries(ORE_PARAMS)) {
    if (worldY < params.minY || worldY > params.maxY) continue;

    const noise = oreNoises[matKey];
    const val = noise(
      worldX * params.scale,
      worldY * params.scale,
      worldZ * params.scale
    );

    if (val > params.threshold) {
      return parseInt(matKey);
    }
  }

  return baseMaterial;
}

// Returns 0–1 emptiness for the entrance pit (dome + flat floor + ramp)
function getEntranceEmptiness(worldX, worldY, worldZ) {
  let maxEmpty = 0;

  // --- Zone 1: Dome (ellipsoid ceiling) ---
  const dx = (worldX - entranceCenterX) / ENTRANCE_RADIUS_X;
  const dy = (worldY - entranceCenterY) / ENTRANCE_RADIUS_Y;
  const dz = (worldZ - entranceCenterZ) / ENTRANCE_RADIUS_Z;
  const ellipDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (ellipDist < 1.0) {
    const empty = ellipDist < 0.85 ? 1.0 : (1.0 - ellipDist) / 0.15;
    maxEmpty = Math.max(maxEmpty, empty);
  }

  // --- Zone 2: Flat-bottomed pit (wide floor below the dome) ---
  const pitMargin = 3;
  const pitDx = Math.abs(worldX - entranceCenterX);
  const pitDz = Math.abs(worldZ - entranceCenterZ);

  if (worldY >= entranceFloorY - 1 && worldY <= entranceCenterY + 2 &&
      pitDx < ENTRANCE_FLOOR_HALF_X + pitMargin &&
      pitDz < ENTRANCE_FLOOR_HALF_Z + pitMargin) {
    const fromLeft = ENTRANCE_FLOOR_HALF_X - pitDx;
    const fromFront = ENTRANCE_FLOOR_HALF_Z - pitDz;
    const fromFloor = worldY - entranceFloorY;
    const fromCeil = entranceCenterY - worldY;
    const minEdge = Math.min(fromLeft, fromFront, fromFloor, fromCeil);

    if (minEdge > pitMargin) {
      maxEmpty = 1.0;
    } else if (minEdge > 0) {
      maxEmpty = Math.max(maxEmpty, minEdge / pitMargin);
    }
  }

  // --- Zone 3: Ramp corridor (+X direction, from pit floor to surface) ---
  const rampStartX = entranceCenterX + ENTRANCE_FLOOR_HALF_X - 4; // overlap with pit
  const rampEndX = rampStartX + ENTRANCE_RAMP_LENGTH + 4;
  const rampHalfW = ENTRANCE_RAMP_WIDTH / 2;
  const rampMargin = 5; // wide margin for smooth marching-cubes surface

  if (worldX >= rampStartX - rampMargin && worldX <= rampEndX + rampMargin &&
      Math.abs(worldZ - entranceCenterZ) < rampHalfW + rampMargin) {
    // t=0 at pit edge, t=1 at surface
    const t = Math.max(0, Math.min(1, (worldX - rampStartX) / ENTRANCE_RAMP_LENGTH));
    const rampFloorY = entranceFloorY + t * (TERRAIN_SURFACE_Y - entranceFloorY);

    // Ceiling merges with dome at pit end, settles to normal headroom further up
    const domeTopY = entranceCenterY + ENTRANCE_RADIUS_Y;
    const baseCeilH = 12;
    const pitCeilH = domeTopY - entranceFloorY;
    const ceilBlend = Math.max(0, 1 - t * 2.5); // transition over first ~40% of ramp
    const rampCeilY = rampFloorY + baseCeilH + (pitCeilH - baseCeilH) * ceilBlend * ceilBlend;

    if (worldY >= rampFloorY - rampMargin && worldY <= rampCeilY + rampMargin) {
      const fromFloor = worldY - rampFloorY;
      const fromCeil = rampCeilY - worldY;
      const fromSideZ = rampHalfW - Math.abs(worldZ - entranceCenterZ);

      // Only apply start/end edges away from pit and surface connections
      let minEdge = Math.min(fromCeil, fromSideZ);
      // Floor edge — this is what creates the ramp surface
      minEdge = Math.min(minEdge, fromFloor);
      // Gentle close at far end (last 8 voxels blend to terrain)
      const fromEnd = rampEndX - worldX;
      if (fromEnd < 8) minEdge = Math.min(minEdge, fromEnd);

      if (minEdge > rampMargin) {
        maxEmpty = 1.0;
      } else if (minEdge > 0) {
        maxEmpty = Math.max(maxEmpty, minEdge / rampMargin);
      }
    }
  }

  return maxEmpty;
}

export function generateChunk(cx, cy, cz) {
  const data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE * 2);

  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const worldX = cx * CHUNK_SIZE + x;
        const worldY = cy * CHUNK_SIZE + y;
        const worldZ = cz * CHUNK_SIZE + z;

        let { density, material } = getLayerAndDensity(worldX, worldY, worldZ);

        // Apply ore veins
        if (material !== Material.AIR) {
          material = applyOreVeins(worldX, worldY, worldZ, material);
        }

        // Carve entrance pit (dome + flat floor + ramp)
        const emptiness = getEntranceEmptiness(worldX, worldY, worldZ);
        if (emptiness > 0) {
          if (emptiness > 0.9) {
            density = 0;
            material = Material.AIR;
          } else {
            // Smooth falloff at edges
            density = Math.floor((1 - emptiness) * SURFACE_THRESHOLD);
          }
        }

        // Smooth ramp floor — replace the staircase with a continuous density gradient
        {
          const rampStartX = entranceCenterX + ENTRANCE_FLOOR_HALF_X - 4;
          const rampLen = ENTRANCE_RAMP_LENGTH;
          const rampHalfW = ENTRANCE_RAMP_WIDTH / 2;

          if (worldX >= rampStartX && worldX <= rampStartX + rampLen &&
              Math.abs(worldZ - entranceCenterZ) < rampHalfW) {
            const t = (worldX - rampStartX) / rampLen;
            const rampFloorY = entranceFloorY + t * (TERRAIN_SURFACE_Y - entranceFloorY);
            const dist = worldY - rampFloorY;
            const halfSpan = 3.5;

            if (dist >= -halfSpan && dist <= halfSpan) {
              const st = (dist + halfSpan) / (2 * halfSpan);
              const smooth = st * st * (3 - 2 * st);
              let smoothDens = Math.floor(255 * (1 - smooth));

              // Fade near ramp ends for clean blending with pit and surface
              const fromEnd = rampStartX + rampLen - worldX;
              const fromStart = worldX - rampStartX;
              const edgeFade = Math.min(fromEnd / 10, fromStart / 6, 1);
              smoothDens = Math.floor(density + (smoothDens - density) * edgeFade);

              density = smoothDens;
            }
          }
        }

        // Force DIRT on solid voxels in the entrance/ramp zone so the pit
        // floor and walls (below DIRT_LAYER_DEPTH) show as warm brown instead
        // of dark stone. Only affects visible surfaces since MC generates
        // triangles only at density transitions.
        if (density >= SURFACE_THRESHOLD && material !== Material.AIR) {
          const eDx = worldX - entranceCenterX;
          const eDz = worldZ - entranceCenterZ;

          // Inside the dome/pit ellipsoid (expanded slightly for wall voxels)
          const eNorm = (eDx * eDx) / ((ENTRANCE_RADIUS_X + 3) * (ENTRANCE_RADIUS_X + 3))
                      + (eDz * eDz) / ((ENTRANCE_RADIUS_Z + 3) * (ENTRANCE_RADIUS_Z + 3));
          if (eNorm < 1.0 && worldY >= entranceFloorY - 2 && worldY <= entranceCenterY + ENTRANCE_RADIUS_Y) {
            material = Material.DIRT;
          }

          // Inside the ramp corridor
          const rampStartX = entranceCenterX + ENTRANCE_FLOOR_HALF_X - 6;
          const rampEndX = rampStartX + ENTRANCE_RAMP_LENGTH + 8;
          if (worldX >= rampStartX && worldX <= rampEndX &&
              Math.abs(eDz) < ENTRANCE_RAMP_WIDTH / 2 + 3 &&
              worldY >= entranceFloorY - 2 && worldY <= TERRAIN_SURFACE_Y + 4) {
            material = Material.DIRT;
          }
        }

        const index = (x + y * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_SIZE) * 2;
        data[index] = density;
        data[index + 1] = material;
      }
    }
  }

  return data;
}
