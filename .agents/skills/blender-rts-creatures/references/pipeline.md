# Creature pipeline

What differs from the [rigid models pipeline](../../blender-rts-models/references/pipeline.md), which covers the library, set atlases, cards, and review renders. `<kind>` is `infantry` or `creatures`, and `<set>` is `themes/<theme>` or `factions/<faction>`.

| Location                                                 | Contents                                        |
| -------------------------------------------------------- | ----------------------------------------------- |
| `art/blender/library/<kind>/<set>/<asset-id>.blend`      | Editable sources: mesh, rig, sockets, and clips |
| `art/staging/models/<kind>/<set>/<asset-id>.glb`         | Baked exports for review                        |
| `art/staging/renders/<kind>/<set>/<asset-id>-review.png` | Review sheet in the first idle pose             |
| `art/staging/renders/<kind>/<set>/<asset-id>-clips.png`  | Clip sheet: a row per clip, four poses across   |
| `apps/website/public/models/<kind>/<set>/<asset-id>.glb` | Approved runtime exports                        |

## Source contract

- The asset collection, named after the asset ID and marked as an Asset, holds one armature, one mesh skinned to it with an Armature modifier, and socket empties. Keep references, spare meshes, and experiments in sibling collections.
- The rig's origin sits at the world origin, the footprint's center. The first `idle` pose stands on Z=0 and faces -Y, and no pose sinks more than 0.25 units below the ground.
- Keep topology fixed while clips play. For a hard edge, split the geometry, or put an Edge Split modifier before the Armature modifier. The game bakes one normal per vertex, so custom split normals do not survive.
- A socket is an empty parented to a bone, named in kebab-case: `muzzle` at a weapon's end, numbered `muzzle-2` and up, and others such as `hand-r` or `mouth` where effects attach.
- Author at any scene frame rate. The export samples each action's frame range in seconds.
- Record the definition's radius as the asset collection's custom property `radius`, as for rigid models. The export writes it into the GLB scene's extras.

## Clips

| Clip     | Required | Plays | Rules                                                                                                   |
| -------- | -------- | ----- | ------------------------------------------------------------------------------------------------------- |
| `idle`   | Yes      | Loop  | A subtle breath or shift of weight. Its first pose is the export's static pose and the review pose.     |
| `move`   | Yes      | Loop  | One full cycle, in place, since the game moves the unit. Its `stride` property is the ground it covers. |
| `attack` | Yes      | Once  | The shot or blow lands within 0.1 seconds of its start, since the game learns of it a tick ahead.       |
| `die`    | Yes      | Once  | Ends at rest on the ground. The game holds the last pose, then fades it.                                |
| `gather` | No       | Loop  | For workers.                                                                                            |
| `cast`   | No       | Once  | For units with abilities.                                                                               |
| `build`  | No       | Loop  | For builders.                                                                                           |

A creature bakes at most 100 frames over all its clips, five seconds at 20 a second, and at most the triangles of its kind's budget in the [rigid pipeline](../../blender-rts-models/references/pipeline.md#budgets). Keep idle near a second and move to one cycle, and spend the rest on attack and die. A loop's last frame repeats its first, and the export checks they match within 3% of the creature's height. Key every bone a clip moves at its start and end. The export resets the pose to rest before each clip, so a bone a clip leaves unkeyed stands at rest. Give the `move` action a custom property `stride`, in units, the distance the feet cover in one cycle, so the game plays the cycle at `speed / stride` cycles a second and the feet don't slide. Keep motion readable from above at a few dozen pixels: big arcs of the arms and weapon, a clear lean, and a fall that changes the silhouette.

## Frames in the GLB

The export poses the mesh in its first `idle` pose and writes it as an ordinary mesh with the set's atlas, so any viewer shows the creature standing. It adds a float vertex attribute `_VERTEX`, the baked vertex each glTF vertex plays, and the baked frames in the binary chunk. The mesh node's `extras.frames` describes them:

```json
{
  "attribute": "_VERTEX",
  "rate": 20,
  "vertices": 882,
  "positions": 7,
  "normals": 8,
  "clips": {
    "idle": { "start": 0, "frames": 20, "loop": true },
    "move": { "start": 20, "frames": 13, "loop": true, "stride": 1.2 }
  },
  "sockets": { "muzzle": 9 }
}
```

`positions` and `normals` name buffer views of little-endian half floats, frames × vertices × 4, in glTF model space with the fourth value zero. Row `start + i` of a clip is its pose `i / rate` seconds in. A loop leaves out its closing frame. Each socket names a buffer view of little-endian 32-bit floats, frames × 3, in the same space. `render` replaces each vertex's position and normal with its baked vertex's, so the static mesh is only a fallback.

## Background helper

Run from the repo root. `$SKILL_DIR` is this skill's directory, and the helper imports the rigid skill's `blender_assets.py` from its sibling folder.

Export a creature by its ID, set, and kind. `--blockout` allows missing clips, textures, and team color, and bakes the current pose as a one-frame `idle` when there are no clips.

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python "$SKILL_DIR/scripts/creature_assets.py" -- export soldier --faction toxic-industrial --kind infantry
```

Render the review sheet and the clip sheet of a staged export. `--with`, `--lighting`, and `--distance` work as for rigid models, and a kind before a colon reaches another kind, as in `structures:barracks`.

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python "$SKILL_DIR/scripts/creature_assets.py" -- render soldier --faction toxic-industrial --kind infantry \
  --with structures:barracks
```

The review sheet shows the static pose, turned 35° as units are, with the team material in a sample blue. The clip sheet poses the imported GLB from its baked frames and normals, so it shows what the game will play. Each row is a clip in the order of the table above, skipping clips the creature lacks. A loop shows its cycle at quarters, and a one-shot its start, its end, and two poses between. Magenta dots mark the sockets. A lighting other than the set's default writes `<asset-id>-<lighting>-clips.png`.
