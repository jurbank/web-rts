# Web RTS Blender pipeline

## Locations

Paths are relative to the repo root.

| Location                                                              | Contents                                                                    |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `art/blender/library/structures/themes/<theme>/<asset-id>.blend`      | Editable building and structure sources                                     |
| `art/blender/library/units/<asset-id>.blend`                          | Future unit sources                                                         |
| `art/blender/library/creatures/<asset-id>.blend`                      | Future creature sources                                                     |
| `art/blender/materials/themes/<theme>/atlas.jpg`                      | A theme's texture atlas that its structures map faces onto                  |
| `art/blender/materials/themes/<theme>/atlas-glow.jpg`                 | The theme's glow map, for themes that glow                                  |
| `art/blender/materials/themes/<theme>/atlas.json`                     | Card map and tool settings: each card's rectangle, review lighting, glow    |
| `art/blender/materials/city_atlas.py`                                 | Painter that generates every theme's atlas, glow map, and card map          |
| `docs/themes/<theme>.md`                                              | The theme's look: shapes, palette, glow, signage, building types            |
| `art/blender/gallery.blend`                                           | Generated inspection scene with relative collection links                   |
| `art/staging/models/structures/themes/<theme>/<asset-id>.glb`         | Individual exports for review                                               |
| `art/staging/renders/structures/themes/<theme>/<asset-id>-review.png` | Review sheet of a staged export from the game camera                        |
| `apps/website/public/models/structures/themes/<theme>/<asset-id>.glb` | Approved runtime exports, served under `/models/structures/themes/<theme>/` |

Git tracks the sources, shared materials, and approved runtime exports. It ignores the gallery, staging exports and renders, and Blender's `.blend1` backups because they are generated.

Register `art/blender/library/` once in Blender under **Preferences → File Paths → Asset Libraries** to browse all source assets. Optional Asset Browser catalogs can group entries as Structures, Units, and Creatures. Keep any catalog definition at the library root with the sources. Add unit and creature folders when their first assets exist. Their rig and animation workflows can use separate skills.

The gallery arranges linked collection instances by category and structure theme. Each sits on its grid point exactly as authored, so an off-center or floating asset shows. Save a source edit and reopen the gallery to see it. Rebuild the gallery to pick up additions, removals, or renamed assets. Keep the gallery and source tree together when moving the project. The gallery is a generated review file. Save any custom review setup under a separate filename.

## Source contract

- Use lowercase kebab-case for the asset ID. The source filename stem, marked collection name, and export filename stem match. Keep the ID stable across revisions.
- Within each theme, use one canonical asset per source file, with an ordinary Blender collection named after the asset ID. Put the static visual payload in that collection and its children. Keep references, cameras, lights, collision guides, and alternate states in sibling collections. Distinct damage states or rigged objects need their own explicit export scope.
- Use one Blender unit per game world unit, +Z up, and -Y as the authoring front. Put the footprint center at the source world origin and the intended ground plane at Z=0. A foundation may sink up to 0.25 units below Z=0 to meet uneven terrain. Export allows the bounds center to drift 10% of the width or depth for overhangs. Keep the collection instance offset at zero. The GLB exporter converts to +Y up and the front becomes +Z, which faces the game camera.
- Keep the model positioned at that anchor in the source. Clear accidental transforms and use deliberate local pivots for parts that need them. Check the dimensions against the actual gameplay footprint, including visual overhangs. Navigation and placement remain scenario data.
- Inspect evaluated geometry for missing faces, flipped normals, broken modifiers, unreadable details, and accidental internal or coincident surfaces. Keep hard-edge smoothing and bevels consistent with related assets.

## Textures and performance

Shipped structures carry image textures, as `docs/ART_DIRECTION.md` asks for painted detail. Use shared flat colors and roughness values only while blocking out. Keep material slots few and combine compatible static details when it improves the exported primitive count. A Blender mesh count alone does not capture the renderer's draw work because a mesh can have several material primitives.

### Theme atlases

Each theme's structures share one texture, `art/blender/materials/themes/<theme>/atlas.jpg`. It holds painted cards such as walls, roofs, rooftop equipment, metals, and signs. Every theme's atlas carries the theme-neutral base cards, such as rooftop equipment and dark metal, plus its own. Read `atlas.json` instead of viewing the image: it lists each card's pixel rectangle and what it shows, plus the theme's review lighting and glow map. A theme that glows also has `atlas-glow.jpg`, black except where cards glow. The exporter writes it as an emissive texture.

Map each face onto a whole card with `scripts/atlas_cards.py`. Save the new source to its library path first, so the atlas images link with relative paths. Inside Blender, add the skill's `scripts` folder to `sys.path`, then call `atlas_cards.apply(obj, {"front": "wall_office_entrance", "top": "roof_flat_large"}, default="concrete", theme="modern")`. It gives the object the theme's material, with the glow map for a theme that glows, and fits the card for each side (front, back, left, right, top, bottom) to the object's extent, so text reads correctly from outside. Pass `from_above=True` for a curved roof. Model the masses as separate objects, one per surface type, so each side can take one card. For reference when mapping by hand, pixel rows count from the top, so for a card at `x`, `y` with size `w` × `h` in an atlas of `width` × `height`, U runs from `(x + 0.5) / width` to `(x + w - 0.5) / width` and V from `1 - (y + h - 0.5) / height` to `1 - (y + 0.5) / height`. Size faces so a card stretches only a little. `apply` records the card each face uses. After the atlas is repainted, call `atlas_cards.refresh(obj, theme=...)` on each mesh to fit its UVs to the cards' new positions.

Reuse cards before adding any. When nothing fits, define the card in `CARDS` in `city_atlas.py`, paint it there, add it to its theme's list in `THEMES`, and run `uv run --with pillow python art/blender/materials/city_atlas.py` from the repo root. Paint its glow with the `gd` drawing beside the color. Cards pack onto 2048-pixel pages in list order, so adding one can move others. Refresh every source in that theme afterward, then export again. Add a new theme to `THEMES` with its lighting and glow settings, next to its `docs/themes/<theme>.md`. Pillow is needed only for this script, since signs need real font rendering. Do any other image work with the Python and numpy that ship with Blender, not a separate environment.

Use deliberate UVs and consistent texel density within the set. Use sRGB for base color and emissive maps, and non-color data for normals and metallic/roughness. Bake procedural shaders that the exporter cannot represent into glTF-compatible maps. The render command re-imports the GLB, so its renders show whether the expected images survived export. Keep authoring texture sizes separate from browser delivery sizes. Choose export sizes through visual comparison at game zoom and introduce compression only with a verified consumer path.

When evaluating an export, inspect it at target zoom and with the expected number of copies in view. Reduce invisible geometry, expensive transparency, and material fragmentation first. Add LODs when a representative scene demonstrates a need and the consumer supports them. Putting a GLB under `public/` exposes the file to the browser. Rendering it in the game requires separate integration.

## Background helper

Run from the repo root. Replace `$SKILL_DIR` with the full path to this skill directory. Use the installed Blender executable, for example `/Applications/Blender.app/Contents/MacOS/Blender` on macOS if `blender` is unavailable on PATH.

Build the gallery after your first asset is saved.

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python "$SKILL_DIR/scripts/blender_assets.py" -- gallery
```

Export a static structure by its ID and theme. Export and render require `--theme`.

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python "$SKILL_DIR/scripts/blender_assets.py" -- export research-lab --theme cyberpunk
```

Both commands accept `--root /path/to/web-rts` after the subcommand and refuse to overwrite by default. Pass `--replace` when refreshing the intended generated output. Export uses a clean Blender process, appends the named collection, and writes a standalone GLB to staging. Its static payload allows meshes and ordinary transform empties within the collection. Export fails when the GLB has no image textures, links images outside the file, or lacks an emissive texture in a theme that glows. Pass `--blockout` to stage an untextured blockout. Check moving parts, animation, and non-mesh content through a purpose-built export. Copy a GLB to the runtime location only after the user approves it.

Render a staged export for review, lined up with its closest neighbors.

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python "$SKILL_DIR/scripts/blender_assets.py" -- render research-lab --theme modern --with barracks,hospital
```

Render imports the staged GLB, not the source, and lights it with the theme's review lighting from its `atlas.json`. `day` mirrors the game's hemisphere light, sun, and ground color from `packages/render/src/renderer.ts`. `night` uses a dark blue sky and a dim moon, so glow carries the read. The game itself renders daylight until the renderer gains theme lighting. The camera matches `packages/render/src/camera.ts`, with a 40° vertical field of view, 55° pitch, and the front facing the camera. `--with` takes neighbor IDs in the selected theme and uses their approved runtime exports, falling back to staged ones. Line up only buildings from the same theme. A `theme/id` reference reaches another theme, for comparing scale only.

It writes `<asset-id>-review.png`, a single 1400-pixel-wide sheet for review:

- Top left: a close view for checking texture detail.
- Top right: the lineup, with the asset first and the neighbors to its right in the order given.
- Bottom left: a crop of the desktop view (1920×1080) at true pixel size.
- Bottom right: a crop of the phone view (844×390, a landscape phone in CSS pixels) at true pixel size.

Desktop and phone use the same camera distance, 30 units by default, so the two crops show how many fewer pixels the building gets on a phone. Pass `--distance` to try other zoom levels. The full `close`, `desktop`, and `phone` renders sit beside the sheet for a closer look. Review from the sheet. Each render replaces the previous one. The renders approximate the game's look. The real check is the game, once it loads models.
