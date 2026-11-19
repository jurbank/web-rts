Lower poly because it's an RTS but not the trendy "low-poly" look.

Structures come in two kinds of set. A **theme** is the look of a map: its lighting, ground, and civic buildings, such as hospitals and skyscrapers, which belong to the city whoever holds them. A **faction** is the look of one side's buildings and units, and it is complete on its own. A match has one theme, and each player picks a faction, so any faction can appear on any theme's map, the way a race in a classic RTS keeps its own look on every tileset. A theme never refers to a faction, and a faction never refers to a theme or another faction.

These rules hold in every set. Each theme's look lives in `docs/themes/<theme>.md` and each faction's in `docs/factions/<faction>.md`, and both build on these rules and may not break them. Inspiration screenshots live in `docs/screen_shots/inspiration/<theme>/` and `docs/screen_shots/inspiration/factions/<faction>/`, sorted by subject. They come from other games and artists, so git ignores that folder, and each set's file describes in words what to take from them. Take the look, not the setting, factions, buildings, logos, or UI.

## Readability

- **Detail comes from textures.** Forms are simple masses with soft bevels. Windows, panel lines, vents, signs, and wear are painted, not modeled.
- **Roofs identify buildings.** From the game camera the roof is most of what a player sees, so the roof says what the building is for.
- **Phones get the same match.** A building still reads by silhouette at phone size, and fine detail doesn't turn into noise.
- **Team colors stay identifiable.** Team colors, selection rings, and effects are the most saturated things on screen. A building's accents and glow stay small and below team colors in saturation, within the limits of its set. Scenarios choose team colors freely, so no hue is reserved.

## Buildings

- **Each building type looks unique within its set.** Its silhouette and massing differ from every other type in its theme or faction, so a player can tell them apart by shape alone. Shapes repeat only across designated variants of one type, such as a small and a large hospital.
- **Accents are the set's choice.** Each set decides whether its building types carry accent colors, and lists them in its file. Signs, trims, doors, and markings use them.
- **Footprints come from the game.** A building keeps the gameplay footprint from its game definition in every set. Only its look changes.

## Factions

- **A faction is complete on its own.** Its file sets its shape language, materials, surface finish, palette, glow, signage, and emblem, and its building types, with no reference to any theme or other faction.
- **A faction reads on every map.** It must read by shape in the game's daylight and keep its own look under any theme's lighting, so its review renders both day and night.
- **Factions differ by shape first.** Players learn each faction's buildings, so a faction's version of a role needn't share a cue with another faction's. Rules and rosters come from game data.

## Set files

Each theme file has these sections: Identity, Shape language, Materials, Palette, Glow, Lighting, Signage, Building types, References, and Avoid. Building types is a table with each type's signature silhouette feature, accent color, and required elements.

Each faction file has the same sections, with Surfaces in place of Lighting: how matte, glossy, or metallic each material is, since a faction brings its own finish to every map. Building types is a table with each type's signature silhouette feature and required elements, plus accents if the faction uses them.

Tool settings for each set, such as a theme's review lighting or a faction's surface finish, sit with its atlas in `art/blender/materials/city_atlas.py`.

- [Modern](themes/modern.md): a near-future city in daylight.
- [Cyberpunk](themes/cyberpunk.md): a dense neon megacity at night.
- [Advanced utopian](factions/advanced-utopian.md): a sleek clean-energy faction of glossy white shells and lit glass.
- [Cyber samurai](factions/cyber-samurai.md): a warrior clan of stepped cybernetic fortresses, blue-black armor, and lacquered gates.
- [Toxic industrial](factions/toxic-industrial.md): an authoritarian industrial state of sooty brutalist concrete, stacks, and tanks over slag and mud.
