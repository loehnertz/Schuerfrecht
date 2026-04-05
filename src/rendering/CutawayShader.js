import eventBus from '../core/EventBus.js';
import sceneManager from './SceneManager.js';

class CutawaySystem {
  init() {
    eventBus.on('camera:cutaway', ({ depth }) => {
      sceneManager.setCutawayDepth(depth);
    });
  }
}

export default new CutawaySystem();
