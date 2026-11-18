Lower poly because it's an RTS but not the trendy "low-poly" look.

These rules hold in every theme. Each theme's look lives in `docs/themes/<theme>.md`, which builds on them and may not break them. Inspiration screenshots live in `docs/screen_shots/inspiration/<theme>/`, sorted by subject. They come from other games and artists, so git ignores that folder, and each theme file describes in words what to take from them. Take the look, not the setting, factions, buildings, logos, or UI.

## Readability

- **Detail comes from textures.** Forms are simple masses with soft bevels. Windows, panel lines, vents, signs, and grime are painted, not modeled.
- **Roofs identify buildings.** From the game camera the roof is most of what a player sees, so the roof says what the building is for.
- **Phones get the same match.** A building still reads by silhouette at phone size, and fine detail doesn't turn into noise.
- **Team colors stay identifiable.** Team colors, selection rings, and effects are the most saturated things on screen. A building's accents and glow stay small and below team colors in saturation, within the limits its theme sets. Scenarios choose team colors freely, so no hue is reserved.

## Buildings

- **Each building type looks unique within its theme.** Its silhouette and massing differ from every other type in the theme, so a player can tell them apart by shape alone. Shapes repeat only across designated variants of one type, such as a small and a large hospital.
- **Each building type has its own accent color within its theme.** Signs, trims, doors, and markings use it, so buildings don't share one generic color. Each theme file lists them.
- **One type, many themes.** A hospital in every theme keeps the gameplay footprint from its game definition. Only its look changes.

## Themes

Each theme file has these sections: Identity, Shape language, Materials, Palette, Glow, Lighting, Signage, Building types, References, and Avoid. Building types is a table with each type's signature silhouette feature, accent color, and required elements. Tool settings for a theme, such as its review lighting, sit with its atlas in `art/blender/materials/city_atlas.py`.

- [Modern](themes/modern.md): a near-future city in daylight.
- [Cyberpunk](themes/cyberpunk.md): a dense neon megacity at night.
