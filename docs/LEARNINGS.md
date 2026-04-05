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
Marching Cubes only generates triangles at density transitions (solid ↔ air). Solid underground rock has zero visible
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
