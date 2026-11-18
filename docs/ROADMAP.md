# Roadmap

The simulation comes first. Each milestone ends with something that runs and a test that proves it. Milestones 1 through 5 together deliver the first milestone in [OVERVIEW.md](OVERVIEW.md), the playable creator loop. Rule ids refer to [ARCHITECTURE.md](ARCHITECTURE.md).

Current: milestone 7. Orders, veterancy, upgrades, and fog of war are implemented. Skirmish runs to a result with fog enabled. The milestone-wide multiplayer review is complete. A real-phone playtest remains. Milestone 6 is done, and the gaps its multiplayer audit found in the format and world state are settled. Milestones 1, 2, 4, and 5 are done. Milestone 3 is built and checked on desktop. Its iPhone check and the performance budgets remain.

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

- Trigger records, variables, timers, regions, and waypoints. The milestone 4 fixture moves its victory condition into triggers. Done in format 2.
- Tower defense: wave spawners, paths, a lives counter, and survive-N-waves victory. Done, as trigger data with no wave mechanism in `sim`.
- Editor: add, move, rename, and delete waypoints, paths, and regions, and edit the settled definition fields (name, color, size, health, speed, cost, build time, weapon, what it trains and builds). Done. Pulled forward from Later so the genre fixtures can be opened and tuned by hand.
- MOBA: one hero per player, abilities, stat modifiers, experience and levels, respawn, and lane creeps. Done in format 3. Teams, levels, modifiers, abilities, and respawn are mechanisms in `sim`. Creep waves and victory are trigger data.
- Auto chess: round phases, commands limited per phase, a shop rolled from the seeded generator, unit merging, count-based synergies, and HUD elements driven by data. Done in format 5. Offers, merging, selections, and command rules are mechanisms in `sim`. Phases, lives, synergies, and round results are trigger data.

Done when the standard RTS, tower defense, MOBA, and auto chess fixtures each play start to finish in a headless test, with no genre-specific code in `sim` (C6).

## 7. Army control and information

The standard RTS controls and the systems that make a match about scouting and tech. The ADR of 2026-11-17 sets the direction. Steps go in this order because each later one builds on the earlier. Each step that adds a command or a mechanic gets the multiplayer-guardian before it is done.

- Orders. An entity holds a queue of orders instead of one. Every unit command may be queued. `attack` takes a target or a point, and a point is attack-move. `patrol`, `stop`, and `hold` are new commands. Auto-acquire puts an attack at the front of the queue, which replaces the attack order's `resume`. The app keeps control groups. Touch gets an attack mode, a sticky queue toggle, and control group buttons, so a phone player can do everything a keyboard player can. Done in format 6.
- Veterancy. `levels` may give a kill's experience to the killer instead of everyone near. Done in format 7.
- Upgrades. Definitions carry tags. More stats can be modified, at least weapon range, weapon cooldown, sight, and armor. A player researches upgrades in a production queue, and an upgrade's modifiers apply to every matching entity that player owns, including ones made later. Definitions, abilities, and upgrades may require upgrades or buildings, which gives a tech tree. Done in format 8. Sight modifiers landed with fog in format 9.
- Fog of war. Done in format 9. Skirmish enables shared team sight, exploration, and last-seen enemy buildings. The sim checks visibility for targeting and the AI scouts with attack-move. Triggers can reveal a region and test whether a team sees a matching entity. Player snapshots filter entities, private fields, and events. The editor can toggle fog and change definition sight. Older scenarios migrate with fog off.

Done when the standard RTS fixture plays to a win or a loss with fog on, through a tech tree and an attack-moved army, every step works by touch, the other three fixtures still pass unchanged, and a test shows a viewer's snapshot holds nothing that viewer cannot see.

## Later

Not ordered and not committed.

- A visual trigger editor over the milestone 6 records.
- Line of sight from terrain height, once terrain import exists (C8). Detection and cloaking.
- Terrain imported from the external terrain editor (C8), real models and effects.
- The rest of game data editing: gathering and resource fields, abilities and bounties from the MOBA, and per-instance overrides. Experience and levels are editable.
- Larger armies against the performance budgets. The milestone 6 audit measured 44 ms a tick for 1200 idle armed units in twelve seats on a desktop, over the 33 ms a tick has. Most of it is every idle unit looking at every entity for a target. A spatial grid, team lookup by seat, a per-tick budget for path searches, and staggered ai would answer it.
- Phones on equal terms, from the milestone 6 audit: a zoom-out limit that shows the whole map on a portrait screen, HUD counters that wrap, and catching up after the page was hidden.
- A twelve-seat determinism fixture with several teams, also run once in a WebKit browser against the hash from Node.
- Campaigns, asset packs, and scenario sharing.
- Multiplayer, after the ADR that picks a model.

## Performance budgets

Not set. Milestone 3 sets them.
