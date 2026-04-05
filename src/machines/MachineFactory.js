import * as THREE from 'three';
import {
  MACHINE_BODY_COLOR, MACHINE_CABIN_COLOR, MACHINE_TRACK_COLOR,
  MACHINE_METAL_COLOR, MACHINE_ACCENT_COLOR,
} from '../core/Config.js';
import sceneManager from '../rendering/SceneManager.js';

// Shared materials — clipped by the same cutaway plane as terrain
function getClip() { return [sceneManager.clippingPlane]; }

const bodyMat = new THREE.MeshLambertMaterial({ color: MACHINE_BODY_COLOR, clippingPlanes: getClip() });
const cabinMat = new THREE.MeshLambertMaterial({ color: MACHINE_CABIN_COLOR, clippingPlanes: getClip() });
const metalMat = new THREE.MeshLambertMaterial({ color: MACHINE_METAL_COLOR, clippingPlanes: getClip() });
const accentMat = new THREE.MeshLambertMaterial({ color: MACHINE_ACCENT_COLOR, clippingPlanes: getClip() });

// Emissive lamp material — glows warm yellow even without external light
const lampMat = new THREE.MeshBasicMaterial({
  color: 0xffe8a0,
  clippingPlanes: getClip(),
});
const lampRimMat = new THREE.MeshLambertMaterial({
  color: 0x444444,
  clippingPlanes: getClip(),
});

function makeTrackMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  // Dark rubber base
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, 128, 32);

  // Tread pads — alternating raised segments with gaps
  for (let i = 0; i < 16; i++) {
    const x = i * 8;
    // Main pad (lighter)
    ctx.fillStyle = '#252525';
    ctx.fillRect(x + 1, 2, 5, 28);
    // Highlight on top edge of pad
    ctx.fillStyle = '#303030';
    ctx.fillRect(x + 1, 2, 5, 2);
    // Shadow on bottom edge
    ctx.fillStyle = '#0e0e0e';
    ctx.fillRect(x + 1, 28, 5, 2);
    // Center groove
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x + 2, 14, 3, 4);
  }

  // Side rails (continuous dark bands)
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, 128, 3);
  ctx.fillRect(0, 29, 128, 3);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);

  return new THREE.MeshLambertMaterial({ map: tex, clippingPlanes: getClip() });
}

/**
 * Build a procedural drill rig from Three.js primitives.
 *
 * Hierarchy:
 *   drillRig (Group)
 *     ├─ body
 *     ├─ trackLeft / trackRight
 *     ├─ cabin (with lamp housing on roof)
 *     └─ boomPivot (elevation joint, mounted at front of body)
 *          └─ boomArm
 *               └─ drillHead (spin joint)
 *                    ├─ drillBit
 *                    └─ drillCollar
 */
export function buildDrillRig() {
  const rig = new THREE.Group();
  rig.name = 'drillRig';

  // --- Body (main chassis) ---
  const bodyGeo = new THREE.BoxGeometry(4, 1.8, 5);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.9;
  body.castShadow = true;
  body.receiveShadow = true;
  rig.add(body);

  // --- Tracks (beefier, with guide teeth and road wheels) ---
  const trackGeo = new THREE.BoxGeometry(1.2, 0.8, 6.2);
  const trackMatL = makeTrackMaterial();
  const trackMatR = makeTrackMaterial();

  const trackLeft = new THREE.Mesh(trackGeo, trackMatL);
  trackLeft.position.set(-2.2, 0.4, 0);
  trackLeft.castShadow = true;
  trackLeft.receiveShadow = true;
  rig.add(trackLeft);

  const trackRight = new THREE.Mesh(trackGeo, trackMatR);
  trackRight.position.set(2.2, 0.4, 0);
  trackRight.castShadow = true;
  trackRight.receiveShadow = true;
  rig.add(trackRight);

  // Track side guards (thin plates on outer sides of tracks)
  const guardGeo = new THREE.BoxGeometry(0.08, 0.6, 6.4);
  for (const side of [-2.82, 2.82]) {
    const guard = new THREE.Mesh(guardGeo, accentMat);
    guard.position.set(side, 0.5, 0);
    rig.add(guard);
  }

  // Drive sprockets (large wheels at track ends)
  const sprocketGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.3, 10);
  sprocketGeo.rotateZ(Math.PI / 2);
  for (const side of [-2.2, 2.2]) {
    for (const end of [-2.8, 2.8]) {
      const sprocket = new THREE.Mesh(sprocketGeo, accentMat);
      sprocket.position.set(side, 0.45, end);
      sprocket.castShadow = true;
      rig.add(sprocket);
    }
  }

  // Road wheels (smaller, between the sprockets)
  const roadWheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.25, 8);
  roadWheelGeo.rotateZ(Math.PI / 2);
  for (const side of [-2.2, 2.2]) {
    for (const z of [-1.4, 0, 1.4]) {
      const wheel = new THREE.Mesh(roadWheelGeo, metalMat);
      wheel.position.set(side, 0.32, z);
      rig.add(wheel);
    }
  }

  // --- Cabin (pushed back) ---
  const cabinGeo = new THREE.BoxGeometry(2.4, 1.8, 2.0);
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.set(0, 2.7, -1.0);
  cabin.castShadow = true;
  rig.add(cabin);

  // Cabin window
  const windowGeo = new THREE.BoxGeometry(2.0, 0.8, 0.1);
  const windowMat = new THREE.MeshLambertMaterial({ color: 0x111122, clippingPlanes: getClip() });
  const cabinWindow = new THREE.Mesh(windowGeo, windowMat);
  cabinWindow.position.set(0, 2.9, 0.06);
  rig.add(cabinWindow);

  // --- Lamp housing on cabin roof (visible light source) ---
  // Lamp bracket
  const bracketGeo = new THREE.BoxGeometry(0.3, 0.6, 0.3);
  const bracket = new THREE.Mesh(bracketGeo, lampRimMat);
  bracket.position.set(0, 3.9, -0.3);
  rig.add(bracket);

  // Lamp bar (wide bar across cabin top)
  const barGeo = new THREE.BoxGeometry(2.8, 0.35, 0.5);
  const lampBar = new THREE.Mesh(barGeo, lampRimMat);
  lampBar.position.set(0, 4.15, -0.3);
  lampBar.castShadow = true;
  rig.add(lampBar);

  // Lamp lenses (3 bright panels on the front of the bar)
  const lensGeo = new THREE.BoxGeometry(0.7, 0.25, 0.1);
  for (const xOff of [-0.85, 0, 0.85]) {
    const lens = new THREE.Mesh(lensGeo, lampMat);
    lens.position.set(xOff, 4.15, 0.0);
    rig.add(lens);
  }

  // Store lamp bar reference for the headlight attachment point
  rig.userData.lampPosition = new THREE.Vector3(0, 4.15, -0.05);

  // --- Boom pivot / shoulder (elevation joint — mounted at front-top of body) ---
  const boomPivot = new THREE.Group();
  boomPivot.name = 'boomPivot';
  boomPivot.position.set(0, 2.2, 1.6);
  rig.add(boomPivot);

  // Shoulder pivot housing
  const pivotGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8);
  pivotGeo.rotateZ(Math.PI / 2);
  const pivotHousing = new THREE.Mesh(pivotGeo, metalMat);
  pivotHousing.castShadow = true;
  boomPivot.add(pivotHousing);

  // --- Upper arm segment ---
  const upperArmGeo = new THREE.BoxGeometry(0.5, 0.5, 2.8);
  const upperArm = new THREE.Mesh(upperArmGeo, metalMat);
  upperArm.position.set(0, 0, 1.6);
  upperArm.castShadow = true;
  boomPivot.add(upperArm);

  // Hydraulic pistons on upper arm
  const pistonGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.0, 6);
  pistonGeo.rotateX(Math.PI / 2);
  for (const xOff of [-0.35, 0.35]) {
    const piston = new THREE.Mesh(pistonGeo, accentMat);
    piston.position.set(xOff, -0.2, 1.2);
    boomPivot.add(piston);
  }

  // --- Elbow joint (second pivot at end of upper arm) ---
  const elbowPivot = new THREE.Group();
  elbowPivot.name = 'elbowPivot';
  elbowPivot.position.set(0, 0, 3.0);
  boomPivot.add(elbowPivot);

  // Elbow pivot housing
  const elbowGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 8);
  elbowGeo.rotateZ(Math.PI / 2);
  const elbowHousing = new THREE.Mesh(elbowGeo, accentMat);
  elbowHousing.castShadow = true;
  elbowPivot.add(elbowHousing);

  // --- Lower arm segment (forearm) ---
  const lowerArmGeo = new THREE.BoxGeometry(0.45, 0.45, 2.4);
  const lowerArm = new THREE.Mesh(lowerArmGeo, metalMat);
  lowerArm.position.set(0, 0, 1.4);
  lowerArm.castShadow = true;
  elbowPivot.add(lowerArm);

  // Hydraulic piston on forearm
  const forearmPistonGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6);
  forearmPistonGeo.rotateX(Math.PI / 2);
  const forearmPiston = new THREE.Mesh(forearmPistonGeo, accentMat);
  forearmPiston.position.set(0, -0.2, 1.0);
  elbowPivot.add(forearmPiston);

  // --- Drill head (spin joint at forearm tip) ---
  const drillHead = new THREE.Group();
  drillHead.name = 'drillHead';
  drillHead.position.set(0, 0, 2.7);
  elbowPivot.add(drillHead);

  // Drill collar
  const collarGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.6, 8);
  collarGeo.rotateX(Math.PI / 2);
  const drillCollar = new THREE.Mesh(collarGeo, bodyMat);
  drillCollar.castShadow = true;
  drillHead.add(drillCollar);

  // Drill bit
  const bitGeo = new THREE.ConeGeometry(0.5, 1.8, 8);
  bitGeo.rotateX(-Math.PI / 2);
  const drillBit = new THREE.Mesh(bitGeo, metalMat);
  drillBit.position.set(0, 0, 1.2);
  drillBit.castShadow = true;
  drillHead.add(drillBit);

  // Drill bit spiral grooves
  const grooveGeo = new THREE.TorusGeometry(0.3, 0.04, 4, 8);
  grooveGeo.rotateY(Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const groove = new THREE.Mesh(grooveGeo, accentMat);
    groove.position.set(0, 0, 0.6 + i * 0.4);
    groove.scale.set(1 - i * 0.2, 1 - i * 0.2, 1);
    drillHead.add(groove);
  }

  // --- Store references for animation ---
  rig.userData.joints = { boomPivot, elbowPivot, drillHead };
  rig.userData.tracks = { left: trackMatL, right: trackMatR };
  rig.userData.drillTipOffset = new THREE.Vector3(0, 0, 2.1);

  return rig;
}
