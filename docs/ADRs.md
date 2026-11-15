# ADRS live here.

They should be short and timestamped.

Periodically trim this file. Older ADRS should be compact.

## 2026-11-14 Three.js from the start, no 2D engine

The simulation is the priority and the first view of it is deliberately minimal. We render with Three.js from day one: a top-down orthographic camera, a flat plane, placeholder boxes. Phaser and plain Canvas 2D were considered for a throwaway 2D phase. Either would be deleted whole when 3D arrived, along with its camera and picking code. Starting in Three.js costs about a day more and nothing gets rewritten. Debug drawing uses a 2D canvas overlay.

## 2026-11-14 Restricted floats in sim, not fixed point

`sim` uses plain JS doubles. JS requires IEEE 754 doubles with no fused or extended-precision operations, so `+ - * /` and `Math.sqrt` give the same bits on every engine. Everything else goes through sim's own math module (S4). Fixed point was considered. It gives determinism by construction and ports to a non-JS server, but every multiply and divide goes through helpers and overflow needs care. The cost of floats is that one stray `Math.sin` breaks determinism silently, so the guardian and the determinism tests have to catch it. Revisit if an authoritative server in another language is chosen.

## 2026-11-14 30 Hz tick

`step` advances one thirtieth of a second. With interpolation an order shows within about 66 ms. 20 Hz saves a third of the sim cost on phones but feels about 100 ms behind. 60 Hz doubles the cost and leaves little room for large armies on an iPhone. The rate is one constant in `sim` (S1). Scenario data states speeds and durations in seconds so the rate can change without rewriting content (C7).

## 2026-11-14 Remove `packages/utils`, keep `apps/website`

`packages/utils` was the starter placeholder and nothing imported it. It is deleted. `apps/website` keeps its name, which the architecture document already uses, and its starter content is replaced when milestone 3 builds the app.

## 2026-11-14 S4 allows the exactly specified Math functions

S4 named only `+ - * /` and `Math.sqrt`. The sim math module needs `Math.floor` for range reduction and `Math.abs`. ECMAScript specifies `floor`, `ceil`, `trunc`, `round`, `abs`, `sign`, `min`, and `max` exactly, so they cannot differ between engines. S4 now lists them. The transcendental functions stay banned.

## 2026-11-15 Tilted perspective camera from the start

Replaces the orthographic top-down camera in the Three.js entry above. A perspective camera pitched about 55 degrees costs the same code, and pan, zoom, ground picking, and box select are written once against the projection the game will ship with. Positions stay ground-plane coordinates (S9), so `sim` is unaffected.

## 2026-11-15 Snapshots are copies

`takeSnapshot` in `sim` returns a new plain object with readonly types (S8). `step` mutates the world in place and interpolation needs the previous tick, so a view over the live world would not work. The copy holds only what consumers draw. Revisit if profiles show the copy cost.

## 2026-11-15 One entity table, capabilities from data

`sim` keeps units, buildings, resource nodes, and obstacles in one table. A definition says what an entity can do through optional fields: `speed`, `weapon`, `gatherer`, `resource`, `produces`, `builds`. Anything without `speed` blocks movement. Separate tables per kind were considered and would need a new table for every new kind a scenario invents (C6).

## 2026-11-15 The ai runs inside step

Each ai player thinks every 30 ticks inside `step` and its commands enter the same queue as a human's (S2). It reads the world and never writes it. Running it in the app was considered. That would put its decisions outside the save, the hash, and a replay.

## 2026-11-15 Grid navigation, no unit collision yet

Paths come from A* on a grid of unit cells built from everything that does not move, then straightened. Units do not push each other apart. A group move spreads its targets so units do not stack. Unit avoidance waits until battles are large enough to need it.

## 2026-11-15 The scenario format is not frozen

`FORMAT_VERSION` stays 1 and fields change without migrations while the only scenarios are fixtures in this repo. The format freezes when milestone 5 lets users save scenarios. From then on every schema change bumps the version and ships a migration with a fixture (C3).

## 2026-11-15 S4 allows `%` and integer bit operators

The grid navigation and the entity lookup use `%`, `>>`, and `>>>`. The language specifies them exactly, so they are safe for determinism. S4 now lists them.
