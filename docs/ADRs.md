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
