import * as THREE from 'three';
import {
  EXCAVATOR_SPEED, EXCAVATOR_TURN_SPEED, MACHINE_MAX_SLOPE_DEG,
  MACHINE_HEIGHT_OFFSET, TURRET_SWING_SPEED, ARM_JOINT_SPEED,
  SCOOP_VOLUME, SCOOP_DURATION, DUMP_DURATION,
  HEADLIGHT_COLOR, SURFACE_THRESHOLD,
  WORLD_CHUNKS_X, WORLD_CHUNKS_Z, CHUNK_SIZE, TERRAIN_SURFACE_Y,
  MATERIAL_PROPS, DEBRIS_BASE_COLOR,
} from '../core/Config.js';
import eventBus from '../core/EventBus.js';
import { buildExcavator } from './ExcavatorFactory.js';
import machineRegistry from './MachineRegistry.js';
import { surfaceProbe, surfaceProbeFrom, findPath } from '../terrain/Traversability.js';
import debrisSystem from '../terrain/DebrisSystem.js';
import chunkStore from '../voxel/ChunkStore.js';
import voxelWorld from '../voxel/VoxelWorld.js';

const _tmpVec = new THREE.Vector3();

class ExcavatorController {
  constructor() {
    this.group = null;
    this.position = new THREE.Vector3();
    this.targetRotation = 0;
    this.currentRotation = 0;
    this.state = 'IDLE';
    this.machineType = 'excavator';

    // Joints
    this._turretPivot = null;
    this._shoulderPivot = null;
    this._elbowPivot = null;
    this._wristPivot = null;
    this._tracks = null;

    // Turret
    this._turretAngle = 0;
    this._turretTargetAngle = 0;

    // Arm target angles
    this._shoulderTarget = -0.3;
    this._elbowTarget = 0.6;
    this._wristTarget = 0.3;

    // Movement
    this._path = null;
    this._pathIndex = 0;
    this._nextStateAfterMove = 'IDLE';

    // Scoop/dump
    this._scoopTarget = null;
    this._dumpTarget = null;
    this._bucketLoad = 0; // volume in bucket
    this._animTimer = 0;
    this._scoopMaterial = 0;

    // Swing state
    this._swingNeedsInit = false;
    this._pendingScoop = false;

    // Selection
    this._selected = false;
    this._selectionRing = null;
    this._selectionTime = 0;

    // Headlight
    this._headlight = null;
    this._headlightTarget = null;

    // Event listener
    this._onCommand = (cmd) => this._handleCommand(cmd);
  }

  init(scene) {
    this.group = buildExcavator();
    this._turretPivot = this.group.userData.joints.turretPivot;
    this._shoulderPivot = this.group.userData.joints.shoulderPivot;
    this._elbowPivot = this.group.userData.joints.elbowPivot;
    this._wristPivot = this.group.userData.joints.wristPivot;
    this._tracks = this.group.userData.tracks;
    this._fillMesh = this.group.userData.fillMesh;

    // Spawn offset from center (wider pit = more room)
    const centerX = (WORLD_CHUNKS_X * CHUNK_SIZE) / 2 + 10;
    const centerZ = (WORLD_CHUNKS_Z * CHUNK_SIZE) / 2 + 8;
    const surface = surfaceProbe(centerX, centerZ);

    if (surface) {
      this.position.set(centerX, surface.y + MACHINE_HEIGHT_OFFSET, centerZ);
    } else {
      this.position.set(centerX, TERRAIN_SURFACE_Y - 4, centerZ);
    }

    this.group.position.copy(this.position);

    // Set initial arm pose (retracted)
    this._shoulderTarget = -0.3;
    this._elbowTarget = 0.6;
    this._wristTarget = 0.3;

    // Create headlight
    this._createHeadlight();

    scene.add(this.group);

    this._createSelectionRing();
    this._createIndicators(scene);
    machineRegistry.register(this);
    eventBus.on('input:command', this._onCommand);

    return this;
  }

  _createHeadlight() {
    this._headlight = new THREE.SpotLight(
      HEADLIGHT_COLOR, 4.0, 50, Math.PI / 4, 0.5, 0.8,
    );
    this._headlight.castShadow = true;
    this._headlight.shadow.mapSize.width = 512;
    this._headlight.shadow.mapSize.height = 512;
    this._headlight.shadow.camera.near = 0.5;
    this._headlight.shadow.camera.far = 50;
    this._headlight.shadow.bias = -0.003;

    // Mount on turret (moves with turret rotation)
    this._headlight.position.set(-1.0, 3.9, 0.9);
    this._turretPivot.add(this._headlight);

    this._headlightTarget = new THREE.Object3D();
    this._headlightTarget.position.set(0, 0, 15);
    this._turretPivot.add(this._headlightTarget);
    this._headlight.target = this._headlightTarget;
  }

  _createSelectionRing() {
    const ringGeo = new THREE.RingGeometry(3.0, 3.4, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x44ff88,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    this._selectionRing = new THREE.Mesh(ringGeo, ringMat);
    this._selectionRing.visible = false;
    this._selectionRing.position.y = -MACHINE_HEIGHT_OFFSET + 0.05;
    this.group.add(this._selectionRing);
  }

  _createIndicators(scene) {
    this._indicatorTime = 0;

    // Scoop indicator — green downward chevron (ring with 3 segments = triangle)
    const scoopGeo = new THREE.RingGeometry(0.6, 1.0, 3);
    scoopGeo.rotateX(-Math.PI / 2); // lay flat on ground
    const scoopMat = new THREE.MeshBasicMaterial({
      color: 0x44dd66, side: THREE.DoubleSide,
      transparent: true, opacity: 0.0, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    this._scoopIndicator = new THREE.Mesh(scoopGeo, scoopMat);
    this._scoopIndicator.visible = false;
    this._scoopIndicator.renderOrder = 1;
    scene.add(this._scoopIndicator);

    // Dump indicator — orange diamond (ring with 4 segments)
    const dumpGeo = new THREE.RingGeometry(0.6, 1.0, 4);
    dumpGeo.rotateX(-Math.PI / 2);
    const dumpMat = new THREE.MeshBasicMaterial({
      color: 0xdd8833, side: THREE.DoubleSide,
      transparent: true, opacity: 0.0, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    this._dumpIndicator = new THREE.Mesh(dumpGeo, dumpMat);
    this._dumpIndicator.visible = false;
    this._dumpIndicator.renderOrder = 1;
    scene.add(this._dumpIndicator);

    // Move indicator — blue circle
    const moveGeo = new THREE.RingGeometry(0.5, 0.8, 16);
    moveGeo.rotateX(-Math.PI / 2);
    const moveMat = new THREE.MeshBasicMaterial({
      color: 0x4488ff, side: THREE.DoubleSide,
      transparent: true, opacity: 0.0, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    this._moveIndicator = new THREE.Mesh(moveGeo, moveMat);
    this._moveIndicator.visible = false;
    this._moveIndicator.renderOrder = 1;
    this._moveTarget = null;
    scene.add(this._moveIndicator);
  }

  _updateIndicators(dt) {
    this._indicatorTime += dt;
    const pulse = Math.sin(this._indicatorTime * 2.5) * 0.15 + 0.35;

    // Scoop indicator — visible when we have a scoop target and are scooping/approaching
    const showScoop = this._scoopTarget &&
      (this.state === 'SCOOPING' || (this.state === 'MOVING' && this._nextStateAfterMove === 'SCOOPING'));
    if (showScoop) {
      this._scoopIndicator.visible = true;
      this._scoopIndicator.position.set(this._scoopTarget.x, this._scoopTarget.y + 0.2, this._scoopTarget.z);
      this._scoopIndicator.material.opacity = pulse;
      this._scoopIndicator.rotation.y += dt * 0.8;
    } else {
      this._scoopIndicator.visible = false;
    }

    // Dump indicator — visible when a dump target is set
    const showDump = this._dumpTarget &&
      (this.state === 'DUMPING' || this.state === 'SWINGING' ||
       (this.state === 'MOVING' && this._nextStateAfterMove === 'SWINGING') ||
       this._bucketLoad > 0);
    if (showDump) {
      this._dumpIndicator.visible = true;
      this._dumpIndicator.position.set(this._dumpTarget.x, this._dumpTarget.y + 0.2, this._dumpTarget.z);
      this._dumpIndicator.material.opacity = pulse;
      this._dumpIndicator.rotation.y += dt * 0.8;
    } else {
      this._dumpIndicator.visible = false;
    }

    // Move indicator — blue circle at move destination
    if (this._moveTarget && this.state === 'MOVING') {
      this._moveIndicator.visible = true;
      this._moveIndicator.position.copy(this._moveTarget);
      this._moveIndicator.material.opacity = Math.sin(this._indicatorTime * 3) * 0.15 + 0.35;
      this._moveIndicator.rotation.y += dt * 0.8;
    } else {
      this._moveIndicator.visible = false;
    }
  }

  setSelected(selected) {
    this._selected = selected;
    this._selectionRing.visible = selected;
    this._selectionTime = 0;
  }

  update(dt) {
    if (this._selected) {
      this._selectionTime += dt;
      this._selectionRing.material.opacity = Math.sin(this._selectionTime * 3) * 0.3 + 0.5;
    }

    switch (this.state) {
      case 'IDLE': this._updateIdle(dt); break;
      case 'MOVING': this._updateMoving(dt); break;
      case 'SCOOPING': this._updateScooping(dt); break;
      case 'SWINGING': this._updateSwinging(dt); break;
      case 'DUMPING': this._updateDumping(dt); break;
    }

    // Animate arm joints toward targets
    this._lerpJoint(this._shoulderPivot, 'x', this._shoulderTarget, ARM_JOINT_SPEED * dt);
    this._lerpJoint(this._elbowPivot, 'x', this._elbowTarget, ARM_JOINT_SPEED * dt);
    this._lerpJoint(this._wristPivot, 'x', this._wristTarget, ARM_JOINT_SPEED * dt);

    // Update target indicators
    this._updateIndicators(dt);

    // Animate turret swing
    const turretDiff = this._turretTargetAngle - this._turretAngle;
    if (Math.abs(turretDiff) > 0.01) {
      this._turretAngle += Math.sign(turretDiff) * Math.min(Math.abs(turretDiff), TURRET_SWING_SPEED * dt);
      this._turretPivot.rotation.y = this._turretAngle;
    }

    this.group.position.copy(this.position);
    this.group.rotation.y = this.currentRotation;
  }

  // --- State handlers ---

  _updateIdle(dt) {
    // Retract arm to rest pose
    this._shoulderTarget = -0.3;
    this._elbowTarget = 0.6;
    this._wristTarget = 0.3;
  }

  _updateMoving(dt) {
    if (!this._path || this._pathIndex >= this._path.length) {
      this.state = this._nextStateAfterMove;
      this._path = null;
      this._moveTarget = null;
      return;
    }

    const target = this._path[this._pathIndex];
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const distXZ = Math.sqrt(dx * dx + dz * dz);

    if (distXZ < 0.5) {
      this._pathIndex++;
      if (this._pathIndex >= this._path.length) {
        this.state = this._nextStateAfterMove;
        this._path = null;
        this._moveTarget = null;
        return;
      }
      return;
    }

    this.targetRotation = Math.atan2(dx, dz);
    this._lerpRotation(dt);

    const speed = EXCAVATOR_SPEED * dt;
    const moveX = (dx / distXZ) * Math.min(speed, distXZ);
    const moveZ = (dz / distXZ) * Math.min(speed, distXZ);
    this.position.x += moveX;
    this.position.z += moveZ;

    const surface = surfaceProbeFrom(this.position.x, this.position.y + 4, this.position.z);
    if (surface) {
      this.position.y = surface.y + MACHINE_HEIGHT_OFFSET;
    }

    this._scrollTracks(dt * EXCAVATOR_SPEED * 0.15);
  }

  _updateScooping(dt) {
    this._animTimer += dt;
    const t = Math.min(this._animTimer / SCOOP_DURATION, 1);

    // Scoop animation: lower arm → drag bucket → raise loaded
    if (t < 0.4) {
      // Lowering: shoulder down, elbow extends, wrist curls bucket open
      const lt = t / 0.4;
      this._shoulderTarget = THREE.MathUtils.lerp(-0.3, 0.5, lt);
      this._elbowTarget = THREE.MathUtils.lerp(0.6, 1.2, lt);
      this._wristTarget = THREE.MathUtils.lerp(0.3, -0.4, lt);
    } else if (t < 0.7) {
      // Dragging: bucket closes (wrist curls in)
      const lt = (t - 0.4) / 0.3;
      this._wristTarget = THREE.MathUtils.lerp(-0.4, 0.8, lt);
      this._elbowTarget = THREE.MathUtils.lerp(1.2, 0.8, lt);
    } else {
      // Raising: shoulder lifts, arm retracts
      const lt = (t - 0.7) / 0.3;
      this._shoulderTarget = THREE.MathUtils.lerp(0.5, -0.5, lt);
      this._elbowTarget = THREE.MathUtils.lerp(0.8, 0.4, lt);
      this._wristTarget = THREE.MathUtils.lerp(0.8, 1.0, lt); // bucket stays closed
    }

    if (t >= 0.5 && this._bucketLoad === 0) {
      // Actually remove debris from heightmap at midpoint of scoop
      const removed = debrisSystem.removeDebris(
        this._scoopTarget.x, this._scoopTarget.z, SCOOP_VOLUME,
      );
      this._bucketLoad = removed;

      // Show fill mesh — color it to match the scooped material
      if (removed > 0 && this._fillMesh) {
        this._fillMesh.visible = true;
        // Scale fill based on how much was actually scooped vs capacity
        const fillFraction = Math.min(removed / SCOOP_VOLUME, 1);
        this._fillMesh.scale.set(1, fillFraction, 1);

        // Tint to match debris material
        const matProps = MATERIAL_PROPS[this._scoopMaterial];
        if (matProps) {
          const r = DEBRIS_BASE_COLOR[0] * 0.5 + matProps.color[0] * 0.5;
          const g = DEBRIS_BASE_COLOR[1] * 0.5 + matProps.color[1] * 0.5;
          const b = DEBRIS_BASE_COLOR[2] * 0.5 + matProps.color[2] * 0.5;
          this._fillMesh.material.color.setRGB(r, g, b);
        }
      }
    }

    if (t >= 1) {
      if (this._dumpTarget) {
        // Dump — drive there if needed, then swing+dump
        this._startDumpSequence();
      } else {
        this.state = 'IDLE';
      }
    }
  }

  _updateSwinging(dt) {
    // On entry (first frame): compute turret angle if it hasn't been set yet
    if (this._swingNeedsInit) {
      this._swingNeedsInit = false;
      const target = this._pendingScoop ? this._scoopTarget : this._dumpTarget;
      if (target) this._computeTurretAngleToTarget(target);
    }

    // Wait for turret to reach target angle
    const diff = Math.abs(this._turretTargetAngle - this._turretAngle);
    if (diff < 0.1) {
      if (this._pendingScoop) {
        // Auto-cycle: swing completed, now drive to scoop if needed
        this._pendingScoop = false;
        this._bucketLoad = 0;
        this._startScoopCycle();
      } else {
        this.state = 'DUMPING';
        this._animTimer = 0;
      }
    }
  }

  _updateDumping(dt) {
    this._animTimer += dt;
    const t = Math.min(this._animTimer / DUMP_DURATION, 1);

    // Dump animation: extend arm out, curl bucket open
    if (t < 0.5) {
      const lt = t / 0.5;
      this._shoulderTarget = THREE.MathUtils.lerp(-0.5, 0.2, lt);
      this._elbowTarget = THREE.MathUtils.lerp(0.4, 0.8, lt);
    } else {
      const lt = (t - 0.5) / 0.5;
      this._wristTarget = THREE.MathUtils.lerp(1.0, -0.5, lt); // bucket opens
    }

    if (t >= 0.7 && this._bucketLoad > 0) {
      // Deposit debris at dump target
      const probe = surfaceProbeFrom(this._dumpTarget.x, this._dumpTarget.y + 4, this._dumpTarget.z);
      const floorY = probe ? probe.y : this._dumpTarget.y;
      debrisSystem.addDebris(this._dumpTarget.x, this._dumpTarget.z, this._bucketLoad, this._scoopMaterial, floorY);
      this._bucketLoad = 0;
      if (this._fillMesh) this._fillMesh.visible = false;
    }

    if (t >= 1) {
      // Swing turret back to forward
      this._turretTargetAngle = 0;
      // Check if more debris at scoop point — auto-cycle (with range check)
      if (this._scoopTarget && debrisSystem.hasDebrisNear(this._scoopTarget.x, this._scoopTarget.z, 3)) {
        this._startScoopCycle();
      } else {
        this.state = 'IDLE';
        this._pendingScoop = false;
      }
    }
  }

  // --- Commands ---

  _handleCommand(cmd) {
    if (!this._selected) return;

    switch (cmd.type) {
      case 'move':
        this._commandMove(cmd.target.x, cmd.target.z);
        break;
      case 'mine':
        // For excavator, left-click on terrain = scoop command (if debris nearby)
        this._commandScoop(cmd.target);
        break;
      case 'cancel':
        this.state = 'IDLE';
        this._path = null;
        this._moveTarget = null;
        this._bucketLoad = 0;
        this._turretTargetAngle = 0;
        if (this._fillMesh) this._fillMesh.visible = false;
        break;
    }
  }

  _commandMove(targetX, targetZ) {
    const path = findPath(
      this.position.x, this.position.z,
      targetX, targetZ,
      MACHINE_MAX_SLOPE_DEG,
    );

    if (path && path.length > 1) {
      this._path = path;
      this._pathIndex = 1;
      this._nextStateAfterMove = 'IDLE';
      const dest = path[path.length - 1];
      this._moveTarget = new THREE.Vector3(dest.x, dest.y + 0.15, dest.z);
      this.state = 'MOVING';
    } else {
      this._flashNoPath();
    }
  }

  _commandScoop(target) {
    // Check if there's debris near the target
    if (!debrisSystem.hasDebrisNear(target.x, target.z, 4)) {
      // No debris — treat as a dump target instead
      this._commandSetDump(target);
      return;
    }

    this._scoopTarget = new THREE.Vector3(target.x, target.y, target.z);
    this._scoopMaterial = debrisSystem.getDebrisMaterial(target.x, target.z);

    // Check distance — need to be close enough to scoop
    if (!this._driveToIfFar(target, 6, 4, 'SCOOPING')) {
      // Within range — start scooping
      this._computeTurretAngleToTarget(target);
      this._animTimer = 0;
      this._bucketLoad = 0;
      this.state = 'SCOOPING';
    }
  }

  _commandSetDump(target) {
    this._dumpTarget = new THREE.Vector3(target.x, target.y, target.z);

    // If bucket is loaded, start dump sequence (drive if too far)
    if (this._bucketLoad > 0) {
      this._startDumpSequence();
    }
  }

  _startDumpSequence() {
    if (!this._dumpTarget) return;

    this._swingNeedsInit = false;
    if (!this._driveToIfFar(this._dumpTarget, 8, 5, 'SWINGING')) {
      // Within range — swing turret and dump
      this._computeTurretAngleToTarget(this._dumpTarget);
      this.state = 'SWINGING';
    } else {
      // Will arrive via MOVING→SWINGING; compute turret angle on arrival
      this._swingNeedsInit = true;
    }
  }

  // Auto-cycle back to scoop target — drives there if too far
  _startScoopCycle() {
    if (!this._scoopTarget) { this.state = 'IDLE'; return; }

    this._scoopMaterial = debrisSystem.getDebrisMaterial(this._scoopTarget.x, this._scoopTarget.z);

    if (!this._driveToIfFar(this._scoopTarget, 6, 4, 'SCOOPING')) {
      // Within range — swing turret and scoop
      this._computeTurretAngleToTarget(this._scoopTarget);
      this._animTimer = 0;
      this._bucketLoad = 0;
      this.state = 'SCOOPING';
    }
  }

  // Drive to target if further than maxDist; approach to approachDist.
  // Returns true if driving, false if already in range.
  _driveToIfFar(target, maxDist, approachDist, stateAfterMove) {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist <= maxDist) return false;

    const dirX = dx / dist;
    const dirZ = dz / dist;
    const approachX = target.x - dirX * approachDist;
    const approachZ = target.z - dirZ * approachDist;

    const path = findPath(
      this.position.x, this.position.z,
      approachX, approachZ,
      MACHINE_MAX_SLOPE_DEG,
    );

    if (path && path.length > 1) {
      this._path = path;
      this._pathIndex = 1;
      this._nextStateAfterMove = stateAfterMove;
      this.state = 'MOVING';
      return true;
    } else {
      this._flashNoPath();
      return true; // returning true to prevent immediate action
    }
  }

  // --- Helpers ---

  _computeTurretAngleToTarget(target) {
    // Compute world direction to target
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const worldAngle = Math.atan2(dx, dz);
    // Turret angle is relative to machine body rotation
    let relAngle = worldAngle - this.currentRotation;
    while (relAngle > Math.PI) relAngle -= Math.PI * 2;
    while (relAngle < -Math.PI) relAngle += Math.PI * 2;
    this._turretTargetAngle = relAngle;
  }

  _lerpRotation(dt) {
    let diff = this.targetRotation - this.currentRotation;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.currentRotation += diff * Math.min(1, EXCAVATOR_TURN_SPEED * dt);
  }

  _lerpJoint(pivot, axis, target, speed) {
    const current = pivot.rotation[axis];
    pivot.rotation[axis] += (target - current) * Math.min(1, speed);
  }

  _scrollTracks(amount) {
    if (this._tracks.left.map) this._tracks.left.map.offset.x += amount;
    if (this._tracks.right.map) this._tracks.right.map.offset.x += amount;
  }

  _flashNoPath() {
    if (!this._selectionRing) return;
    this._selectionRing.material.color.set(0xff4444);
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      if (this._selectionRing) this._selectionRing.material.color.set(0x44ff88);
    }, 400);
  }
}

export { ExcavatorController };
