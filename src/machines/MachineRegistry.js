/**
 * Maps Three.js mesh objects to their MachineController instances.
 * Used by InputManager to determine if a raycast hit a machine.
 */
class MachineRegistry {
  constructor() {
    this._meshToController = new Map();
    this._controllers = new Set();
  }

  register(controller) {
    this._controllers.add(controller);
    // Walk all descendants and map meshes to this controller
    controller.group.traverse((obj) => {
      if (obj.isMesh) {
        this._meshToController.set(obj, controller);
      }
    });
  }

  unregister(controller) {
    this._controllers.delete(controller);
    controller.group.traverse((obj) => {
      if (obj.isMesh) {
        this._meshToController.delete(obj);
      }
    });
  }

  getControllerForMesh(mesh) {
    // Check the mesh itself, then walk up to find a registered parent
    let obj = mesh;
    while (obj) {
      if (this._meshToController.has(obj)) {
        return this._meshToController.get(obj);
      }
      obj = obj.parent;
    }
    return null;
  }

  getAllControllers() {
    return [...this._controllers];
  }
}

export default new MachineRegistry();
