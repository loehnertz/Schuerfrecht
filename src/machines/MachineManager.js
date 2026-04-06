class MachineManager {
  constructor() {
    this._machines = [];
  }

  addMachine(controller) {
    this._machines.push(controller);
  }

  update(dt) {
    for (const m of this._machines) {
      try {
        m.update(dt);
      } catch (err) {
        console.error(`[MachineManager] ${m.machineType} update error:`, err);
        m.state = 'IDLE';
      }
    }
  }

  getAllMachines() {
    return this._machines;
  }

  getByIndex(index) {
    return this._machines[index] || null;
  }
}

export default new MachineManager();
