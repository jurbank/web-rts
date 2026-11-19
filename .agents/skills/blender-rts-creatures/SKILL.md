---
name: blender-rts-creatures
description: Create or revise original RTS models with a skeleton in Blender, such as infantry, animals, monsters, aliens, and walking mechs, for a named theme (a map's look) or faction (one side's look). Model, texture with the set's atlas, rig, and animate the idle, move, attack, and die clips, bake them into vertex frames, export web-ready GLBs, and review them in renders and clip sheets from the game camera. Use for creature and infantry blockouts, rigging, weights, animation clips, sockets, and export. Not for rigid buildings or vehicles, or for effects.
---

# Blender RTS creatures

This skill makes models that move on a skeleton: **infantry**, a side's foot units whatever they are made of, and **creatures**, animals and monsters that are not a side's soldiers, such as a theme's wildlife or a neutral camp. Pass `--kind infantry` or `--kind creatures`. Rigid buildings and vehicles belong to the `blender-rts-models` skill, which this one builds on. A walking mech is both: its legs are a creature, and an upper body that turns on its own is a named rigid part, which the game does not support yet, so ask the user first.

The game never plays a skeleton. The export bakes each clip into vertex frames, which the game plays on the GPU so a crowd stays cheap on a phone. `docs/ADRs.md` records why, under "Creatures play baked vertex frames on the GPU".

Every model belongs to one set, a theme or a faction, and the set file decides its look. Read `docs/ART_DIRECTION.md`, including its Units section, and the set's file, `docs/themes/<theme>.md` or `docs/factions/<faction>.md`. Take the type's row from its Unit types table. If the set has no file, or no row for the type, write it with the user before modeling. Read the rigid models skill's [pipeline](../blender-rts-models/references/pipeline.md) for the library, atlases, the source contract, and the review renders, then [the creature pipeline](references/pipeline.md) for what differs. Resolve paths from the web-rts workspace root. For a revision, open the existing source first and keep its asset ID, bone names, sockets, and intentional dimensions.

## Build the creature

1. Establish the type, its definition's `radius` and `speed`, its front, its weapon, and which optional clips it needs: `gather` for a worker, `cast` for an ability user, `build` for a builder.
2. Take the type's row from the set file and pick neighbors from the same set and kind, plus a building such as the barracks that trains it, to check scale. When the set has no approved creatures yet, build one at a time and treat the look as provisional until the user approves it.
3. Block out the body as a few masses, one per part that bends: torso, head, upper and lower limbs, weapon. Exaggerate what reads from above, such as shoulders, a helmet, a weapon held forward, or a tail. Stand it on Z=0 facing -Y, centered on the origin, in a pose that reads as the idle stance.
4. Texture each part with the set's atlas, as the rigid pipeline describes. Map each part onto a card with `atlas_cards.apply`, swap the team part's material for one named `team`, and join every part into one mesh with `atlas_cards.join`. Painted detail replaces modeled detail.
5. Rig it with an armature whose origin and `root` bone sit at the world origin. Name bones in lowercase kebab-case with `-l` and `-r` for sides, such as `upper-arm-l`. Weight each part fully to its bone, and blend weights only where cloth or skin bends. Skin the mesh with an Armature modifier, and parent each socket empty, such as `muzzle`, to the bone it moves with.
6. Animate one action per clip, named `idle`, `move`, `attack`, `die`, and any optional ones, keying only the rig's pose bones. Read the clip rules in [the creature pipeline](references/pipeline.md). Mark each action with a fake user so it saves.
7. Export with `--blockout` while clips are missing, and render to check the silhouette and the clip sheet. Export without it once every required clip exists. The export fails on a missing clip or stride, a loop that pops, a move that travels, a pose below the ground, more triangles or baked frames than the budget allows, or, as for vehicles, missing textures, glow, or team material. Report its summary: size, triangles and share of the budget, vertices, clips, frame memory, and sockets.
8. Render the export next to its neighbors, by day and by night for a faction, and have the sheets reviewed as [the review guide](../blender-rts-models/references/review.md) describes, sending the clip sheets too. Fix, export, render, and review again until the verdict is ship.
9. Rebuild the gallery with the rigid skill's helper after adding, removing, or renaming a source.
10. Deliver the review sheet, the clip sheet, and the export summary, and leave the GLB in staging. Copy it to `apps/website/public/models/<kind>/<themes|factions>/<set>/` only when the user approves it.

Keep facing, clip choice, playback speed, and death fades in `render`, and damage timing in `sim`. Clip, bone, and socket names never appear in game data.
