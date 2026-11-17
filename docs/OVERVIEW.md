# Browser RTS & Scenario Editor — Overview

**Goal:** Build a feature-rich, responsive browser RTS with a fully customizable scenario editor. Players should be able to create, playtest, save, and share their own levels, mods, and game modes. Player A should be able to battle Player B intensly on their desktop pc, while Player B is battling them from an iPhone. The editor doesn't need to be optimized for mobile.

**Priority:** Deliver a small, working **Edit → Playtest → Edit** loop before expanding content or polishing visuals. This is an original game, not a direct port of an existing RTS.

## References

### RTS gameplay and architecture

- **Command & Conquer: Generals / Zero Hour** — Core gameplay, base building, resource gathering, factions, combat, and unit controls. [EA source](https://github.com/electronicarts/CnC_Generals_Zero_Hour)
- **OpenSAGE** — Reference for SAGE-style architecture, content, maps, and game-system boundaries. [Website](https://opensage.github.io/) · [Repository](https://github.com/OpenSAGE/OpenSAGE)
- **Beyond All Reason (BAR)** — Large battles, unit commands, strategic terrain, army management, and scalability. [Website](https://www.beyondallreason.info/) · [Repository](https://github.com/beyond-all-reason/Beyond-All-Reason)

### Scenario editor design

- **Generals World Builder** — Map editing, objects, waypoints, and mission scripts. [Reference](https://www.cnclabs.com/maps/generals/worldbuilder/)
- **Warcraft III World Editor** — Accessible terrain, object, trigger, and campaign authoring. [Reference](https://news.blizzard.com/en-us/article/23395649/revisiting-the-warcraft-iii-editor)
- **StarCraft II Editor** — Deep data editing, abilities, effects, triggers, and custom game modes. [Data](https://news.blizzard.com/en-us/article/4121678/new-maps-and-mods-tutorial-data-module) · [Triggers](https://news.blizzard.com/en-us/article/2774506/new-maps-and-mods-tutorial-trigger-module)

Feel free to study these projects for design patterns; don't assume their code, assets, or interfaces should be copied. We want to building something that follows a modern architecture and best practices for software of this kind and scale so a solid foundation is key, no rush here.

## Product Vision

The game and editor are **equally important parts of one platform**:

- **Play:** Responsive RTS controls, economy, construction, production, tactical combat, AI, and scenario-defined objectives.
- **Create:** Build maps and scenarios ranging from standard skirmishes to campaigns, survival modes, scripted missions, custom rule sets, and other genres such as tower defense, MOBA, and auto chess.
- **Iterate:** Switch quickly between editing and playtesting without losing changes to the authoring document.

"Any scenario" is the long-term flexibility goal; new mechanics may still require extending the available systems.

## Core RTS Features

- **Controls:** Camera, selection/box selection, control groups, move, attack, attack-move, patrol, queued orders, and hotkeys.
- **Economy:** Resources, collectors, construction, unit production, upgrades, and configurable faction rules.
- **Combat:** Units, weapons, targeting, damage, projectiles, abilities, veterancy, and counters.
- **World:** 3D terrain, elevation, obstacles, navigation, visibility/fog of war, and map boundaries.
- **Matches:** Teams, alliances, AI, victory/defeat conditions, and eventually campaigns and multiplayer.
- **Scale:** Support growing armies using measured performance budgets rather than speculative optimizations.

## Scenario Editor Features

The editor is a **first-class product feature**, not an internal debug tool.

- **Terrain:** Import terrain meshes made in a separate, external terrain editor; sculpting and painting do not live in this project. Place obstacles and props on top.
- **Placement:** Add, move, duplicate, organize, and configure units, buildings, resources, props, zones, and waypoints.
- **Game data:** Edit or derive unit, building, weapon, ability, upgrade, and faction definitions; support per-instance overrides.
- **Scenario setup:** Configure players, teams, starting positions, resources, diplomacy, AI, and win/loss rules.
- **Logic:** Event → condition → action triggers, variables, timers, objectives, waves, and scripted events, stored as data. Agents author them first; a visual trigger editor comes later. No end-user scripting language for now.
- **Workflow:** Viewport, hierarchy, inspector, asset browser, search, snapping, undo/redo, validation, import/export, save/load, and one-click playtest.
- **Later:** Asset packs, campaign tools, community scenario sharing, and creator-friendly extensions.

## Technical Direction

**Proposed stack:** TypeScript, Vite, pnpm, Three.js for 3D rendering, React for game/editor UI. Validate against the existing repository before committing to the stack.

Keep these concerns distinct:

| System                     | Responsibility                                                                |
| -------------------------- | ----------------------------------------------------------------------------- |
| **Simulation**             | Fixed-step, headless game rules, commands, AI, economy, movement, and combat. |
| **Renderer**               | Battlefield, terrain, units, effects, camera, and visual feedback.            |
| **Game & editor UI**       | Controls, HUD, authoring tools, inspectors, and playtest workflow.            |
| **Content definitions**    | Reusable, data-driven units, structures, abilities, and factions.             |
| **Scenario format**        | Versioned terrain, placements, players, rules, objectives, and triggers.      |
| **Validation & scripting** | Data integrity, authoring diagnostics, safe scenario logic, and migrations.   |

**Architecture rules:**

- The editor and game use the **same scenario format, content definitions, and simulation**.
- Separate reusable entity definitions from individual placed instances.
- Playtests run an isolated copy of editor state; they must not mutate saved content.
- Keep simulation independent of React and rendering; use a fixed timestep.
- Make editor changes reversible, scenario data serializable, and user-authored logic sandboxed.
- Preserve room for multiplayer, but **do not build networking in the first slice**.

## First Milestone — Playable Creator Loop

Build one simple map, one prototype faction, basic resources, a few buildings and units, and a simple opposing force. Placeholder visuals are fine.

**Editor requirements:**

- Create/load a map; place obstacles. Terrain stays a flat plane until terrain import arrives.
- Place/select/move/delete objects; set teams, start points, and a victory condition.
- Undo/redo, save/reload, and launch a playtest.

**Game requirements:**

- Camera, selection, movement, obstacle-aware navigation, and attack orders.
- Resource gathering, construction, unit production, damage/death, and simple enemy AI.
- Victory/defeat, restart, and essential gameplay UI.

**Done when:** A user can build a simple scenario, save it, reload it, play it, and return to editing without data loss or hardcoded scenario logic. Add automated checks for serialization, editing history, and key simulation behavior.

## Implementation Priorities

1. **Audit:** Inspect the repository and references; identify reusable work, constraints, and licensing concerns.
2. **Foundation:** Define shared scenario/content data and simulation boundaries; build the 3D viewport, selection, and object placement.
3. **Creator loop:** Implement save/load, undo/redo, playtest transition, navigation, and basic RTS gameplay.
4. **Depth:** Extend AI, commands, combat, editor tools, triggers, unit definitions, and performance.
5. **Expansion:** Advanced customization, campaigns, sharing, and eventually multiplayer.

## Instructions for the Agent

- Review existing code **before** scaffolding, rewriting, or choosing libraries.
- Keep the architecture modular but avoid premature abstractions.
- Favor a **complete vertical slice** over a large unfinished feature list.
- Explain meaningful tradeoffs and verify behavior with tests and profiling.
- Begin implementation after a concise architecture and milestone plan, and report what works, what changed, and what's deferred.

**Suggested outputs:** `ARCHITECTURE.md`, a short `ROADMAP.md`, and a working first slice.
