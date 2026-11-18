# Modern

## Identity

A near-future city in daylight. Concrete, glass, and metal buildings with real-world proportions, weathered and lived in. Approved buildings: police station, hospital, barracks.

## Shape language

Boxes, slabs, podiums, and curved roofs with soft bevels. Buildings feel heavy and sit firmly on the ground. Height comes from storeys of believable size, with three to four storeys at most for now. Rooftops carry equipment, parapets, and helipads.

## Materials

Weathered concrete panels, membrane roofs, ribbed and painted metal, tinted glass. Every surface carries some grime, such as streaks under sills and dirt at the base.

## Palette

| Use    | Colors                                              |
| ------ | --------------------------------------------------- |
| Walls  | Concrete `#99958a`, warm grey `#77736c`             |
| Roofs  | Slate membrane `#5d6569`, `#5f6a6c`                 |
| Metal  | Dark structural `#4e5659`, painted panels `#69747a` |
| Glass  | Tinted blue-grey `#536874`                          |
| Ground | Paving `#706f68`                                    |

## Glow

None. Lit windows and signs are painted, not glowing.

## Lighting

The game's daylight: a hemisphere light with a white sky and dark ground, and a sun from the front left. The `render` command uses it by default.

## Signage

Plain painted signs and fascias in the building's accent color with cream lettering. Text is a texture detail and needn't read at game zoom.

## Building types

| Type           | Signature silhouette                                       | Accent               | Required elements                                                                                                              |
| -------------- | ---------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Police station | A two-storey box with a lower garage wing and a radio mast | Blue `#3e5161`       | Badge panel on the roof, patrol bays                                                                                           |
| Hospital       | A three-storey ward slab behind a single-storey podium     | Muted red `#6c2e2a`  | Helipad with a red H in a white ring, emergency canopy, ambulance bays. No red cross, because the emblem is legally protected. |
| Barracks       | Two half-round huts                                        | Olive drab `#50543f` | Personnel doors, a parade yard, a flag                                                                                         |

## References

`docs/screen_shots/inspiration/modern/structures/` holds two near-future city battles seen from a high three-quarter camera.

- **Believable proportions.** Buildings keep real-world proportions and feel heavy. Units are small next to them.
- **Painted detail.** Simple boxes, cylinders, and curved roofs carry painted window grids, panel lines, vents, concrete, and grime.
- **Roofs identify buildings.** Barrel-vault hangars, flat roofs with equipment, and stepped towers each read differently.
- **Lived-in surroundings.** Roads, lot markings, fences, pylons, trees, and parked vehicles surround the buildings.
- **A neutral city.** Buildings and ground stay greyer than team colors.

## Avoid

- Clean, pastel, toy-like surfaces.
- Saturated color over large areas.
- Reusing the barrel vault for anything but the barracks, so a future hangar needs a different roof.
