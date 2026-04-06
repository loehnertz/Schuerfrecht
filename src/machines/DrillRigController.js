import * as THREE from 'three';
import {
  MACHINE_SPEED, MACHINE_MAX_SLOPE_DEG, MACHINE_HEIGHT_OFFSET,
  MACHINE_TURN_SPEED, DRILL_SPIN_SPEED, DRILL_EXTEND_SPEED,
  CARVE_INTERVAL_BASE, MACHINE_CARVE_RADIUS, SURFACE_THRESHOLD,
  DRILL_BOOM_MIN_ANGLE, DRILL_BOOM_MAX_ANGLE,
  HEADLIGHT_COLOR,
  MATERIAL_PROPS,
  WORLD_CHUNKS_X, WORLD_CHUNKS_Z, CHUNK_SIZE, TERRAIN_SURFACE_Y,
} from '../core/Config.js';
import eventBus from '../core/EventBus.js';
import { buildDrillRig } from './MachineFactory.js';
import machineRegistry from './MachineRegistry.js';
import { surfaceProbe, surfaceProbeFrom, findPath, getMaterialAt } from '../terrain/Traversability.js';
import chunkStore from '../voxel/ChunkStore.js';
import voxelWorld from '../voxel/VoxelWorld.js';

const _UP = new THREE.Vector3(0, 1, 0);
const _tmpVec = new THREE.Vector3();
const _drillTipLocal = new THREE.Vector3();

class DrillRigController {
  constructor() {
    this.group = null;
    this.position = new THREE.Vector3();
    this.targetRotation = 0;
    this.currentRotation = 0;
    this.state = 'IDLE';
    this.machineType = 'drill';

    // Joints
    this._boomPivot = null;
    this._drillHead = null;
    this._tracks = null;
    this._drillTipOffset = null;

    // Movement
    this._path = null;
    this._pathIndex = 0;
    this._nextStateAfterMove = 'IDLE';

    // Mining
    this._mineTarget = null;
    this._mineNormal = null;
    this._carveTimer = 0;
    this._boomTargetAngle = 0;
    this._elbowTargetAngle = 0;
    this._fineMining = false;
    this._approachTime = 0;

    // Selection
    this._selected = false;
    this._selectionRing = null;
    this._selectionTime = 0;

    // Headlight
    this._headlight = null;
    this._headlightTarget = null;

    // Mine target indicator
    this._mineIndicator = null;
    this._mineIndicatorTime = 0;

    // Move target indicator
    this._moveIndicator = null;
    this._moveIndicatorTime = 0;
    this._moveTarget = null;

    // Event listener
    this._onCommand = (cmd) => this._handleCommand(cmd);
  }

  init(scene) {
    this.group = buildDrillRig();
    this._boomPivot = this.group.userData.joints.boomPivot;
    this._elbowPivot = this.group.userData.joints.elbowPivot;
    this._drillHead = this.group.userData.joints.drillHead;
    this._tracks = this.group.userData.tracks;
    this._drillTipOffset = this.group.userData.drillTipOffset;

    // Spawn at entrance cavern floor
    const centerX = (WORLD_CHUNKS_X * CHUNK_SIZE) / 2;
    const centerZ = (WORLD_CHUNKS_Z * CHUNK_SIZE) / 2;
    const surface = surfaceProbe(centerX, centerZ);

    if (surface) {
      this.position.set(centerX, surface.y + MACHINE_HEIGHT_OFFSET, centerZ);
    } else {
      this.position.set(centerX, TERRAIN_SURFACE_Y - 4, centerZ);
    }

    this.group.position.copy(this.position);

    // Create headlight
    this._createHeadlight();

    // Add to scene
    scene.add(this.group);

    // Create selection ring (hidden initially)
    this._createSelectionRing();

    // Create target indicators (added to scene, not to machine group)
    this._createMineIndicator(scene);
    this._createMoveIndicator(scene);

    // Register with machine registry
    machineRegistry.register(this);

    // Listen for commands
    eventBus.on('input:command', this._onCommand);

    return this;
  }

  _createHeadlight() {
    // Main headlight — mounted on the cabin lamp bar, bright and wide
    this._headlight = new THREE.SpotLight(
      HEADLIGHT_COLOR,
      5.0,        // much brighter
      60,         // longer range
      Math.PI / 4, // wider cone
      0.5,
      0.8,
    );
    this._headlight.castShadow = true;
    this._headlight.shadow.mapSize.width = 512;
    this._headlight.shadow.mapSize.height = 512;
    this._headlight.shadow.camera.near = 0.5;
    this._headlight.shadow.camera.far = 60;
    this._headlight.shadow.bias = -0.003;

    // Mount on the lamp bar position (top of cabin), not on the boom
    const lampPos = this.group.userData.lampPosition;
    this.group.add(this._headlight);
    this._headlight.position.copy(lampPos);

    // Target placed ahead of the machine (in local Z)
    this._headlightTarget = new THREE.Object3D();
    this._headlightTarget.position.set(0, 0, 15);
    this.group.add(this._headlightTarget);
    this._headlight.target = this._headlightTarget;
  }

  _createSelectionRing() {
    const ringGeo = new THREE.RingGeometry(3.0, 3.4, 32);
    ringGeo.rotateX(-Math.PI / 2); // lay flat
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x44ff88,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    this._selectionRing = new THREE.Mesh(ringGeo, ringMat);
    this._selectionRing.visible = false;
    this._selectionRing.position.y = -MACHINE_HEIGHT_OFFSET + 0.05; // just above ground
    this.group.add(this._selectionRing);
  }

  _createMineIndicator(scene) {
    // A subtle amber diamond/ring at the mine target — matches the UI design system
    const geo = new THREE.RingGeometry(0.8, 1.1, 4); // 4 segments = diamond shape
    const mat = new THREE.MeshBasicMaterial({
      color: 0xd4a84b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this._mineIndicator = new THREE.Mesh(geo, mat);
    this._mineIndicator.visible = false;
    this._mineIndicator.renderOrder = 1; // render after terrain
    scene.add(this._mineIndicator);
  }

  _updateMineIndicator(dt) {
    if (this._mineTarget && (this.state === 'WORKING' || this.state === 'APPROACHING')) {
      this._mineIndicator.visible = true;
      this._mineIndicatorTime += dt;

      // Position at the mine target, offset slightly outward along the
      // opposite of drill direction to sit just in front of the rock face
      if (this._mineNormal) {
        this._mineIndicator.position.set(
          this._mineTarget.x - this._mineNormal.x * 0.15,
          this._mineTarget.y - this._mineNormal.y * 0.15,
          this._mineTarget.z - this._mineNormal.z * 0.15,
        );
        const lookTarget = _tmpVec.copy(this._mineIndicator.position).sub(this._mineNormal);
        this._mineIndicator.lookAt(lookTarget);
      } else {
        this._mineIndicator.position.copy(this._mineTarget);
      }

      // Gentle pulse
      const pulse = Math.sin(this._mineIndicatorTime * 2.5) * 0.15 + 0.35;
      this._mineIndicator.material.opacity = pulse;

      // Slow rotation
      this._mineIndicator.rotation.z += dt * 0.5;
    } else {
      this._mineIndicator.visible = false;
      this._mineIndicatorTime = 0;
    }
  }

  _createMoveIndicator(scene) {
    const geo = new THREE.RingGeometry(0.5, 0.8, 16);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4488ff, side: THREE.DoubleSide,
      transparent: true, opacity: 0.0, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    this._moveIndicator = new THREE.Mesh(geo, mat);
    this._moveIndicator.visible = false;
    this._moveIndicator.renderOrder = 1;
    scene.add(this._moveIndicator);
  }

  _updateMoveIndicator(dt) {
    if (this._moveTarget && this.state === 'MOVING') {
      this._moveIndicator.visible = true;
      this._moveIndicatorTime += dt;
      const pulse = Math.sin(this._moveIndicatorTime * 3) * 0.15 + 0.35;
      this._moveIndicator.material.opacity = pulse;
      this._moveIndicator.position.copy(this._moveTarget);
      this._moveIndicator.rotation.y += dt * 0.8;
    } else {
      this._moveIndicator.visible = false;
      this._moveIndicatorTime = 0;
    }
  }

  setSelected(selected) {
    this._selected = selected;
    this._selectionRing.visible = selected;
    this._selectionTime = 0;
  }

  update(dt) {
    // Update selection ring pulse
    if (this._selected) {
      this._selectionTime += dt;
      this._selectionRing.material.opacity = Math.sin(this._selectionTime * 3) * 0.3 + 0.5;
    }

    // Dispatch to state handler
    switch (this.state) {
      case 'IDLE':
        this._updateIdle(dt);
        break;
      case 'MOVING':
        this._updateMoving(dt);
        break;
      case 'APPROACHING':
        this._updateApproaching(dt);
        break;
      case 'WORKING':
        this._updateWorking(dt);
        break;
    }

    // Update target indicators
    this._updateMineIndicator(dt);
    this._updateMoveIndicator(dt);

    // Apply position and rotation to group
    this.group.position.copy(this.position);
    this.group.rotation.y = this.currentRotation;
  }

  // --- State handlers ---

  _updateIdle(_dt) {
    // Retract boom and elbow slowly
    this._elbowTargetAngle = 0;
    this._lerpBoomAngle(0, _dt * 0.5);
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

    // Face movement direction
    this.targetRotation = Math.atan2(dx, dz);
    this._lerpRotation(dt);

    // Move toward waypoint
    const speed = MACHINE_SPEED * dt;
    const moveX = (dx / distXZ) * Math.min(speed, distXZ);
    const moveZ = (dz / distXZ) * Math.min(speed, distXZ);
    this.position.x += moveX;
    this.position.z += moveZ;

    // Auto floor-leveling — carve small bumps under the tracks as we drive
    this._levelFloorUnderTracks();

    // Terrain following — update Y from surface
    const surface = surfaceProbeFrom(this.position.x, this.position.y + 4, this.position.z);
    if (surface) {
      this.position.y = surface.y + MACHINE_HEIGHT_OFFSET;
    }

    // Animate tracks
    this._scrollTracks(dt * MACHINE_SPEED * 0.15);

    // Retract boom while moving
    this._lerpBoomAngle(0, dt * 0.5);
  }

  _updateApproaching(dt) {
    if (!this._mineNormal || !this._mineTarget) {
      this.state = 'IDLE';
      return;
    }

    // Rotate to face the drill direction
    const drillDirXZ = new THREE.Vector2(this._mineNormal.x, this._mineNormal.z);
    if (drillDirXZ.length() > 0.01) {
      this.targetRotation = Math.atan2(drillDirXZ.x, drillDirXZ.y);
    }
    this._lerpRotation(dt);

    // Check if we're facing the right direction (or close enough after 3 seconds)
    this._approachTime = (this._approachTime || 0) + dt;
    const angleDiff = Math.abs(this._angleDiff(this.currentRotation, this.targetRotation));
    if (angleDiff < 0.15 || this._approachTime > 3) {
      this._approachTime = 0;
      this._computeArmAngles();
      this.state = 'WORKING';
      this._carveTimer = 0;
    }
  }

  _updateWorking(dt) {
    if (!this._mineTarget || !this._mineNormal) {
      this.state = 'IDLE';
      return;
    }

    // Spin drill
    this._drillHead.rotation.z += DRILL_SPIN_SPEED * dt;

    // Recompute arm angles as the mine target advances
    this._computeArmAngles();

    // Extend boom toward target angle
    this._lerpBoomAngle(this._boomTargetAngle, dt * DRILL_EXTEND_SPEED);

    // Carve at timed intervals — carve at the mine target (rock surface),
    // not at the drill tip. The arm is a cosmetic animation; the actual
    // mining happens at the surface the player clicked on.
    this._carveTimer -= dt;
    if (this._carveTimer <= 0) {
      // Check material at mine target for hardness
      const mat = getMaterialAt(
        this._mineTarget.x, this._mineTarget.y, this._mineTarget.z,
      );
      const props = MATERIAL_PROPS[mat];
      const hardness = props ? props.hardness : 0.5;

      if (hardness <= 0) {
        // Target is now air — check if we should stop or advance
        this._checkDrillCompletion();
        this._carveTimer = 0.1;
        return;
      }

      // Carve a short line of overlapping spheres along the drill direction
      // for smoother tunnel cross-sections instead of isolated round holes
      const radius = this._fineMining ? MACHINE_CARVE_RADIUS * 0.4 : MACHINE_CARVE_RADIUS;
      const steps = this._fineMining ? 1 : 3;
      const stepDist = radius * 0.5;
      for (let i = 0; i < steps; i++) {
        const offset = (i - (steps - 1) / 2) * stepDist;
        eventBus.emit('machine:carve', {
          x: this._mineTarget.x + this._mineNormal.x * offset,
          y: this._mineTarget.y + this._mineNormal.y * offset,
          z: this._mineTarget.z + this._mineNormal.z * offset,
          radius,
        });
      }

      // Reset timer — harder rock takes longer
      this._carveTimer = CARVE_INTERVAL_BASE * (0.5 + hardness * 1.5);
    }
  }

  _checkDrillCompletion() {
    // Check if the area around the drill tip is all air
    this.group.updateWorldMatrix(true, true);
    _drillTipLocal.copy(this._drillTipOffset);
    const tipWorld = this._drillHead.localToWorld(_drillTipLocal);

    const mat = getMaterialAt(tipWorld.x, tipWorld.y, tipWorld.z);
    if (MATERIAL_PROPS[mat] && MATERIAL_PROPS[mat].hardness <= 0) {
      if (this._mineTarget && this._mineNormal) {
        // Advance the mine target further along drill direction
        this._mineTarget.x += this._mineNormal.x * MACHINE_CARVE_RADIUS;
        this._mineTarget.y += this._mineNormal.y * MACHINE_CARVE_RADIUS;
        this._mineTarget.z += this._mineNormal.z * MACHINE_CARVE_RADIUS;

        // Check if the new target is beyond arm reach — stop if so
        if (this._getDistanceToMineTarget() > 7.0) {
          this.state = 'IDLE';
          this._mineTarget = null;
          this._mineNormal = null;
          return;
        }

        // Check if the new target is also air — if so, advance the machine forward
        const newMat = getMaterialAt(this._mineTarget.x, this._mineTarget.y, this._mineTarget.z);
        if (MATERIAL_PROPS[newMat] && MATERIAL_PROPS[newMat].hardness <= 0) {
          // Mined through air — try to creep the machine forward
          this._advanceMachineForward();
        }
        // Otherwise keep drilling into the new solid target
      }
    }
  }

  _advanceMachineForward() {
    // Creep the machine forward along the drill direction (like a TBM)
    const advanceDist = MACHINE_CARVE_RADIUS * 0.7;
    const drillDirXZ = Math.sqrt(this._mineNormal.x ** 2 + this._mineNormal.z ** 2);
    if (drillDirXZ < 0.01) return; // purely vertical drill, can't advance horizontally

    // Advance along the horizontal component of drill direction
    const dirX = this._mineNormal.x / drillDirXZ;
    const dirZ = this._mineNormal.z / drillDirXZ;
    const newX = this.position.x + dirX * advanceDist;
    const newZ = this.position.z + dirZ * advanceDist;

    // Level the floor under the new position before checking surface
    this._levelFloorAt(newX, newZ, this.position.y);

    // Check if the new position has a walkable surface
    const surface = surfaceProbeFrom(newX, this.position.y + 4, newZ);
    if (surface) {
      const dy = Math.abs(surface.y + MACHINE_HEIGHT_OFFSET - this.position.y);
      const maxDY = Math.tan(MACHINE_MAX_SLOPE_DEG * Math.PI / 180) * advanceDist;

      if (dy <= maxDY) {
        this.position.x = newX;
        this.position.z = newZ;
        this.position.y = surface.y + MACHINE_HEIGHT_OFFSET;

        // Push mine target further ahead
        this._mineTarget.x += this._mineNormal.x * MACHINE_CARVE_RADIUS;
        this._mineTarget.y += this._mineNormal.y * MACHINE_CARVE_RADIUS;
        this._mineTarget.z += this._mineNormal.z * MACHINE_CARVE_RADIUS;

        // Level floor under new position
        this._levelFloorUnderTracks();

        this._scrollTracks(advanceDist * 0.15);
        return;
      }
    }

    // Can't advance — stop drilling
    this.state = 'IDLE';
    this._mineTarget = null;
    this._mineNormal = null;
  }

  // --- Commands ---

  _handleCommand(cmd) {
    if (!this._selected) return;

    console.debug('[Machine] cmd:', cmd.type, 'state:', this.state,
      cmd.target ? `target:(${cmd.target.x.toFixed(1)},${cmd.target.y.toFixed(1)},${cmd.target.z.toFixed(1)})` : '');

    switch (cmd.type) {
      case 'move':
        this.commandMove(cmd.target.x, cmd.target.z);
        break;
      case 'mine':
        this.commandMine(cmd.target, cmd.normal, cmd.fine);
        break;
      case 'cancel':
        console.debug('[Machine] cancelled');
        this.state = 'IDLE';
        this._path = null;
        this._mineTarget = null;
        this._mineNormal = null;
        this._elbowTargetAngle = 0;
        this._fineMining = false;
        this._approachTime = 0;
        break;
    }
  }

  commandMove(targetX, targetZ) {
    const path = findPath(
      this.position.x, this.position.z,
      targetX, targetZ,
      MACHINE_MAX_SLOPE_DEG,
    );

    if (path && path.length > 1) {
      this._path = path;
      this._pathIndex = 1; // skip start node (we're already there)
      this._nextStateAfterMove = 'IDLE';
      this._mineTarget = null;
      this._mineNormal = null;
      this._fineMining = false;
      this._approachTime = 0;
      // Store move destination for indicator
      const dest = path[path.length - 1];
      this._moveTarget = new THREE.Vector3(dest.x, dest.y + 0.15, dest.z);
      this.state = 'MOVING';
    } else {
      console.warn('[Machine] move failed: no path to', targetX.toFixed(1), targetZ.toFixed(1));
      this._flashNoPath();
    }
  }

  commandMine(target, normal, fine) {
    this._fineMining = !!fine;

    // If already working/approaching with valid state, just redirect the target (for drag-mining)
    if ((this.state === 'WORKING' || this.state === 'APPROACHING') && this._mineTarget && this._mineNormal) {
      const toTargetX = target.x - this.position.x;
      const toTargetY = target.y - this.position.y;
      const toTargetZ = target.z - this.position.z;
      const dist3D = Math.sqrt(toTargetX ** 2 + toTargetY ** 2 + toTargetZ ** 2);

      if (dist3D <= 7.0 && dist3D > 0.01) {
        // Within reach — just update the target
        this._mineTarget.set(target.x, target.y, target.z);
        this._mineNormal.set(toTargetX, toTargetY, toTargetZ).normalize();
        return;
      }
    }

    return this._startMine(target);
  }

  _startMine(target) {
    const MAX_DRILL_REACH = 7.0;

    this._mineTarget = new THREE.Vector3(target.x, target.y, target.z);

    // Drill direction: from machine toward the click target
    const toTargetX = target.x - this.position.x;
    const toTargetY = target.y - this.position.y;
    const toTargetZ = target.z - this.position.z;
    const lenXZ = Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ);
    const dist3D = Math.sqrt(toTargetX ** 2 + toTargetY ** 2 + toTargetZ ** 2);

    // Compute drill direction
    if (lenXZ > 0.1) {
      this._mineNormal = new THREE.Vector3(toTargetX, toTargetY, toTargetZ).normalize();
    } else {
      const facingX = Math.sin(this.currentRotation);
      const facingZ = Math.cos(this.currentRotation);
      this._mineNormal = new THREE.Vector3(facingX, -0.15, facingZ).normalize();
    }

    // Check if target is within drill reach
    if (dist3D > MAX_DRILL_REACH) {
      // Too far — drive closer
      if (lenXZ > 0.1) {
        const approachDist = 4.5;
        const dirX = toTargetX / lenXZ;
        const dirZ = toTargetZ / lenXZ;
        const approachX = target.x - dirX * approachDist;
        const approachZ = target.z - dirZ * approachDist;

        const path = findPath(
          this.position.x, this.position.z,
          approachX, approachZ,
          MACHINE_MAX_SLOPE_DEG,
        );

        if (path && path.length > 1) {
          console.debug('[Machine] mine: driving to approach position, dist3D:', dist3D.toFixed(1));
          this._path = path;
          this._pathIndex = 1;
          this._nextStateAfterMove = 'APPROACHING';
          this.state = 'MOVING';
          return;
        }
      }
      console.warn('[Machine] mine failed: target too far (', dist3D.toFixed(1), '> 7.0) and no path to approach');
      this._mineTarget = null;
      this._mineNormal = null;
      this._flashNoPath();
      return;
    }

    console.debug('[Machine] mine: within reach (', dist3D.toFixed(1), '), approaching');
    this._approachTime = 0;
    this.state = 'APPROACHING';
  }

  // --- Helpers ---

  _lerpRotation(dt) {
    const diff = this._angleDiff(this.currentRotation, this.targetRotation);
    this.currentRotation += diff * Math.min(1, MACHINE_TURN_SPEED * dt);
  }

  _angleDiff(from, to) {
    let diff = to - from;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }

  _computeArmAngles() {
    if (!this._mineTarget) return;

    // Pivot is at machine local (0, 2.2, 1.6), upper arm length ~3.0, elbow at Z=3.0 from pivot
    const pivotWorldY = this.position.y + 2.2;
    const upperArmLen = 3.0;
    const forearmLen = 2.7;

    // Vector from machine center to mine target
    const dx = this._mineTarget.x - this.position.x;
    const dz = this._mineTarget.z - this.position.z;
    const distXZ = Math.sqrt(dx * dx + dz * dz);

    // Forward distance from pivot to target (in the machine's forward direction)
    const forwardDist = Math.max(0, distXZ - 1.6);

    // Height difference: negative means target is below pivot
    const dy = this._mineTarget.y - pivotWorldY;

    // Strategy: the shoulder angles the upper arm to position the elbow
    // roughly above the target, then the elbow curls down to reach it.
    //
    // For a target at ground level directly in front:
    //   - Shoulder tilts slightly forward/down to push the elbow out
    //   - Elbow bends aggressively downward so the drill points at the floor
    //
    // For a wall target at the same height:
    //   - Shoulder aims roughly at the target
    //   - Elbow stays mostly straight

    // Direct angle from pivot to target
    const directAngle = Math.atan2(-dy, Math.max(forwardDist, 0.5));
    // How far below the pivot the target is (0 = same height, 1 = far below)
    const belowness = THREE.MathUtils.clamp(-dy / (upperArmLen + forearmLen), 0, 1);
    // How close the target is (1 = very close, 0 = at max reach)
    const closeness = 1 - THREE.MathUtils.clamp(
      Math.sqrt(forwardDist * forwardDist + dy * dy) / (upperArmLen + forearmLen), 0, 1,
    );

    // Shoulder: for low/close targets, tilt forward gently (position the elbow out).
    // For far targets, aim more directly at the target.
    const shoulderAngle = THREE.MathUtils.lerp(
      directAngle * 0.8,               // far targets: aim mostly at target
      Math.min(directAngle * 0.3, 0.3), // close/low targets: gentle forward tilt
      closeness * belowness,
    );
    this._boomTargetAngle = THREE.MathUtils.clamp(
      shoulderAngle,
      DRILL_BOOM_MIN_ANGLE,
      DRILL_BOOM_MAX_ANGLE,
    );

    // Elbow: bends down to reach the target from where the shoulder placed it.
    // Positive X rotation on the elbow = curls the forearm downward (in parent space).
    // For ground-level targets in front: elbow bends hard (up to +90°).
    // For wall targets at same height: elbow stays near straight.
    const elbowAngle = THREE.MathUtils.lerp(
      directAngle * 0.3,            // far/same-height: small bend
      Math.PI / 2 * 0.85,           // close/below: nearly 90° down
      belowness * (0.5 + closeness * 0.5),
    );
    this._elbowTargetAngle = THREE.MathUtils.clamp(
      elbowAngle,
      -0.4,           // slight upward bend
      Math.PI / 2,    // max 90° bend down
    );
  }

  _lerpBoomAngle(target, speed) {
    // Shoulder (boom pivot)
    const current = this._boomPivot.rotation.x;
    this._boomPivot.rotation.x += (target - current) * Math.min(1, speed);

    // Elbow — independent joint, lerps to its own target
    const elbowCurrent = this._elbowPivot.rotation.x;
    this._elbowPivot.rotation.x += (this._elbowTargetAngle - elbowCurrent) * Math.min(1, speed);
  }

  /**
   * Level the floor at a specific position — used to clear the way before advancing.
   */
  _levelFloorAt(wx, wz, machineY) {
    const trackY = machineY - 0.3;
    const facingX = Math.sin(this.currentRotation);
    const facingZ = Math.cos(this.currentRotation);
    const perpX = Math.cos(this.currentRotation);
    const perpZ = -Math.sin(this.currentRotation);

    let needsRemesh = false;
    for (let fwd = -1; fwd <= 2; fwd += 1) {
      for (let side = -2.5; side <= 2.5; side += 1) {
        const px = wx + facingX * fwd + perpX * side;
        const pz = wz + facingZ * fwd + perpZ * side;
        for (let dy = 0; dy <= 2; dy++) {
          const vy = Math.floor(trackY) + dy;
          const { density } = chunkStore.getVoxel(Math.floor(px), vy, Math.floor(pz));
          if (density >= SURFACE_THRESHOLD) {
            chunkStore.setVoxel(Math.floor(px), vy, Math.floor(pz), 0, 0);
            needsRemesh = true;
          }
        }
      }
    }
    if (needsRemesh) {
      voxelWorld.remeshDirty();
    }
  }

  /**
   * Auto floor-leveling: carve any small rock bumps under the machine's footprint.
   * This prevents the machine from getting stuck on single voxels.
   * Only carves voxels that poke above the machine's track level — a small, flat carve.
   */
  _levelFloorUnderTracks() {
    const trackY = this.position.y - 0.3; // just below track bottom
    const facingX = Math.sin(this.currentRotation);
    const facingZ = Math.cos(this.currentRotation);
    // Perpendicular direction for track width
    const perpX = Math.cos(this.currentRotation);
    const perpZ = -Math.sin(this.currentRotation);

    // Check a grid of points under the machine footprint
    // Machine is roughly 4 wide x 6 long
    let needsRemesh = false;
    for (let fwd = -1; fwd <= 4; fwd += 1.5) {
      for (let side = -2.5; side <= 2.5; side += 1.5) {
        const wx = this.position.x + facingX * fwd + perpX * side;
        const wz = this.position.z + facingZ * fwd + perpZ * side;
        const wy = Math.floor(trackY);

        // Check a couple of voxels at and just above track level
        for (let dy = 0; dy <= 1; dy++) {
          const { density } = chunkStore.getVoxel(Math.floor(wx), wy + dy, Math.floor(wz));
          if (density >= SURFACE_THRESHOLD && wy + dy >= trackY - 0.5) {
            // Bump found — flatten it with a small carve
            chunkStore.setVoxel(Math.floor(wx), wy + dy, Math.floor(wz), 0, 0);
            needsRemesh = true;
          }
        }
      }
    }
    if (needsRemesh) {
      voxelWorld.remeshDirty();
    }
  }

  _scrollTracks(amount) {
    if (this._tracks.left.map) {
      this._tracks.left.map.offset.x += amount;
    }
    if (this._tracks.right.map) {
      this._tracks.right.map.offset.x += amount;
    }
  }

  _getDistanceToMineTarget() {
    if (!this._mineTarget) return Infinity;
    const dx = this._mineTarget.x - this.position.x;
    const dy = this._mineTarget.y - this.position.y;
    const dz = this._mineTarget.z - this.position.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  _flashNoPath() {
    if (!this._selectionRing) return;
    this._selectionRing.material.color.set(0xff4444);
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      if (this._selectionRing) {
        this._selectionRing.material.color.set(0x44ff88);
      }
    }, 400);
  }
}

export { DrillRigController };
