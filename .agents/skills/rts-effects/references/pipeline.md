# Effects pipeline

## Locations

Paths are relative to the repo root.

| Location                                                       | Contents                                                                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `packages/render/src/effects/recipes.ts`                       | The generic recipe of every kind, the emitter format, and `SHOT_KINDS`, which the gallery and the editor offer |
| `apps/website/src/factionEffects.ts`                           | Each faction's style: how it redraws every generic recipe, block by block, and parts of its own                |
| `packages/render/src/effects/effects.ts`                       | Parts, their motion, the budgets, and which blocks are decoration                                              |
| `packages/render/src/effects/blocks.ts`                        | The instanced meshes and shaders that draw every block                                                         |
| `packages/render/src/renderer.ts`                              | `startFiring`, `playDeath`, and `recipeFor`: which recipe an event plays, its anchors, scale, and seed         |
| `apps/website/src/gallery.ts`, `EffectsGallery.tsx`            | The gallery at `#effects`, and `renderEffectSheet`, which the capture script calls                             |
| `docs/factions/<faction>.md`                                   | The faction's Effects section: colors, shapes, and smoke of its shots and explosions                           |
| `art/staging/renders/effects/<faction>/<effect>-<subject>.png` | Captured sheets, where `<effect>` is a shot kind or `death`. Git ignores them.                                 |

## How an event picks a recipe

- A `fired` event plays the kind of shot the attacker's weapon names in scenario data, `weapon.shot`, which the editor sets. A weapon that names none plays `melee` at range 1.5 or less and `bullet` otherwise.
- A `died` event plays by size: a building, which has no speed, `building-death`, a unit of radius 0.8 or more `vehicle-death`, and a smaller one `unit-death`. A resource running out plays nothing.
- The owner's style, which the app sets to their faction, picks `<faction>/<kind>` from the faction recipes the app passes. A faction without its own version of a kind, and a kind no recipe knows, fall back to the generic recipe of the kind.
- A shot from an attacker the viewer cannot see plays the generic `bullet` impact, with no kind or style, since either would name the hidden weapon or its faction.

### A faction's version

`factionEffects.ts` builds each faction's recipes from the generic ones with a style. For each block, a style gives a change to every emitter of that block, such as its colors, its size, or a shorter life, or null to leave the block out, such as scorch for a faction whose explosions leave nothing behind. `add` appends parts of the faction's own to a kind, such as a second beam from a forked barrel or a puff of soot at the muzzle. Every faction gets a version of every kind this way, so a new generic kind is drawn in each faction's colors at once. Change the style rather than writing a whole recipe, unless the faction's look cannot come from the generic one.

## Anchors and scale

- `origin` is the muzzle: from the attacker's position, 0.9 of its radius toward the target, at 0.6 of its height. Sockets such as `muzzle` are not read yet. It is null when the viewer cannot see the attacker.
- `target` is the impact: half the target's radius short of its center, at half its height, or for a death, the ground where it fell. It is null when the viewer cannot see the target. Then `direction` and `reach`, the weapon's range, carry a beam or tracer on into the fog.
- A unit stands 0.8 tall and a building 1.6.
- A shot's scale is the attacker's radius over 0.5, kept between 0.6 and 2. A death's is the radius over the recipe's `radius`, kept between 0.5 and 3. Sizes, speeds, scatter, lift, and rise are multiplied by it.
- The seed is the tick and the entity's id, so a shot draws the same on every device.

## Recipes

A recipe is a list of emitters and an optional `radius`, the footprint it is sized for. Each emitter makes `count` parts of one block. Every range, written `[min, max]`, is drawn again for each part.

| Field     | Meaning                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `block`   | What it draws. See the blocks below.                                                                                                               |
| `at`      | `origin` or `target`, the default. Beams and tracers always run from origin to target.                                                             |
| `count`   | How many parts. Defaults to 1.                                                                                                                     |
| `delay`   | Seconds after the event it starts.                                                                                                                 |
| `life`    | Seconds it lasts.                                                                                                                                  |
| `size`    | At birth and at death. A diameter, a beam's width, a tracer's or spark's length, a fireball's radius, a chunk's edge.                              |
| `color`   | At birth and at death. A fireball's are its hot and cool colors.                                                                                   |
| `opacity` | At birth and at death. Defaults to `[1, 0]`.                                                                                                       |
| `speed`   | Starting speed in ground units a second.                                                                                                           |
| `aim`     | `forward` along the shot, `back` toward the shooter, `up`, or `out` in every direction above the ground.                                           |
| `spread`  | Half-angle in radians of the cone around `aim`.                                                                                                    |
| `rise`    | Upward acceleration. Positive lifts smoke, negative drops sparks and debris.                                                                       |
| `drag`    | The share of speed lost each second.                                                                                                               |
| `scatter` | How far from the anchor a part may start, across the ground.                                                                                       |
| `lift`    | Height above the anchor.                                                                                                                           |
| `side`    | Distance to the right of the shot's line, negative for the left. A beam or tracer moves only its start, so twin barrels' beams meet at the target. |
| `arrive`  | Flies to the target over its life, whatever the range, as a flame jet does. Overrides `speed`.                                                     |
| `along`   | Seconds a shot takes to fly. Each part starts at a random point along the shot and waits until the shot passes it, so smoke lays a trail.          |
| `jitter`  | How far an arc's bends stray from the straight line.                                                                                               |
| `spin`    | Turns a second, for smoke, scorch, and debris.                                                                                                     |

## Blocks

| Block      | Draws                                                                     | Batch     | Blend    | Part of    |
| ---------- | ------------------------------------------------------------------------- | --------- | -------- | ---------- |
| `glow`     | A soft camera-facing dot of light                                         | light     | additive | core       |
| `flare`    | A star of light, for muzzle flashes and blasts                            | light     | additive | core       |
| `beam`     | A ribbon from origin to target, for lasers                                | beams     | additive | core       |
| `tracer`   | A short ribbon that flies from origin to target                           | beams     | additive | core       |
| `arc`      | A jagged bolt from origin to target that flickers, drawn as beam segments | beams     | additive | core       |
| `fireball` | A lumpy sphere of 320 triangles that burns away                           | fireballs | solid    | core       |
| `spark`    | A short ribbon stretched along its flight                                 | beams     | additive | decoration |
| `light`    | A glow lying on the ground, in place of a light                           | light     | additive | decoration |
| `ring`     | A ring on the ground, for shockwaves                                      | light     | additive | decoration |
| `smoke`    | A noisy camera-facing puff                                                | shade     | alpha    | decoration |
| `scorch`   | A dark noisy mark on the ground                                           | shade     | alpha    | decoration |
| `debris`   | A lit chunk that falls, bounces, and sinks                                | debris    | lit      | decoration |

Each batch is one draw call for every effect on screen. The shade batch draws right after the ground and before every model, so smoke never hides a unit.

To add a block: add its name to `Block` in `recipes.ts`, draw it in a batch in `blocks.ts` (an existing one if the shader fits, or a new `createBatch` with its own budget), give it a case in `draw` in `effects.ts`, and add it to `DECORATION` unless it tells the event. Keep one draw call for the whole block, a fixed budget, and no allocation per frame.

## Budgets

The same on every device. Past a batch's budget the newest parts are skipped, and decoration draws last, so it is what goes.

| Batch     | Parts at once |
| --------- | ------------- |
| light     | 1024          |
| shade     | 512           |
| beams     | 512           |
| fireballs | 128           |
| debris    | 256           |
| all parts | 4096          |

A 6v6 fight can play hundreds of shots a second, so one effect stays small. Keep a sheet's peaks within these. Parts are live particles. Slots are the batch instances they draw, where an arc takes one a bend, so a shot that is cheap in parts can still crowd the beam batch.

| Effect             | Peak parts | Peak slots |
| ------------------ | ---------- | ---------- |
| A shot             | 16         | 24         |
| A unit's death     | 24         | 24         |
| A vehicle's death  | 60         | 60         |
| A building's death | 150        | 150        |

Within a batch, one-slot core parts draw first, then arcs, then decoration, so a full batch drops bends and dressing before any shot.

## Capture

Run from the repo root with the `website` dev server running. It drives headless Chrome over its debugging protocol, so it needs Node 22 or later and Chrome. Set `CHROME` to the browser's path where it is not the macOS default.

```sh
node .agents/skills/rts-effects/scripts/capture.mjs --faction cyber-samurai --effect laser --subject tank
node .agents/skills/rts-effects/scripts/capture.mjs --faction cyber-samurai --effect death --subject war-factory
```

`--effect` is a shot kind, which every subject's weapon then fires, or `death`, which plays the death its subject's size calls for. `--subject` is `soldier`, `tank`, or `war-factory`. Both play through the faction's style, as in a match. `--url` defaults to `http://localhost:5190`, and `--out` to `art/staging/renders/effects/<faction>/<effect>-<subject>.png`. It prints one line of JSON with the sheet's path and its peak parts, draw calls, and triangles. A faction without a model for the subject draws boxes.

The sheet's columns are moments after the event: 0.02, 0.06, 0.12, and 0.25 seconds for a shot, and 0.05, 0.3, 0.8, and 2 seconds for a death. The top row is at desktop pixel size and the bottom row at phone pixel size. A shot sheet frames the red shooter on the left and the blue target on the right. A death sheet centers on the blue target, closer for a bigger one, and removes it as the effect plays, with the red one of the same kind to its left for scale. The sheet steps a fixed clock at 60 frames a second, so the same settings draw the same sheet. There is no night sheet until themes light the renderer.
