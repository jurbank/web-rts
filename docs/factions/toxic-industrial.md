# Toxic industrial

## Identity

An authoritarian industrial state that burns whatever it can dig up and never cleans up after itself. Its buildings are brutalist monoliths of raw concrete, blunt, heavy, and without ornament, with industry growing out of them: smokestacks, tanks, furnaces, and cooling towers. Each stands in a walled compound of churned mud and slag. The concrete is blackened with soot from the top down and stained where chemicals leak. Fire shows through furnace mouths and slit windows, toxic sludge glows sickly in pools and tank gauges, and huge banners of the state's crest hang down the walls. Whatever map it stands on, it should look like it is ruling it and poisoning it. No buildings are approved yet, so the first ones set the look provisionally.

## Shape language

- **Concrete monoliths.** Each building is a few massive blocks of raw concrete with blunt, slightly rounded edges, no ornament, and deep-set openings. Walls are either sheer or slope inward like a bunker's.
- **Sloped buttresses and legs.** Thick sloped walls run from upper blocks down to the ground like buttresses, and some blocks stand on heavy legs, at least 0.3 units across, with an exterior stair climbing beneath them.
- **Capsule tanks.** Rounded upright capsule tanks sit on roofs and against walls, half sunk into the concrete.
- **Top-heavy.** Upper blocks cantilever out over lower ones, so buildings loom. Overhangs are at least 0.3 units deep so they read from the game camera.
- **Fins and buttresses.** Heavy concrete fins, at least 0.15 units thick, march along long walls and carry cantilevers.
- **Repetition.** A facade repeats one cell, one slit window, or one long slot window with rounded ends many times. The repetition is painted on the wall cards, not modeled.
- **Industry grows out of the concrete.** Each building has at least one smokestack, tank, or cooling tower rising from or beside its concrete mass. Keep every stack at least 0.25 units across, and no taller than one and a half times the building's main mass, so it doesn't hide units.
- **Pipe racks.** Chunky pipes, at least 0.12 units across, run between masses on concrete bents. A few, not a tangle.
- **Walled compounds.** Each building stands in a yard of packed mud with ruts, a slag heap, and an oily puddle, inside a low concrete wall with razor wire painted on top.
- **Scaffold cages are painted.** Unfinished floors wrapped in scaffolding are painted on the wall cards, never modeled, since modeled poles vanish at phone size.
- **Smoke is an effect.** Plumes come from the renderer, not the model. Paint soot around stack mouths and vents instead.

## Materials

Raw board-formed concrete showing the grain of its planks and rows of form-tie holes, precast concrete panels in a grid with each panel a slightly different grey, corroded steel, tarred corrugated roofing, and stained steel tanks with weld seams and rivets. Weathering is heavy everywhere: soot darkens every surface toward its top and around every opening, rust runs down from the form ties and seams, and yellow chemical stains drip from valves. Ground is churned mud, slag, and oily water.

## Palette

| Use      | Colors                                              |
| -------- | --------------------------------------------------- |
| Concrete | Raw concrete `#7a766e`, soot black `#2a2826`        |
| Steel    | Corroded steel `#4d4740`, rust `#6b4a33`            |
| Roofs    | Tarred corrugated `#3a3835`                         |
| Stains   | Chemical yellow `#8c8a3e`                           |
| Banners  | Soot black with faded ochre `#8c7a3a`               |
| Hazard   | Faded ochre `#8c7a3a` with black stripes            |
| Ground   | Mud `#5c5145`, slag `#3d3a36`, oily water `#2c2f2a` |

Concrete is most of every building. The palette is dark and unsaturated, so only the glow, the banners, and the hazard stripes draw the eye, and none of them competes with team colors.

## Surfaces

The atlas carries a roughness and metallic map.

| Material           | Finish                               |
| ------------------ | ------------------------------------ |
| Concrete           | Matte, roughness 0.9                 |
| Corroded steel     | Rough metal, roughness 0.6, metallic |
| Tanks              | Satin metal, roughness 0.5, metallic |
| Tarred roofs       | Roughness 0.7, not metallic          |
| Banners            | Matte cloth, roughness 0.95          |
| Mud, slag          | Matte, roughness 0.95                |
| Oily water, sludge | Glossy, roughness 0.1                |

## Glow

- **Furnace orange:** `#e8873a`, in furnace mouths, stack rims, vents, and a few slit windows and cells, as soft hot patches.
- **Toxic green:** `#a8c43c`, in sludge pools and tank sight glasses only.
- **How much:** at most a tenth of the visible surface. No trims, lines, or signs that glow. Leave roofs, stacks, and banners unlit so their shape reads.

## Signage

- **Emblem:** an invented crest: a gear ring around three smokestacks of different heights. Painted in faded ochre on soot, on roofs, and on tall banners that hang down the front of the HQ and the larger buildings. It reads as a simple shape from the game camera.
- **Markings:** stencilled block numbers and short English words in faded white, such as WORK or SECTOR 4, hazard stripes on blast doors and pads, and painted bay outlines. No neon, screens, or brands.

## Building types

All are provisional until the first one is approved. Types tell apart by shape alone. The faction uses no accent colors beyond its banners and hazard stripes.

| Type         | Signature silhouette                                                                                                                                                         | Required elements                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| HQ           | A top-heavy concrete monolith whose upper floors cantilever out in steps over a sloped bunker base, with three stacks of different heights rising behind it                  | A crest banner down the front, furnace glow at the base, a blast gate with hazard stripes into the compound             |
| Barracks     | A long concrete slab block of identical recessed window cells, raised on heavy square piers over a walled muster yard, with one short stack at one end                       | Lit cells in the slab, floodlights on the yard wall, painted muster lines                                               |
| Supply depot | Three fat storage tanks of different sizes, half sunk into a sloped concrete berm, joined by a pipe rack over the drop-off pad                                               | Glowing sight glasses on the tanks, painted drop-off bays with hazard stripes                                           |
| Refinery     | Two process columns of stacked cylinders of different heights rising from a squat concrete furnace block on a sloped berm, joined by a pipe bridge, with a short flare stack | Furnace glow in the block's mouth, a sludge settling pool glowing toxic green, painted hazard stripes on the berm stair |
| War factory  | A long concrete assembly hall whose roof is a row of heavy sawtooth fins, with a top-heavy control block cantilevered over the vehicle door and one stack at the back        | A blast door with furnace glow behind it, a crest banner on the control block, a rutted roll-out apron                  |
| Science lab  | A squat waisted cooling tower beside a windowless concrete cube cut by slit windows, over a sludge pond                                                                      | The pond glowing toxic green, a vent stack on the cube, a sensor mast                                                   |

## References

`docs/screen_shots/inspiration/factions/toxic-industrial/structures/` holds two images of polluting industry over a ruined landscape and one sheet of blocky concrete building concepts.

- **Smoking plant over spoil.** A dense plant of stacks, tanks, and scaffolded towers pouring black smoke, beyond churned spoil heaps and rutted mud tracks. Take the stacks of different heights, the scaffold-wrapped towers, and the rutted mud and spoil around the base. Leave the gas-masked figure and the church.
- **Refinery by a dead river.** A refinery of tall stacks and process towers under a yellow sky, by a polluted river with dead trees. Take the process towers, the clusters of stacks, and the oily water. Leave the yellow sky, which is lighting, not the faction.
- **Blocky concrete concepts.** Six chunky buildings of paneled concrete blocks with rounded edges, sloped buttress walls, blocks raised on legs over exterior stairs, capsule tanks on the roofs, long slot windows with rounded ends, pipes along the walls, and drip streaks down every panel. Take the massing, the buttresses and legs, the capsule tanks, the slot windows, the panel grid, and the drips. Leave the bright pastel colors, which must become shades of grey concrete and soot, and the graffiti.

## Avoid

- Clean, new, or painted-bright surfaces, colored panels, and graffiti. Everything is grey concrete, sooty and stained.
- Ornament, curves for their own sake, and glass curtain walls. Openings are deep-set slits and cells.
- Thin cantilevers and fins, and pipes, ladders, scaffold poles, and lattices modeled where they would vanish at phone size.
- Smoke, flames, or steam modeled as geometry.
- Glow over whole facades, glowing trims or signs, and neon.
- Stacks so tall they hide units, and a forest of stacks with no concrete under them.
- Real political symbols and regimes' imagery, real company logos, the radiation trefoil, and the biohazard symbol.
- Skulls, gore, and figures as decoration.
- Copies of real brutalist buildings, power stations, and refineries.
