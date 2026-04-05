# CLAUDE.md

## Project

Underground mining game — browser-based, isometric, Three.js. The player operates tracked mining machines to carve into
voxel terrain.

## Required Reading

Before starting any work, read these files in order:

1. `@docs/ARCHITECTURE.md` — tech stack, module structure, data formats, constraints
2. `@docs/DESIGN.md` — visual direction, interaction model, gameplay
3. `@docs/ROADMAP.md` — phased build plan with acceptance criteria

Follow the current roadmap phase. Do not skip ahead. Complete all acceptance criteria before moving to the next phase.

4. `@docs/LEARNINGS.md` — pitfalls and hard-won knowledge from previous phases (read before making changes)

## Working Style

- Build the simplest working version first, then iterate
- Every change should produce a visible result — no invisible plumbing without something to show
- Prioritize feel over correctness
- Test in the browser frequently; don't write large amounts of code before checking it runs
- When making a design choice not covered by the docs, choose the option that looks or feels better from the player's
  perspective

## Hard Rules

- No external asset files (no .glb, .obj, .png, .wav) — everything procedural in code
- Voxel meshing happens in Web Workers, never on the main thread
- Isometric orthographic camera only
- The player interacts through machines, not as a character

## Stack

- Vite + vanilla JS (ES modules)
- Three.js r128+
- Rapier WASM for debris physics (Phase 3+)
- Web Audio / Tone.js for sound (Phase 6)

## Commands

```bash
npm run dev    # Start dev server
npm run build  # Production build
```
