import { WORLD_SEED, WORLD_CHUNKS_X, WORLD_CHUNKS_Y, WORLD_CHUNKS_Z } from './core/Config.js';
import { getState } from './core/GameState.js';
import sceneManager from './rendering/SceneManager.js';
import cameraController from './rendering/CameraController.js';
import lightingSystem from './rendering/LightingSystem.js';
import cutawaySystem from './rendering/CutawayShader.js';
import depthSlider from './ui/DepthSlider.js';
import inputManager from './input/InputManager.js';
import { initTerrain } from './voxel/TerrainGenerator.js';
import voxelWorld from './voxel/VoxelWorld.js';

// --- Init ---

const canvas = document.getElementById('game-canvas');

// Core systems
initTerrain(WORLD_SEED);
sceneManager.init(canvas);
const camera = cameraController.init();
lightingSystem.init(sceneManager.scene);
cutawaySystem.init();
depthSlider.init();

// Voxel engine
voxelWorld.init();
voxelWorld.loadInitialChunks(WORLD_CHUNKS_X, WORLD_CHUNKS_Y, WORLD_CHUNKS_Z);

// Input — debug mining
inputManager.init(camera, (wx, wy, wz) => {
  voxelWorld.carveAt(wx, wy, wz);
});

// Set initial cutaway from state
sceneManager.setCutawayDepth(getState().cutawayDepth);

// --- Game Loop ---

const fpsDisplay = document.getElementById('fps-display');
const triDisplay = document.getElementById('tri-display');

let lastTime = performance.now();
let frameCount = 0;
let fpsAccumulator = 0;

function gameLoop(now) {
  requestAnimationFrame(gameLoop);

  const dt = Math.min((now - lastTime) / 1000, 0.1); // Cap at 100ms
  lastTime = now;

  // FPS counter
  frameCount++;
  fpsAccumulator += dt;
  if (fpsAccumulator >= 0.5) {
    const fps = Math.round(frameCount / fpsAccumulator);
    fpsDisplay.textContent = fps;
    triDisplay.textContent = formatNumber(sceneManager.renderer.info.render.triangles);
    frameCount = 0;
    fpsAccumulator = 0;
  }

  // Update
  cameraController.update(dt);

  // Render
  sceneManager.render(camera);
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

requestAnimationFrame(gameLoop);
