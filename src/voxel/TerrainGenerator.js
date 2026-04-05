import { createNoise3D } from 'simplex-noise';
import alea from 'alea';
import {
  CHUNK_SIZE, SURFACE_THRESHOLD, Material,
  TERRAIN_SURFACE_Y, DIRT_LAYER_DEPTH, STONE_LAYER_DEPTH,
  ORE_PARAMS,
  ENTRANCE_RADIUS_X, ENTRANCE_RADIUS_Y, ENTRANCE_RADIUS_Z,
  WORLD_CHUNKS_X, WORLD_CHUNKS_Z,
} from '../core/Config.js';

let terrainNoise;
let oreNoises = {};
let entranceCenterX;
let entranceCenterY;
let entranceCenterZ;

export function initTerrain(seed) {
  terrainNoise = createNoise3D(alea(seed + 'terrain'));

  for (const matKey of Object.keys(ORE_PARAMS)) {
    oreNoises[matKey] = createNoise3D(alea(seed + 'ore' + matKey));
  }

  // Entrance cavern at the center of the world, near the surface
  entranceCenterX = (WORLD_CHUNKS_X * CHUNK_SIZE) / 2;
  entranceCenterY = TERRAIN_SURFACE_Y - 4;
  entranceCenterZ = (WORLD_CHUNKS_Z * CHUNK_SIZE) / 2;
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

function getLayerAndDensity(worldX, worldY, worldZ) {
  // Noise-perturbed layer boundaries
  const boundaryNoise = fbm3(terrainNoise, worldX, 0, worldZ, 0.02) * 6;

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
    material = worldY < surfaceY ? Material.DIRT : Material.AIR;
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

function isInEntranceCavern(worldX, worldY, worldZ) {
  const dx = (worldX - entranceCenterX) / ENTRANCE_RADIUS_X;
  const dy = (worldY - entranceCenterY) / ENTRANCE_RADIUS_Y;
  const dz = (worldZ - entranceCenterZ) / ENTRANCE_RADIUS_Z;
  return (dx * dx + dy * dy + dz * dz) < 1.0;
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

        // Carve entrance cavern
        if (isInEntranceCavern(worldX, worldY, worldZ)) {
          // Smooth edges using distance
          const dx = (worldX - entranceCenterX) / ENTRANCE_RADIUS_X;
          const dy = (worldY - entranceCenterY) / ENTRANCE_RADIUS_Y;
          const dz = (worldZ - entranceCenterZ) / ENTRANCE_RADIUS_Z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (dist < 0.85) {
            density = 0;
            material = Material.AIR;
          } else {
            // Smooth falloff at cavern edge
            const t = (dist - 0.85) / 0.15;
            density = Math.floor(t * SURFACE_THRESHOLD);
            // Keep the material for the walls
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
