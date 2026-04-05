# KNOWN_ISSUES.md — Phase 2 Known Issues

## Machine Movement

### Machine struggles to advance forward through mined tunnels
The auto-advance mechanism (`_advanceMachineForward`) works but is conservative. The machine may stop advancing
if the freshly carved floor is uneven. The floor-leveling system helps but doesn't always produce a smooth enough
surface for the pathfinder. **Workaround:** Right-click to manually move the machine into the carved space, or
use shift+click (fine mining) to smooth the floor.

### Machine occasionally spins to unexpected facing before mining
When issuing a mine command at a target that's behind or to the side, the machine rotates to face the target.
In tight spaces, the rotation animation can look unnatural. The 3-second approach timeout prevents it from
getting stuck, but the visual can be jarring. Improvement: could skip rotation entirely for very close targets
and let the arm reach sideways (requires lateral arm joint, not implemented).

### Pathfinding grid is capped at 80x80
For very distant move targets, the A* grid is capped at 80x80 cells to prevent frame hitches. This means paths
longer than ~70 voxels may fail even if a valid route exists. **Workaround:** Issue multiple shorter move commands.

## Mining

### Ramp building requires careful manual work
There is no automated ramp-building mode. The player must use shift+click (fine mining) to carefully carve a
traversable slope. Regular mining creates holes too deep/steep for the machine to drive on. This is by design
(the player builds their own ramps) but can be frustrating without practice.

### Line carving produces slightly bumpy tunnels
The drill carves 3 overlapping spheres per pulse along the drill direction. While smoother than single spheres,
tunnels are still not perfectly cylindrical. Visible bumps remain on walls and floors. Could be improved with
capsule-shaped carving in a future pass.

### Drill reach check uses machine center, not drill tip
The 7-unit max reach is measured from the machine center position, not from the actual drill tip. This means
the effective drill reach varies with arm angle — drilling straight ahead reaches further than drilling down.

## Rendering

### Mine target indicator can clip slightly into rock
The amber diamond indicator is offset 0.15 units from the mine target along the drill direction, but on very
rough surfaces it can still z-fight or partially clip. The `polygonOffset` helps but isn't perfect.

### Machine headlight shadow can flicker at certain angles
The spotlight shadow map is 512x512 which can produce aliasing artifacts when the machine is viewed from
certain camera angles. Increasing the shadow map would fix it but costs performance.

## Input

### Drag-to-mine can conflict with camera orbit
If the user starts a left-drag for mining and then presses Ctrl mid-drag to orbit, the drag state is cleared
and the camera takes over. This works correctly but the transition can feel abrupt. The reverse (starting orbit
then releasing Ctrl) does not accidentally start mining.

### First click after page load may miss the machine
The machine's world matrix may not be fully computed on the very first frame. Clicking the machine immediately
after load might miss. **Workaround:** Wait a moment or zoom/pan first.
