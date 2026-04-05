# LEARNINGS.md — Hard-Won Knowledge from Implementation

## Voxel Engine

### Chunk mesh positioning

Marching Cubes outputs vertex positions in chunk-local space (0–16). You MUST translate the geometry to world
coordinates before adding it to the scene: `geometry.translate(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE)`.
Forgetting this causes all chunk meshes to overlap at the origin — the terrain looks like a single tiny blob.

### Border meshing is critical

When a voxel near a chunk edge is modified, ALL face-neighbor chunks must be marked dirty and remeshed — not just the
chunk containing the modified voxel. `ChunkStore.setVoxel` handles this automatically by checking if the local
coordinate is 0 or 15 on any axis. Skipping this causes visible seams at chunk borders.

### The padded array pattern

`getChunkWithBorders` builds an 18×18×18 padded array by sampling neighbor chunks for the +1 overlap that Marching
Cubes needs. This padded array is built on the main thread (fast — just array copies) and transferred to the worker.
The padded data is detached after transfer (transferable arrays) so build a fresh copy each time.

### Solid underground has no visible geometry

Marching Cubes only generate triangles at density transitions (solid ↔ air). Solid underground rock has zero visible
surfaces until the player carves into it. The cutaway clipping plane does NOT create cross-section surfaces — it only
hides geometry above the plane. This means:

- The initial scene only shows the terrain surface and the entrance cavern walls
- Deeper cutaway depths show nothing unless there are carved-out air pockets at that level
- This is correct behavior, not a bug

## Rendering

### Three.js lighting with orthographic cameras

The camera sits at `CAMERA_DISTANCE = 200` units away. Fog, light falloff, and shadow ranges must account for this
distance. Early iterations were nearly invisible because:

- `FogExp2` with density > 0.005 eats everything at distance 200 (`exp(-0.005 * 200) ≈ 0.37`)
- ACES filmic tone mapping crushes dark scenes further — use `NoToneMapping` or `ReinhardToneMapping`
- `MeshStandardMaterial` (PBR) absorbs too much light in dim scenes — `MeshLambertMaterial` is more forgiving
- Ambient light needs to be at least `0.5` intensity for terrain to be readable in the dark underground aesthetic

### Material choice matters for dark scenes

`MeshLambertMaterial` with `vertexColors: true` is the sweet spot for this game: responsive to light, shows vertex
color variation clearly, and performs well. `MeshStandardMaterial` looked muddy in the dark. `MeshBasicMaterial` is
useful as a debug tool (unlit, shows raw vertex colors) but has no depth cues.

## Dependencies

### simplex-noise v4 does NOT export `alea`

The `alea` PRNG must be installed as a separate package (`npm install alea`). Import as `import alea from 'alea'`.
The simplex-noise README shows this but it's easy to assume `alea` is re-exported.

### Vite worker bundling

Workers work out of the box with: `new Worker(new URL('./mesher.worker.js', import.meta.url), { type: 'module' })`.
The worker can `import` from other modules and Vite bundles them correctly. No special config needed.

## Machine System (Phase 2)

### Raycasting machine meshes requires updateMatrixWorld

Three.js defers world matrix computation until render time. When raycasting against machine meshes between frames
(e.g., in a click handler), child meshes in a Group hierarchy have stale world matrices. You MUST call
`group.updateMatrixWorld(true)` before `raycaster.intersectObjects()`. Also use `recursive: true` on the top-level
group — don't raycast individual meshes from the registry, as their matrices may be stale.

### Machine clipping — share the terrain clipping plane

Machines should be clipped by the cutaway depth (user preference overrides ARCHITECTURE.md's recommendation).
All machine materials must reference `sceneManager.clippingPlane` — the same `THREE.Plane` object that terrain uses.
Since it's a shared reference, `setCutawayDepth()` updates all materials automatically. Watch out for inline materials
(cabin window, track textures) — every material needs the clipping plane, not just the shared ones.

### Drill direction should be machine→target, not face normal

Using the raycast hit face normal for drill direction causes confusion: the machine approaches from the wrong side
when clicking walls at oblique angles. Always compute drill direction as the vector from machine position toward the
clicked point. The face normal is only useful for distinguishing walls from floors in the command system.

### Arm geometry must not extend past the mine target

The articulated arm is a cosmetic animation — actual carving happens at the mine target position (where the player
clicked), not at the drill tip world position. Arm angles should be computed via simple inverse kinematics targeting
the mine target, scaled by a reach fraction so the arm doesn't overshoot into solid rock.

### Entrance cavern needs to be large enough for machine maneuvering

The original 12×14×12 ellipsoid was too tight for the drill rig to turn and pathfind. Increased to 18×12×18 for
Phase 2. Future machine types (excavator, truck) will need at least this much room.

### Right-click move needs drag detection

Right-click is used for both camera orbit (drag) and move command (click). Track `mousedown` position and only emit
the move command in `contextmenu` if the mouse moved less than 5px — otherwise it was an orbit drag.

### surfaceProbe scans downward from above

`surfaceProbe(x, z)` scans from `TERRAIN_SURFACE_Y + 8` downward to find the first air→solid density transition.
`surfaceProbeFrom(x, startY, z)` scans from an arbitrary Y — used for terrain-following inside carved tunnels where
the surface is well below the original terrain height.

### Chunk border dirty marking must include the +1 overlap zone

Marching cubes meshes sample a +1 padded border from neighboring chunks. When a voxel is modified at local positions
0–1 or 14–15 (not just exactly 0 or 15), the neighboring chunk's mesh is affected. `ChunkStore.setVoxel` must mark
neighbors dirty for positions `<= 1` and `>= CHUNK_SIZE - 2`, not just `=== 0` and `=== CHUNK_SIZE - 1`. Missing
this causes black holes — carved tunnels that penetrate chunk borders show void instead of generating new wall faces.

### Null _mineTarget in WORKING state crashes the game loop

The machine can transition to WORKING while `_mineTarget` is set, but `_checkDrillCompletion` or
`_advanceMachineForward` may null it out while the state is still WORKING. The next frame's `_updateWorking` then
crashes on `this._mineTarget.x`. Every state handler must guard against null `_mineTarget`/`_mineNormal` at the top.
The game loop should also try-catch the machine update so a crash doesn't kill camera/rendering.

### Floor-leveling must set material to AIR (0), not just density to 0

`chunkStore.setVoxel(x, y, z, 0)` without a material argument preserves the old material byte. Code that later
reads `getMaterialAt` at that cell sees rock material with hardness > 0, even though density is 0. Always pass
material 0 (AIR) when clearing voxels: `chunkStore.setVoxel(x, y, z, 0, 0)`.

### Distance checks must use 3D distance, not just XZ

`_getDistanceToMineTarget` originally only computed XZ distance, causing the drill to keep advancing past its reach
for targets far above or below the machine. Always include the Y component in reach checks.

### State cleanup on command override

When `commandMove` overrides an in-progress mine operation, it must clear `_mineTarget`, `_mineNormal`, and
`_fineMining`. Otherwise the mine indicator stays visible and stale mine state persists.
