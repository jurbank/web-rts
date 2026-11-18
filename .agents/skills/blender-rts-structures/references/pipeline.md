# Web RTS Blender pipeline

## Locations

Paths are relative to the repo root.

| Location                                               | Contents                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `art/blender/library/structures/<asset-id>.blend`      | Editable building and structure sources                         |
| `art/blender/library/units/<asset-id>.blend`           | Future unit sources                                             |
| `art/blender/library/creatures/<asset-id>.blend`       | Future creature sources                                         |
| `art/blender/materials/city-atlas.jpg`                 | Shared city texture atlas that structures map faces onto        |
| `art/blender/materials/city-atlas.json`                | Card map: each card's pixel rectangle and what it shows         |
| `art/blender/materials/city_atlas.py`                  | Painter that generates the atlas and its card map               |
| `art/blender/gallery.blend`                            | Generated inspection scene with relative collection links       |
| `art/staging/models/structures/<asset-id>.glb`         | Individual exports for review                                   |
| `art/staging/renders/structures/<asset-id>-review.png` | Review sheet of a staged export from the game camera            |
| `apps/website/public/models/structures/<asset-id>.glb` | Approved runtime exports, served under `/models/structures/`    |

Git tracks the sources, shared materials, and approved runtime exports. It ignores the gallery, staging exports and renders, and Blender's `.blend1` backups because they are generated.

Register `art/blender/library/` once in Blender under **Preferences → File Paths → Asset Libraries** to browse all source assets. Optional Asset Browser catalogs can group entries as Structures, Units, and Creatures. Keep any catalog definition at the library root with the sources. Add unit and creature folders when their first assets exist. Their rig and animation workflows can use separate skills.

The gallery arranges linked collection instances by category. Each sits on its grid point exactly as authored, so an off-center or floating asset shows. Save a source edit and reopen the gallery to see it. Rebuild the gallery to pick up additions, removals, or renamed assets. Keep the gallery and source tree together when moving the project. The gallery is a generated review file. Save any custom review setup under a separate filename.

## Source contract

- Use lowercase kebab-case for the asset ID. The source filename stem, marked collection name, and export filename stem match. Keep the ID stable across revisions.
- Use one canonical asset per source file, with an ordinary Blender collection named after the asset ID. Put the static visual payload in that collection and its children. Keep references, cameras, lights, collision guides, and alternate states in sibling collections. Distinct damage states or rigged objects need their own explicit export scope.
- Use one Blender unit per game world unit, +Z up, and -Y as the authoring front. Put the footprint center at the source world origin and the intended ground plane at Z=0. A foundation may sink up to 0.25 units below Z=0 to meet uneven terrain. Export allows the bounds center to drift 10% of the width or depth for overhangs. Keep the collection instance offset at zero. The GLB exporter converts to +Y up and the front becomes +Z, which faces the game camera.
- Keep the model positioned at that anchor in the source. Clear accidental transforms and use deliberate local pivots for parts that need them. Check the dimensions against the actual gameplay footprint, including visual overhangs. Navigation and placement remain scenario data.
- Inspect evaluated geometry for missing faces, flipped normals, broken modifiers, unreadable details, and accidental internal or coincident surfaces. Keep hard-edge smoothing and bevels consistent with related assets.

## Textures and performance

Shipped structures carry image textures, as `docs/ART_DIRECTION.md` asks for painted detail. Use shared flat colors and roughness values only while blocking out. Keep material slots few and combine compatible static details when it improves the exported primitive count. A Blender mesh count alone does not capture the renderer's draw work because a mesh can have several material primitives.

### The city atlas

Structures share one texture, `art/blender/materials/city-atlas.jpg`. It holds painted cards such as office walls, garage fronts, roofs, rooftop equipment, metals, and signs. Read `city-atlas.json` instead of viewing the image: it lists each card's pixel rectangle and what it shows. Give each structure one material named `City atlas` with the image linked at `//../../materials/city-atlas.jpg`, not packed, so an atlas update reaches every source.

Map each face onto a whole card with `scripts/atlas_cards.py`. Inside Blender, add the skill's `scripts` folder to `sys.path`, then call `atlas_cards.apply(obj, {"front": "wall_office_entrance", "top": "roof_flat_large"}, default="concrete")`. It gives the object the shared material and fits the card for each side (front, back, left, right, top, bottom) to the object's extent, so text reads correctly from outside. Pass `from_above=True` for a curved roof. Model the masses as separate objects, one per surface type, so each side can take one card. For reference when mapping by hand, pixel rows count from the top, so for a card at `x`, `y` with size `w` × `h` in an atlas of `width` × `height`, U runs from `(x + 0.5) / width` to `(x + w - 0.5) / width` and V from `1 - (y + h - 0.5) / height` to `1 - (y + 0.5) / height`. Size faces so a card stretches only a little.

Reuse cards before adding any. When nothing fits, add a card at the end of the last page in `city_atlas.py`, paint it there, and run `uv run --with pillow python art/blender/materials/city_atlas.py` from the repo root. Never resize, reorder, or remove a card, because packing would move the cards that existing models point at. When the last page is full, start a new one. A new page widens the atlas, so map structures again with `atlas_cards.py` and scale the U of any structure mapped by hand. So far only the police station is mapped by hand. Pillow is needed only for this script, since signs need real font rendering. Do any other image work with the Python and numpy that ship with Blender, not a separate environment.

Use deliberate UVs and consistent texel density within the set. Use sRGB for base color and emissive maps, and non-color data for normals and metallic/roughness. Bake procedural shaders that the exporter cannot represent into glTF-compatible maps. The render command re-imports the GLB, so its renders show whether the expected images survived export. Keep authoring texture sizes separate from browser delivery sizes. Choose export sizes through visual comparison at game zoom and introduce compression only with a verified consumer path.

When evaluating an export, inspect it at target zoom and with the expected number of copies in view. Reduce invisible geometry, expensive transparency, and material fragmentation first. Add LODs when a representative scene demonstrates a need and the consumer supports them. Putting a GLB under `public/` exposes the file to the browser. Rendering it in the game requires separate integration.

## Background helper

Run from the repo root. Replace `$SKILL_DIR` with the full path to this skill directory. Use the installed Blender executable, for example `/Applications/Blender.app/Contents/MacOS/Blender` on macOS if `blender` is unavailable on PATH.

Build the gallery after your first asset is saved.

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python "$SKILL_DIR/scripts/blender_assets.py" -- gallery
```

Export a static structure by its ID.

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python "$SKILL_DIR/scripts/blender_assets.py" -- export research-lab
```

Both commands accept `--root /path/to/web-rts` after the subcommand and refuse to overwrite by default. Pass `--replace` when refreshing the intended generated output. Export uses a clean Blender process, appends the named collection, and writes a standalone GLB to staging. Its static payload allows meshes and ordinary transform empties within the collection. Export fails when the GLB has no image textures or links images outside the file. Pass `--blockout` to stage an untextured blockout. Check moving parts, animation, and non-mesh content through a purpose-built export. Copy a GLB to the runtime location only after the user approves it.

Render a staged export for review, lined up with its closest neighbors.

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python "$SKILL_DIR/scripts/blender_assets.py" -- render research-lab --with barracks,hospital
```

Render imports the staged GLB, not the source, and lights it like the game: the hemisphere light, sun, and ground color from `packages/render/src/renderer.ts`. The camera matches `packages/render/src/camera.ts`, with a 40° vertical field of view, 55° pitch, and the front facing the camera. `--with` takes neighbor IDs and uses their approved runtime exports, falling back to staged ones.

It writes `<asset-id>-review.png`, a single 1400-pixel-wide sheet for review:

- Top left: a close view for checking texture detail.
- Top right: the lineup, with the asset first and the neighbors to its right in the order given.
- Bottom left: a crop of the desktop view (1920×1080) at true pixel size.
- Bottom right: a crop of the phone view (844×390, a landscape phone in CSS pixels) at true pixel size.

Desktop and phone use the same camera distance, 30 units by default, so the two crops show how many fewer pixels the building gets on a phone. Pass `--distance` to try other zoom levels. The full `close`, `desktop`, and `phone` renders sit beside the sheet for a closer look. Review from the sheet. Each render replaces the previous one. The renders approximate the game's look. The real check is the game, once it loads models.
