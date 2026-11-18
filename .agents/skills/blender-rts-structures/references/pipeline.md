# Web RTS Blender pipeline

## Locations

Paths are relative to the repo root.

| Location                                               | Contents                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `art/blender/library/structures/<asset-id>.blend`      | Editable building and structure sources                         |
| `art/blender/library/units/<asset-id>.blend`           | Future unit sources                                             |
| `art/blender/library/creatures/<asset-id>.blend`       | Future creature sources                                         |
| `art/blender/materials/`                               | Shared authoring textures and optional `shared-materials.blend` |
| `art/blender/gallery.blend`                            | Generated inspection scene with relative collection links       |
| `art/staging/models/structures/<asset-id>.glb`         | Individual exports for review                                   |
| `apps/website/public/models/structures/<asset-id>.glb` | Approved runtime exports, served under `/models/structures/`    |

Git tracks the sources, shared materials, and approved runtime exports. It ignores the gallery, staging exports, and Blender's `.blend1` backups because they are generated.

Register `art/blender/library/` once in Blender under **Preferences → File Paths → Asset Libraries** to browse all source assets. Optional Asset Browser catalogs can group entries as Structures, Units, and Creatures. Keep any catalog definition at the library root with the sources. Add unit and creature folders when their first assets exist. Their rig and animation workflows can use separate skills.

The gallery arranges linked collection instances by category. Each sits on its grid point exactly as authored, so an off-center or floating asset shows. Save a source edit and reopen the gallery to see it. Rebuild the gallery to pick up additions, removals, or renamed assets. Keep the gallery and source tree together when moving the project. The gallery is a generated review file. Save any custom review setup under a separate filename.

## Source contract

- Use lowercase kebab-case for the asset ID. The source filename stem, marked collection name, and export filename stem match. Keep the ID stable across revisions.
- Use one canonical asset per source file, with an ordinary Blender collection named after the asset ID. Put the static visual payload in that collection and its children. Keep references, cameras, lights, collision guides, and alternate states in sibling collections. Distinct damage states or rigged objects need their own explicit export scope.
- Use one Blender unit per game world unit, +Z up, and -Y as the authoring front. Put the footprint center at the source world origin and the intended ground plane at Z=0. A foundation may sink up to 0.25 units below Z=0 to meet uneven terrain. Export allows the bounds center to drift 10% of the width or depth for overhangs. Keep the collection instance offset at zero. The GLB exporter converts to +Y up and the front becomes +Z, which faces the game camera.
- Keep the model positioned at that anchor in the source. Clear accidental transforms and use deliberate local pivots for parts that need them. Check the dimensions against the actual gameplay footprint, including visual overhangs. Navigation and placement remain scenario data.
- Inspect evaluated geometry for missing faces, flipped normals, broken modifiers, unreadable details, and accidental internal or coincident surfaces. Keep hard-edge smoothing and bevels consistent with related assets.

## Textures and performance

Start with shared colors and roughness values. Keep material slots few and combine compatible static details when it improves the exported primitive count. A Blender mesh count alone does not capture the renderer's draw work because a mesh can have several material primitives.

For authored textures, keep reusable source maps under `art/blender/materials/` and use relative links or pack the images with the source. Use deliberate UVs and consistent texel density within the set. Use sRGB for base color and emissive maps, and non-color data for normals and metallic/roughness. A reusable opaque atlas or trim sheet is a good fit once several structures share the same details. Bake procedural shaders that the exporter cannot represent into glTF-compatible maps. Re-import the GLB and check that it contains and displays the expected images. Keep authoring texture sizes separate from browser delivery sizes. Choose export sizes through visual comparison at game zoom and introduce compression only with a verified consumer path.

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

Both commands accept `--root /path/to/web-rts` after the subcommand and refuse to overwrite by default. Pass `--replace` when refreshing the intended generated output. Export uses a clean Blender process, appends the named collection, and writes a standalone GLB to staging. Its static payload allows meshes and ordinary transform empties within the collection. Check moving parts, animation, and non-mesh content through a purpose-built export. Review and copy the approved GLB to the runtime location when shipping.
