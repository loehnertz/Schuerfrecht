import RAPIER from '@dimforge/rapier3d-compat';

class PhysicsWorld {
  constructor() {
    this._world = null;
    this._ready = false;
    this._RAPIER = null;
  }

  async init() {
    await RAPIER.init();
    this._RAPIER = RAPIER;
    this._world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this._ready = true;
  }

  get ready() { return this._ready; }
  get RAPIER() { return this._RAPIER; }

  step(dt) {
    if (!this._ready) return;
    this._world.timestep = Math.min(dt, 1 / 30);
    this._world.step();
  }

  createDynamicBody(pos, halfExtents, velocity) {
    const bodyDesc = this._RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setLinvel(velocity.x, velocity.y, velocity.z);
    const body = this._world.createRigidBody(bodyDesc);

    const colliderDesc = this._RAPIER.ColliderDesc.cuboid(
      halfExtents.x, halfExtents.y, halfExtents.z,
    )
      .setRestitution(0.3)
      .setFriction(0.6);
    this._world.createCollider(colliderDesc, body);

    return body;
  }

  createStaticPlane(y) {
    const bodyDesc = this._RAPIER.RigidBodyDesc.fixed()
      .setTranslation(0, y, 0);
    const body = this._world.createRigidBody(bodyDesc);

    // Large thin cuboid as ground plane
    const colliderDesc = this._RAPIER.ColliderDesc.cuboid(500, 0.1, 500)
      .setFriction(0.8);
    this._world.createCollider(colliderDesc, body);

    return body;
  }

  removeBody(body) {
    if (!this._ready || !body) return;
    this._world.removeRigidBody(body);
  }

  getTranslation(body) {
    return body.translation();
  }

  getRotation(body) {
    return body.rotation();
  }

  getLinearVelocity(body) {
    return body.linvel();
  }
}

export default new PhysicsWorld();
