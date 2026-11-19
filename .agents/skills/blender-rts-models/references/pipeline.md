# Web RTS Blender pipeline

## Locations

Paths are relative to the repo root.

A model belongs to one set: a theme, the look of a map, or a faction, the complete look of one side. `<set>` below is `themes/<theme>` or `factions/<faction>`. `<kind>` is `structures` or `vehicles`.

| Location                                                 | Contents                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `art/blender/library/<kind>/<set>/<asset-id>.blend`      | Editable model sources                                                              |
| `art/blender/materials/<set>/atlas.jpg`                  | A set's texture atlas that its models map faces onto                                |
| `art/blender/materials/<set>/atlas-glow.jpg`             | The set's glow map, for sets that glow                                              |
| `art/blender/materials/<set>/atlas-surface.jpg`          | The set's roughness (green) and metallic (blue) map, for sets with their own finish |
| `art/blender/materials/<set>/atlas.json`                 | Card map and tool settings: each card's rectangle, review lighting, glow, surface   |
| `art/blender/materials/city_atlas.py`                    | Painter that generates every set's atlas, glow, surface, and card maps              |
| `docs/themes/<theme>.md`, `docs/factions/<faction>.md`   | The set's look: shapes, palette, surfaces, glow, signage, building and unit types   |
| `art/blender/gallery.blend`                              | Generated inspection scene with relative collection links                           |
| `art/staging/models/<kind>/<set>/<asset-id>.glb`         | Individual exports for review                                                       |
| `art/staging/renders/<kind>/<set>/<asset-id>-review.png` | Review sheet of a staged export from the game camera                                |
| `apps/website/public/models/<kind>/<set>/<asset-id>.glb` | Approved runtime exports, served under `/models/<kind>/<set>/`                      |

Git tracks the sources, shared materials, and approved runtime exports. It ignores the gallery, staging exports and renders, and Blender's `.blend1` backups because they are generated.

Register `art/blender/library/` once in Blender under **Preferences → File Paths → Asset Libraries** to browse all source assets. Optional Asset Browser catalogs can group entries by kind. Keep any catalog definition at the library root with the sources. Models with a skeleton sit beside them in `infantry/` and `creatures/`, and export with the `blender-rts-creatures` skill. The gallery shows every kind.

The gallery arranges linked collection instances by kind and set. Each sits on its grid point exactly as authored, so an off-center or floating asset shows. Save a source edit and reopen the gallery to see it. Rebuild the gallery to pick up additions, removals, or renamed assets. Keep the gallery and source tree together when moving the project. The gallery is a generated review file. Save any custom review setup under a separate filename.

## Source contract

- Use lowercase kebab-case for the asset ID. The source filename stem, marked collection name, and export filename stem match. Keep the ID stable across revisions.
- Within each set, use one canonical asset per source file, with an ordinary Blender collection named after the asset ID. Put the static visual payload in that collection and its children. Keep references, cameras, lights, collision guides, and alternate states in sibling collections. Distinct damage states or rigged objects need their own explicit export scope.
- Use one Blender unit per game world unit, +Z up, and -Y as the authoring front. Put the footprint center at the source world origin and the intended ground plane at Z=0. A foundation may sink up to 0.25 units below Z=0 to meet uneven terrain. Export allows the bounds center to drift 10% of the width or depth for overhangs. Keep the collection instance offset at zero. The GLB exporter converts to +Y up and the front becomes +Z, which faces the game camera.
- A vehicle's hull is its root mesh. Each moving part is a child mesh, and each socket an empty, named in lowercase kebab-case, since the game finds them by name. Export keeps the hierarchy and each object's origin, which is the part's pivot. The skill lists the names and axes.
- Keep the model positioned at that anchor in the source. Clear accidental transforms and use deliberate local pivots for parts that need them. Check the dimensions against the actual gameplay footprint, including visual overhangs. Navigation and placement remain scenario data.
- Inspect evaluated geometry for missing faces, flipped normals, broken modifiers, unreadable details, and accidental internal or coincident surfaces. Keep hard-edge smoothing and bevels consistent with related assets.

## Textures and performance

Shipped models carry image textures, as `docs/ART_DIRECTION.md` asks for painted detail. Use shared flat colors and roughness values only while blocking out. Keep material slots few and combine compatible static details when it improves the exported primitive count. Once every part is mapped, `atlas_cards.join(objects, "<asset-id>", faction=...)` joins them into one mesh and keeps each face's card, so the building exports as one primitive and `refresh` still works. For a vehicle, join each moving part's pieces under that part's name instead. Its team piece is mapped like the rest, so `join` accepts it. Swap its material for one named `team` after mapping and before joining, since `apply` replaces the materials. `join` and `refresh` keep the slot. A Blender mesh count alone does not capture the renderer's draw work because a mesh can have several material primitives.

### Budgets

Each kind has a provisional triangle budget, set by how many copies of it a phone shows at once in the busiest view: a 6v6 zoomed out, with about 300 infantry, 60 vehicles, and 80 buildings, near 620,000 triangles in all. The export reports each model's share and fails over budget.

| Kind                   | Triangles |
| ---------------------- | --------- |
| Infantry and creatures | 1,000     |
| Vehicles               | 2,000     |
| Structures             | 2,500     |
| Heroes, with `--hero`  | 4,000     |

A hero is a model only a few of which take the field, such as a MOBA hero or a boss monster. Pass `--over-budget "<reason>"` to export a model over its budget on purpose. The summary records the reason, so pass it only when the user agrees. Spend triangles where they change the silhouette from the game camera: on a unit a few dozen pixels tall, a 14-sided sphere looks like an 8-sided one. Cut segments on small parts first, then leave out faces nobody sees, such as caps inside joints. A Decimate modifier in the source keeps the full mesh editable, since the export applies modifiers, and its Planar mode with UVs delimited keeps each card's faces apart. The export also reports the vertex count after the exporter splits vertices at UV seams and hard edges, and the primitive count, one draw call each. These numbers are guesses until a stress scene runs on a real phone, as `docs/ARCHITECTURE.md` asks.

### Set atlases

Each set's structures share one texture, `art/blender/materials/<set>/atlas.jpg`. It holds painted cards such as walls, roofs, rooftop equipment, metals, and signs. Every theme's atlas carries the theme-neutral base cards, such as rooftop equipment and dark metal, plus its own. A faction's atlas holds only its own cards. Read `atlas.json` instead of viewing the image: it lists each card's pixel rectangle and what it shows, plus the set's review lighting, glow map, and surface map. A set that glows also has `atlas-glow.jpg`, black except where cards glow, which the exporter writes as an emissive texture. A set with its own finish also has `atlas-surface.jpg`, with roughness in green and metallic in blue, which the exporter writes as a metallic-roughness texture. Sets without one share a matte finish.

Map each face onto a whole card with `scripts/atlas_cards.py`. Save the new source to its library path first, so the atlas images link with relative paths. Inside Blender, add the skill's `scripts` folder to `sys.path`, then call `atlas_cards.apply(obj, {"front": "wall_office_entrance", "top": "roof_flat_large"}, default="concrete", theme="modern")`, or pass `faction="advanced-utopian"` instead of `theme=`. It gives the object the set's material, with its glow and surface maps when the set has them, and fits the card for each side (front, back, left, right, top, bottom) to the object's extent, so text reads correctly from outside. Pass `from_above=True` for a curved roof. Model the masses as separate objects, one per surface type, so each side can take one card. Model rounded edges as geometry rather than with a bevel modifier where the faces on either side take different cards, since the bevel blends their UVs and smears unrelated cards across the edge. For reference when mapping by hand, pixel rows count from the top, so for a card at `x`, `y` with size `w` × `h` in an atlas of `width` × `height`, U runs from `(x + 0.5) / width` to `(x + w - 0.5) / width` and V from `1 - (y + h - 0.5) / height` to `1 - (y + 0.5) / height`. Size faces so a card stretches only a little. `apply` records the card each face uses. After the atlas is repainted, call `atlas_cards.refresh(obj, theme=...)` or `refresh(obj, faction=...)` on each mesh to fit its UVs to the cards' new positions.

Reuse cards before adding any. When nothing fits, define the card in `CARDS` in `city_atlas.py`, paint it there, add it to its set's list in `THEMES` or `FACTIONS`, and run `uv run --with pillow python art/blender/materials/city_atlas.py` from the repo root. Paint its glow with the `gd` drawing beside the color, and its finish with the `rd` drawing on the surface map. Start a faction's card names with its faction ID, such as `advanced_utopian_emblem`, since `CARDS` is shared. Cards pack onto 2048-pixel pages in list order, so adding one can move others, and a new page widens the atlas. Refresh every source in that set afterward, then export again. List a faction's cards tallest first so they pack tightly. Add a new set to `THEMES` or `FACTIONS` with its settings, next to its file in `docs/`. Pillow is needed only for this script, since signs need real font rendering. Do any other image work with the Python and numpy that ship with Blender, not a separate environment.

Use deliberate UVs and consistent texel density within the set. Use sRGB for base color and emissive maps, and non-color data for normals and metallic/roughness. Bake procedural shaders that the exporter cannot represent into glTF-compatible maps. The render command re-imports the GLB, so its renders show whether the expected images survived export. Keep authoring texture sizes separate from browser delivery sizes. Choose export sizes through visual comparison at game zoom and introduce compression only with a verified consumer path.

When evaluating an export, inspect it at target zoom and with the expected number of copies in view. Reduce invisible geometry, expensive transparency, and material fragmentation first. Add LODs when a representative scene demonstrates a need and the consumer supports them. Putting a GLB under `public/` exposes the file to the browser. Rendering it in the game requires separate integration.

## Background helper

Run from the repo root. Replace `$SKILL_DIR` with the full path to this skill directory. Use the installed Blender executable, for example `/Applications/Blender.app/Contents/MacOS/Blender` on macOS if `blender` is unavailable on PATH.

Build the gallery after your first asset is saved.

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python "$SKILL_DIR/scripts/blender_assets.py" -- gallery
```

Export a model by its ID and set. Export and render require `--theme` or `--faction`, and take `--kind vehicles` for a vehicle.

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python "$SKILL_DIR/scripts/blender_assets.py" -- export science-lab --faction advanced-utopian
```

Both commands accept `--root /path/to/web-rts` after the subcommand and refuse to overwrite by default. Pass `--replace` when refreshing the intended generated output. Export uses a clean Blender process, appends the named collection, and writes a standalone GLB to staging. It allows meshes and ordinary transform empties within the collection, with no animation, since the game moves a vehicle's parts itself. Export fails when the GLB has no image textures, links images outside the file, or lacks an emissive texture in a set that glows. A vehicle's export also fails without a `team` material or with an object not named in kebab-case, and its summary lists the moving parts and sockets. Pass `--blockout` to stage an untextured blockout. Copy a GLB to the runtime location only after the user approves it.

Render a staged export for review, lined up with its closest neighbors.

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python "$SKILL_DIR/scripts/blender_assets.py" -- render research-lab --theme modern --with barracks,hospital
blender --background --factory-startup --python-exit-code 1 \
  --python "$SKILL_DIR/scripts/blender_assets.py" -- render scrap-tank --faction toxic-industrial --kind vehicles \
  --with flame-crawler,structures:war-factory
```

Render imports the staged GLB, not the source, and lights it with the set's review lighting from its `atlas.json`, or with `--lighting day` or `--lighting night`. `day` mirrors the game's hemisphere light, sun, and ground color from `packages/render/src/renderer.ts`. `night` uses a dark blue sky and a dim moon, so glow carries the read. A faction can stand on any map, so render it both ways. A lighting other than the set's default writes `<asset-id>-<lighting>-review.png` beside the default sheet. The game itself renders daylight until the renderer gains theme lighting. The camera matches `packages/render/src/camera.ts`, with a 40° vertical field of view, 55° pitch, and the front facing the camera. `--with` takes neighbor IDs in the selected kind and set and uses their approved runtime exports, falling back to staged ones. Line up models from the same set. A `theme/id` or `factions/<faction>/id` reference reaches another set, for comparing scale only. A kind before a colon reaches another kind, as in `structures:war-factory`. Vehicles drive in every direction, so the render turns each vehicle 35° to show its side as well as its front. It also shows the `team` material multiplied by a sample blue, as the game multiplies it by the player's color.

It writes `<asset-id>-review.png`, a single 1400-pixel-wide sheet for review:

- Top left: a close view for checking texture detail.
- Top right: the lineup, with the asset first and the neighbors to its right in the order given.
- Bottom left: a crop of the desktop view (1920×1080) at true pixel size.
- Bottom right: a crop of the phone view (844×390, a landscape phone in CSS pixels) at true pixel size.

Desktop and phone use the same camera distance, 30 units by default, so the two crops show how many fewer pixels the model gets on a phone. Pass `--distance` to try other zoom levels. The full `close`, `desktop`, and `phone` renders sit beside the sheet for a closer look. Review from the sheet. Each render replaces the previous one. The renders approximate the game's look. The real check is the game, once it loads models.
