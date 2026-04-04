# DESIGN.md — Underground Mining Game

## Game Identity

An underground mining simulation where the player operates heavy tracked machinery to carve into rock, clear debris, and
push deeper into the earth. The tone is **industrial, atmospheric, and satisfying** — not frantic, not cute, not
abstract. The player should feel like a mine operator solving spatial puzzles with heavy equipment.

Reference points (for tone, not mechanics): Captain of Industry's terrain reshaping, Satisfactory's
first-person-to-overview scale, Deep Rock Galactic's underground atmosphere, Noita's destructible terrain feel.

---

## Visual Direction

### Overall Aesthetic

**Dark industrial, slightly stylized.** The underground is dark. Machines are the primary light sources. The rock has
geological character. Minerals glow faintly. Everything has weight and mass.

This is NOT:

- Minecraft-style blocky
- Clean/sterile/clinical
- Bright or colorful
- Pixel art or retro

### Color Palette

- **Rock:** Muted earth tones. Browns, grays, dark slate. Layers should be visually distinct but within a restrained
  palette. Deeper = darker and cooler (more blue-gray). Shallower = warmer (brown, tan).
- **Minerals:** The only saturated colors in the scene. Iron = deep rust/red-orange. Gold = warm amber with emissive
  glow. Crystal = cool blue-white with stronger emissive. These should feel like discovering something precious in the
  dark.
- **Machines:** Industrial yellow, orange, or muted green — pick a consistent manufacturer color scheme, like real
  mining equipment brands (Caterpillar yellow, Sandvik orange, etc.). Metallic grays for structural parts. Dark
  rubber/black for treads.
- **Lighting:** Warm white/yellow for headlights. Slightly blue-cool ambient for the underground void. Mining sparks are
  orange-hot.
- **UI:** Minimal. Monospace or industrial typeface. Muted gold or amber text on near-transparent dark backgrounds. The
  UI should feel like a control panel readout, not a game HUD.

### Machine Design Language

Machines should look **chunky, solid, and slightly exaggerated.** Oversized functional parts: big drill bits, thick
hydraulic arms, wide bucket scoops, heavy treads. Proportions should favor stocky over sleek. Think heavy equipment
caricature — recognizable as real machines but with personality.

Every machine should be visually distinct in silhouette at isometric distance. The player should be able to identify
machine types at a glance from their shape alone, without color or labels.

Avoid fine detail — the isometric camera means small features are invisible. Invest geometry in overall form and
proportions instead.

### Terrain Rendering

Marching cubes meshes should feel organic and rough, like actual rock. Vertex color noise helps break up uniformity.
Freshly carved surfaces can be slightly lighter or have different roughness to contrast with aged/natural surfaces.

Mineral veins should be visible as colored streaks or clusters within the rock face, ideally with subtle emissive glow
so they're visible in the dark before the headlight hits them. This serves gameplay (the player spots a gold vein and
plans their cut toward it) and atmosphere (the mine feels alive with hidden value).

### Lighting

Lighting is a core part of the experience, not decoration.

- The underground is **dark by default.** Not pitch black (the player needs some spatial awareness), but dark enough
  that machine headlights create dramatic contrast.
- Each machine has at least one spotlight that casts shadows. The interplay of multiple machine lights in a cavern
  should feel cinematic.
- Freshly carved rock face lit by a drill rig's headlight should be a "hero moment" — this is the visual payoff of
  mining.
- Fog reinforces depth and limits draw distance naturally.
- Mineral emissives should pulse very subtly (not like a game collectible — like a natural phosphorescence).

### Particles & Effects

- **Dust:** Persistent ambient dust floating in light beams. Density increases near active machines.
- **Sparks:** Short-lived bright particles when drilling, especially on hard rock. Direction generally opposes the
  drill.
- **Debris chunks:** Tumbling fragments when rock breaks (the hero chunks in the physics system). Should visually match
  the material being mined.
- **Exhaust/heat haze:** Optional subtle effect near machine engines.

All particles must be procedural (Points geometry, instanced meshes, or shader-driven).

---

## Interaction Design

### Camera Interaction

The camera is the player's primary navigation tool.

- **Rotate:** Q/E keys for 90° snaps, or click-drag if free rotation is implemented. Rotation should be smooth and
  animated, not instant.
- **Zoom:** Scroll wheel. Wide range from "see the whole mine" to "closely observe one machine working."
- **Pan:** Middle mouse drag, or WASD/arrow keys.
- **Cutaway depth:** A slider (or scroll + modifier key) that adjusts the clipping plane. This peels away rock layers to
  reveal the current working depth. This is the most important UI element — the player will constantly adjust it.

### Machine Selection & Control

The player interacts with the world exclusively through machines.

**Selection:**

- Click a machine to select it. Selected machine gets a subtle highlight (outline, glow, or selection ring on the
  ground).
- Click empty space to deselect.
- Hotkeys (1, 2, 3...) to quick-select machines by type or by index.

**Commands:**

- With a machine selected, clicking on terrain issues a context-appropriate command:
    - **Drill rig selected + click on rock face** → "Mine here" — drill moves to position and begins drilling at the
      clicked face.
    - **Excavator selected + click on debris pile** → "Scoop here" — excavator moves to debris and begins scooping.
    - **Excavator selected + click on empty ground** → "Dump here" — sets the dump point for the next scoop cycle.
    - **Truck selected + click on excavator** → "Haul for this excavator" — truck parks near excavator, waits for loads,
      and auto-hauls to dump zone.
- A ghost/preview overlay should show the area of effect before the player commits (drill radius, scoop path).
- Right-click to cancel current command or clear queue.

**Autonomy:**

- Machines execute commands autonomously once given. The drill keeps drilling until the player stops it or it runs out
  of reachable rock.
- The excavator cycles scoop-dump-return until debris is cleared or the player reassigns it.
- The truck loops between excavator and dump zone.
- The player's job is strategic: deciding WHERE to mine, HOW to route access, and WHEN to reassign machines.

### Mining Feedback

The act of mining must feel **satisfying and physical:**

- Visual: rock crumbles, chunks fly, dust billows, the drill bit visibly chews into the face
- Audio: grinding, crunching, metallic impacts, rumbling. Different rock types should sound different (dirt = soft thud,
  stone = sharp crack, hard rock = grinding screech, hitting ore = distinct metallic ring)
- Camera: subtle screen shake on heavy impacts or collapses (very subtle — this is a sim, not an action game)
- Progress: the face visibly recedes as the machine works. The player should see the hole growing.

### Ramp Building

The player must carve ramps to move machines to deeper levels. This is the core spatial puzzle.

Ramps are not a special building action — they're just mining at an angle. The player directs the drill to carve at a
downward slope. If the slope is within the machine's traversability limit, it becomes a usable ramp. If too steep, the
machine can't climb it.

Visual feedback should indicate when a surface is traversable vs. too steep. This could be a color overlay (green/red)
when a machine is selected and the player is planning a path, or simply the pathfinding refusing to route through
too-steep terrain with a visual indicator.

---

## Gameplay Loop

### Core Loop (Minute-to-Minute)

1. Survey the rock face (rotate camera, adjust cutaway, look for mineral veins)
2. Position the drill rig and begin mining
3. Debris piles up at the base of the cut
4. Switch to excavator, clear the debris
5. Truck hauls debris to the dump zone
6. Assess the new opening — plan next cut or carve a ramp to go deeper
7. Repeat

### Progression (Session-to-Session)

- **Depth = progress.** The deeper you go, the harder the rock, the rarer the minerals, the more complex the logistics.
- **Geological layers** change every N meters of depth, introducing new rock types and minerals.
- **Machine unlocks** (future phase): earn resources from minerals to unlock better/bigger machines. Larger machines
  mine faster but need wider ramps and more clearance.
- **Challenges scale naturally:** deeper mines need longer haul routes, more ramp planning, more collapse risk. No
  artificial difficulty — the geometry IS the difficulty.

### Fail States & Tension

- **Collapse:** undermining a wall causes it to fall, potentially burying machines or blocking access routes. Not
  game-over, but costly — the player has to dig out.
- **Trapped machines:** a machine with no valid path back is stuck. The player must carve a rescue route with another
  machine.
- **Debris overflow:** ignoring debris clogs the mine. Access routes get blocked. The mine becomes unworkable until
  cleared.

None of these should feel punishing. They should feel like "I made a mistake, now I need to solve a problem." The tone
is problem-solving, not punishment.

---

## Audio Direction

All audio must be procedurally generated or synthesized — no sample files.

### Ambient

- Deep low-frequency hum of the underground (drone, subtle)
- Occasional distant rumbles (tectonic, atmospheric)
- Dripping water sound (synthesized)
- Echo on all sounds proportional to cavern size

### Machine Sounds

- Engine idle: low rumble, rhythmic
- Movement: treads on rock, grinding
- Drilling: high-pitched grinding, escalating with harder rock
- Excavator: hydraulic whine, bucket scraping, dump thud
- Truck: engine note changes with load weight

### Event Sounds

- Rock breaking: sharp crack/crumble
- Collapse: deep rumbling cascade
- Hitting ore: distinct metallic "ping" or chime — the reward sound
- Machine selected: subtle UI click/beep

---

## UI Principles

- **Minimal and non-intrusive.** The game world is the main character, not the UI.
- **Industrial aesthetic.** Monospace type, muted colors, thin borders. Feels like a control panel, not a mobile game.
- **Information on demand.** Show depth and selected machine status always. Show detailed info (material, slope, machine
  health) on hover or selection.
- **No menus in Phase 1.** Start button, game world, HUD. Menus come later.
- **The cutaway depth slider is the most important UI element.** It should be prominent, smooth, and satisfying to use.

---

## Scope Boundaries

### In Scope (Full Game Vision)

- Multiple machine types with direct command control
- Voxel terrain carving with marching cubes
- Ramp planning and traversability
- Debris management (hybrid heightmap + physics)
- Structural collapse
- Geological layers with ore veins
- Procedural audio
- Save/load
- Machine unlocks and progression

### Out of Scope (Not This Game)

- Multiplayer
- Base building on the surface
- Character/person simulation (workers, health, morale)
- Complex production chains (this is not Factorio)
- Procedural story or narrative
- Mobile touch controls (desktop browser only for now)
- VR/AR
