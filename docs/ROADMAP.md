# Roadmap

The simulation comes first. Each milestone ends with something that runs and a test that proves it. Milestones 1 through 5 together deliver the first milestone in [OVERVIEW.md](OVERVIEW.md), the playable creator loop. Rule ids refer to [ARCHITECTURE.md](ARCHITECTURE.md).

Current: milestone 6, not started. Milestones 1, 2, 4, and 5 are done. Milestone 3 is built and checked on desktop. Its iPhone check and the performance budgets remain.

## 1. Foundation

Decide what the simulation code depends on, then make room for it.

- ADRs for number representation, tick rate, and the fate of `apps/website` and `packages/utils`.
- Scaffold `packages/data` and `packages/sim` with the dependencies from the package table.
- Replace the starter README.

Done when `vp check` and `vp test` pass on the new packages and the guardian reports clean.

## 2. Headless simulation core

No rendering. Everything runs in `vp test`.

- `data`: a first scenario schema with a format version, a map size, players, unit definitions, and placements. Scenarios are hand-written fixtures until the editor exists.
- `sim`: world state, `step`, the command queue, the seeded random generator, the sim math module, state hash, and save and load.
- One behavior: units accept a move command and travel across an empty map.

Done when a fixture scenario with a scripted command stream produces the same hash on two runs, and again after a save and load partway through.

## 3. A view of the simulation

- `packages/render`: Three.js, tilted perspective camera, flat plane, placeholder boxes, interpolation between snapshots, raycast picking, and the 2D debug overlay.
- App: the game loop, pan and zoom, select, box select, and move orders, by mouse and by touch (U1, U2).
- Set performance budgets from measurements on a real phone and record them below.

Done when someone can select units and move them around on a desktop and on an iPhone.

## 4. RTS rules

Each rule lands in `sim` with headless tests first, then gets its placeholder visuals and UI.

- Obstacles and obstacle-aware navigation.
- Attack orders, weapons, damage, and death.
- Resources and gathering.
- Construction and unit production.
- A simple opposing AI that submits commands like a player (S2).
- Victory and defeat from scenario data, restart, and the essential HUD. The HUD brings React, Zustand, and Tailwind into the app.

Done when a fixture scenario plays from start to a win or a loss against the AI, with no unit stats or rules hardcoded in `sim` (C6).

## 5. Creator loop

- `packages/editor`: the document, operations with inverses, and history.
- Editor UI: create and load a map on a flat plane, place obstacles, place, select, move, and delete objects, set teams, start points, and a victory condition.
- Save and reload through the storage interface (U5).
- Playtest and return to editing (E3).

Done when a user builds a scenario, saves it, reloads it, plays it, and returns to editing with nothing lost. Round-trip and history tests cover it.

The editor follows the rules because the simulation is the priority and the hardest part to change later. The cost is that scenarios stay hand-written for three milestones. That exercises the format before a UI depends on it.

## 6. Scenario logic

Triggers as data (C5), written by agents against the schema. The visual trigger editor comes later and edits the same records. Each step adds only what its genre fixture needs.

- Trigger records, variables, timers, regions, and waypoints. The milestone 4 fixture moves its victory condition into triggers.
- Tower defense: wave spawners, paths, a lives counter, and survive-N-waves victory.
- MOBA: one hero per player, abilities, stat modifiers, experience and levels, respawn, and lane creeps.
- Auto chess: round phases, commands limited per phase, a shop rolled from the seeded generator, unit merging, count-based synergies, and HUD elements driven by data.

Done when the standard RTS, tower defense, MOBA, and auto chess fixtures each play start to finish in a headless test, with no genre-specific code in `sim` (C6).

## Later

Not ordered and not committed.

- A visual trigger editor over the milestone 6 records.
- Fog of war and visibility.
- Upgrades, veterancy, patrol, attack-move, queued orders, control groups.
- Terrain imported from the external terrain editor (C8), real models and effects.
- Game data editing in the editor, with per-instance overrides.
- Larger armies against the performance budgets.
- Campaigns, asset packs, and scenario sharing.
- Multiplayer, after the ADR that picks a model.

## Performance budgets

Not set. Milestone 3 sets them.
