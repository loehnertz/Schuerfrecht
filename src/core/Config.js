// All tunable constants in one place

export const CHUNK_SIZE = 16;
export const VOXEL_BYTES = 2;
export const SURFACE_THRESHOLD = 128;
export const WORLD_SEED = 42;

// World extent in chunks
export const WORLD_CHUNKS_X = 8;
export const WORLD_CHUNKS_Y = 8;
export const WORLD_CHUNKS_Z = 8;

// Carve settings
export const CARVE_RADIUS = 2.5;

// Material enum
export const Material = {
  AIR: 0,
  DIRT: 1,
  STONE: 2,
  HARD_ROCK: 3,
  IRON_ORE: 4,
  GOLD_ORE: 5,
  CRYSTAL: 6,
};

// Material properties: [r, g, b, hardness, emissiveR, emissiveG, emissiveB]
export const MATERIAL_PROPS = {
  [Material.AIR]:       { color: [0.0, 0.0, 0.0],    hardness: 0,   emissive: [0, 0, 0] },
  [Material.DIRT]:      { color: [0.62, 0.45, 0.30],  hardness: 0.3, emissive: [0, 0, 0] },
  [Material.STONE]:     { color: [0.55, 0.53, 0.50],  hardness: 0.6, emissive: [0, 0, 0] },
  [Material.HARD_ROCK]: { color: [0.40, 0.38, 0.45],  hardness: 1.0, emissive: [0, 0, 0] },
  [Material.IRON_ORE]:  { color: [0.70, 0.30, 0.15],  hardness: 0.7, emissive: [0.15, 0.05, 0.02] },
  [Material.GOLD_ORE]:  { color: [0.85, 0.65, 0.15],  hardness: 0.5, emissive: [0.25, 0.18, 0.03] },
  [Material.CRYSTAL]:   { color: [0.55, 0.75, 0.95],  hardness: 0.8, emissive: [0.12, 0.20, 0.35] },
};

// Flat arrays for fast worker access (no object overhead)
export const MATERIAL_COLORS = new Float32Array([
  // AIR
  0.0, 0.0, 0.0,
  // DIRT — warm brown
  0.62, 0.45, 0.30,
  // STONE — neutral gray
  0.55, 0.53, 0.50,
  // HARD_ROCK — cool blue-gray
  0.40, 0.38, 0.45,
  // IRON_ORE — rust/orange
  0.70, 0.30, 0.15,
  // GOLD_ORE — amber
  0.85, 0.65, 0.15,
  // CRYSTAL — blue-white
  0.55, 0.75, 0.95,
]);

export const MATERIAL_EMISSIVE = new Float32Array([
  0, 0, 0,          // AIR
  0, 0, 0,          // DIRT
  0, 0, 0,          // STONE
  0, 0, 0,          // HARD_ROCK
  0.15, 0.05, 0.02, // IRON_ORE — subtle rust glow
  0.25, 0.18, 0.03, // GOLD_ORE — warm amber glow
  0.12, 0.20, 0.35, // CRYSTAL — cool blue glow
]);

// Camera defaults
export const CAMERA_ZOOM = 40;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 500;
export const CAMERA_ELEVATION = 35.264 * (Math.PI / 180); // True isometric
export const CAMERA_INITIAL_AZIMUTH = Math.PI / 4; // 45 degrees
export const CAMERA_PAN_SPEED = 0.5;
export const CAMERA_ZOOM_SPEED = 2;
export const CAMERA_ZOOM_MIN = 15;
export const CAMERA_ZOOM_MAX = 120;
export const CAMERA_ROTATION_LERP = 0.08;
export const CAMERA_DISTANCE = 200;

// Lighting
export const FOG_DENSITY = 0.003;
export const AMBIENT_COLOR = 0x0a0a12;
export const AMBIENT_INTENSITY = 0.15;
export const SPOT_COLOR = 0xffe8c0;
export const SPOT_INTENSITY = 2.0;
export const SPOT_ANGLE = Math.PI / 6;
export const SPOT_PENUMBRA = 0.5;

// Terrain generation
export const TERRAIN_SURFACE_Y = 96;
export const DIRT_LAYER_DEPTH = 80;
export const STONE_LAYER_DEPTH = 48;

// Ore vein parameters: [minDepth, maxDepth, noiseThreshold, noiseScale]
export const ORE_PARAMS = {
  [Material.IRON_ORE]:  { minY: 40, maxY: 90, threshold: 0.65, scale: 0.08 },
  [Material.GOLD_ORE]:  { minY: 20, maxY: 60, threshold: 0.75, scale: 0.06 },
  [Material.CRYSTAL]:   { minY: 0,  maxY: 30, threshold: 0.80, scale: 0.05 },
};

// Entrance cavern — tall enough to cut through dirt into stone layer
export const ENTRANCE_RADIUS_X = 12;
export const ENTRANCE_RADIUS_Y = 14;
export const ENTRANCE_RADIUS_Z = 12;

// Worker pool
export const WORKER_COUNT = 2;
