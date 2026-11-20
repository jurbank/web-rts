---
name: rts-effects
description: Create or revise RTS visual effects in the game's renderer, such as muzzle flashes, tracers, lasers, lightning arcs, missile thrust and trails, impacts, explosions, debris, smoke, and scorch marks, for a kind of shot or death, generic or a faction's own. Write recipes on the effect building blocks, add a block when none fits, look at them in the effects gallery, and review sheets captured at desktop and phone size. Use for new effects and for tuning an effect's look, timing, or cost. Not for models, rigs, or clips, which belong to the Blender skills, or for gameplay such as travel time, splash, or chaining, which belongs in `sim`.
---

# RTS effects

An effect is drawing. It plays when `render` receives a `fired` or `died` event, and it never changes an outcome. Read the ADR "Effects are render recipes, and sim announces shots" in `docs/ADRs.md` for the rules this skill follows: what belongs in `sim`, what each player may see under fog, the budgets, and why every device draws every shot. Read the Effects section of `docs/ART_DIRECTION.md`, and for a faction's effect, the Effects section of `docs/factions/<faction>.md`. If the faction file has no Effects section, or it says nothing about this kind of effect, write it with the user first. If the request changes when damage lands, who it hits, or adds a projectile in flight, a splash, or a chain, stop and tell the user. That is a `sim` mechanism that needs its own ADR and the multiplayer-guardian. Read [the pipeline](references/pipeline.md) for the recipe format, the blocks, the anchors, the budgets, and the capture script. Resolve paths from the web-rts workspace root.

## Make the effect

1. Establish the kind of effect and its subjects. A shot kind, such as `bullet`, `laser`, or `melee`, plays from the attacker's muzzle to the target. A death kind, such as `unit-death`, `vehicle-death`, or `building-death`, plays where something fell. Name the subjects it must suit: soldier, tank, or war factory in the gallery. Say what a viewer may not see: a shot from a hidden attacker has no origin, and one at a hidden target has a direction instead of a target. The recipe must still look right with either end missing.
2. Choose the blocks from the pipeline's table. Put what tells the event, such as a flash, a tracer, a beam, or a fireball, in core blocks, and dress it with decoration, such as sparks, smoke, debris, and scorch. Decoration is what gives way when a budget fills, so an effect must still read with its decoration gone.
3. For a new kind, write its generic recipe in `packages/render/src/effects/recipes.ts`, and add a shot kind to `SHOT_KINDS`, so the gallery and the editor's Shot field offer it. Start from the closest existing recipe. Size it for its `radius`, keep flashes under half a second, and keep a generic recipe neutral, so it fits any faction. For a faction's look, change its style in `apps/website/src/factionEffects.ts`, taking colors and shapes from the faction file. A style redraws every kind, so check the faction's other kinds still read after a change.
4. When no block can draw the effect, such as a ribbon trail or a heat shimmer, add one in `blocks.ts` and `effects.ts`, as the pipeline describes, and record it in the ADR's list of blocks. Then run the architecture-guardian.
5. Look at it in the gallery. Start the `website` dev server from `.claude/launch.json` and open `#effects`, or press Effects in the editor. Pick the faction, the effect, and each subject, and use Slow. Fix what is obviously wrong before capturing.
6. Capture a sheet for each subject the effect suits with `scripts/capture.mjs`, as the pipeline shows. Each sheet shows four moments after the event at desktop and phone pixel size, with the effect's peak parts, slots, draw calls, and triangles. Compare the peaks with the pipeline's per-effect limits.
7. Have the sheets reviewed as below. Fix what the review marks serious, capture again, and review again.
8. Run `vp check` and `vp test`. Run the multiplayer-guardian when the change reads anything new from events or snapshots, or changes budgets, timing, or what is decoration.
9. Deliver the sheets, the peaks, and what changed. Effects are code, so nothing is copied into the game. Commit only when the user asks.

## Review

The builder of an effect tends to approve it, so a fresh reviewer judges it. Start the `effects-reviewer` agent (`.agents/agents/effects-reviewer.md`). It holds the questions and the report format, can only read, and reads everything in one turn. Where the environment has no agent types but can start a subagent, give a fresh subagent that file's text as its instructions. Where neither is possible, answer its questions yourself and show the sheets to the user.

Give it the sheet paths, the effect's name and kind, the faction or `generic`, each sheet's peaks from the capture output, and any deliberate choices it should not reverse. Review up to four sheets of one effect per call, or one sheet each of up to four effects of one faction. Run at most two rounds. After the second, fix the cheap minor points, check the sheets yourself, and hand any open points to the user.

## Rules

- Draw only from what the viewer's events and snapshot hold. Never draw from a field fog keeps private, such as production, even to decorate.
- Use the seeded `random` the effects system passes, never `Math.random`, so every device spawns a shot the same.
- No light sources. A flash lights the ground with a `light` decal.
- Smoke and scorch use the shade batch, which draws before every model, so they never hide a unit's body. Do not draw darkening parts any other way.
- A part shorter than a frame still draws once, so keep the first moment of every core part readable. That is what a phone at 15 frames a second shows.
