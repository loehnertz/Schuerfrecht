import * as THREE from 'three';
import eventBus from '../core/EventBus.js';
import selectionManager from './SelectionManager.js';

class CommandSystem {
  constructor() {
    this._escHandler = null;
  }

  init() {
    eventBus.on('input:click', (e) => this._onLeftClick(e));
    eventBus.on('input:rightclick', (e) => this._onRightClick(e));
    eventBus.on('input:dragmine', (e) => this._onDragMine(e));

    // Keyboard shortcuts
    this._keyHandler = (e) => {
      if (e.key === 'Escape') {
        eventBus.emit('input:command', { type: 'cancel' });
        selectionManager.deselect();
      } else if (e.key >= '1' && e.key <= '9') {
        selectionManager.selectByIndex(parseInt(e.key) - 1);
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  _onLeftClick({ point, normal, isTerrain, isMachine, shiftKey }) {
    if (!isTerrain || !selectionManager.selected) return;

    if (normal) {
      eventBus.emit('input:command', {
        type: 'mine',
        target: point,
        normal: normal,
        fine: shiftKey,
      });
    }
  }

  _onDragMine({ point, normal, fine }) {
    // Continuously update mine target while dragging — "painting" the mine path
    if (!selectionManager.selected) return;

    eventBus.emit('input:command', {
      type: 'mine',
      target: point,
      normal: normal,
      fine: fine,
    });
  }

  _onRightClick({ point, normal }) {
    if (!selectionManager.selected) return;

    eventBus.emit('input:command', {
      type: 'move',
      target: point,
    });
  }
}

export default new CommandSystem();
