# Architecture

`data`, `sim`, `editor`, `render`, and the app exist in their first form. This document sets the boundaries the first slice gets built inside. [OVERVIEW.md](OVERVIEW.md) says what we are building and why.

Rule ids (D1, S3, ...) are stable. The architecture-guardian agent cites them. A removed rule leaves a gap. To change a rule, add an entry to [ADRs.md](ADRs.md) and edit this file in the same change.

## Packages

```
apps/website        React UI, input, storage, wiring
   |      |      |
   v      v      v
editor  render -> sim
   |      |      |
   +------+------+
          v
        data
```

| Package           | Owns                                                                                                | May import                                      |
| ----------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `packages/data`   | Zod schemas and types for content definitions and scenarios, format version, migrations, validation | nothing in the workspace                        |
| `packages/sim`    | Headless game rules. World state, commands, fixed-step tick, AI, triggers, snapshots, state hash    | `data`                                          |
| `packages/editor` | Headless authoring. The scenario document, edit operations, undo/redo history                       | `data`                                          |
| `packages/render` | Drawing the battlefield from snapshots. Camera, picking, effects, overlays                          | `data`, `sim` (types and snapshot readers only) |
| `apps/website`    | React game and editor UI, input mapping, persistence, the game loop, the edit and playtest wiring   | everything                                      |

Five packages is the starting point, not a target. Split one only when a second consumer needs half of it.

### Dependency rules

- **D1.** Imports follow the table. A package lists every workspace package it imports in its own `package.json`, so an import outside the table fails to resolve.
- **D2.** `sim` and `editor` never import each other. The app connects them through serialized scenario data.
- **D3.** `data`, `sim`, and `editor` run in Node with no DOM. They do not import React, Zustand, Three.js, or anything that touches `window` or `document`.
- **D4.** `render` does not import `editor` or React. The app passes it snapshots and overlays.
- **D5.** Packages export through their entry point. No deep imports into another package's `src`.

## Simulation

The simulation is a function of its inputs. Given the same scenario, seed, and command stream, it produces the same state on every device. Replays, save games, desync detection, the playtest sandbox, and either multiplayer model all depend on that property, so we hold it from the first commit even though networking is deferred.

- **S1.** State changes only inside `step`. One call advances one tick of fixed length. The tick rate is one constant in `sim`.
- **S2.** Commands are the only input. A command is plain serializable data with a player id and a target tick. The UI, the AI, and later the network all submit commands to the same queue. AI gets no private way to mutate state.
- **S3.** No ambient inputs. `sim` never reads `Math.random`, `Date.now`, `performance.now`, timers, or locale. Randomness comes from a seeded generator stored in world state.
- **S4.** Math is reproducible across JS engines. Use `+ - * /` and `Math.sqrt`, which IEEE 754 fixes exactly, and `Math.floor`, `ceil`, `trunc`, `round`, `abs`, `sign`, `min`, and `max`, which the language specifies exactly. `%` and the integer bit operators are exact too. `Math.sin`, `cos`, `atan2`, `pow`, `exp`, and `log` may differ between engines, so `sim` calls its own math module for those.
- **S5.** Iteration order is defined. Systems run in a fixed order and visit entities in id order. Nothing depends on `Map` or `Set` order unless insertion order is itself deterministic.
- **S6.** `step` is synchronous. No promises, no `await`, no I/O.
- **S7.** World state is plain data. It serializes to JSON and back without loss, and `sim` can hash it. No class instances holding closures, no references to DOM or renderer objects.
- **S8.** Output is read only. `sim` exposes snapshots and a per-tick event list (unit died, building finished). Consumers never write to either.
- **S9.** Positions are a ground-plane coordinate plus height from terrain. Tilting the camera or adding real terrain must not change `sim`.

Entity storage is one plain table in id order with systems as functions. Navigation is A* on a grid built from everything that does not move. Pick an ECS library only if profiling shows the need.

## Data

- **C1.** One scenario format. The editor saves it, the game loads it, and no second format exists for either.
- **C2.** Definitions and instances are separate. A definition describes a kind of unit, building, weapon, or ability. A placement references a definition by id and may carry overrides. Scenarios can add or override definitions.
- **C3.** Every scenario file carries `formatVersion`. A migration is a pure function from version N to N+1. Loading always runs migrate, then validate. Nothing else reads an unvalidated file. The format is frozen now that users save scenarios. Every schema change bumps the version and ships a migration with a fixture.
- **C4.** Zod schemas are the source of truth. TypeScript types are inferred from them, not written beside them.
- **C5.** Scenario logic is data. Triggers are event, condition, action records that `sim` interprets inside `step`. Actions may change state in ways no command can, such as spawning units or granting resources, because they are part of the scenario and not input. No `eval`, no `new Function`, no user code running in the page. If scripting arrives later it runs inside `step` in a sandbox with a step budget and changes the world only through trigger actions.
- **C6.** No hardcoded scenario content. Unit stats, faction rules, and victory conditions come from data. `sim` contains mechanisms, not a particular game. Triggers decide who is defeated or wins. Ending the game once one player or none is left standing is a mechanism in `sim`.
- **C7.** Scenario data states speeds and durations in seconds, never in ticks. `sim` converts using its tick constant, so the tick rate can change without rewriting content.
- **C8.** Terrain is an imported asset made in an external terrain editor. The scenario references it and carries the grids `sim` needs, such as pathing. `sim` never reads the mesh. Only `render` does.

## Editor

- **E1.** The document is scenario data in the `data` schema. Serializing the document is saving.
- **E2.** Every mutation is an operation with an inverse. UI code never mutates the document directly. Undo and redo replay operations.
- **E3.** Playtest gets a copy. The app serializes the document, runs it through C3, and builds a new `sim` world from the result. The world holds no reference to the document. Ending the playtest discards the world.
- **E4.** Editor-only state (selection, active tool, camera, panel layout) stays out of the document and out of undo history.

The editor viewport starts by building a tick-zero world from the document and handing its snapshot to `render`, with zones, waypoints, and gizmos drawn as overlays. That keeps one drawing path for both modes. Revisit if rebuild cost shows up in profiles.

## Render

- **R1.** The renderer holds no game state. It draws the latest snapshots and can be destroyed and rebuilt at any tick without changing the outcome.
- **R2.** Rendering runs at display rate and interpolates between the last two snapshots. It never calls `step` and never decides game outcomes.
- **R3.** The engine stays inside `render`. Three.js types do not appear in the package's exports, and no game state lives on Three.js objects or their `userData`.
- **R4.** Picking returns entity ids and ground positions. The app turns those into commands.

The renderer is Three.js from the start. The first version is a tilted perspective camera over a flat plane with placeholder boxes, so `sim` gets a picture early and the camera, raycast picking, and interpolation carry forward. Debug drawing (labels, paths, navigation grids) goes on a transparent 2D canvas layered above it.

## UI and input

- **U1.** Device input becomes intents, then commands. Mouse, keyboard, and touch handlers live in the app and map to the same intents (select, box select, order at point, pan, zoom). Nothing below the app knows which device produced a command.
- **U2.** Every action works by touch. No feature depends on hover, right click, or a keyboard. Hotkeys are accelerators.
- **U3.** React does not render the battlefield and does not re-render per tick. HUD components subscribe to derived view models that update when their values change.
- **U4.** Zustand holds UI state. World state lives in `sim`. The scenario document is an `editor` history value that the app holds in one place. Neither is copied into a store.
- **U5.** Storage is behind one interface in the app. `data` and `editor` produce and accept serialized scenarios and do not know where they are kept.

## Flows

A game frame, driven by the app:

1. Input handlers turn device events into commands and queue them.
2. An accumulator calls `sim.step` zero or more times to catch up to real time.
3. `render` draws, interpolating between the last two snapshots.
4. View models pick up changed values and React updates the HUD.

Edit, playtest, edit:

1. The user edits. Each edit is an operation applied to the document (E2).
2. Playtest serializes the document, migrates and validates it, and builds a world (E3).
3. The game loop runs against that world.
4. Stop discards the world. The document and its history are where the user left them.

## Multiplayer

Not in the first slice. The rules above keep two models open. In lockstep, clients exchange commands and each runs `sim`. With an authoritative server, `sim` runs in Node and clients predict. Both need S1 through S7, and both use the state hash to detect divergence. The choice is an open decision.

## Tests

These exist from the first slice and run under `vp test` with no browser.

- Determinism. The same scenario, seed, and commands produce the same state hash, run twice and run after a save and load mid-game.
- Round trip. Parse, serialize, and parse again yields equal data. Every migration has a fixture.
- History. Applying an operation and then its inverse restores the document exactly.
- Behavior. Key rules (gathering, production, damage, victory) run as headless scenarios.

Performance budgets are not set yet. They get set against a real phone, since the iPhone player is the constraint, and recorded in the roadmap.

## Open decisions

Each of these needs an ADR before the code that depends on it.

1. Multiplayer model, lockstep or authoritative server.
2. Save games. Whether a saved world carries a version and is validated on load, or is disposable across format versions.
3. Terrain import. The mesh file format, and how the pathing grid is derived from the mesh (C8).
