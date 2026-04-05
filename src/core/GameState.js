import { WORLD_SEED, TERRAIN_SURFACE_Y, CAMERA_INITIAL_AZIMUTH, CAMERA_ZOOM } from './Config.js';
import eventBus from './EventBus.js';

const state = {
  seed: WORLD_SEED,
  cutawayDepth: TERRAIN_SURFACE_Y + 4,
  camera: {
    azimuth: CAMERA_INITIAL_AZIMUTH,
    zoom: CAMERA_ZOOM,
    panX: 0,
    panZ: 0,
  },
};

export function getState() {
  return state;
}

export function setCutawayDepth(y) {
  state.cutawayDepth = y;
  eventBus.emit('camera:cutaway', { depth: y });
}
