# ROADMAP.md — Underground Mining Game

## Build Philosophy

Each phase produces something **playable and testable.** No phase should be a "plumbing-only" phase with nothing to see.
If a phase adds an invisible system, it must also add a visible manifestation of that system.

Phases are sequential — each builds on the previous. Do not skip ahead. Complete the acceptance criteria for a phase
before starting the next.

---

## Phase 1: The Rock

**Goal:** A voxel world you can look at and carve into with a debug tool. Establish the rendering pipeline and voxel
engine.

### Deliverables

- Vite project scaffolded with the project structure from ARCHITECTURE.md
- Voxel world with chunk-based storage (16³ chunks)
- Terrain generation: geological layers by depth, noise-driven variation, ore veins
- Marching cubes meshing in a Web Worker (at least one worker)
- Vertex-colored terrain with material-based colors
- Orthographic isometric camera with rotation (90° snaps), zoom, and pan
- Cutaway clipping plane with a UI slider to adjust depth
- Dark underground atmosphere: fog, near-black ambient, one test spotlight
- Debug mining: click on terrain to carve a sphere at the click point (raycast from camera through mouse position, carve
  at intersection). This is a placeholder — not the final interaction model.

### Acceptance Criteria

- [ ] Camera rotates, zooms, and pans smoothly
- [ ] Cutaway slider reveals underground cross-sections
- [ ] Terrain has visible geological layers with distinct colors
- [ ] Ore veins are visible as colored inclusions in the rock
- [ ] Clicking on terrain carves a visible hole
- [ ] Carving near chunk borders works correctly (no seams)
- [ ] Meshing does not cause frame drops (worker is functional)
- [ ] 60fps on a mid-range machine with the initial world loaded

---

## Phase 2: The First Machine

**Goal:** One controllable machine that moves on the terrain surface and mines. Replace the debug carving tool with a
drill rig.

### Deliverables

- Procedural drill rig model (Three.js primitives, kinematic joint hierarchy)
- Machine placed on terrain surface, oriented to surface normal
- Click to select machine, click terrain to issue "move here" command
- Machine pathfinds along walkable surface to destination (A* on surface voxels)
- Machine movement animation (treads scroll, body moves along path)
- Slope analysis: machine refuses paths that exceed its max slope
- "Mine here" command: machine drives to rock face, drill arm extends, carving begins
- Drill animation: rotation, forward extension
- Carving driven by machine tool tip position, not mouse click
- Machine headlight (spotlight, shadows)

### Acceptance Criteria

- [ ] Drill rig is visually recognizable as a tracked mining machine
- [ ] Machine can be selected and commanded to move
- [ ] Machine pathfinds around obstacles and refuses too-steep slopes
- [ ] Machine mines rock face when commanded, visibly carving into terrain
- [ ] Drill has animated rotation and extension
- [ ] Machine headlight illuminates the work area
- [ ] Mining different materials takes different amounts of time
- [ ] Player can carve a ramp by directing the drill at a downward angle
- [ ] Machine can traverse a player-carved ramp to reach a new depth level

---

## Phase 3: Debris

**Goal:** Mining produces debris that piles up and must be dealt with. Add the excavator.

### Deliverables

- Debris heightmap system: carving adds volume to debris layer below the carve point
- Debris rendered as a displaced mesh (separate from terrain mesh)
- Hero chunks: 3–10 rigid bodies spawned per carve event, tumble and settle
- Hero chunk → heightmap transition (settled chunks merge into heightmap)
- Rapier WASM integration for hero chunk physics
- Procedural excavator model (tracked base, articulated arm, bucket)
- Excavator "scoop" command: drive to debris, scoop animation, volume subtracted from heightmap
- Excavator "dump" command: swing arm, dump animation, volume added at dump point
- Debris blocks machine pathfinding (machines can't drive through deep debris)

### Acceptance Criteria

- [ ] Mining with the drill produces visible debris that accumulates below
- [ ] Hero chunks tumble and bounce realistically, then merge into the heightmap
- [ ] Debris pile grows and is visually distinct from solid terrain
- [ ] Excavator can scoop debris and dump it elsewhere
- [ ] Debris blocks machine access routes until cleared
- [ ] Active rigid body count stays under 50
- [ ] Excavator arm animation looks mechanical and weighty

---

## Phase 4: The Haul

**Goal:** Complete the mining cycle. Debris goes somewhere. Add the haul truck and a dump zone.

### Deliverables

- Procedural haul truck model (tracked or wheeled, open bed)
- Truck "haul" command: parks near excavator, waits for load, drives to dump zone
- Dump zone: a designated area (near mine entrance or wherever player designates) where debris is deposited
- Truck autonomous loop: load → haul → dump → return
- Excavator loads truck (scoop → swing → dump into truck bed, volume transfer)
- Visual: truck bed fills as it's loaded, empties when dumped
- Basic resource tracking: minerals extracted from ore veins are counted (UI display)
- Multiple machines operating simultaneously

### Acceptance Criteria

- [ ] Full mining cycle works: drill → debris → excavator → truck → dump
- [ ] Truck autonomously loops between excavator and dump zone
- [ ] Truck bed visually fills and empties
- [ ] Multiple machines can be active simultaneously without conflicts
- [ ] Resources (iron, gold, crystal) are tracked and displayed in HUD
- [ ] The player can manage a small mining operation with all three machine types

---

## Phase 5: Collapse

**Goal:** The terrain fights back. Unsupported rock falls.

### Deliverables

- Structural integrity system: voxels check for support (below and horizontal within N)
- Support values per material (dirt collapses easily, hard rock holds overhangs)
- Collapse propagation over multiple frames (throttled, visual cascade)
- Collapsed voxels become debris (add to heightmap, spawn hero chunks)
- Collapse can bury machines (machine becomes immobile, must be dug out by another machine)
- Collapse can block access routes
- Visual/audio warning before collapse (small particles, cracking sounds, rumble)
- Player can assess collapse risk somehow (visual cue on unsupported surfaces)

### Acceptance Criteria

- [ ] Undermining a wall causes it to collapse after a short delay
- [ ] Collapse cascades — one section falling can trigger adjacent sections
- [ ] Collapsed rock becomes debris that must be cleared
- [ ] A machine can be buried by a collapse (and subsequently rescued)
- [ ] The player has some visual warning that a collapse is imminent
- [ ] Collapse feels dramatic and physical, not like blocks disappearing
- [ ] The collapse system does not cause frame drops (throttled propagation)

---

## Phase 6: Polish & Sound

**Goal:** Make it feel finished. Audio, particles, effects, save/load.

### Deliverables

- Procedural audio system (synthesized sounds, no sample files)
- Engine sounds, drilling sounds, excavator hydraulics, truck engine
- Rock breaking sounds, collapse rumble, ore discovery chime
- Ambient underground drone and distant rumbles
- Enhanced particle effects: dust in light beams, sparks on drilling, debris dust clouds
- Screen shake on collapses (subtle)
- Mineral emissive pulsing
- Save/load to localStorage
- Autosave on interval
- Start screen with new game / continue options
- Performance optimization pass (instancing, draw call reduction, LOD if needed)

### Acceptance Criteria

- [ ] The game has sound and it enhances the experience significantly
- [ ] Different materials produce different drilling sounds
- [ ] Collapse has a dramatic audio/visual moment
- [ ] Discovering ore feels rewarding (audio + visual)
- [ ] Game state persists across browser sessions
- [ ] Performance remains at 60fps with a moderately developed mine

---

## Future Phases (Not Yet Planned in Detail)

These are ideas for continued development. Do not implement until Phases 1–6 are complete.

- **Machine progression:** earn resources to unlock upgraded machines (faster drill, larger excavator, bigger truck)
- **Support structures:** placeable roof bolts or pillars to prevent collapse in mined-out areas
- **Underground water:** hitting a water table floods lower levels, requiring pumps
- **Conveyor belts / rail lines:** for long-haul debris removal deep in the mine
- **Multiple mine shafts:** player manages separate access points into the same rock volume
- **Geological surveys:** a scanner machine that reveals ore positions before mining
- **Environmental hazards:** gas pockets, unstable ground, extreme depth pressure
- **Terrain types / biomes:** different starting conditions (granite mine, limestone quarry, crystal cavern)

---

## Implementation Notes for the Agent

### General Approach

- Build incrementally. Get the simplest version of each system working first, then add complexity.
- Test each system in isolation before integrating. The voxel engine should work before machines exist. Machines should
  work on a flat surface before traversability matters.
- Prioritize feel over correctness. A physically inaccurate animation that feels heavy and satisfying is better than a
  physically correct one that feels floaty.
- When in doubt about a design decision, choose the option that produces a more visible result. The player should always
  be able to see the effect of what they're doing.

### Common Pitfalls to Avoid

- **Don't over-engineer the voxel engine.** 16³ chunks, flat arrays, basic marching cubes. No octrees, no dual
  contouring, no transvoxel unless performance demands it.
- **Don't make machines too small.** In isometric view, machines need to be chunky enough to read clearly. Err on the
  side of too big.
- **Don't forget chunk border meshing.** The #1 visual bug in voxel engines is seams between chunks. Handle neighbor
  sampling from the start.
- **Don't block the main thread.** Meshing in workers, physics in fixed timestep, terrain generation lazy/on-demand.
- **Don't simulate what you can fake.** The excavator doesn't need to physically interact with debris particles. It
  subtracts from a heightmap and spawns cosmetic chunks. The truck bed doesn't need physics. A fill level variable +
  visual representation is enough.
- **Don't add UI before the game needs it.** Phase 1 needs almost no UI. Let the world speak for itself. Add UI elements
  only when the player genuinely needs information they can't get from looking at the scene.

### Quality Bar

Each phase should feel like a polished tech demo, not a rough prototype. Animations should be smooth, lighting should be
atmospheric, the camera should feel good. This is a portfolio piece as much as it is a game — every phase should be
something worth showing.
