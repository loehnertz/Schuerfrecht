import { WORLD_SEED, WORLD_CHUNKS_X, WORLD_CHUNKS_Y, WORLD_CHUNKS_Z } from './core/Config.js';
import { getState } from './core/GameState.js';
import eventBus from './core/EventBus.js';
import sceneManager from './rendering/SceneManager.js';
import cameraController from './rendering/CameraController.js';
import lightingSystem from './rendering/LightingSystem.js';
import cutawaySystem from './rendering/CutawayShader.js';
import depthSlider from './ui/DepthSlider.js';
import inputManager from './input/InputManager.js';
import selectionManager from './input/SelectionManager.js';
import commandSystem from './input/CommandSystem.js';
import { initTerrain } from './voxel/TerrainGenerator.js';
import voxelWorld from './voxel/VoxelWorld.js';
import machineManager from './machines/MachineManager.js';
import { DrillRigController } from './machines/DrillRigController.js';
import { ExcavatorController } from './machines/ExcavatorController.js';
import debrisSystem from './terrain/DebrisSystem.js';
import physicsWorld from './physics/PhysicsWorld.js';

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

// Debris system
debrisSystem.init(sceneManager.scene);

// Input systems
inputManager.init(camera);
selectionManager.init();
commandSystem.init();

// Machine — subscribe to carve events before spawning
eventBus.on('machine:carve', ({ x, y, z, radius }) => {
  const result = voxelWorld.carveAt(x, y, z, radius);
  if (result.volume > 0.05) {
    debrisSystem.addDebrisBelow(x, y, z, result.volume, result.material);
    debrisSystem.spawnHeroChunks(x, y, z, result.volume, result.material);
  }
  // Update debris baseY if terrain was carved underneath existing debris
  debrisSystem.refreshBaseYNear(x, y, z, radius);
});

// Spawn machines in the entrance cavern
const drillRig = new DrillRigController();
drillRig.init(sceneManager.scene);
machineManager.addMachine(drillRig);

const excavator = new ExcavatorController();
excavator.init(sceneManager.scene);
machineManager.addMachine(excavator);

// Set initial cutaway from state
sceneManager.setCutawayDepth(getState().cutawayDepth);

// Initialize physics (async — game loop runs without it until ready)
physicsWorld.init().then(() => {
  console.log('[init] Rapier physics ready');
  debrisSystem.initPhysics(physicsWorld);
}).catch(err => {
  console.error('[init] Rapier failed to load:', err);
});

// --- Game Loop ---

const fpsDisplay = document.getElementById('fps-display');
const triDisplay = document.getElementById('tri-display');
const machineTypeDisplay = document.getElementById('machine-type');
const stateDisplay = document.getElementById('machine-state');

// Update machine status on selection change
eventBus.on('machine:selected', ({ controller }) => {
  if (machineTypeDisplay) {
    machineTypeDisplay.textContent = controller.machineType === 'drill' ? 'DRILL RIG' : controller.machineType.toUpperCase();
  }
});
eventBus.on('machine:deselected', () => {
  if (machineTypeDisplay) machineTypeDisplay.textContent = '--';
  if (stateDisplay) stateDisplay.textContent = '--';
});

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

  // Update all machines
  machineManager.update(dt);

  // Step physics and update debris (hero chunks + heightmap meshes)
  physicsWorld.step(dt);
  debrisSystem.update(dt);
  debrisSystem.updateMeshes();

  // Update machine status display for selected machine
  if (stateDisplay && selectionManager.selected) {
    stateDisplay.textContent = selectionManager.selected.state;
  }

  // Update camera
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
