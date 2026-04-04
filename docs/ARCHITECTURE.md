# ARCHITECTURE.md — Underground Mining Game

## Overview

A browser-based isometric underground mining game built entirely in JavaScript. The player operates tracked mining
machines to carve into a voxel-based rock volume, managing access ramps, debris removal, and structural stability. All
assets are procedurally generated in code — no external model files, no asset pipeline.

---

## Tech Stack

| Concern           | Technology                                | Notes                                                     |
|-------------------|-------------------------------------------|-----------------------------------------------------------|
| Rendering         | Three.js (r128+)                          | WebGL, orthographic camera for isometric view             |
| Voxel meshing     | Marching Cubes in Web Workers             | Offload geometry generation from main thread              |
| Debris physics    | Rapier WASM (`@dimforge/rapier3d-compat`) | Rigid bodies for hero chunks only                         |
| Build system      | Vite                                      | Fast dev server, ES module support, easy worker bundling  |
| Language          | JavaScript (ES modules)                   | TypeScript optional but not required                      |
| State persistence | localStorage (initial)                    | Serializable game state, portable to server later         |
| Audio             | Tone.js or Web Audio API directly         | Procedural/synthesized sounds preferred over sample files |

### No External Assets Rule

Every visual element — terrain, machines, UI, particles, lighting — must be generated in code. No `.glb`, `.obj`,
`.png`, `.wav` imports. Textures may be generated via `CanvasTexture` or shaders. Audio may be synthesized. This
constraint is intentional and must not be worked around.

---

## Project Structure

```
src/
├── main.js                  # Entry point, game loop, init
├── core/
│   ├── GameState.js         # Central serializable state object
│   ├── EventBus.js          # Pub/sub for decoupled communication
│   └── Config.js            # All tunable constants in one place
├── voxel/
│   ├── VoxelWorld.js        # Chunk management, read/write voxels
│   ├── ChunkStore.js        # Chunk data storage, dirty tracking
│   ├── TerrainGenerator.js  # Procedural terrain, geological layers, ore veins
│   ├── MarchingCubes.js     # Isosurface extraction (runs in worker)
│   └── mesher.worker.js     # Web Worker entry for meshing
├── machines/
│   ├── MachineFactory.js    # Procedural geometry builders for each machine type
│   ├── MachineController.js # State machine, command queue, execution
│   ├── Kinematics.js        # Joint chain solver for arms/buckets
│   └── TrackSystem.js       # Track/tread animation, surface movement
├── terrain/
│   ├── Traversability.js    # Slope analysis, pathfinding on voxel surfaces
│   ├── Collapse.js          # Structural integrity checks, collapse propagation
│   └── DebrisSystem.js      # Hybrid heightmap + rigid body debris
├── rendering/
│   ├── SceneManager.js      # Three.js scene setup, post-processing
│   ├── CameraController.js  # Isometric camera, rotation, zoom, pan, cutaway
│   ├── LightingSystem.js    # Machine lights, ambient, atmosphere
│   ├── ParticleSystem.js    # Dust, sparks, debris particles
│   └── CutawayShader.js     # Clipping plane for terrain cross-section
├── input/
│   ├── InputManager.js      # Keyboard, mouse, and (later) gamepad input
│   ├── SelectionManager.js  # Machine selection, hover states
│   └── CommandSystem.js     # Translates player input to machine commands
├── ui/
│   ├── HUD.js               # Depth, resources, machine status (HTML overlay)
│   └── DepthSlider.js       # Cutaway depth control
└── audio/
    └── AudioSystem.js       # Procedural sound effects, event-driven
```

### Module Boundaries

Modules communicate through the **EventBus** and through the **GameState** object. Direct imports between sibling
directories (e.g., `machines/` importing from `rendering/`) should be avoided. Instead:

- `machines/` emits events like `machine:carve`, `machine:scoop`
- `voxel/` listens and modifies terrain data
- `rendering/` listens and updates meshes
- `terrain/` provides query interfaces (slope at point, is supported, pathfind)

The game loop in `main.js` orchestrates the update order:

1. Process input → generate commands
2. Update machines (state machines, kinematics)
3. Apply terrain modifications (carve, collapse)
4. Remesh dirty chunks (dispatch to workers)
5. Update debris physics (Rapier step)
6. Update rendering (lights, particles, camera)
7. Render frame

---

## Voxel Engine

### Chunk Specification

- **Chunk size:** 16×16×16 voxels
- **Voxel data:** 2 bytes per voxel
    - Byte 0: `density` (Uint8, 0–255, where 128 = surface threshold)
    - Byte 1: `material` (Uint8, enum)
- **Chunk storage:** Flat `Uint8Array(16 * 16 * 16 * 2)` = 8,192 bytes per chunk
- **Indexing:** `index = (x + y * 16 + z * 16 * 16) * 2`
- **Extra border:** Meshing requires +1 overlap on each edge. The mesher must sample neighboring chunks for border
  voxels rather than storing oversized chunks.

### Material Enum

```
0 = AIR
1 = DIRT / LOOSE SOIL
2 = STONE
3 = HARD_ROCK
4 = IRON_ORE
5 = GOLD_ORE
6 = CRYSTAL
7–15 = reserved for future materials
```

Each material must define: color (RGB), hardness (float, affects mining speed), and structural strength (float, affects
collapse resistance).

### Terrain Generation

- Geological layering driven by depth (Y coordinate)
- Perlin/Simplex noise (3D FBM) for layer boundaries and variation
- Ore veins: separate noise fields per ore type with depth-dependent thresholds
- Starting area: a pre-carved entrance cavern large enough to fit initial machines
- Chunks generated on demand when first accessed; generation must be deterministic given a world seed

### Meshing

- Marching Cubes algorithm, executed in Web Workers
- Input: chunk voxel data + neighbor border data
- Output: `Float32Array` buffers (position, normal, color) transferred back via `postMessage` with transferable arrays
- Vertex colors derived from material type with slight per-vertex noise for organic feel
- Only remesh chunks flagged as dirty
- Worker pool: 2–4 workers, task queue with priority (chunks near camera first)

---

## Camera System

### Isometric Projection

- **Orthographic camera** with true isometric or near-isometric angle
- Standard isometric: camera elevation ~35.264°, azimuth rotatable in 90° increments
- Free rotation is acceptable if it feels better, but snap rotation must be available
- **Zoom:** Orthographic zoom (adjust frustum size), scroll wheel
- **Pan:** Middle mouse drag or screen edge scroll
- **Cutaway:** A horizontal clipping plane at adjustable Y depth, controlled by a UI slider or scroll. Terrain above the
  cutaway plane is invisible, revealing the underground cross-section. This is essential — the player must be able to
  see inside the mine.

### Cutaway Implementation

Use a custom shader or Three.js clipping planes (`renderer.clippingPlanes`). The cutaway plane Y value is a game state
property. All terrain meshes must respect it. Machine meshes should NOT be clipped (machines remain visible even above
the cutaway for spatial reference).

---

## Machine System

### Machine Types (Initial Set)

1. **Drill Rig** — tracked base, boom arm with rotary drill head. Breaks rock at the face. Slow movement, high mining
   power.
2. **Excavator** — tracked base, three-segment articulated arm, bucket. Scoops debris, swings, dumps. Core debris
   removal tool.
3. **Haul Truck** — wheeled or tracked, open bed. Receives debris from excavator, drives it to dump point. Autonomous
   pathing once loaded.

### Machine Data Model

```js
{
    id: string,
        type
:
    'drill' | 'excavator' | 'truck',
        position
:
    {
        x, y, z
    }
,      // World position
    rotation: float,              // Y-axis rotation
        joints
:
    [                     // Kinematic chain
        {name: string, angle: float, min: float, max: float, axis: 'x' | 'y' | 'z'}
    ],
        state
:
    string,                // Current state machine state
        commandQueue
:
    [],             // Pending commands
        dimensions
:
    {
        width, height, length
    }
,  // For traversability
    maxSlope: float,              // Maximum traversable gradient
        speed
:
    float,                 // Movement speed
}
```

### Machine Geometry

Built procedurally from Three.js primitives (BoxGeometry, CylinderGeometry, SphereGeometry, ConeGeometry) composed into
`THREE.Group` hierarchies. Each joint in the kinematic chain is a nested Group so that rotation at a parent joint
cascades to children.

Design should feel chunky, slightly oversized, industrial. Exaggerated proportions are encouraged — big drill bits,
thick pistons, wide tracks. The machines should read clearly from isometric distance.

Track/tread animation: UV-scrolling texture on a box, or a chain of small box segments. Either approach is acceptable.

### Machine State Machine

Each machine runs a simple state machine:

```
IDLE → MOVING → WORKING → RETURNING → IDLE
```

Transitions triggered by player commands or task completion. The state machine drives both the kinematic animation and
the terrain/debris effects. For example, the drill in WORKING state rotates its drill joint and emits `machine:carve`
events each frame with the drill tip position and radius.

### Command System

Player clicks select a machine. With a machine selected, clicking on terrain issues a command:

- **Drill:** "Mine at this point" → drive to position, drill into face
- **Excavator:** "Scoop here, dump there" → drive to debris, scoop, drive to dump point, dump
- **Truck:** "Haul to exit" → drive to excavator, wait for load, drive to dump zone

Commands go into a queue. Machines execute sequentially. Basic autonomy: a truck can be set to loop between excavator
and dump point.

---

## Terrain Interaction

### Mining (Carving)

When a machine mines, it modifies voxel density values within a radius around the tool tip. Density increases toward
AIR (above surface threshold = carved away). Mining speed is inversely proportional to material hardness.

Carving must flag affected chunks as dirty for remeshing.

### Traversability

The surface of the voxel terrain must be analyzed for slope. A machine can only move across surfaces where:

- The local gradient does not exceed the machine's `maxSlope`
- The surface width accommodates the machine's dimensions
- A connected path exists from current position to target (A* on walkable surface voxels)

Ramps are surfaces the player has carved at a valid grade. The game does NOT auto-generate ramps — the player must plan
and cut them.

### Structural Collapse

Voxels require structural support. The simplest viable model:

- A voxel is **supported** if it has a solid voxel directly below it, OR if it is within N voxels horizontally of a
  supported voxel (overhang limit)
- Unsupported voxels collapse: density set to AIR, debris added to heightmap below, hero chunks spawned
- Collapse propagates over multiple frames (throttled, not instant) for dramatic visual effect
- Check triggered whenever voxels are carved — only recheck in the modified region plus a margin

The overhang limit N is a tunable per-material value (dirt = 1–2, stone = 3–4, hard rock = 5–6).

---

## Debris System

### Hybrid Model

Two layers that work together:

1. **Heightmap layer:** A 2D grid (same XZ resolution as voxels) tracking debris depth at each cell. When rock is
   carved, volume is added to cells below the carve point. When an excavator scoops, volume is subtracted along the
   bucket path. Rendered as a displaced plane mesh with rock-colored material, regenerated when dirty.

2. **Hero chunks:** On carve events, spawn 3–10 Rapier rigid bodies (convex hulls, varied sizes) that tumble and settle.
   When a hero chunk's velocity drops below a threshold for a sustained period, lerp its scale to zero while adding its
   volume to the heightmap, then remove the body. Keeps active rigid body count under ~50.

### Excavator Interaction

The excavator bucket traces a path through the heightmap and subtracts volume. Simultaneously, cosmetic chunks appear
inside the bucket mesh. On dump, volume is added at the dump point. The abstraction is invisible to the player because
volumes are conserved.

---

## Rendering

### Atmosphere

The underground should feel dark, enclosed, and dramatic:

- Near-black ambient light
- Each machine has one or more SpotLights (headlights) that cast shadows
- Optional placeable lamps (later phase)
- Fog (exponential, short range) to reinforce darkness and hide chunk loading
- Dust particles near active machines (Points or instanced small meshes)
- Sparks on drilling (short-lived emissive point particles)
- Subtle post-processing: bloom on emissive minerals and machine lights, vignette

### Material Rendering

- Vertex colors from material type, with per-vertex noise
- Freshly carved surfaces could have slightly different roughness or brightness to read as "new cut"
- Mineral veins (iron, gold, crystal) should have subtle emissive properties so they glow faintly in the dark — this
  serves as both visual reward and gameplay information

### Performance Budget

Target: 60fps on mid-range hardware (integrated GPU, ~2020 laptop). This means:

- Max ~200K triangles visible
- Max ~50 active Rapier bodies
- Max ~4 shadow-casting lights
- Chunk remeshing must not cause frame drops (hence workers)
- Draw call batching where possible (instanced meshes for particles, debris)

---

## Game State & Serialization

### State Object

```js
{
    seed: number,
        tick
:
    number,
        cutawayDepth
:
    number,
        camera
:
    {
        x, y, z, zoom, rotation
    }
,
    machines: [ /* machine data objects */],
        modifiedChunks
:
    {
        "cx,cy,cz"
    :
        Uint8Array  // Only chunks that differ from procedural generation
    }
,
    debrisHeightmap: Float32Array,
        resources
:
    {
        iron: 0, gold
    :
        0, crystal
    :
        0
    }
}
```

Only **modified** chunks need saving — unmodified chunks can be regenerated from the seed. This keeps save files small.

### Save/Load

- `localStorage` initially
- Save on explicit player action + autosave every N minutes
- Load on startup if save exists, otherwise generate new world

---

## Event Catalog

Key events on the EventBus (not exhaustive — add as needed):

| Event              | Payload                       | Emitter → Listener                    |
|--------------------|-------------------------------|---------------------------------------|
| `machine:carve`    | `{ position, radius, power }` | MachineController → VoxelWorld        |
| `machine:scoop`    | `{ path, volume }`            | MachineController → DebrisSystem      |
| `machine:dump`     | `{ position, volume }`        | MachineController → DebrisSystem      |
| `terrain:modified` | `{ chunkKeys[] }`             | VoxelWorld → MeshManager              |
| `terrain:collapse` | `{ voxels[] }`                | Collapse → DebrisSystem, VoxelWorld   |
| `chunk:meshed`     | `{ key, buffers }`            | Worker → MeshManager                  |
| `machine:selected` | `{ id }`                      | SelectionManager → HUD, CommandSystem |
| `input:command`    | `{ type, target, params }`    | InputManager → CommandSystem          |
| `camera:cutaway`   | `{ depth }`                   | DepthSlider → CameraController        |

---

## Constraints & Non-Negotiables

1. **No external asset files.** Everything procedural.
2. **Isometric orthographic camera.** Not perspective, not first-person.
3. **Machines are the player's avatar.** The player does not exist as a character. Interaction is through machine
   selection and commands.
4. **Terrain is voxel-based with marching cubes.** Not block-based, not heightmap-only.
5. **Meshing in Web Workers.** Never on the main thread.
6. **The player builds their own ramps.** No auto-pathing through solid rock.
7. **Debris is a gameplay obstacle.** It does not disappear automatically.
8. **Serializable game state.** Every piece of game state must be saveable and loadable.
