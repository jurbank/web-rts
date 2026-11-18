# Cyberpunk

## Identity

A dense neon megacity at night. Buildings are stacked, patched, and bolted together over decades, heavy with cables, rooftop clutter, and signs. Dark masses carry the shape, and small hot points of light say what they are. No buildings are approved yet, so the first ones set the look provisionally.

## Shape language

- **Stacked and stepped.** Towers are built from offset blocks: setbacks, upper floors wider than the base, and modules that cantilever out on struts. Avoid a single clean box.
- **Bolted-on parts.** Exterior lift shafts, stair towers, pipes, ducts, and catwalks hang off the main mass.
- **Busy roofs.** Antennas, dishes, water tanks, vent stacks, and landing decks on brackets. The roof clutter is part of the silhouette, so keep each piece chunky enough to read from the game camera.
- **Street level.** Shop fronts, roller shutters, and a lit canopy or two at the base.

## Materials

Dark weathered concrete, grimy steel cladding with recessed vertical channels, and corrugated and patched panels. Large painted panel fields carry block numbers. Glass is mostly dark, broken up by a few lit tiles. Everything is wet-looking and dirty, with rust streaks and stains.

## Palette

| Use          | Colors                                                                  |
| ------------ | ----------------------------------------------------------------------- |
| Walls        | Charcoal concrete `#3a3d42`, dark steel `#2c3035`                       |
| Panel fields | Muted hazard ochre `#8c7a3a` with black stripes, stained teal `#2f4a4c` |
| Metal        | Rusted brown `#5a4636`, gunmetal `#4a4f55`                              |
| Glass        | Near-black `#1d2329` with occasional lit tiles                          |
| Ground       | Wet asphalt `#26292d`                                                   |

A panel field may cover up to a third of a facade.

## Glow

Glow is what makes this theme, and it is also what could drown out team colors, so it has hard limits.

- **Where it goes:** signs, thin trim strips along edges and setbacks, a few lit window tiles, landing-deck lamps, and screens.
- **How much:** at most a tenth of a building's visible surface. Never a whole facade or the whole silhouette.
- **Colors:** neon cyan `#35d6e0`, magenta `#e04ac8`, amber `#f0a640`, and acid green `#7ee05a`. Each building type uses its own accent glow and at most one other glow color.

Glow is painted on the atlas's glow map. The exporter writes it as an emissive texture, and export checks that it survives.

## Lighting

Night. The `render` command uses a dark blue sky, a dim cool moon, and the glow map, as the atlas tool settings select. The game itself renders daylight until the renderer gains theme lighting. Until then, buildings must also read in daylight by shape and panel fields alone.

## Signage

Vertical sign strips, block numbers painted large, small screens, and glowing pictograms. Use invented glyphs, numbers, and short English words. Avoid copying real scripts as decoration, and avoid real brands and logos.

## Building types

All are provisional until the first one is approved.

| Type           | Signature silhouette                                                                                                     | Accent glow                                           | Required elements                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Hospital       | A stepped clinic tower with a landing deck cantilevered out on struts and an exterior lift shaft                         | Cyan `#35d6e0`                                        | A vertical sign strip with a glowing green cross (a pharmacy cross, not the protected red cross), deck lamps, an ambulance bay at the base |
| Police station | A fortified block with a watchtower and a searchlight mast                                                               | Amber `#f0a640` with blue-white strobes               | Armored shutters, a block number, drone pads                                                                                               |
| Barracks       | Stacked container blocks with exterior stairs and catwalks                                                               | Acid green `#7ee05a`                                  | Corporate security markings, floodlights, a fenced yard                                                                                    |
| Therapy center | A low storefront with an offset shed roof and a salvaged sign pitched toward the street                                  | Magenta `#e04ac8`                                     | A legible THERAPY sign, boarded windows, and a patched entry canopy                                                                        |
| Skyscrapers    | Exchange with twin slabs and a skybridge, relay with a cantilever and antenna crown, habitat with broad planted setbacks | Cyan for exchange, amber for relay, green for habitat | Street entrances, weathered panel fields, and rooftop plant or antenna equipment matched to each variant                                   |

## References

`docs/screen_shots/inspiration/cyberpunk/civic/structures/` holds city scenes, building packs, and concept art.

- **Megastructures with block numbers.** Tall slab towers clad in ochre and black panels with recessed channels, a huge painted number near the top, and lamp lines along setbacks. Take the panel fields, the numbers, and the lamp lines.
- **Neon street canyons.** Night streets where vertical sign strips, screens, and cables strung between buildings carry the light. Take the sign strips and the cables, kept chunky enough to read from above.
- **Stacked kit buildings.** Small towers built from offset blocks with balconies, external stairs, rooftop antennas, dishes, and landing pads. Take the stacking, the bolted-on parts, and the roof clutter.
- **Glowing panel arcologies.** Tapered and pyramid masses whose cladding glows in a grid of red and green tiles. Take the tapering mass, but keep glow to a few tiles, not the whole skin.
- **Patchwork concept art.** Buildings assembled from mismatched colored panels on stilts with ladders. Take the patchwork and the stilts for poorer districts.

## Avoid

- The modern theme's clean office boxes with a cyberpunk sign added.
- Glow over whole facades, and glow in more than two colors on one building.
- Buildings that only read at night. They must also read by shape in the game's daylight.
- Real brands, logos, and copied buildings from games or films.
