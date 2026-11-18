# Render review

The builder of an asset tends to approve it. Hand the review to a fresh subagent with no stake in the asset when the environment can start one. Otherwise review it yourself against every question below and show the renders to the user.

## Give the reviewer

- The review sheet, `art/staging/renders/structures/<asset-id>-review.png`, rendered with `--with` naming the closest neighbors. It comes from the exported GLB under the game's camera and lighting, so it shows what ships. Its top left is a close view and its top right a lineup with the asset first. Its bottom row holds desktop and phone crops at true pixel size. The sheet is the only image the reviewer needs.
- `docs/ART_DIRECTION.md`. Where a neighbor breaks the art direction, the art direction wins.
- The export summary line, and what the structure is for.
- For a new kind of building only, one screenshot from `docs/screen_shots/inspiration/` when that folder exists. Git ignores it, so it may be missing.

Ask for a verdict of **ship** or **revise**, then each problem with the render that shows it and a concrete fix, most serious first. Ask it not to list strengths.

## Questions

1. **Painted detail.** Are window grids, panel lines, vents, concrete, and wear painted into textures? Or are surfaces flat color, with small details modeled as geometry?
2. **Not the trendy low-poly look.** Does it read as a clean toy or diorama piece, with pastel colors, uniform rounded bevels, and no wear? That is the look `ART_DIRECTION.md` rules out.
3. **Unique.** In the lineup, does its silhouette differ from every neighbor that is not a designated variant of it? Does it use its own accent color for signs, trims, and markings, and not another type's?
4. **Roof.** In the desktop crop, does the roof alone say what the building is for?
5. **Proportions.** Does it feel heavy and believable at real-world proportions? Does it match the scale of neighboring structures?
6. **Color.** Is any surface as bright or saturated as a team color? Buildings stay neutral so team colors, selection rings, and effects stand out.
7. **Phone.** In the phone crop, does the silhouette still read? Does fine detail turn into noise?
8. **Front.** Does the entrance or main face point toward the camera?
9. **Technical.** Look for visible faceting on curves, floating or sunk geometry, shading seams, missing faces, stretched or blurry textures, and texel density that varies between parts.

Fix what the reviewer finds, export and render again, and repeat until the verdict is ship. A ship verdict hands the asset to the user. It does not approve copying it into the game.
