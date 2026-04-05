import eventBus from '../core/EventBus.js';
import machineRegistry from '../machines/MachineRegistry.js';

class SelectionManager {
  constructor() {
    this.selected = null;
  }

  init() {
    eventBus.on('input:click', (e) => this._onClick(e));
  }

  _onClick({ object, isMachine }) {
    if (isMachine) {
      const controller = machineRegistry.getControllerForMesh(object);
      if (controller && controller !== this.selected) {
        this._deselect();
        this.selected = controller;
        controller.setSelected(true);
        eventBus.emit('machine:selected', { controller });
      }
    } else {
      // Clicking terrain/empty space does NOT deselect — it issues a command.
      // Only deselect if nothing is selected or if we want explicit deselect.
      // Deselection happens via Escape key or clicking empty space with no command context.
    }
  }

  deselect() {
    this._deselect();
    eventBus.emit('machine:deselected', {});
  }

  _deselect() {
    if (this.selected) {
      this.selected.setSelected(false);
      this.selected = null;
    }
  }
}

export default new SelectionManager();
