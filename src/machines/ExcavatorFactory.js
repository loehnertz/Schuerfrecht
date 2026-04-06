import * as THREE from 'three';
import {
  MACHINE_BODY_COLOR, MACHINE_CABIN_COLOR, MACHINE_TRACK_COLOR,
  MACHINE_METAL_COLOR, MACHINE_ACCENT_COLOR,
} from '../core/Config.js';
import sceneManager from '../rendering/SceneManager.js';

function getClip() { return [sceneManager.clippingPlane]; }

const bodyMat = new THREE.MeshLambertMaterial({ color: MACHINE_BODY_COLOR, clippingPlanes: getClip() });
const cabinMat = new THREE.MeshLambertMaterial({ color: MACHINE_CABIN_COLOR, clippingPlanes: getClip() });
const metalMat = new THREE.MeshLambertMaterial({ color: MACHINE_METAL_COLOR, clippingPlanes: getClip() });
const accentMat = new THREE.MeshLambertMaterial({ color: MACHINE_ACCENT_COLOR, clippingPlanes: getClip() });
const counterweightMat = new THREE.MeshLambertMaterial({ color: 0x555555, clippingPlanes: getClip() });

const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe8a0, clippingPlanes: getClip() });

function makeTrackMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, 128, 32);
  for (let i = 0; i < 16; i++) {
    const x = i * 8;
    ctx.fillStyle = '#252525';
    ctx.fillRect(x + 1, 2, 5, 28);
    ctx.fillStyle = '#303030';
    ctx.fillRect(x + 1, 2, 5, 2);
    ctx.fillStyle = '#0e0e0e';
    ctx.fillRect(x + 1, 28, 5, 2);
  }
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, 128, 3);
  ctx.fillRect(0, 29, 128, 3);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);

  return new THREE.MeshLambertMaterial({
    map: tex,
    color: MACHINE_TRACK_COLOR,
    clippingPlanes: getClip(),
  });
}

export function buildExcavator() {
  const rig = new THREE.Group();

  // --- Undercarriage (tracks + chassis) ---

  // Main chassis — slightly wider than drill rig for stability
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(4.5, 1.2, 5.0),
    bodyMat,
  );
  chassis.position.y = 0.6;
  chassis.castShadow = true;
  rig.add(chassis);

  // Tracks
  const trackMatL = makeTrackMaterial();
  const trackMatR = makeTrackMaterial();

  const trackGeo = new THREE.BoxGeometry(1.2, 0.8, 6.0);
  const trackL = new THREE.Mesh(trackGeo, trackMatL);
  trackL.position.set(-2.5, 0.4, 0);
  trackL.castShadow = true;
  rig.add(trackL);

  const trackR = new THREE.Mesh(trackGeo, trackMatR);
  trackR.position.set(2.5, 0.4, 0);
  trackR.castShadow = true;
  rig.add(trackR);

  // Track guards
  const guardGeo = new THREE.BoxGeometry(0.15, 1.0, 6.2);
  const guardL = new THREE.Mesh(guardGeo, accentMat);
  guardL.position.set(-3.15, 0.5, 0);
  rig.add(guardL);
  const guardR = new THREE.Mesh(guardGeo, accentMat);
  guardR.position.set(3.15, 0.5, 0);
  rig.add(guardR);

  // Sprockets (4 corners)
  const sprocketGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.3, 8);
  sprocketGeo.rotateZ(Math.PI / 2);
  for (const [sx, sz] of [[-2.5, 2.8], [2.5, 2.8], [-2.5, -2.8], [2.5, -2.8]]) {
    const spr = new THREE.Mesh(sprocketGeo, metalMat);
    spr.position.set(sx, 0.45, sz);
    rig.add(spr);
  }

  // --- Turret (rotates on Y-axis) ---

  const turretPivot = new THREE.Group();
  turretPivot.position.set(0, 1.2, -0.5); // slightly behind center
  rig.add(turretPivot);

  // Turret body — flat cylinder
  const turretBody = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.4, 0.8, 12),
    bodyMat,
  );
  turretBody.position.y = 0.4;
  turretBody.castShadow = true;
  turretPivot.add(turretBody);

  // Counterweight — heavy block at the back
  const counterweight = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 1.2, 1.8),
    counterweightMat,
  );
  counterweight.position.set(0, 0.6, -1.8);
  counterweight.castShadow = true;
  turretPivot.add(counterweight);

  // Cabin — offset to the left side (like real excavators)
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 1.6, 2.0),
    cabinMat,
  );
  cabin.position.set(-1.0, 1.6, -0.2);
  cabin.castShadow = true;
  turretPivot.add(cabin);

  // Cabin window
  const windowMat = new THREE.MeshLambertMaterial({
    color: 0x334455,
    transparent: true,
    opacity: 0.6,
    clippingPlanes: getClip(),
  });
  const cabinWindow = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 0.8, 0.05),
    windowMat,
  );
  cabinWindow.position.set(-1.0, 2.0, 0.8);
  turretPivot.add(cabinWindow);

  // Headlamp
  const lampBracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.5, 0.15),
    metalMat,
  );
  lampBracket.position.set(-1.0, 2.7, 0.8);
  turretPivot.add(lampBracket);

  const lampLens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.1, 8),
    lampMat,
  );
  lampLens.rotation.x = Math.PI / 2;
  lampLens.position.set(-1.0, 2.7, 0.9);
  turretPivot.add(lampLens);

  // --- Arm system (boom → stick → bucket) ---

  // Shoulder pivot — on the turret, right side
  const shoulderPivot = new THREE.Group();
  shoulderPivot.position.set(0.5, 1.2, 1.2);
  turretPivot.add(shoulderPivot);

  // Shoulder housing
  const shoulderHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 1.0, 8),
    metalMat,
  );
  shoulderHousing.rotation.z = Math.PI / 2;
  shoulderPivot.add(shoulderHousing);

  // Upper arm (boom)
  const upperArm = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 3.5),
    bodyMat,
  );
  upperArm.position.set(0, 0, 1.75);
  upperArm.castShadow = true;
  shoulderPivot.add(upperArm);

  // Hydraulic piston on upper arm
  const pistonGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.0, 6);
  pistonGeo.rotateX(Math.PI / 2);
  const piston1 = new THREE.Mesh(pistonGeo, metalMat);
  piston1.position.set(0.3, 0.35, 1.0);
  shoulderPivot.add(piston1);

  // Elbow pivot
  const elbowPivot = new THREE.Group();
  elbowPivot.position.set(0, 0, 3.5);
  shoulderPivot.add(elbowPivot);

  // Elbow housing
  const elbowHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 0.7, 8),
    metalMat,
  );
  elbowHousing.rotation.z = Math.PI / 2;
  elbowPivot.add(elbowHousing);

  // Forearm (stick)
  const forearm = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.4, 3.0),
    bodyMat,
  );
  forearm.position.set(0, 0, 1.5);
  forearm.castShadow = true;
  elbowPivot.add(forearm);

  // Forearm piston
  const piston2 = new THREE.Mesh(pistonGeo, metalMat);
  piston2.position.set(0.25, 0.3, 0.8);
  elbowPivot.add(piston2);

  // Wrist pivot
  const wristPivot = new THREE.Group();
  wristPivot.position.set(0, 0, 3.0);
  elbowPivot.add(wristPivot);

  // --- Bucket ---
  // Trapezoidal open box — wider at the opening
  const bucketGroup = new THREE.Group();
  wristPivot.add(bucketGroup);

  const bucketWidth = 2.6;
  const bucketDepth = 1.6;
  const bucketHeight = 1.1;

  // Bottom
  const bucketBottom = new THREE.Mesh(
    new THREE.BoxGeometry(bucketWidth, 0.08, bucketDepth),
    metalMat,
  );
  bucketBottom.position.set(0, -bucketHeight / 2, bucketDepth / 2);
  bucketGroup.add(bucketBottom);

  // Back wall
  const bucketBack = new THREE.Mesh(
    new THREE.BoxGeometry(bucketWidth, bucketHeight, 0.08),
    metalMat,
  );
  bucketBack.position.set(0, 0, 0);
  bucketGroup.add(bucketBack);

  // Side walls
  const sideGeo = new THREE.BoxGeometry(0.08, bucketHeight, bucketDepth);
  const sideL = new THREE.Mesh(sideGeo, metalMat);
  sideL.position.set(-bucketWidth / 2, 0, bucketDepth / 2);
  bucketGroup.add(sideL);
  const sideR = new THREE.Mesh(sideGeo, metalMat);
  sideR.position.set(bucketWidth / 2, 0, bucketDepth / 2);
  bucketGroup.add(sideR);

  // Bucket teeth — small triangles along the front edge
  for (let i = 0; i < 6; i++) {
    const tooth = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.25, 4),
      accentMat,
    );
    tooth.rotation.x = -Math.PI / 2;
    tooth.position.set(
      -bucketWidth / 2 + 0.3 + i * (bucketWidth - 0.6) / 5,
      -bucketHeight / 2 + 0.05,
      bucketDepth + 0.1,
    );
    bucketGroup.add(tooth);
  }

  // Fill mesh — a lump of "rock" inside the bucket, hidden by default
  const fillMat = new THREE.MeshLambertMaterial({
    color: 0x665544,
    clippingPlanes: getClip(),
  });
  const fillGeo = new THREE.SphereGeometry(1, 6, 4);
  fillGeo.scale(
    (bucketWidth - 0.3) / 2,
    (bucketHeight - 0.2) / 2,
    (bucketDepth - 0.2) / 2,
  );
  const fillMesh = new THREE.Mesh(fillGeo, fillMat);
  fillMesh.position.set(0, -0.05, bucketDepth * 0.45);
  fillMesh.visible = false;
  bucketGroup.add(fillMesh);

  // Store joint references and metadata
  rig.userData.joints = {
    turretPivot,
    shoulderPivot,
    elbowPivot,
    wristPivot,
  };
  rig.userData.tracks = { left: trackMatL, right: trackMatR };
  rig.userData.lampPosition = new THREE.Vector3(-1.0, 2.7 + 1.2, 0.9); // relative to turret pivot
  rig.userData.bucketTipOffset = new THREE.Vector3(0, -bucketHeight / 2, bucketDepth);
  rig.userData.fillMesh = fillMesh;

  return rig;
}
