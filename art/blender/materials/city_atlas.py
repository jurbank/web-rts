"""Paint each theme's and faction's texture atlas, glow map, surface map, and card map.

Run from the repo root:

    uv run --with pillow python art/blender/materials/city_atlas.py

Each card is a painted surface that structures map faces onto. CARDS defines
every card once. BASE lists the theme-neutral cards that every theme's atlas
carries, and THEMES lists each theme's own cards and tool settings. FACTIONS
lists each faction's cards and settings, and a faction's atlas holds only its
own cards. Each set gets art/blender/materials/<themes|factions>/<name>/
atlas.jpg and atlas.json, plus atlas-glow.jpg when it glows and
atlas-surface.jpg, a roughness and metallic map, when it has one. Cards pack in list order onto 2048-pixel
pages laid side by side, filling gaps before adding a page.

Cards may move when lists change. Structures mapped with atlas_cards.py record
which card each face uses, so atlas_cards.refresh() fits them again. Reuse cards
before adding one, and remove a card only when no source uses it.

Pillow is used because the signs need real font rendering. Only this script
needs it, and only when an atlas changes.
"""
import json
import math
from pathlib import Path
import random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
FONTS = Path('/System/Library/Fonts/Supplemental')
PAGE = 2048
PAD = 12
CONCRETE = (153, 149, 138)

# name: ((width, height) in pixels, base color, what it shows)
CARDS = {
    'lot_two_bay': ((828, 716), (112, 111, 104), 'Paved forecourt with a crosswalk, drain, and two marked vehicle bays at the street edge'),
    'roof_flat_large': ((455, 455), (93, 101, 105), 'Flat membrane roof with seams, two drains, and weathering'),
    'roof_flat_small': ((299, 376), (95, 106, 108), 'Smaller flat membrane roof with seams and weathering'),
    'wall_office_entrance': ((460, 276), CONCRETE, 'Two-storey concrete front: upper window band, glass lobby doors, side window, address plate'),
    'wall_office_rear': ((460, 276), CONCRETE, 'Two-storey concrete rear: upper windows, service door, louvre'),
    'wall_office_side': ((455, 276), CONCRETE, 'Two-storey concrete side with two rows of windows'),
    'wall_garage_two_bay': ((291, 166), CONCRETE, 'Single-storey front with two numbered roller doors'),
    'wall_garage_side': ((376, 166), CONCRETE, 'Single-storey side with high clerestory windows'),
    'wall_garage_rear': ((291, 166), CONCRETE, 'Single-storey rear with high windows and a service door'),
    'sign_police_roof': ((342, 241), (69, 89, 107), 'Rooftop police badge panel reading POLICE, PRECINCT 12'),
    'wall_metal_band': ((256, 54), (105, 116, 121), 'Ribbed metal cladding band for a rooftop room'),
    'sign_police_fascia': ((258, 33), (54, 74, 93), 'Canopy fascia reading POLICE STATION'),
    'roof_canopy': ((258, 85), (79, 93, 103), 'Canopy top with a drip edge'),
    'hvac_side': ((134, 45), (127, 134, 131), 'Air handler side with louvres and a service panel'),
    'hvac_top': ((134, 109), (106, 115, 114), 'Air handler top with two fans'),
    'hvac_intake': ((70, 83), (81, 91, 94), 'Small louvred intake'),
    'concrete': ((180, 125), CONCRETE, 'Plain weathered concrete'),
    'foundation': ((260, 34), (119, 115, 108), 'Foundation band with joints and a dirty base'),
    'coping': ((242, 30), (134, 137, 130), 'Parapet coping strip'),
    'column': ((95, 95), (128, 133, 130), 'Column or pier finish'),
    'metal_blue': ((100, 62), (62, 81, 97), 'Painted blue metal'),
    'metal_dark': ((87, 65), (78, 86, 89), 'Dark structural metal'),
    'apron_paved': ((512, 410), (112, 111, 104), 'Plain paved apron with slab joints, a kerb edge, and stains'),
    'sign_hospital_roof': ((256, 250), (150, 152, 146), 'Hospital rooftop helipad: a red H inside a white ring on a light panel'),
    'sign_hospital_fascia': ((258, 24), (128, 50, 45), 'Muted red canopy fascia reading EMERGENCY'),
    'roof_barrel_seam': ((300, 300), (80, 84, 66), 'Army olive corrugated metal for curved hut roofs, with five broad ribs across the curve'),
    'marking_ambulance_bays': ((228, 80), (112, 111, 104), 'Paving decal with two outlined ambulance bays and a hatched kerb strip'),
    'wall_ward_slab': ((440, 278), CONCRETE, 'Three-storey hospital ward slab: continuous window bands and a red stair-core stripe left of center'),
    'wall_ward_slab_end': ((150, 278), CONCRETE, 'Narrow three-storey end wall with one small window per floor'),
    'wall_podium_entrance': ((320, 89), CONCRETE, 'Single-storey hospital podium front: red cornice band, glazed entrance left of center, windows to the right'),
    'gable_quonset_end': ((220, 110), (80, 84, 68), 'Olive end wall of a half-round hut: centered personnel door, two small windows, stencilled number'),
    'marking_muster_yard': ((360, 100), (112, 111, 104), 'Paving decal for a muster yard: painted border, rows of formation marks, a walkway'),
    'flag_army': ((94, 60), (84, 96, 62), 'Olive flag with a cream star'),
    'cyber_hospital_ward': ((420, 330), (77, 83, 89), 'Dark ward curtain wall with steel mullions, lit rooms, and glowing red light bands'),
    'cyber_hospital_lobby': ((412, 115), (82, 87, 90), 'Trauma center entry with glazed doors, a glowing red light band, and metal panels'),
    'cyber_hospital_pad': ((352, 352), (72, 76, 81), 'Air ambulance deck with a large cream H, glowing red edge lamps, and approach stripes'),
    'cyber_clinic_street': ((480, 140), (58, 61, 66), 'Clinic street front: shuttered pharmacy counter under a small green cross, glazed clinic door, two hazard-framed ambulance bay roller doors'),
    'cyber_clinic_tower': ((440, 176), (60, 63, 68), 'Two clinic floors of dark window tiles in recessed channels, a few lit cyan tiles, a stained teal panel field with a small cyan screen at the right'),
    'cyber_clinic_upper': ((300, 170), (60, 63, 68), 'Upper clinic floor: dark window grid with two lit cyan tiles, ochre and black panel field with a large painted 07 at the right'),
    'cyber_wall_channels': ((300, 170), (57, 60, 65), 'Charcoal concrete side or rear wall with recessed vertical channels, small dark windows, a pipe run, and rust streaks'),
    'cyber_lift_shaft': ((72, 420), (54, 58, 64), 'Exterior lift shaft: steel frame with cross bracing, a glazed slot, and a cyan-lit cab near the top'),
    'cyber_sign_pharmacy': ((80, 450), (34, 38, 44), 'Vertical sign blade: glowing green pharmacy cross at the top, CLINIC in glowing cyan letters down the strip'),
    'cyber_landing_deck': ((300, 280), (62, 66, 72), 'Landing deck seen from above: steel plates, hazard ochre edge band with cyan lamps, a teal ring around a large cream cross'),
    'cyber_canopy_fascia': ((256, 22), (40, 44, 50), 'Canopy fascia reading AMBULANCE over a glowing cyan strip'),
    'cyber_apron_bays': ((560, 448), (38, 41, 45), 'Wet asphalt lot: two ochre ambulance bays front center, a pedestrian crossing at the left, a hatched service yard at the right, puddles'),
    'cyber_roof_tar': ((300, 300), (50, 54, 58), 'Dark wet roof membrane with patched panels, seams, puddles with a pale sheen, rust, and stains'),
    'cyber_trim_cyan': ((256, 20), (44, 48, 54), 'Dark steel edge trim with a thin glowing cyan lamp line'),
    'cyber_metal_rust': ((128, 96), (84, 66, 52), 'Rusted brown sheet metal with ribs and streaks'),
    'cyber_lamp': ((48, 48), (40, 44, 50), 'Lamp head: dark housing around a glowing cyan lens'),
    'cyber_therapy_front': ((240, 138), (71, 78, 78), 'Weathered therapy storefront with boarded windows, patched cladding, and a recessed entry door'),
    'cyber_therapy_sign': ((228, 62), (54, 45, 53), 'Chipped sign reading THERAPY in worn magenta tubing'),
    'cyber_container_wall': ((252, 106), (66, 76, 71), 'Corrugated security container with personnel doors, dark vents, and a narrow green access panel'),
    'cyber_security_yard': ((236, 222), (46, 50, 54), 'Rain-dark muster yard with faded drill lines, a gate approach, and a striped equipment bay'),
    'cyber_security_lamp': ((48, 32), (44, 49, 48), 'Steel floodlight housing with twin acid-green lenses'),
    'cyber_security_roof': ((112, 48), (79, 87, 79), 'Painted container roof with faded SEC 12 lettering and steel seams'),
    'cyber_exchange': ((298, 193), (62, 69, 75), 'Exchange curtain wall with broad grouped glass bays, dark spandrels, and scattered cool lights'),
    'cyber_relay': ((270, 187), (65, 66, 68), 'Shielded relay cladding with recessed air intakes, an ochre block 18 field, and amber status bars'),
    'cyber_habitat': ((310, 187), (71, 75, 69), 'Residential balcony rows with patched teal screens and scattered green-lit rooms'),
    'cyber_tower_lobby': ((304, 92), (59, 64, 67), 'Tower storefront with a glazed street lobby and weathered roller shutters'),
    'cyber_exchange_sign': ((184, 42), (49, 59, 66), 'Exchange bridge fascia with sparse cyan pinstripes and EXCHANGE lettering'),
    'cyber_habitat_deck': ((110, 140), (63, 68, 64), 'Rain-stained concrete roof terrace with boxed planting beds'),
    'cyber_habitat_sign': ((84, 48), (57, 71, 66), 'Worn communal tank sign with green HAB lettering'),
    'cyber_relay_beacon': ((42, 34), (52, 48, 47), 'Amber warning lens set in a dark antenna housing'),
    'advanced_utopian_glass': ((480, 110), (26, 33, 41), 'Advanced utopian storey glass: dark reflective panes behind fine white fins, floors lit softly from within, planting and furniture behind'),
    'advanced_utopian_tower_glass': ((224, 448), (26, 33, 41), 'Sail tower glass: many floors of dark reflective panes behind bold white fins, most lit softly from within'),
    'advanced_utopian_shell': ((512, 96), (221, 220, 215), 'Glossy white composite shell with faint panel lines'),
    'advanced_utopian_shell_glazed': ((512, 96), (221, 220, 215), 'Glossy white composite shell with faint panel lines and a softly lit glazed bay in each panel'),
    'advanced_utopian_roof_solar': ((400, 400), (221, 220, 215), 'Floating white roof from above: one flush solar ring, faint radial panel lines, the faction emblem at the center'),
    'advanced_utopian_shell_top': ((400, 400), (221, 220, 215), 'Factory shell roof from above: the flush solar ring around the emblem, crossed front to back by a softly lit skylight strip'),
    'advanced_utopian_court': ((256, 256), (88, 105, 77), 'Garden court from above: muted lawn, a white path ring, and a still leaf-shaped pool lit softly from below'),
    'advanced_utopian_pool': ((256, 128), (34, 48, 58), 'Still reflecting pool from above: dark water lit softly from below'),
    'advanced_utopian_dome': ((256, 256), (26, 33, 41), 'Glass dome from above: fine white ribs over a soft glowing instrument core'),
    'advanced_utopian_door': ((300, 150), (221, 220, 215), 'Tall vehicle door: glass panels over a softly lit bay inside a rounded white frame'),
    'advanced_utopian_apron_depot': ((512, 512), (168, 167, 162), 'Depot podium from above: pale paving, three grey-outlined drop-off bays with chevrons across the middle, soft lit studs in front of them'),
    'advanced_utopian_apron_factory': ((512, 512), (160, 159, 154), 'Factory lot from above: pale paving inside a dark kerb, a roll-out lane with white lines, chevrons, and soft lit studs'),
    'advanced_utopian_silo': ((192, 256), (221, 220, 215), 'Glossy white capsule silo side with faint seams and soft lit level windows'),
    'advanced_utopian_silo_top': ((128, 128), (221, 220, 215), 'Capsule silo crown from above: glossy white with faint circular seams'),
    'advanced_utopian_underside': ((64, 64), (142, 141, 136), 'Shaded white underside of a floating roof'),
    'advanced_utopian_podium': ((400, 60), (168, 167, 162), 'Clean pale stone podium side with crisp joints and a light coping'),
    'advanced_utopian_podium_top': ((512, 512), (168, 167, 162), 'Podium top from above: pale stone paving, a light path ring around the center, a front walk, and muted lawn corners'),
    'advanced_utopian_plaza': ((384, 384), (160, 159, 154), 'Street plaza from above: pale stone paving with clean joints inside a dark kerb'),
    'advanced_utopian_stone': ((128, 96), (168, 167, 162), 'Plain clean pale stone with crisp joints'),
    'advanced_utopian_fascia': ((300, 76), (221, 220, 215), 'Glossy white entrance fascia with the faction emblem at the center'),
    'advanced_utopian_metal': ((96, 64), (210, 212, 212), 'Clean pale satin metal with faint brushing'),
    'advanced_utopian_lamp': ((48, 48), (169, 196, 198), 'Lamp lens filling the whole card, glowing soft ice'),
    'advanced_utopian_armor': ((128, 128), (221, 220, 215), 'Unit armor: glossy white composite plates with clear panel seams, shaded toward the edges'),
    'advanced_utopian_suit': ((96, 96), (52, 60, 72), 'Unit undersuit: dark blue-grey ribbed weave with faint seams'),
    'advanced_utopian_visor': ((96, 48), (26, 33, 41), 'Unit visor: dark glass band glowing soft ice from within, brightest at the center'),
    'cyber_samurai_gravel': ((384, 384), (161, 156, 144), 'Court from above: pale gravel raked in straight lines inside a granite kerb'),
    'cyber_samurai_roof_tiles': ((512, 256), (59, 65, 72), 'Roof slope: dark steel tile rolls running down the slope, end caps along the bottom edge for the eave'),
    'cyber_samurai_stone': ((512, 192), (119, 115, 107), 'Sloped base: fitted grey granite in uneven courses, moss in some joints'),
    'cyber_samurai_wall_screens': ((480, 160), (30, 28, 29), 'Black lacquer frame holding paper screen bays in a fine grid, most lit warm from inside'),
    'cyber_samurai_wall_armor': ((480, 160), (30, 28, 29), 'Rows of overlapping gunmetal armor plates laced with crimson cord, between black lacquer posts'),
    'cyber_samurai_plaster': ((256, 128), (207, 200, 184), 'Pale plaster band over black lacquered boards, under a lacquer beam'),
    'cyber_samurai_emblem': ((128, 128), (30, 28, 29), 'Faction crest on black lacquer: a brass ring broken at the top around an upright crimson-lit blade'),
    'cyber_samurai_lantern': ((64, 96), (217, 201, 163), 'Paper lantern side with dark ribs and caps, glowing warm'),
    'cyber_samurai_lacquer': ((128, 96), (30, 28, 29), 'Plain black lacquer with faint grain'),
    'cyber_samurai_vermilion': ((128, 96), (168, 57, 43), 'Vermilion lacquer post or beam with brass bands near each end'),
    'cyber_samurai_eave': ((512, 48), (30, 28, 29), 'Eave edge: black lacquer fascia with a brass top edge and a thin crimson line of light along the bottom'),
    'cyber_samurai_lamp': ((48, 48), (224, 72, 60), 'Lamp lens filling the whole card, glowing crimson'),
    'toxic_industrial_ground': ((384, 384), (92, 81, 69), 'Yard from above: churned mud with tire ruts, slag patches, and an oily puddle'),
    'toxic_industrial_roof': ((512, 256), (58, 56, 53), 'Tarred corrugated roof with rust at the seams and soot gathering toward the top'),
    'toxic_industrial_tank': ((256, 256), (77, 71, 64), 'Stained steel tank side: weld seams, rivets, rust and yellow drips, a glowing green sight glass'),
    'toxic_industrial_scaffold': ((256, 256), (64, 61, 57), 'Unfinished sooty concrete floors behind a scaffold cage of poles and planks'),
    'toxic_industrial_stack': ((192, 256), (110, 106, 99), 'Smokestack side: concrete with darker rings near the top, a painted ladder, soot thickening upward'),
    'toxic_industrial_concrete': ((512, 192), (108, 104, 96), 'Board-formed raw concrete: plank grain, form-tie holes with rust runs, slit windows, a few lit, soot from the top, a stencilled block number'),
    'toxic_industrial_cells': ((480, 160), (122, 118, 110), 'Brutalist cell facade: rows of identical deep-set window cells in a concrete grid, a few lit orange, soot from the top'),
    'toxic_industrial_banner': ((96, 256), (42, 40, 38), 'Tall hanging banner: soot black cloth with faded ochre borders and the faction crest'),
    'toxic_industrial_sludge': ((256, 128), (44, 47, 42), 'Sludge pond from above: oily surface glowing toxic green toward the middle'),
    'toxic_industrial_emblem': ((128, 128), (42, 40, 38), 'Faction crest on soot: a faded ochre gear ring around three smokestacks of different heights'),
    'toxic_industrial_stack_top': ((128, 128), (110, 106, 99), 'Stack mouth from above: a sooty rim around a dark throat glowing orange'),
    'toxic_industrial_furnace': ((128, 96), (42, 40, 38), 'Furnace mouth: a heavy steel frame around a hot orange opening'),
    'toxic_industrial_steel': ((128, 96), (77, 71, 64), 'Corroded steel plate with rust streaks'),
    'toxic_industrial_hazard': ((256, 48), (140, 122, 58), 'Faded ochre and black hazard stripes, scuffed'),
    'toxic_industrial_pad': ((512, 512), (104, 100, 93), 'Drop-off pad from above: sooty concrete slabs, three faded white bays, a hazard stripe band along the front, oil stains, mud at the edges'),
    'toxic_industrial_apron': ((384, 512), (92, 81, 69), 'Roll-out apron from above: a concrete lane with faded white lines and chevrons through rutted mud, hazard stripes at the door end'),
    'toxic_industrial_slab_top': ((384, 384), (104, 100, 93), 'Flat concrete roof from above: board seams, two drains, soot, the faction crest painted large in faded ochre'),
    'toxic_industrial_tank_top': ((256, 256), (77, 71, 64), 'Tank lid from above: corroded steel rings of rivets around a central hatch, soot and rust'),
    'toxic_industrial_blast_door': ((256, 192), (77, 71, 64), 'Steel blast door: two ribbed leaves drawn apart on a furnace-lit interior, hazard stripes along the bottom'),
    'toxic_industrial_concrete_plain': ((512, 192), (104, 100, 93), 'Board-formed raw concrete with no openings: plank grain, rusty form-tie holes, yellow drips, heavy soot from the top'),
    'toxic_industrial_slab': ((256, 256), (100, 96, 89), 'Plain flat concrete roof or berm top from above: board seams, a drain, soot and oil stains'),
    'toxic_industrial_wall_top': ((512, 32), (100, 96, 89), 'Compound wall coping from above: sooty concrete under coils of razor wire'),
    'cyber_samurai_loading_court': ((560, 440), (126, 120, 108), 'Granite-bordered court with two painted drop-off bays and a central loading lane'),
    'cyber_samurai_forge_apron': ((480, 560), (88, 87, 82), 'Dark stone rollout apron with white guide lines and a painted clan crest'),
    'cyber_samurai_refinery_court': ((480, 480), (146, 140, 126), 'Raked gravel process yard with dark stone service path and white safety markings'),
    'cyber_samurai_forge_door': ((384, 192), (53, 56, 60), 'Armored steel shutter with overlapping panels, lock seam and painted threshold marks'),
    'cyber_samurai_forge_vent': ((384, 96), (38, 34, 34), 'Slim amber furnace light recessed behind dark steel vent baffles'),
    'cyber_samurai_tank_plate': ((384, 192), (73, 78, 84), 'Laced gunmetal vessel shell with broad bands and brass fasteners'),
    'cyber_samurai_brass': ((96, 96), (134, 108, 63), 'Satin brass for transfer pipes and ridge fittings'),
    'cyber_samurai_tech_shell': ((416, 288), (58, 70, 84), 'Chamfered blue-black cladding with gunmetal panels, bright bevels, and rose service tracers'),
    'cyber_samurai_tech_wall': ((384, 224), (45, 55, 66), 'Deep armored service wall with blue optical slots, pale ceramic and overlapping panels'),
    'cyber_samurai_tech_edge': ((224, 128), (86, 102, 115), 'Satin machined edge with bevel highlights and darker outer seams'),
    'cyber_samurai_power_band': ((432, 120), (25, 36, 47), 'Recessed ice-blue optical slots in a segmented black steel instrument band'),
    'cyber_samurai_separator': ((320, 320), (33, 46, 59), 'Circular separator lid, segmented blue optical ring, and concentric gunmetal service rings'),
    'cyber_samurai_forge_spine': ((224, 512), (36, 40, 46), 'Recessed longitudinal heat exchanger with amber channels and dark cross-bracing'),
}

# Theme-neutral cards in every theme's atlas.
BASE = ['roof_flat_large', 'roof_flat_small', 'apron_paved', 'concrete', 'foundation', 'coping', 'column',
        'metal_dark', 'wall_metal_band', 'roof_canopy', 'hvac_side', 'hvac_top', 'hvac_intake']

# lighting: the review render preset. glow: whether the theme paints a glow map.
THEMES = {
    'modern': {'lighting': 'day', 'glow': False, 'cards': [
        'lot_two_bay', 'wall_office_entrance', 'wall_office_rear', 'wall_office_side', 'wall_garage_two_bay',
        'wall_garage_side', 'wall_garage_rear', 'sign_police_roof', 'sign_police_fascia', 'metal_blue',
        'sign_hospital_roof', 'sign_hospital_fascia', 'marking_ambulance_bays', 'wall_ward_slab',
        'wall_ward_slab_end', 'wall_podium_entrance', 'roof_barrel_seam', 'gable_quonset_end',
        'marking_muster_yard', 'flag_army']},
    'cyberpunk': {'lighting': 'night', 'glow': True, 'fill_gaps': True, 'cards': [
        'cyber_hospital_ward', 'cyber_hospital_lobby', 'cyber_hospital_pad',
        'cyber_apron_bays', 'cyber_clinic_street', 'cyber_clinic_tower', 'cyber_clinic_upper', 'cyber_landing_deck',
        'cyber_roof_tar', 'cyber_wall_channels', 'cyber_lift_shaft', 'cyber_sign_pharmacy', 'cyber_metal_rust',
        'cyber_canopy_fascia', 'cyber_trim_cyan', 'cyber_lamp',
        'cyber_therapy_front', 'cyber_therapy_sign', 'cyber_container_wall', 'cyber_security_yard',
        'cyber_security_lamp', 'cyber_security_roof',
        'cyber_exchange', 'cyber_relay', 'cyber_habitat', 'cyber_tower_lobby',
        'cyber_exchange_sign', 'cyber_habitat_deck', 'cyber_habitat_sign', 'cyber_relay_beacon']},
}

# The same settings for each faction, plus surface: whether the atlas carries a roughness and metallic map.
# A faction's atlas holds only its own cards. List cards tallest first so they pack tightly.
FACTIONS = {
    'advanced-utopian': {'lighting': 'day', 'glow': True, 'surface': True, 'cards': [
        'advanced_utopian_apron_depot', 'advanced_utopian_apron_factory', 'advanced_utopian_podium_top',
        'advanced_utopian_tower_glass', 'advanced_utopian_roof_solar', 'advanced_utopian_shell_top',
        'advanced_utopian_plaza', 'advanced_utopian_court', 'advanced_utopian_dome', 'advanced_utopian_silo',
        'advanced_utopian_door', 'advanced_utopian_pool', 'advanced_utopian_silo_top',
        'advanced_utopian_glass', 'advanced_utopian_shell', 'advanced_utopian_shell_glazed', 'advanced_utopian_stone', 'advanced_utopian_fascia',
        'advanced_utopian_metal', 'advanced_utopian_underside', 'advanced_utopian_podium',
        'advanced_utopian_lamp', 'advanced_utopian_armor', 'advanced_utopian_suit', 'advanced_utopian_visor']},
    'toxic-industrial': {'lighting': 'day', 'glow': True, 'surface': True, 'cards': [
        'toxic_industrial_ground', 'toxic_industrial_roof', 'toxic_industrial_tank', 'toxic_industrial_scaffold',
        'toxic_industrial_banner', 'toxic_industrial_stack', 'toxic_industrial_concrete', 'toxic_industrial_cells',
        'toxic_industrial_sludge',
        'toxic_industrial_emblem', 'toxic_industrial_stack_top', 'toxic_industrial_furnace', 'toxic_industrial_steel',
        'toxic_industrial_hazard', 'toxic_industrial_pad', 'toxic_industrial_apron',
        'toxic_industrial_slab_top', 'toxic_industrial_tank_top', 'toxic_industrial_blast_door',
        'toxic_industrial_concrete_plain', 'toxic_industrial_slab', 'toxic_industrial_wall_top']},
    'cyber-samurai': {'lighting': 'day', 'glow': True, 'surface': True, 'cards': [
        'cyber_samurai_gravel', 'cyber_samurai_roof_tiles', 'cyber_samurai_stone', 'cyber_samurai_wall_screens',
        'cyber_samurai_wall_armor', 'cyber_samurai_plaster', 'cyber_samurai_emblem', 'cyber_samurai_lantern',
        'cyber_samurai_lacquer', 'cyber_samurai_vermilion', 'cyber_samurai_eave', 'cyber_samurai_lamp',
        'cyber_samurai_forge_apron', 'cyber_samurai_refinery_court', 'cyber_samurai_loading_court',
        'cyber_samurai_tank_plate', 'cyber_samurai_forge_door', 'cyber_samurai_forge_vent', 'cyber_samurai_brass',
        'cyber_samurai_tech_shell', 'cyber_samurai_tech_wall', 'cyber_samurai_tech_edge',
        'cyber_samurai_power_band', 'cyber_samurai_separator', 'cyber_samurai_forge_spine']},
}


resample = Image.Resampling.BICUBIC


def text(draw, at, label, size, color, condensed=False):
    font = ImageFont.truetype(str(FONTS / ('DIN Condensed Bold.ttf' if condensed else 'DIN Alternate Bold.ttf')), size)
    draw.text(at, label, font=font, fill=color, anchor='mm', stroke_width=0)

def field(size, base, coarse=10, grain=4, edge=12):
    w,h = size
    def noise(step):
        small = Image.new('L', (max(2,w//step), max(2,h//step)))
        small.putdata([rng.randrange(256) for _ in range(small.width * small.height)])
        return list(small.resize(size, resample).tobytes())
    broad, mid = noise(73), noise(16)
    im = Image.new('RGB', size)
    pixels = []
    for i, (n1,n2) in enumerate(zip(broad,mid)):
        x,y = i%w,i//w
        ao = edge*math.exp(-min(x,w-x-1,y,h-y-1)/9)
        offset = (n1-128)*coarse/128 + (n2-128)*.052 + rng.randint(-grain,grain) - ao
        pixels.append(tuple(max(0,min(255,round(v+offset))) for v in base))
    im.putdata(pixels)
    return im

def grime(im, contacts=(), streaks=0):
    w,h=im.size
    mask=Image.new('L',im.size)
    d=ImageDraw.Draw(mask)
    for x0,y0,x1,y1,power in contacts:
        d.rectangle((x0,y0,x1,y1), fill=power)
    for _ in range(streaks):
        x=rng.randrange(w)
        y=rng.choice([rng.randrange(max(1,h//3)),rng.randrange(h)])
        reach=rng.randrange(5,max(6,h//3))
        d.line((x,y,x+rng.randrange(-2,3),y+reach), fill=rng.randint(18,53), width=rng.randint(1,4))
    im.paste((36,38,35), (0,0), mask.filter(ImageFilter.GaussianBlur(4.5)))

def glass(d, x0, y0, x1, y1, divisions, door=False):
    d.rectangle((x0,y0,x1,y1+4),fill=(85,86,81))
    d.rectangle((x0+3,y0+2,x1-3,y1-2),fill=(54,63,66))
    d.rectangle((x0+5,y0+5,x1-5,y1-4),fill=(83,104,116))
    dy=y1-y0
    d.polygon([(x0+5,y0+int(dy*.70)), (x1-5,y0+int(dy*.32)),(x1-5,y1-4),(x0+5,y1-4)],fill=(61,79,89))
    if dy>45:
        d.line((x0+5,y0+int(dy*.23),x1-5,y0+int(dy*.23)), fill=(115,127,130),width=2)
    for i in range(1,divisions):
        x=x0+round((x1-x0)*i/divisions)
        d.rectangle((x-2,y0+3,x+2,y1-2),fill=(58,69,73))
        d.line((x-1,y0+4,x-1,y1-3),fill=(119,129,128),width=1)
    d.line((x0,y1+3,x1,y1+3),fill=(172,171,157),width=2)
    if door:
        x=(x0+x1)//2
        for xx in (x-7,x+6):
            d.rounded_rectangle((xx,y0+dy//2,xx+2,y0+dy//2+13),radius=1,fill=(166,173,166))
        d.rectangle((x0+10,y0+dy//2-15,x0+19,y0+dy//2-7),fill=(162,174,177))

def seams(d,w,h,spacing,lower):
    for x in range(3,w,spacing):
        d.line((x,1,x,h-1),fill=(120,116,107))
        d.line((x+1,1,x+1,h-1),fill=(165,160,146))
    for y in lower:
        d.line((0,y,w,y),fill=(107,105,99),width=2)
        d.line((0,y+2,w,y+2),fill=(173,168,153),width=1)

# Cyberpunk glow colors from docs/themes/cyberpunk.md, and the paint they show by day.
CYAN, CYAN_PAINT = (53,214,224), (128,190,196)
GREEN, GREEN_PAINT = (126,224,90), (128,176,104)
OCHRE = (140,122,58)

# The advanced utopian faction from docs/factions/advanced-utopian.md: spotless and glossy, glowing softly.
UTOPIAN = 'advanced_utopian_'
ICE = (214,242,240)
SHELL, SHELL_SHADE, GLASS, LIT = (221,220,215), (142,141,136), (26,33,41), (169,196,198)
MOSS, SOLAR, STONE, WATER = (88,105,77), (43,54,68), (168,167,162), (34,48,58)
LEAF_PAINT = (160,196,198)
# Surface finish as (roughness, metallic), from the faction file's Surfaces table.
GLOSSY, MIRROR, CELLS, SATIN, MATTE, LAWN = (.25,0), (.07,0), (.15,0), (.3,1), (.7,0), (.9,0)
SURFACES = {
    'advanced_utopian_glass': MIRROR, 'advanced_utopian_tower_glass': MIRROR, 'advanced_utopian_dome': MIRROR,
    'advanced_utopian_pool': (.05,0), 'advanced_utopian_court': LAWN,
    'advanced_utopian_apron_depot': MATTE, 'advanced_utopian_apron_factory': MATTE,
    'advanced_utopian_podium_top': MATTE, 'advanced_utopian_plaza': MATTE, 'advanced_utopian_stone': MATTE,
    'advanced_utopian_podium': MATTE, 'advanced_utopian_metal': SATIN, 'advanced_utopian_underside': (.4,0),
    'advanced_utopian_suit': (.55,0), 'advanced_utopian_visor': MIRROR,
}

# The toxic industrial faction from docs/factions/toxic-industrial.md: soot, rust, furnace fire, and toxic sludge.
SOOT, ASH, CORRODED, RUST = (42,40,38), (110,106,99), (77,71,64), (107,74,51)
STAIN, MUD, SLAG, OILY = (140,138,62), (92,81,69), (61,58,54), (44,47,42)
FURNACE, FURNACE_PAINT, TOXIC, TOXIC_PAINT = (232,135,58), (190,120,70), (168,196,60), (130,150,70)
SURFACES |= {
    'toxic_industrial_ground': (.95,0), 'toxic_industrial_roof': (.7,0), 'toxic_industrial_tank': (.4,1),
    'toxic_industrial_scaffold': (.9,0), 'toxic_industrial_stack': (.9,0), 'toxic_industrial_concrete': (.9,0),
    'toxic_industrial_cells': (.9,0), 'toxic_industrial_banner': (.95,0), 'toxic_industrial_sludge': (.1,0), 'toxic_industrial_emblem': (.9,0),
    'toxic_industrial_stack_top': (.9,0), 'toxic_industrial_furnace': (.6,1), 'toxic_industrial_steel': (.6,1),
    'toxic_industrial_hazard': (.85,0), 'toxic_industrial_pad': (.9,0), 'toxic_industrial_apron': (.95,0),
    'toxic_industrial_slab_top': (.9,0), 'toxic_industrial_tank_top': (.45,1), 'toxic_industrial_blast_door': (.55,1),
    'toxic_industrial_concrete_plain': (.9,0), 'toxic_industrial_slab': (.9,0), 'toxic_industrial_wall_top': (.8,1),
}

def soot(im, reach=1.0, strength=200):
    """Soot darkening a card from the top down over `reach` of its height."""
    w,h=im.size
    mask=Image.new('L',im.size)
    d=ImageDraw.Draw(mask)
    for y in range(int(h*reach)):
        d.line((0,y,w,y),fill=round(strength*(1-y/(h*reach))**1.6))
    im.paste(SOOT,(0,0),mask)

def drips(im, count):
    """Yellow chemical drips running down from random points."""
    w,h=im.size
    mask=Image.new('L',im.size)
    md=ImageDraw.Draw(mask)
    for _ in range(count):
        x,y=rng.randrange(w),rng.randrange(h//2)
        md.line((x,y,x+rng.randint(-2,2),y+rng.randrange(20,h//2)),fill=rng.randint(80,160),width=rng.randint(3,6))
    im.paste(STAIN,(0,0),mask.filter(ImageFilter.GaussianBlur(1.5)))

def smokestacks(d, c, cy, r, color):
    """The toxic industrial crest: a gear ring around three smokestacks of different heights."""
    for k in range(12):
        a=math.radians(k*30)
        d.line((c+r*.8*math.cos(a),cy+r*.8*math.sin(a),c+r*math.cos(a),cy+r*math.sin(a)),fill=color,width=max(3,r//6))
    d.ellipse((c-r*.82,cy-r*.82,c+r*.82,cy+r*.82),outline=color,width=max(2,r//8))
    for dx,top in ((-.32,-.35),(0,-.6),(.32,-.15)):
        d.rectangle((c+(dx-.09)*r,cy+top*r,c+(dx+.09)*r,cy+.45*r),fill=color)

# The cyber samurai faction from docs/factions/cyber-samurai.md: black lacquer, steel tiles, warm screens, crimson lines.
LACQUER, LACQUER_EDGE, TILE, TILE_LIGHT = (30,28,29), (58,53,55), (59,65,72), (106,113,121)
PLATE, CORD, VERMILION, BRASS = (74,79,85), (143,47,42), (168,57,43), (160,132,82)
PAPER, PLASTER, GRANITE, JOINT, MOSS_JOINT = (217,201,163), (207,200,184), (119,115,107), (79,76,71), (79,90,62)
LANTERN, CRIMSON, CRIMSON_PAINT = (242,184,102), (224,72,60), (196,86,76)
SURFACES |= {
    'cyber_samurai_gravel': (.9,0), 'cyber_samurai_roof_tiles': (.45,1), 'cyber_samurai_stone': (.9,0),
    'cyber_samurai_wall_screens': (.3,0), 'cyber_samurai_wall_armor': (.4,1), 'cyber_samurai_plaster': (.85,0),
    'cyber_samurai_emblem': (.3,0), 'cyber_samurai_lantern': (.85,0), 'cyber_samurai_lacquer': (.3,0),
    'cyber_samurai_vermilion': (.3,0), 'cyber_samurai_eave': (.3,0), 'cyber_samurai_lamp': (.3,0),
    'cyber_samurai_loading_court': (.9,0), 'cyber_samurai_forge_apron': (.9,0),
    'cyber_samurai_refinery_court': (.9,0), 'cyber_samurai_forge_door': (.4,1),
    'cyber_samurai_forge_vent': (.45,1), 'cyber_samurai_tank_plate': (.4,1), 'cyber_samurai_brass': (.3,1),
    'cyber_samurai_tech_shell': (.44,.73), 'cyber_samurai_tech_wall': (.47,.62),
    'cyber_samurai_tech_edge': (.38,.74), 'cyber_samurai_power_band': (.41,.58),
    'cyber_samurai_separator': (.41,.65), 'cyber_samurai_forge_spine': (.48,.65),
}

def finish(rough_metal):
    """A surface-map color: green is roughness and blue is metallic."""
    rough, metal = rough_metal
    return (255, round(rough*255), round(metal*255))

def emblem(d, glow, c, cy, r):
    """The faction emblem: a white ring around a rising leaf that glows softly."""
    d.ellipse((c-r,cy-r,c+r,cy+r),fill=(150,152,150))
    d.ellipse((c-r,cy-r,c+r,cy+r),outline=(246,246,242),width=max(3,r//4))
    k=r/40
    leaf=[(c-13*k,cy+20*k),(c-17*k,cy+3*k),(c-9*k,cy-13*k),(c+4*k,cy-25*k),
          (c+15*k,cy-28*k),(c+11*k,cy-13*k),(c+2*k,cy+3*k),(c-7*k,cy+15*k)]
    d.polygon(leaf,fill=LEAF_PAINT)
    mask=Image.new('L',glow.size)
    ImageDraw.Draw(mask).polygon(leaf,fill=230)
    glow.paste(ICE,(0,0),mask.filter(ImageFilter.GaussianBlur(max(1,r/20))))

def crest(d, glow, c, cy, r):
    """The cyber samurai crest: a brass ring broken at the top around an upright blade that glows crimson."""
    d.arc((c-r,cy-r,c+r,cy+r),-58,238,fill=BRASS,width=max(3,r//5))
    k=r/40
    blade=[(c,cy-38*k),(c+5*k,cy-28*k),(c+5*k,cy+16*k),(c-5*k,cy+16*k),(c-5*k,cy-28*k)]
    d.polygon(blade,fill=CRIMSON_PAINT)
    d.rectangle((c-15*k,cy+16*k,c+15*k,cy+22*k),fill=BRASS)
    d.rectangle((c-3*k,cy+22*k,c+3*k,cy+34*k),fill=LACQUER_EDGE)
    mask=Image.new('L',glow.size)
    ImageDraw.Draw(mask).polygon(blade,fill=240)
    glow.paste(CRIMSON,(0,0),mask.filter(ImageFilter.GaussianBlur(max(1,r/30))))

def lerp(start, end, t):
    return tuple(round(a+(b-a)*t) for a,b in zip(start,end))

def wash(glow, box, color, blur, strength=255):
    """A soft glow that fades out from `box`, never a hard edge."""
    mask=Image.new('L',glow.size)
    ImageDraw.Draw(mask).rectangle(box,fill=strength)
    glow.paste(color,(0,0),mask.filter(ImageFilter.GaussianBlur(blur)))

def joints(d, w, h, spacing, color, light, rows=()):
    """Fine panel joints, a dark line with a light edge beside it."""
    for x in range(spacing,w,spacing):
        d.line((x,0,x,h),fill=color)
        d.line((x+1,0,x+1,h),fill=light)
    for y in rows:
        d.line((0,y,w,y),fill=color)
        d.line((0,y+1,w,y+1),fill=light)


def rust(im, count, top=0):
    """Rust streaks running down from rows near `top`."""
    w,h=im.size
    mask=Image.new('L',im.size)
    d=ImageDraw.Draw(mask)
    for _ in range(count):
        x=rng.randrange(w)
        y=top+rng.randrange(max(1,h//4))
        d.line((x,y,x+rng.randrange(-2,3),y+rng.randrange(8,max(9,h//2))),fill=rng.randint(80,170),width=rng.randint(1,4))
    im.paste((104,68,42),(0,0),mask.filter(ImageFilter.GaussianBlur(1.5)))

def patches(im, count, region=None, sheen=False):
    """Patched panels and wet stains. `sheen` adds pale reflections for wet roofs."""
    w,h=im.size
    x0,y0,x1,y1=region or (0,0,w,h)
    d=ImageDraw.Draw(im)
    for _ in range(count):
        pw,ph=rng.randrange(18,60),rng.randrange(14,44)
        x,y=rng.randrange(x0,max(x0+1,x1-pw)),rng.randrange(y0,max(y0+1,y1-ph))
        tone=rng.choice([(72,76,80),(48,51,55),(66,62,56),(52,64,66)])
        d.rectangle((x,y,x+pw,y+ph),fill=tone,outline=(34,36,40))
        for bx,by in ((x+3,y+3),(x+pw-3,y+3),(x+3,y+ph-3),(x+pw-3,y+ph-3)):
            d.point((bx,by),fill=(110,112,112))
    mask=Image.new('L',im.size)
    md=ImageDraw.Draw(mask)
    for _ in range(count):
        x,y=rng.randrange(w),rng.randrange(h)
        md.ellipse((x-rng.randrange(8,30),y-rng.randrange(6,20),x+rng.randrange(8,30),y+rng.randrange(6,20)),fill=rng.randint(60,140))
    im.paste((26,28,31),(0,0),mask.filter(ImageFilter.GaussianBlur(5)))
    if sheen:
        mask=Image.new('L',im.size)
        md=ImageDraw.Draw(mask)
        for _ in range(count):
            x,y=rng.randrange(w),rng.randrange(h)
            md.line((x,y,x+rng.randrange(20,70),y+rng.randrange(-6,7)),fill=rng.randint(60,130),width=rng.randint(2,5))
        im.paste((112,128,142),(0,0),mask.filter(ImageFilter.GaussianBlur(2)))

def channels(d, h, xs, top=0):
    """Recessed vertical channels in steel cladding."""
    for x in xs:
        d.rectangle((x-3,top,x+3,h),fill=(36,39,44))
        d.line((x+4,top,x+4,h),fill=(84,88,93))

def tiles(d, gd, x0, y0, cols, rows, size, gap, lit=()):
    """Dark glass tiles, with the (col, row) pairs in `lit` glowing pale cyan."""
    for row in range(rows):
        for col in range(cols):
            x,y=x0+col*(size[0]+gap),y0+row*(size[1]+gap)
            box=(x,y,x+size[0]-1,y+size[1]-1)
            if (col,row) in lit:
                d.rectangle(box,fill=CYAN_PAINT)
                gd.rectangle((x+1,y+1,x+size[0]-2,y+size[1]-2),fill=(150,226,230))
            else:
                d.rectangle(box,fill=(29,35,41))
                d.line((x+1,y+1,x+size[0]-3,y+1),fill=(58,70,78))

def shutter(d, x0, y0, x1, y1, up=0):
    """A roller shutter, raised by `up` pixels."""
    d.rectangle((x0,y0,x1,y1),fill=(30,33,37))
    for y in range(y0+up,y1,5):
        d.line((x0,y,x1,y),fill=(78,82,86))
        d.line((x0,y+1,x1,y+1),fill=(58,62,66))

def hazard(im, x0, y0, x1, y1, step=10):
    """Ochre and black diagonal stripes filling a box."""
    w,h=x1-x0+1,y1-y0+1
    band=Image.new('RGB',(w,h),OCHRE)
    bd=ImageDraw.Draw(band)
    for x in range(-h,w+h,step):
        bd.polygon([(x,h),(x+step//2,h),(x+step//2+h,0),(x+h,0)],fill=(26,26,24))
    im.paste(band,(x0,y0))

painted = {}
for card, (size, base, _) in CARDS.items():
    # Each card seeds its own noise, so adding a card never repaints the others.
    rng = random.Random(card)
    # Glow is painted beside the color, black where nothing glows.
    glow=Image.new('RGB',size,(0,0,0))
    gd=ImageDraw.Draw(glow)
    # The surface map beside it carries roughness and metallic, for sets that paint one.
    surface=Image.new('RGB',size,finish(SURFACES.get(card,GLOSSY if card.startswith(UTOPIAN) else (.86,0))))
    rd=ImageDraw.Draw(surface)
    w,h=size
    is_wall=card.startswith(('wall_office_', 'wall_garage_', 'wall_ward_'))
    broad={'roof_flat_large','lot_two_bay','roof_flat_small','apron_paved','cyber_apron_bays','cyber_roof_tar'}
    if card.startswith(UTOPIAN):
        # Spotless: an even base, so broad noise never reads as stains on the white.
        im=Image.new('RGB',size,base)
    else:
        im=field(size,base,16 if card in broad else 8,4,12)
    d=ImageDraw.Draw(im)

    if is_wall:
        if card.startswith('wall_office_'):
            lower=[78,164,h-17]
        elif card.startswith('wall_ward_slab'):
            lower=[h//3,2*h//3,h-17]
        else:
            lower=[37,h-16]
        seams(d,w,h,76,lower)
        d.rectangle((0,h-15,w,h), fill=(121,120,112))

    if card == 'wall_office_entrance':
        # Broad upper glazing, separate lobby doors and a masonry address pier.
        d.rectangle((21,52,439,113),fill=(109,113,109))
        for a,b,n in [(29,160,3),(166,297,3),(303,431,3)]:
            glass(d,a,59,b,106,n)
        d.rectangle((26,144,300,265),fill=(117,120,113))
        glass(d,39,154,232,266,4,True)
        glass(d,239,156,289,234,1)
        glass(d,324,157,427,220,2)
        d.rectangle((307,230,346,248),fill=(67,85,101))
        text(d,(326,239),'12',15,(198,199,186))
        grime(im,[(24,141,300,149,53),(28,109,431,119,46),(0,0,w,7,47)],35)

    if card == 'wall_office_side':
        for y0,y1 in [(60,111),(164,218)]:
            for x0 in (48,171,294):
                glass(d,x0,y0,x0+104,y1,2)
        grime(im,[(0,0,w,5,55),(0,h-7,w,h,50)],50)

    if card == 'wall_office_rear':
        for x0 in (43,148,253,358):
            glass(d,x0,67,x0+72,113,2)
        d.rectangle((47,170,124,262),fill=(100,107,104))
        d.rectangle((51,174,120,262),fill=(120,125,120))
        d.rectangle((104,217,114,220),fill=(69,74,71))
        d.rectangle((300,185,404,207),fill=(90,100,100))
        for y in range(188,205,4):
            d.line((304,y,400,y),fill=(131,135,127))
        grime(im,[(0,h-7,w,h,68)],65)

    if card == 'wall_garage_two_bay':
        d.rectangle((9,24,282,h-9),fill=(114,113,103))
        for index,(x0,x1) in enumerate(((16,139),(153,276)),1):
            d.rectangle((x0,48,x1,h-3),fill=(68,74,75))
            for y in range(53,h-6,9):
                colors = [(103,117,122),(110,124,127),(117,129,130)]
                d.rectangle((x0+5,y,x1-5,y+6),fill=rng.choice(colors))
                d.line((x0+5,y,x1-5,y),fill=(150,160,154))
            for x in range(x0+13,x1-22,34):
                d.rectangle((x,69,x+25,79),fill=(63,79,87))
                d.line((x+1,70,x+24,70),fill=(110,126,132))
            d.rounded_rectangle((x0+43,26,x1-43,46),radius=2,fill=(55,75,91))
            text(d,((x0+x1)//2,36),f'0{index}',16,(198,194,177),True)
            for x in (x0+3,x1-3):
                d.rectangle((x-2,h-25,x+1,h-6),fill=(163,143,96))
        grime(im,[(14,47,278,53,55),(0,h-8,w,h,65)],20)

    if card in ('wall_garage_side','wall_garage_rear'):
        for x in range(37,w-60,112):
            glass(d,x,52,x+56,76,2)
        if card == 'wall_garage_rear':
            d.rectangle((113,63,171,155),fill=(104,112,112))
            d.rectangle((117,66,166,155),fill=(132,137,129))
            d.line((153,115,163,115),fill=(73,78,76),width=3)
        grime(im,[(0,h-8,w,h,65)],42)

    if card in ('roof_flat_large','roof_flat_small','roof_canopy'):
        for y in range(12,h,54):
            d.line((0,y,w,y),fill=(76,83,84),width=2)
            d.line((0,y+2,w,y+2),fill=(120,126,123),width=1)
            for x in range((y*7)%107,w,107):
                d.line((x,y,x,min(y+54,h)),fill=(83,90,90),width=1)
        if card == 'roof_flat_large':
            for x,y in [(29,29),(426,424)]:
                d.rectangle((x-9,y-9,x+9,y+9),fill=(80,86,85))
                d.ellipse((x-5,y-5,x+5,y+5),fill=(53,62,62))
                for yy in range(y-3,y+4,3):
                    d.line((x-3,yy,x+3,yy),fill=(117,125,120))
            grime(im,[(30,222,304,413,60),(263,69,417,184,52),(31,74,89,141,56),
                      (0,0,w,10,52),(0,h-12,w,h,56),(0,0,8,h,52),(w-10,0,w,h,58)],34)
        if card == 'roof_flat_small':
            grime(im,[(126,71,253,188,60),(34,139,103,228,55),(0,0,w,12,50),
                      (0,h-10,w,h,52),(w-10,0,w,h,52)],22)
        if card == 'roof_canopy':
            d.line((10,h-7,w-10,h-7),fill=(109,125,131),width=2)
            grime(im,[(0,0,w,7,46)],14)

    if card == 'sign_police_roof':
        d.rectangle((11,10,w-12,h-11),outline=(135,149,151),width=3)
        for y in (18,h-19):
            for x in range(19,w-16,34):
                d.ellipse((x-1,y-1,x+1,y+1), fill=(164,167,155))
        cream=(210,211,191)
        d.polygon([(52,55),(99,42),(146,55),(143,106),(134,139),(99,181),
                   (64,139),(55,106)],fill=cream)
        d.polygon([(59,61),(99,50),(139,61),(135,107),(128,135),(99,168),
                   (70,135),(63,107)],fill=(58,76,93))
        star=[]
        for i in range(10):
            angle=-math.pi/2+i*math.pi/5
            radius=32 if i%2==0 else 13
            star.append((99+radius*math.cos(angle),105+radius*math.sin(angle)))
        d.polygon(star,fill=cream)
        text(d,(232,105),'POLICE',51,cream,True)
        d.line((166,136,303,136),fill=(153,163,163),width=2)
        text(d,(232,157),'PRECINCT 12',23,(192,197,184),True)
        grime(im,[(0,0,w,11,32),(0,h-8,w,h,41)],19)

    if card == 'sign_police_fascia':
        d.line((5,h-5,w-5,h-5),fill=(129,147,155),width=2)
        text(d,(w//2,13),'POLICE STATION',26,(218,220,201),True)
    if card == 'wall_metal_band':
        d.line((0,7,w,7),fill=(138,145,143),width=2)
        d.line((0,h-7,w,h-7),fill=(77,90,96),width=3)
        for x in range(34,w,49):
            d.line((x,6,x,h-6),fill=(85,94,96),width=2)
        grime(im,[(0,0,w,6,40)],17)

    if card in ('hvac_top','hvac_intake'):
        d.rounded_rectangle((8,9,w-9,h-10),radius=6,fill=(78,89,92),outline=(149,156,146),width=2)
        if card == 'hvac_top':
            for x in (39,95):
                center=h//2
                d.ellipse((x-23,center-23,x+23,center+23),fill=(59,69,71),outline=(151,159,151),width=2)
                for angle in range(0,360,60):
                    r=math.radians(angle)
                    d.line((x,center,x+18*math.cos(r),center+18*math.sin(r)),fill=(106,118,115),width=4)
                d.ellipse((x-4,center-4,x+4,center+4),fill=(149,155,145))
        else:
            for y in range(16,h-12,6):
                d.line((12,y,w-13,y),fill=(145,149,138),width=2)
    if card == 'hvac_side':
        d.rectangle((11,8,98,h-11),fill=(75,86,88))
        for y in range(11,h-12,5):
            d.line((14,y,95,y),fill=(130,139,134),width=2)
        d.rectangle((106,12,123,20),fill=(170,159,124))
        grime(im,[(0,h-5,w,h,43)],12)

    if card == 'lot_two_bay':
        # Y on the lot runs from back at row zero to the street at the bottom.
        d.rectangle((492,449,800,h-13),fill=(93,95,91))
        d.line((492,449,492,h-13),fill=(119,119,110),width=4)
        d.line((13,h-12,w-13,h-12),fill=(148,145,131),width=2)
        d.line((12,0,12,h),fill=(141,138,126),width=2)
        d.line((w-13,0,w-13,h),fill=(139,138,127),width=2)
        for y in (98,229,394,514,613,695):
            d.line((12,y,491,y),fill=(91,91,84),width=2)
            d.line((12,y+2,491,y+2),fill=(132,130,118))
        for x in (73,225,375):
            d.line((x,530,x,h-14),fill=(88,88,83),width=1)
        for x in (511,644,779):
            d.line((x,479,x,h-27),fill=(159,150,117),width=4)
        for x in (573,709):
            for wheel in (-30,30):
                d.line((x+wheel,481,x+wheel+3,645),fill=(85,86,80),width=6)
            d.polygon([(x,565),(x-11,588),(x-4,588),(x-4,609),
                       (x+4,609),(x+4,588),(x+11,588)],fill=(165,160,139))
        d.line((513,653,637,653),fill=(150,147,128),width=4)
        d.line((651,653,778,653),fill=(150,147,128),width=4)
        for y in range(615,659,10):
            d.rounded_rectangle((89,y,283,y+4),radius=1,fill=(165,163,146))
        d.rectangle((424,640,451,657),fill=(76,82,81),outline=(134,136,127),width=1)
        for x in range(428,449,4):
            d.line((x,643,x,654),fill=(140,142,131))
        grime(im,[(39,81,504,539,100),(489,100,800,464,101),(69,517,319,613,58),
                  (517,460,777,489,55),(569,518,583,562,48),(699,554,719,596,49)],75)

    if card in ('foundation','coping','column'):
        d.line((0,3,w,3),fill=tuple(min(255,c+20) for c in base),width=1)
        d.line((0,h-4,w,h-4),fill=tuple(max(0,c-22) for c in base),width=2)
        if card != 'column':
            for x in range(34,w,58):
                d.line((x,3,x,h-3),fill=tuple(max(0,c-19) for c in base))
        grime(im,[(0,h-9,w,h,45)],7)


    if card == 'apron_paved':
        for x in range(0,w,128):
            d.line((x,0,x,h),fill=(92,92,86),width=2)
            d.line((x+2,0,x+2,h),fill=(132,130,118))
        for y in range(0,h,102):
            d.line((0,y,w,y),fill=(92,92,86),width=2)
            d.line((0,y+2,w,y+2),fill=(132,130,118))
        d.rectangle((0,0,w-1,h-1),outline=(141,138,126),width=5)
        grime(im,[(60,60,w-60,h-60,55),(0,0,w,14,40)],60)

    if card == 'sign_hospital_roof':
        d.rectangle((10,10,w-11,h-11),outline=(118,120,114),width=3)
        for x in range(18,w-16,30):
            for y in (18,h-19):
                d.ellipse((x-1,y-1,x+1,y+1),fill=(110,112,106))
        d.ellipse((w//2-102,h//2-102,w//2+102,h//2+102),outline=(214,214,200),width=10)
        text(d,(w//2,h//2+5),'H',150,(150,48,42),True)
        grime(im,[(0,0,w,10,32),(0,h-8,w,h,41)],14)

    if card == 'sign_hospital_fascia':
        d.line((4,h-3,w-4,h-3),fill=(176,128,118),width=2)
        text(d,(w//2,11),'EMERGENCY',19,(226,220,204),True)

    if card == 'roof_barrel_seam':
        # Broad ribs only. Fine seams turn into stripes at phone size, so corrugation stays faint.
        for y in range(3,h,6):
            d.line((0,y,w,y),fill=(76,80,63))
        for y in range(30,h,60):
            d.rectangle((0,y,w,y+6),fill=(112,120,86))
            d.line((0,y+7,w,y+7),fill=(52,56,42),width=3)
        star=[]
        for i in range(10):
            angle=-math.pi/2+i*math.pi/5
            radius=44 if i%2==0 else 18
            star.append((w/2+radius*math.cos(angle),h/2+4+radius*math.sin(angle)))
        d.polygon(star,fill=(150,148,118))
        grime(im,[(0,0,w,8,40),(0,h-8,w,h,40)],40)


    if card == 'marking_ambulance_bays':
        yellow=(171,158,104)
        for x0 in (6,118):
            d.rectangle((x0,6,x0+104,58),outline=yellow,width=3)
            cx=x0+52
            for dy in (14,30):
                d.line((cx-22,dy+14,cx,dy,cx+22,dy+14),fill=(140,56,48),width=5,joint='curve')
        for x in range(-40,w,14):
            d.line((x,64,x+14,76),fill=yellow,width=3)
        grime(im,[(20,20,100,50,40),(132,20,212,50,40)],10)

    if card == 'wall_ward_slab':
        red=(108,46,42)
        for top in (22,114,206):
            d.rectangle((10,top-4,w-10,top+44),fill=(109,113,109))
            glass(d,16,top,112,top+38,3)
            for a in range(160,420,88):
                glass(d,a,top,a+82,top+38,3)
        d.rectangle((126,10,146,h-17),fill=red)
        for top in (40,132,224):
            d.rectangle((131,top,141,top+16),fill=(58,62,60))
        grime(im,[(0,0,w,8,47),(10,64,w-10,70,40),(10,156,w-10,162,40),(10,248,w-10,254,40)],70)

    if card == 'wall_ward_slab_end':
        for top in (30,122,214):
            glass(d,52,top,98,top+34,1)
        grime(im,[(0,0,w,8,47)],30)

    if card == 'wall_podium_entrance':
        seams(d,w,h,64,[h-17])
        d.rectangle((0,h-15,w,h),fill=(121,120,112))
        d.rectangle((0,0,w,11),fill=(128,50,45))
        d.line((0,12,w,12),fill=(84,36,33),width=2)
        d.rectangle((34,22,146,h),fill=(117,120,113))
        glass(d,42,28,138,h-5,4,True)
        for x0 in (176,246):
            glass(d,x0,30,x0+56,58,2)
        grime(im,[(0,13,w,20,45),(0,h-6,w,h,45)],20)

    if card == 'gable_quonset_end':
        for x in range(4,w,9):
            d.line((x,0,x,h),fill=(66,70,56))
            d.line((x+1,0,x+1,h),fill=(98,102,84))
        d.rectangle((88,48,132,h),fill=(62,66,50))
        d.rectangle((92,52,128,h),fill=(96,104,78))
        d.rectangle((120,80,124,84),fill=(170,160,120))
        for x0 in (38,158):
            glass(d,x0,50,x0+24,66,1)
        text(d,(110,34),'3',16,(196,190,160),True)
        grime(im,[(0,h-8,w,h,55)],18)

    if card == 'marking_muster_yard':
        d.rectangle((8,8,w-9,h-9),outline=(186,184,166),width=3)
        d.line((w//2,18,w//2,h-18),fill=(186,184,166),width=2)
        for y in (36,64):
            for x in (48,100,152,208,260,312):
                d.rectangle((x-10,y-4,x+10,y+4),fill=(171,158,104))
        grime(im,[(20,20,w-20,h-20,35)],15)

    if card == 'flag_army':
        star=[]
        for i in range(10):
            angle=-math.pi/2+i*math.pi/5
            radius=19 if i%2==0 else 8
            star.append((47+radius*math.cos(angle),31+radius*math.sin(angle)))
        d.polygon(star,fill=(214,206,170))

    if card == 'cyber_hospital_ward':
        for i, y in enumerate((26, 121, 216)):
            d.rectangle((12,y,w-13,y+68),fill=(38,44,48))
            for j, x in enumerate(range(21,w-44,56)):
                glass(d,x,y+10,x+42,y+53,2)
                if (i+j*2)%5 == 0:
                    d.rectangle((x+7,y+19,x+19,y+45),fill=(147,129,108))
                    gd.rectangle((x+7,y+19,x+19,y+45),fill=(150,118,84))
                    d.line((x+7,y+35,x+19,y+35),fill=(100,89,81),width=3)
                else:
                    d.line((x+7,y+19,x+35,y+19),fill=(113,143,149),width=3)
            d.line((14,y+70,w-15,y+70),fill=(114,118,119),width=2)
            d.rectangle((16,y+76,w-17,y+77),fill=(51,55,58))
        for x in (12,w-21):
            d.rectangle((x,12,x+8,h-13),fill=(54,55,59))
            d.rectangle((x+2,24,x+6,h-25),fill=(171,84,78))
            gd.rectangle((x+2,24,x+6,h-25),fill=(255,96,84))
        d.rectangle((112,11,307,23),fill=(50,54,61))
        text(d,(w//2,16),'TRAUMA WARDS / 07',11,(190,181,167),True)
        grime(im,[(0,h-24,w,h,60),(0,0,w,7,47)],32)

    if card == 'cyber_hospital_lobby':
        for x in range(5,w,49):
            d.line((x,28,x,h),fill=(52,56,61),width=2)
        d.rectangle((6,6,w-7,31),fill=(71,44,46))
        d.line((8,31,w-9,31),fill=(176,94,82),width=3)
        gd.line((8,31,w-9,31),fill=(255,96,84),width=3)
        glass(d,29,44,134,92,3)
        glass(d,148,42,265,113,4,True)
        glass(d,281,44,382,92,3)
        grime(im,[(0,h-8,w,h,45),(5,34,w-6,40,37)],18)

    if card == 'cyber_hospital_pad':
        ink=(198,193,175)
        for x in (36,104,246,314):
            d.line((x,12,x,h-13),fill=(56,60,66),width=2)
            d.line((x+2,12,x+2,h-13),fill=(85,89,91))
        for y in (46,146,213,305):
            d.line((12,y,w-13,y),fill=(57,61,67),width=2)
        d.rounded_rectangle((11,11,w-12,h-12),radius=18,outline=(132,68,67),width=6)
        d.ellipse((51,51,w-52,h-52),outline=ink,width=8)
        text(d,(w//2,h//2),'H',168,ink,True)
        text(d,(w//2,37),'AIR AMBULANCE',21,(186,178,164),True)
        for x in (21,w-22):
            for y in range(35,h-25,56):
                d.rounded_rectangle((x-5,y-7,x+5,y+7),radius=3,fill=(206,115,101))
                gd.rounded_rectangle((x-5,y-7,x+5,y+7),radius=3,fill=(255,110,96))
        for x in range(116,236,24):
            d.line((x,h-36,x+10,h-24),fill=(165,143,108),width=4)
        grime(im,[(0,0,w,9,43),(0,h-12,w,h,48),(42,260,309,287,35)],28)

    if card == 'cyber_clinic_street':
        # Spans the podium front from X=-2.4 to 1.0, about 141 pixels per unit.
        d.rectangle((0,0,w,12),fill=(44,47,52))
        d.line((0,13,w,13),fill=(86,90,95),width=2)
        channels(d,h,(104,224,232,424),14)
        d.rectangle((0,h-9,w,h),fill=(46,48,50))
        # Pharmacy counter: shutter part raised over a lit counter, a small green cross above.
        d.rectangle((12,46,94,h-9),fill=(70,74,80))
        d.rectangle((16,50,90,80),fill=(29,35,41))
        d.rectangle((20,60,86,72),fill=CYAN_PAINT)
        gd.rectangle((20,60,86,72),fill=(120,200,206))
        shutter(d,16,80,90,h-10)
        d.rectangle((41,20,65,42),fill=(28,30,34))
        d.rectangle((50,23,56,39),fill=GREEN_PAINT)
        d.rectangle((44,28,62,34),fill=GREEN_PAINT)
        gd.rectangle((50,23,56,39),fill=GREEN)
        gd.rectangle((44,28,62,34),fill=GREEN)
        # Clinic door with a lit hall behind dark glass.
        d.rectangle((118,36,206,h-9),fill=(72,76,82))
        d.rectangle((123,41,201,h-9),fill=(29,35,41))
        d.rectangle((127,62,197,76),fill=CYAN_PAINT)
        gd.rectangle((127,62,197,76),fill=(110,190,196))
        for x in (149,162,175):
            d.line((x,41,x,h-9),fill=(70,74,80),width=3)
        text(d,(162,25),'CLINIC 24',15,(196,192,178),True)
        # Ambulance bays: two roller doors in hazard frames.
        for x0,x1 in ((258,330),(334,406)):
            hazard(im,x0,34,x1,h-9,12)
            shutter(d,x0+7,41,x1-7,h-9)
        d.rectangle((328,34,336,h-9),fill=(44,47,52))
        patches(im,5,(410,14,470,h-10))
        rust(im,60,14)
        grime(im,[(0,h-14,w,h,70),(0,14,w,22,50)],18)

    if card == 'cyber_clinic_tower':
        # Spans X=-2.2 to 0.8. The sign blade covers the first 70 pixels.
        d.rectangle((0,0,w,7),fill=(42,45,50))
        channels(d,h,(36,72,306),8)
        for top in (20,98):
            d.rectangle((78,top-6,302,top+52),fill=(42,46,52))
            tiles(d,gd,84,top,8,1,(22,46),5,lit={(2,0),(6,0)} if top == 20 else {(4,0)})
        d.rectangle((78,82,302,88),fill=(70,74,80))
        # Stained teal panel field with a small screen.
        d.rectangle((314,14,430,166),fill=(47,74,76))
        for y in (62,114):
            d.line((314,y,430,y),fill=(36,56,58),width=2)
        d.line((372,14,372,166),fill=(36,56,58),width=2)
        d.rectangle((326,24,418,54),fill=(20,26,30))
        for i,(x,length) in enumerate([(332,30),(332,52),(332,40),(332,64)]):
            y=29+i*6
            d.line((x,y,x+length,y),fill=CYAN_PAINT,width=3)
            gd.line((x,y,x+length,y),fill=CYAN,width=3)
        text(d,(372,140),'MED 7',30,(176,184,170),True)
        patches(im,6,(0,8,78,h))
        rust(im,80,6)
        grime(im,[(0,h-10,w,h,60),(0,0,w,8,40)],24)

    if card == 'cyber_clinic_upper':
        # Spans X=-1.85 to 0.15, about 150 pixels per unit.
        d.rectangle((0,0,w,8),fill=(42,45,50))
        patches(im,7,(0,10,190,h))
        channels(d,h,(10,184),9)
        for top in (30,98):
            d.rectangle((18,top-5,176,top+44),fill=(42,46,52))
        tiles(d,gd,22,30,7,1,(18,38),4,lit={(1,0)})
        tiles(d,gd,22,98,7,1,(18,38),4,lit={(5,0)})
        # Ochre panel field, under a third of the face, with a painted block number.
        d.rectangle((196,12,292,160),fill=OCHRE)
        for y in (60,108):
            d.line((196,y,292,y),fill=(110,96,46),width=2)
        text(d,(244,72),'07',86,(30,30,28),True)
        hazard(im,196,134,292,160,14)
        rust(im,60,8)
        grime(im,[(0,h-10,w,h,60),(196,12,292,20,40)],26)

    if card == 'cyber_wall_channels':
        d.rectangle((0,0,w,7),fill=(42,45,50))
        channels(d,h,range(24,w,50),8)
        for top in (34,104):
            tiles(d,gd,34,top,5,1,(18,30),32)
        d.rectangle((270,0,282,h),fill=(84,66,52))
        d.line((271,0,271,h),fill=(118,94,74))
        for y in (30,90,150):
            d.rectangle((266,y,286,y+5),fill=(60,48,40))
        patches(im,8)
        rust(im,90,6)
        grime(im,[(0,h-12,w,h,60)],30)

    if card == 'cyber_lift_shaft':
        # Spans Z=0 to 3.0, 140 pixels per unit. The cab sits at deck level.
        d.rectangle((0,0,10,h),fill=(74,79,85))
        d.rectangle((w-11,0,w,h),fill=(74,79,85))
        d.rectangle((15,8,w-16,h-24),fill=(29,35,41))
        for y in range(8,h-90,70):
            d.line((15,y,w-16,y+70),fill=(66,70,76),width=3)
            d.line((w-16,y,15,y+70),fill=(66,70,76),width=3)
        for y in (98,280):
            d.rectangle((0,y,w,y+7),fill=(84,88,93))
        d.rectangle((18,50,w-19,86),fill=CYAN_PAINT)
        gd.rectangle((20,52,w-21,84),fill=(130,220,226))
        d.line((18,68,w-19,68),fill=(60,70,76),width=2)
        gd.ellipse((32,12,40,20),fill=CYAN)
        d.ellipse((32,12,40,20),fill=CYAN_PAINT)
        hazard(im,0,h-24,w-1,h-1,10)
        rust(im,10,0)

    if card == 'cyber_sign_pharmacy':
        d.rectangle((0,0,w-1,h-1),outline=(70,74,80),width=4)
        d.rectangle((10,10,w-11,84),fill=(22,26,30))
        cx,cy=w//2,47
        for box in ((cx-11,cy-31,cx+11,cy+31),(cx-31,cy-11,cx+31,cy+11)):
            d.rectangle(box,fill=GREEN_PAINT)
            gd.rectangle(box,fill=GREEN)
        d.line((8,94,w-9,94),fill=(70,74,80),width=3)
        for i,letter in enumerate('CLINIC'):
            y=128+i*56
            text(d,(cx,y),letter,56,CYAN_PAINT,True)
            text(gd,(cx,y),letter,56,CYAN,True)
        grime(im,[(0,h-10,w,h,40)],8)

    if card == 'cyber_landing_deck':
        # Seen from above. The top rows are the back of the deck, the bottom rows the front.
        for x in range(0,w,40):
            d.line((x,0,x,h),fill=(48,52,58),width=2)
        for y in range(0,h,40):
            d.line((0,y,w,y),fill=(48,52,58),width=2)
        band=16
        hazard(im,0,0,w-1,band,14)
        hazard(im,0,h-band-1,w-1,h-1,14)
        side=Image.new('RGB',(band,h),OCHRE)
        sd=ImageDraw.Draw(side)
        for y in range(-band,h,14):
            sd.polygon([(0,y),(0,y+7),(band,y+7+band),(band,y+band)],fill=(26,26,24))
        im.paste(side,(0,0))
        im.paste(side,(w-band,0))
        # Lamps at the corners and mid-edges only, so the ring doesn't read as a selection marker.
        lamps=[(x,y) for x in (9,w//2,w-10) for y in (9,h-10)]+[(x,h//2) for x in (9,w-10)]
        for x,y in lamps:
            d.rounded_rectangle((x-5,y-5,x+5,y+5),radius=3,fill=(150,210,214))
            gd.rounded_rectangle((x-5,y-5,x+5,y+5),radius=3,fill=CYAN)
        cx,cy=w//2,h//2+8
        d.ellipse((cx-96,cy-96,cx+96,cy+96),outline=(62,112,112),width=12)
        cream=(222,216,194)
        d.rectangle((cx-22,cy-68,cx+22,cy+68),fill=cream)
        d.rectangle((cx-68,cy-22,cx+68,cy+22),fill=cream)
        text(d,(cx,32),'DECK 2',18,(170,168,154),True)
        grime(im,[(0,0,w,band+4,30),(band,band,w-band,h-band,22)],30)

    if card == 'cyber_canopy_fascia':
        d.rectangle((0,0,w,2),fill=(150,156,160))
        text(d,(w//2,10),'AMBULANCE',17,(214,210,194),True)
        d.rectangle((2,h-6,w-3,h-2),fill=CYAN_PAINT)
        gd.rectangle((2,h-6,w-3,h-2),fill=CYAN)

    if card == 'cyber_apron_bays':
        # Seen from above, 112 pixels per unit: column = (X + 2.5) * 112, row = (2 - Y) * 112.
        d.rectangle((0,0,w-1,h-1),outline=(70,72,74),width=6)
        for x0,x1,label in ((210,272,'1'),(278,340,'2')):
            d.rectangle((x0,308,x1,436),outline=OCHRE,width=4)
            for y in (384,400):
                d.line((x0+12,y+12,(x0+x1)//2,y,x1-12,y+12),fill=(118,104,52),width=4)
            text(d,((x0+x1)//2,422),label,22,(168,164,148),True)
        for x in range(26,184,18):
            d.rectangle((x,380,x+8,432),fill=(104,106,104))
        yard=im.crop((428,124,545,421))
        yd=ImageDraw.Draw(yard)
        for x in range(-300,120,22):
            yd.line((x,297,x+297,0),fill=(96,86,46),width=3)
        im.paste(yard,(428,124))
        d.rectangle((424,120,548,424),outline=OCHRE,width=4)
        for _ in range(7):
            x,y=rng.randrange(20,w-60),rng.randrange(300,h-30)
            rx,ry=rng.randrange(14,34),rng.randrange(6,14)
            d.ellipse((x-rx,y-ry,x+rx,y+ry),fill=(46,52,60))
            d.arc((x-rx+3,y-ry+2,x+rx-3,y+ry-2),200,330,fill=(112,126,140),width=3)
        grime(im,[(200,300,350,440,30)],40)

    if card == 'cyber_roof_tar':
        for y in range(0,h,60):
            d.line((0,y,w,y),fill=(40,43,47),width=3)
        for x in range(0,w,75):
            d.line((x,0,x,h),fill=(42,45,49),width=2)
        for _ in range(6):
            x,y=rng.randrange(10,w-80),rng.randrange(10,h-60)
            shade=rng.randrange(44,62)
            d.rectangle((x,y,x+rng.randrange(30,70),y+rng.randrange(20,50)),fill=(shade,shade+3,shade+6),outline=(36,38,42))
        for _ in range(5):
            x,y=rng.randrange(20,w-40),rng.randrange(20,h-30)
            d.ellipse((x-22,y-9,x+22,y+9),fill=(32,36,41))
            d.arc((x-22,y-9,x+22,y+9),200,320,fill=(78,88,98),width=2)
        patches(im,10,sheen=True)
        rust(im,30,0)
        grime(im,[(0,0,w,10,40),(0,h-10,w,h,40),(0,0,10,h,40),(w-10,0,w,h,40)],30)

    if card == 'cyber_trim_cyan':
        d.line((0,1,w,1),fill=(84,88,94),width=2)
        d.rectangle((0,8,w,12),fill=CYAN_PAINT)
        gd.rectangle((0,8,w,12),fill=CYAN)
        d.line((0,h-2,w,h-2),fill=(28,30,34),width=2)

    if card == 'cyber_metal_rust':
        for x in range(4,w,12):
            d.line((x,0,x,h),fill=(64,50,40),width=2)
            d.line((x+2,0,x+2,h),fill=(110,88,70))
        rust(im,24,0)
        grime(im,[(0,h-8,w,h,50)],10)

    if card == 'cyber_lamp':
        d.rectangle((2,2,w-3,h-3),outline=(74,79,85),width=3)
        d.ellipse((10,10,w-11,h-11),fill=(170,225,228))
        gd.ellipse((10,10,w-11,h-11),fill=CYAN)

    if card == 'cyber_therapy_front':
        d.rectangle((0,14,w-1,52),fill=(49,69,69),outline=(33,49,51),width=2)
        d.rectangle((12,61,144,120),fill=(31,35,40),outline=(100,98,90),width=3)
        for x in (46,79,112):
            d.line((x,64,x,116),fill=(67,72,74),width=3)
        for offset, tone in ((0,(146,119,88)),(19,(126,100,77)),(38,(133,113,89))):
            d.polygon(((12,73+offset),(137,64+offset),(138,76+offset),(12,85+offset)),fill=tone)
            d.line((15,83+offset,133,75+offset),fill=(72,57,45),width=1)
            for x,y in ((18,78+offset),(132,69+offset)):
                d.ellipse((x-1,y-1,x+1,y+1),fill=(45,41,39))
        d.rectangle((163,47,217,137),fill=(29,36,42),outline=(103,130,124),width=3)
        d.rectangle((173,59,207,92),fill=(70,86,88),outline=(36,48,51),width=3)
        d.line((173,85,206,78),fill=(95,107,103),width=2)
        d.line((201,103,209,103),fill=(155,147,123),width=3)
        d.rectangle((224,48,232,102),fill=(98,77,64))
        for x in (25,81,153,223):
            d.line((x,17,x,49),fill=(33,50,50),width=2)
        patches(im,12,(0,0,w,45))
        rust(im,19,8)
        grime(im,[(0,119,w,h,55)],24)

    if card == 'cyber_therapy_sign':
        d.rectangle((3,4,w-4,h-5),outline=(113,87,86),width=2)
        d.line((5,h-7,w-6,h-7),fill=(56,36,39),width=2)
        for x in (9,w-10):
            for y in (9,h-10):
                d.ellipse((x-2,y-2,x+2,y+2),fill=(125,106,98))
        rust(im,14,3)
        text(d,(w//2,h//2+1),'THERAPY',41,(218,146,186))
        text(gd,(w//2,h//2+1),'THERAPY',41,(224,74,200))
        # Dead segments interrupt the tubing while the original painted letter stays legible.
        for x,y,length in ((51,22,8),(116,37,7),(179,23,9)):
            gd.line((x,y,x+length,y+1),fill=(18,4,13),width=3)

    if card == 'cyber_container_wall':
        channels(d,h,range(5,w-3,13))
        d.rectangle((0,0,w-1,h-1),outline=(95,104,94),width=4)
        d.rectangle((5,5,w-6,h-6),outline=(42,50,49),width=2)
        d.rectangle((14,17,67,76),fill=(107,118,93),outline=(36,46,41),width=2)
        text(d,(40,36),'SEC',20,(30,44,39),True)
        text(d,(40,59),'12',25,(30,44,39),True)
        for x in (77,125):
            shutter(d,x,22,x+34,56)
        d.rectangle((178,12,227,h-6),fill=(53,63,62),outline=(31,41,42),width=3)
        d.rectangle((190,24,217,43),fill=(28,38,40),outline=(91,101,94),width=2)
        d.rectangle((232,42,239,55),fill=GREEN_PAINT)
        gd.rectangle((233,43,238,54),fill=GREEN)
        d.line((213,62,220,62),fill=(144,147,127),width=3)
        d.line((8,h-10,173,h-10),fill=(110,94,62),width=3)
        rust(im,21,3)
        grime(im,[(0,h-9,w,h,56)],17)

    if card == 'cyber_security_yard':
        d.rectangle((3,3,w-4,h-4),outline=(83,85,77),width=3)
        for x in (53,102,150,197):
            d.line((x,0,x,h),fill=(36,41,46),width=2)
        d.line((0,174,w,174),fill=(36,41,46),width=2)
        patches(im,12,sheen=True)
        d.rectangle((23,137,91,198),outline=(132,122,83),width=3)
        for y in (150,164,178,192):
            d.line((30,y,83,y),fill=(110,111,88),width=2)
        hazard(im,158,141,205,145,11)
        d.rectangle((158,146,205,195),outline=(120,111,75),width=2)
        for x in (94,137):
            d.line((x,205,x,218),fill=(131,120,79),width=3)

    if card == 'cyber_security_lamp':
        d.rectangle((2,3,w-3,h-4),outline=(108,116,112),width=2)
        for x in (6,26):
            d.rectangle((x,8,x+15,23),fill=(178,200,160))
            gd.rectangle((x+1,9,x+14,22),fill=GREEN)

    if card == 'cyber_security_roof':
        for x in range(7,w-3,8):
            d.line((x,1,x,h-2),fill=(48,60,55))
            d.line((x+1,1,x+1,h-2),fill=(100,109,96))
        d.rectangle((0,0,w-1,h-1),outline=(51,57,55),width=2)
        d.rectangle((8,9,w-9,h-10),fill=(89,98,86),outline=(67,76,68))
        text(d,(w//2,h//2),'SEC 12',26,(208,209,183),True)
        rust(im,7,1)

    if card == 'cyber_exchange':
        for y in range(13,h-17,31):
            d.rectangle((0,y-5,w-1,y+24),fill=(46,52,59))
            for x in range(9,w-26,28):
                d.rectangle((x,y,x+22,y+17),fill=(28,37,44))
                d.line((x,y,x+22,y),fill=(72,87,93),width=2)
                if rng.random()<.11:
                    d.rectangle((x+3,y+4,x+15,y+14),fill=(103,145,153))
                    gd.rectangle((x+4,y+5,x+14,y+13),fill=(55,151,166))
            d.line((0,y+25,w-1,y+25),fill=(104,112,112),width=2)
        for x in (3,91,203,292):
            d.rectangle((x,0,x+4,h),fill=(90,95,97))
        rust(im,18,4)
        grime(im,[(0,h-10,w,h,45)],16)

    if card == 'cyber_relay':
        channels(d,h,range(10,w-8,25))
        for y in (16,71,126):
            d.rectangle((10,y,156,y+34),fill=(38,44,49),outline=(87,92,94),width=2)
            for x in range(18,151,23):
                shutter(d,x,y+6,x+15,y+27)
        d.rectangle((169,14,257,150),fill=(122,107,65),outline=(41,44,47),width=3)
        hazard(im,173,18,253,29,17)
        text(d,(213,61),'18',55,(37,41,42),True)
        text(d,(213,103),'RELAY',24,(46,47,41),True)
        for x in (175,225):
            d.rectangle((x,131,x+22,135),fill=(173,127,65))
            gd.rectangle((x+2,132,x+20,134),fill=(240,166,64))
        d.line((0,h-10,w,h-10),fill=(106,104,87),width=3)
        rust(im,24,6)
        grime(im,[(0,h-18,w,h,52)],18)

    if card == 'cyber_habitat':
        for y in (10,67,124):
            for x in range(7,w-40,48):
                d.rectangle((x,y,x+39,y+37),fill=(33,42,46),outline=(98,102,92),width=2)
                d.line((x+18,y+2,x+18,y+19),fill=(75,79,73),width=2)
                shade=rng.choice(((70,89,87),(89,86,75),(95,99,90)))
                d.rectangle((x+1,y+22,x+38,y+36),fill=shade)
                if rng.random()<.17:
                    d.rectangle((x+21,y+6,x+34,y+16),fill=(131,167,113))
                    gd.rectangle((x+23,y+8,x+32,y+14),fill=(96,160,75))
            d.line((0,y+41,w-1,y+41),fill=(111,111,96),width=3)
        rust(im,25,12)
        grime(im,[(0,h-16,w,h,45)],18)

    if card == 'cyber_tower_lobby':
        shutter(d,11,24,85,h-8)
        shutter(d,224,24,292,h-8)
        d.rectangle((100,13,211,h-2),fill=(35,46,51),outline=(101,106,103),width=3)
        glass(d,109,20,203,h-3,4,door=True)
        for x in (93,217):
            d.line((x,8,x,h-2),fill=(101,109,103),width=3)
        for x in (28,241):
            d.rectangle((x,12,x+34,17),fill=(126,118,93))
        rust(im,15,0)

    if card == 'cyber_exchange_sign':
        d.rectangle((2,2,w-3,h-3),outline=(86,103,107),width=2)
        text(d,(w//2,h//2),'EXCHANGE',26,(150,189,193),True)
        text(gd,(w//2,h//2),'EXCHANGE',26,(68,187,198),True)
        for x in (10,w-28):
            for dy in (0,7):
                d.rectangle((x,16+dy,x+17,18+dy),fill=CYAN_PAINT)
                gd.line((x+1,17+dy,x+16,17+dy),fill=CYAN)

    if card == 'cyber_habitat_deck':
        d.rectangle((2,3,w-3,h-4),outline=(108,111,98),width=3)
        patches(im,5,sheen=True)
        for y in (8,76):
            d.rectangle((9,y,w-10,y+55),fill=(88,97,67),outline=(149,144,117),width=5)
            for x in (29,54,79):
                for offset in (17,38):
                    canopy=rng.choice(((119,133,77),(136,144,91),(105,126,77)))
                    d.ellipse((x-16,y+offset-13,x+16,y+offset+13),fill=canopy)
                    d.arc((x-14,y+offset-11,x+14,y+offset+11),195,320,fill=(151,153,104),width=2)

    if card == 'cyber_habitat_sign':
        d.rectangle((3,4,w-4,h-5),outline=(103,117,100),width=2)
        text(d,(w//2,h//2),'HAB',28,(172,188,151),True)
        text(gd,(w//2,h//2),'HAB',28,(102,176,84),True)
        rust(im,7,1)

    if card == 'cyber_relay_beacon':
        d.rectangle((2,2,w-3,h-3),outline=(90,73,61),width=2)
        d.rectangle((9,8,w-10,h-9),fill=(195,128,67))
        gd.rectangle((10,9,w-11,h-10),fill=(240,166,64))

    if card in ('advanced_utopian_glass', 'advanced_utopian_tower_glass'):
        tower = card == 'advanced_utopian_tower_glass'
        floor = 22 if tower else h
        for y0 in range(0,h,floor):
            y1=min(h,y0+floor)
            for x0 in range(0,w,32):
                if rng.random()<(.92 if tower else .85):
                    for y in range(y0+2,y1):
                        d.line((x0,y,x0+31,y),fill=lerp((78,94,100),GLASS,(y-y0-2)/max(1,y1-y0-3)))
                    if not tower:
                        for _ in range(rng.randint(1,2)):
                            px=rng.randrange(x0+3,x0+24)
                            d.rectangle((px,y1-30,px+rng.randint(4,7),y1-10),fill=(60,70,76))
                        if rng.random()<.5:
                            px=rng.randrange(x0+6,x0+26)
                            d.ellipse((px-8,y1-32,px+8,y1-10),fill=(84,108,78))
                    wash(glow,(x0+4,y0+4,x0+27,y0+4+max(6,(y1-y0)//3)),ICE,max(4,floor//8),
                         rng.randint(55,95) if tower else rng.randint(80,140))
        step,width=(28,5) if tower else (16,2)
        for x in range(0,w,step):
            d.line((x,0,x,h),fill=SHELL,width=width)
            rd.line((x,0,x,h),fill=finish(GLOSSY),width=width)

    if card in ('advanced_utopian_shell', 'advanced_utopian_shell_glazed'):
        for y in range(h):
            d.line((0,y,w,y),fill=lerp((234,233,228),(208,207,202),y/h))
        for y in range(32,h,32):
            d.line((0,y,w,y),fill=(188,187,182),width=2)
        for x in range(96,w,96):
            d.line((x,0,x,h),fill=(192,191,186),width=2)
        for x in range(96,w,96) if card == 'advanced_utopian_shell_glazed' else ():
            # A glazed bay in each panel, lit softly from inside.
            d.rounded_rectangle((x-80,44,x-16,h-14),radius=8,fill=lerp((78,94,100),GLASS,.4))
            rd.rounded_rectangle((x-80,44,x-16,h-14),radius=8,fill=finish(MIRROR))
            wash(glow,(x-74,48,x-22,62),ICE,5,90)

    if card == 'advanced_utopian_roof_solar':
        c=w//2
        for k in range(24):
            a=math.radians(k*15)
            d.line((c,c,c+w*math.cos(a),c+w*math.sin(a)),fill=(190,189,184),width=2)
        d.ellipse((c-int(c*.95),c-int(c*.95),c+int(c*.95),c+int(c*.95)),outline=(190,189,184),width=2)
        r0,r1=int(c*.62),int(c*.88)
        d.ellipse((c-r1,c-r1,c+r1,c+r1),fill=SOLAR)
        rd.ellipse((c-r1,c-r1,c+r1,c+r1),fill=finish(CELLS))
        d.ellipse((c-r0,c-r0,c+r0,c+r0),fill=SHELL)
        rd.ellipse((c-r0,c-r0,c+r0,c+r0),fill=finish(GLOSSY))
        for k in range(48):
            a=math.radians(k*7.5)
            d.line((c+r0*math.cos(a),c+r0*math.sin(a),c+r1*math.cos(a),c+r1*math.sin(a)),fill=(66,80,96),width=1)
        d.ellipse((c-(r0+r1)//2,c-(r0+r1)//2,c+(r0+r1)//2,c+(r0+r1)//2),outline=(66,80,96),width=1)
        emblem(d,glow,c,c,44)

    if card == 'advanced_utopian_shell_top':
        c=w//2
        r0,r1=int(c*.5),int(c*.8)
        d.ellipse((c-r1,c-r1,c+r1,c+r1),fill=SOLAR)
        rd.ellipse((c-r1,c-r1,c+r1,c+r1),fill=finish(CELLS))
        d.ellipse((c-r0,c-r0,c+r0,c+r0),fill=SHELL)
        rd.ellipse((c-r0,c-r0,c+r0,c+r0),fill=finish(GLOSSY))
        for k in range(40):
            a=math.radians(k*9)
            d.line((c+r0*math.cos(a),c+r0*math.sin(a),c+r1*math.cos(a),c+r1*math.sin(a)),fill=(66,80,96),width=1)
        top,bottom=24,h-84
        d.rounded_rectangle((c-26,top,c+26,bottom),radius=12,fill=lerp((78,94,100),GLASS,.3))
        rd.rounded_rectangle((c-26,top,c+26,bottom),radius=12,fill=finish(MIRROR))
        for y in range(top+14,bottom,18):
            d.line((c-24,y,c+24,y),fill=SHELL,width=2)
        wash(glow,(c-16,top+8,c+16,bottom-8),ICE,9,130)
        emblem(d,glow,c,h-44,26)

    if card == 'advanced_utopian_court':
        for _ in range(60):
            x,y=rng.randrange(w),rng.randrange(h)
            r=rng.randint(6,14)
            d.ellipse((x-r,y-r,x+r,y+r),fill=rng.choice(((94,111,82),(84,100,74),(100,116,86))))
        c=w//2
        d.ellipse((12,12,w-12,h-12),outline=SHELL,width=10)
        rd.ellipse((12,12,w-12,h-12),outline=finish(MATTE),width=10)
        k=w/300
        leaf=[(c-50*k,c+80*k),(c-64*k,c+16*k),(c-34*k,c-46*k),(c+16*k,c-96*k),(c+60*k,c-104*k),(c+44*k,c-46*k),(c+12*k,c+16*k),(c-26*k,c+64*k)]
        d.polygon(leaf,fill=SHELL)
        inner=[(x*.86+c*.14,y*.86+c*.14) for x,y in leaf]
        d.polygon(inner,fill=WATER)
        rd.polygon(inner,fill=finish((.05,0)))
        d.line((c-46*k,c+76*k,c+40*k,c-92*k),fill=SHELL,width=4)
        mask=Image.new('L',glow.size)
        ImageDraw.Draw(mask).polygon(inner,fill=210)
        glow.paste(ICE,(0,0),mask.filter(ImageFilter.GaussianBlur(7)))

    if card == 'advanced_utopian_pool':
        d.rounded_rectangle((0,0,w-1,h-1),radius=40,fill=WATER)
        for _ in range(6):
            x,y=rng.randrange(20,w-60),rng.randrange(20,h-20)
            d.line((x,y,x+rng.randrange(20,50),y),fill=(60,78,90),width=2)
        mask=Image.new('L',glow.size)
        ImageDraw.Draw(mask).rounded_rectangle((24,24,w-25,h-25),radius=30,fill=130)
        glow.paste((170,226,232),(0,0),mask.filter(ImageFilter.GaussianBlur(16)))

    if card == 'advanced_utopian_dome':
        c=w//2
        for r,tone in ((126,(74,92,102)),(100,(62,80,90))):
            d.ellipse((c-r,c-r,c+r,c+r),fill=tone)
        for r in range(60,0,-2):
            d.ellipse((c-r,c-r,c+r,c+r),fill=lerp((150,172,176),(62,80,90),r/60))
        mask=Image.new('L',glow.size)
        ImageDraw.Draw(mask).ellipse((c-30,c-30,c+30,c+30),fill=220)
        glow.paste(ICE,(0,0),mask.filter(ImageFilter.GaussianBlur(18)))
        for k in range(16):
            a=math.radians(k*22.5)
            d.line((c+64*math.cos(a),c+64*math.sin(a),c+126*math.cos(a),c+126*math.sin(a)),fill=SHELL,width=2)
            rd.line((c+64*math.cos(a),c+64*math.sin(a),c+126*math.cos(a),c+126*math.sin(a)),fill=finish(GLOSSY),width=2)
        for r in (64,94,126):
            d.ellipse((c-r,c-r,c+r,c+r),outline=SHELL,width=2)

    if card == 'advanced_utopian_door':
        d.rounded_rectangle((16,14,w-17,h+20),radius=34,fill=(52,60,66))
        for y in range(20,h):
            d.line((24,y,w-25,y),fill=lerp((96,114,120),(48,60,68),(y-20)/(h-20)))
        rd.rounded_rectangle((22,20,w-23,h+20),radius=28,fill=finish(MIRROR))
        wash(glow,(50,40,w-51,110),ICE,22,150)
        for y in range(52,h,32):
            d.line((24,y,w-25,y),fill=SHELL,width=3)
        for x in range(24+55,w-24,55):
            d.line((x,22,x,h),fill=SHELL,width=2)
        d.rounded_rectangle((16,14,w-17,h+20),radius=34,outline=SHELL,width=8)

    if card in ('advanced_utopian_apron_depot', 'advanced_utopian_apron_factory', 'advanced_utopian_podium_top',
                'advanced_utopian_plaza', 'advanced_utopian_stone', 'advanced_utopian_podium'):
        spacing={'advanced_utopian_apron_factory':40,'advanced_utopian_plaza':40}.get(card,32)
        joints(d,w,h,spacing,(150,149,144),(184,183,178),range(spacing,h,spacing))

    if card == 'advanced_utopian_apron_depot':
        for x0,y0 in ((-60,-60),(w-90,-60)):
            d.ellipse((x0,y0,x0+150,y0+150),fill=MOSS)
            rd.ellipse((x0,y0,x0+150,y0+150),fill=finish(LAWN))
        bay=(w-80)//3
        top,bottom=int(h*.36),int(h*.82)
        for i in range(3):
            x0=40+i*bay
            d.rectangle((x0+6,top,x0+bay-6,bottom),fill=(186,185,180),outline=(120,121,122),width=8)
            for k in range(3):
                y=top+40+k*50
                m=x0+bay//2
                d.line((m-30,y+18,m,y,m+30,y+18),fill=(120,121,122),width=8)
        for x in range(40,w-30,40):
            d.ellipse((x-5,bottom+12,x+5,bottom+22),fill=LIT)
            wash(glow,(x-3,bottom+14,x+3,bottom+20),ICE,3,180)

    if card == 'advanced_utopian_apron_factory':
        d.rectangle((0,0,w-1,h-1),outline=(64,68,72),width=14)
        c=w//2
        d.rectangle((c-104,h-150,c+104,h-14),fill=(178,177,172))
        for x in (c-104,c+104):
            d.line((x,h-150,x,h-14),fill=SHELL,width=5)
        for k in range(3):
            y=h-120+k*36
            d.line((c-40,y+20,c,y,c+40,y+20),fill=SHELL,width=6)

    if card == 'advanced_utopian_podium_top':
        for x0,y0 in ((-60,-60),(w-90,-60),(-60,h-90),(w-90,h-90)):
            d.ellipse((x0,y0,x0+150,y0+150),fill=MOSS)
            rd.ellipse((x0,y0,x0+150,y0+150),fill=finish(LAWN))
        c=(w//2,h//2+18)
        d.ellipse((c[0]-215,c[1]-215,c[0]+215,c[1]+215),outline=(196,195,190),width=22)
        d.rectangle((c[0]-74,c[1],c[0]+74,h),fill=(196,195,190))
        joints(d,w,h,32,(176,175,170),(204,203,198))

    if card == 'advanced_utopian_plaza':
        d.rectangle((0,0,w-1,h-1),outline=(64,68,72),width=12)

    if card == 'advanced_utopian_podium':
        d.rectangle((0,0,w,7),fill=(200,199,194))

    if card == 'advanced_utopian_silo':
        for y in range(32,h,32):
            d.line((0,y,w,y),fill=(188,187,182),width=2)
        for x in range(24,w,48):
            d.line((x,0,x,h),fill=(192,191,186),width=2)
        for c in (w//4,w//2,3*w//4):
            for k in range(5):
                y=h-40-k*30
                d.rounded_rectangle((c-6,y,c+6,y+20),radius=3,fill=LIT)
                rd.rectangle((c-6,y,c+6,y+20),fill=finish(MIRROR))
                wash(glow,(c-3,y+3,c+3,y+17),ICE,4,150)

    if card == 'advanced_utopian_silo_top':
        c=w//2
        for r in (24,44):
            d.ellipse((c-r,c-r,c+r,c+r),outline=(192,191,186),width=2)

    if card == 'advanced_utopian_fascia':
        d.line((0,h-3,w,h-3),fill=(196,195,190),width=3)
        emblem(d,glow,w//2,h//2,27)

    if card == 'advanced_utopian_metal':
        for y in range(0,h,3):
            d.line((0,y,w,y),fill=rng.choice(((206,208,208),(214,216,216),(210,212,212))))

    if card == 'advanced_utopian_lamp':
        gd.rectangle((0,0,w,h),fill=ICE)

    if card == 'advanced_utopian_armor':
        # Unit plates read at a few dozen pixels, so their seams are bolder than a building's panel lines.
        for y in range(h):
            d.line((0,y,w,y),fill=lerp((246,245,240),(222,221,216),abs(y-h/2)/(h/2)))
        # One seam each way, so a part reads as a few large plates rather than a grid.
        d.line((w//2,0,w//2,h),fill=(172,171,166),width=3)
        d.line((0,h//2,w,h//2),fill=(172,171,166),width=3)
        rd.line((w//2,0,w//2,h),fill=finish(SATIN),width=3)
        rd.line((0,h//2,w,h//2),fill=finish(SATIN),width=3)

    if card == 'advanced_utopian_suit':
        for y in range(0,h,4):
            d.line((0,y,w,y),fill=(64,73,86),width=2)
        for x in (w//3,2*w//3):
            d.line((x,0,x,h),fill=(38,45,55),width=2)

    if card == 'advanced_utopian_visor':
        d.rounded_rectangle((0,0,w-1,h-1),radius=12,fill=GLASS)
        mask=Image.new('L',glow.size)
        ImageDraw.Draw(mask).rounded_rectangle((10,10,w-11,h-11),radius=10,fill=255)
        glow.paste(ICE,(0,0),mask.filter(ImageFilter.GaussianBlur(5)))

    if card == 'cyber_samurai_gravel':
        for y in range(4,h,7):
            d.line((0,y,w,y),fill=(140,135,124),width=2)
            d.line((0,y+2,w,y+2),fill=(184,179,167))
        d.rectangle((0,0,w-1,h-1),outline=GRANITE,width=16)
        d.rectangle((15,15,w-16,h-16),outline=JOINT,width=2)
        for x in range(0,w,48):
            d.line((x,0,x,15),fill=JOINT,width=2)
            d.line((x,h-16,x,h),fill=JOINT,width=2)

    if card == 'cyber_samurai_roof_tiles':
        for y in range(0,h-24,30):
            d.line((0,y,w,y),fill=(44,49,55),width=2)
        for x in range(0,w,24):
            d.rectangle((x,0,x+9,h-24),fill=(70,77,85))
            d.line((x+3,0,x+3,h-24),fill=TILE_LIGHT,width=2)
            d.line((x+10,0,x+10,h-24),fill=(36,40,45),width=3)
            d.rectangle((x-1,h-24,x+11,h),fill=(36,40,45))
            d.ellipse((x,h-22,x+10,h-6),fill=TILE_LIGHT,outline=(36,40,45),width=2)
        rd.rectangle((0,h-24,w,h),fill=finish((.45,1)))

    if card == 'cyber_samurai_stone':
        y=0
        while y<h:
            row=rng.randint(26,40)
            x=-rng.randrange(40)
            while x<w:
                block=rng.randint(44,92)
                tone=lerp(GRANITE,rng.choice(((98,95,88),(136,132,123),(112,110,104))),rng.random()*.6)
                d.rounded_rectangle((x+2,y+2,x+block-2,y+row-2),radius=5,fill=tone)
                d.line((x+4,y+3,x+block-6,y+3),fill=lerp(tone,(170,166,156),.4),width=2)
                if rng.random()<.22:
                    d.line((x+block-1,y+rng.randrange(row),x+block-1,y+row),fill=MOSS_JOINT,width=4)
                x+=block
            d.line((0,y,w,y),fill=JOINT,width=2)
            y+=row

    if card == 'cyber_samurai_wall_screens':
        for x0 in range(0,w,96):
            d.rectangle((x0+10,12,x0+86,h-14),fill=(150,138,110))
            lit=rng.random()<.75
            if lit:
                d.rectangle((x0+10,12,x0+86,h-14),fill=PAPER)
                wash(glow,(x0+16,18,x0+80,h-20),LANTERN,6,rng.randint(150,210))
            for x in range(x0+10,x0+87,19):
                d.line((x,12,x,h-14),fill=LACQUER,width=2)
            for y in range(12,h-13,22):
                d.line((x0+10,y,x0+86,y),fill=LACQUER,width=2)
            d.rectangle((x0,0,x0+9,h),fill=LACQUER_EDGE)
            d.rectangle((x0+87,0,x0+95,h),fill=LACQUER_EDGE)
        d.rectangle((0,0,w,11),fill=LACQUER_EDGE)
        d.rectangle((0,h-13,w,h),fill=LACQUER_EDGE)

    if card == 'cyber_samurai_wall_armor':
        for y0 in range(10,h-10,22):
            shift=8 if (y0//22)%2 else 0
            for x0 in range(-shift,w,16):
                d.rectangle((x0+1,y0,x0+15,y0+24),fill=PLATE,outline=(40,43,47))
                d.line((x0+2,y0+1,x0+14,y0+1),fill=(120,126,132),width=2)
            d.line((0,y0+24,w,y0+24),fill=(32,34,38),width=2)
        for x in range(40,w,80):
            for y0 in range(10,h-10,22):
                d.line((x-4,y0+4,x+4,y0+12),fill=CORD,width=3)
                d.line((x+4,y0+4,x-4,y0+12),fill=CORD,width=3)
                rd.line((x-4,y0+4,x+4,y0+12),fill=finish((.85,0)),width=3)
                rd.line((x+4,y0+4,x-4,y0+12),fill=finish((.85,0)),width=3)
            d.line((x,10,x,h-10),fill=CORD,width=2)
            rd.line((x,10,x,h-10),fill=finish((.85,0)),width=2)
        for x0 in range(0,w,160):
            d.rectangle((x0,0,x0+9,h),fill=LACQUER_EDGE)
            rd.rectangle((x0,0,x0+9,h),fill=finish((.3,0)))
        for box in ((0,0,w,9),(0,h-10,w,h)):
            d.rectangle(box,fill=LACQUER_EDGE)
            rd.rectangle(box,fill=finish((.3,0)))

    if card == 'cyber_samurai_plaster':
        d.rectangle((0,0,w,14),fill=LACQUER_EDGE)
        rd.rectangle((0,0,w,14),fill=finish((.3,0)))
        d.line((0,15,w,15),fill=BRASS,width=2)
        top=int(h*.78)
        d.rectangle((0,top,w,h),fill=LACQUER)
        rd.rectangle((0,top,w,h),fill=finish((.3,0)))
        for y in range(top+8,h,9):
            d.line((0,y,w,y),fill=LACQUER_EDGE)
        for x in range(0,w,64):
            d.rectangle((x,top,x+5,h),fill=LACQUER_EDGE)

    if card == 'cyber_samurai_emblem':
        d.ellipse((4,4,w-5,h-5),fill=(42,39,40),outline=LACQUER_EDGE,width=3)
        crest(d,glow,w//2,h//2,46)

    if card == 'cyber_samurai_lantern':
        gd.rectangle((0,10,w,h-10),fill=LANTERN)
        for y in range(18,h-10,10):
            d.line((0,y,w,y),fill=(150,128,92))
        d.rectangle((0,0,w,9),fill=LACQUER)
        d.rectangle((0,h-9,w,h),fill=LACQUER)
        for box in ((0,0,w,9),(0,h-9,w,h)):
            gd.rectangle(box,fill=(0,0,0))
            rd.rectangle(box,fill=finish((.3,0)))

    if card == 'cyber_samurai_lacquer':
        for y in range(0,h,4):
            d.line((0,y,w,y),fill=rng.choice(((28,26,27),(33,31,32),(30,28,29))))

    if card == 'cyber_samurai_vermilion':
        for box in ((0,8,w,18),(0,h-19,w,h-9)):
            d.rectangle(box,fill=BRASS)
            rd.rectangle(box,fill=finish((.3,1)))

    if card == 'cyber_samurai_eave':
        d.rectangle((0,0,w,6),fill=BRASS)
        rd.rectangle((0,0,w,6),fill=finish((.3,1)))
        for x in range(0,w,64):
            d.rectangle((x,10,x+3,h-12),fill=LACQUER_EDGE)
        d.rectangle((0,h-8,w,h-4),fill=CRIMSON_PAINT)
        gd.rectangle((0,h-8,w,h-4),fill=CRIMSON)

    if card == 'cyber_samurai_lamp':
        gd.rectangle((0,0,w,h),fill=CRIMSON)

    if card in ('cyber_samurai_loading_court', 'cyber_samurai_forge_apron', 'cyber_samurai_refinery_court'):
        paint = (222, 214, 194)
        yard = card != 'cyber_samurai_forge_apron'
        if yard:
            for y in range(18, h-16, 8):
                d.line((18, y, w-18, y), fill=(129, 124, 112), width=2)
                d.line((18, y+2, w-18, y+2), fill=(161, 155, 140))
        else:
            for y in range(32, h, 42):
                d.line((0, y, w, y), fill=JOINT, width=2)
                for x in range(20+(y//42)%2*29, w, 58):
                    d.line((x, y, x, y+42), fill=JOINT, width=2)
        d.rectangle((0, 0, w-1, h-1), outline=GRANITE, width=16)
        d.rectangle((15, 15, w-16, h-16), outline=JOINT, width=2)
        if card == 'cyber_samurai_loading_court':
            d.rectangle((w//2-73, h//2-34, w//2+73, h-18), fill=(92, 91, 84))
            for left, right in ((42, w//2-89), (w//2+89, w-42)):
                for x, inward in ((left, 1), (right, -1)):
                    d.line((x+inward*33, h-46, x, h-46, x, h//2+14, x+inward*33, h//2+14),
                           fill=paint, width=5)
                for x in (left+30, right-30):
                    d.line((x, h//2+29, x, h//2+46), fill=paint, width=4)
            for y in range(h//2+18, h-30, 50):
                d.line((w//2, y, w//2, y+20), fill=paint, width=4)
        elif card == 'cyber_samurai_forge_apron':
            for x in (w//4, w*3//4):
                d.line((x, h//2-30, x, h-24), fill=paint, width=6)
                d.line((x+7, h//2-30, x+7, h-24), fill=(151, 144, 129), width=2)
            crest(d, Image.new('RGB', im.size), w//2, h-74, 24)
        else:
            left, right = int(w*.20), int(w*.46)
            d.rectangle((left, h//2, right, h-16), fill=(91, 89, 82))
            for x in (left+7, right-7):
                d.line((x, h//2+5, x, h-19), fill=paint, width=3)
            for x in range(right+24, w-24, 20):
                d.line((x, h-75, x+13, h-57), fill=paint, width=3)

    if card == 'cyber_samurai_forge_door':
        for y in range(17, h-12, 34):
            d.rectangle((9, y, w-10, y+31), fill=(86, 88, 89), outline=(31, 32, 34), width=2)
            d.line((11, y+2, w-12, y+2), fill=(147, 145, 133), width=3)
        for x in (10, w//2-5, w-14):
            d.rectangle((x, 8, x+4, h-9), fill=LACQUER)
        d.rectangle((0, 0, w-1, h-1), outline=LACQUER_EDGE, width=9)
        for x in range(20, w-26, 25):
            d.line((x, h-16, x+9, h-16), fill=(175, 159, 116), width=3)

    if card == 'cyber_samurai_forge_vent':
        d.rectangle((8, 18, w-9, h-19), fill=(109, 60, 32), outline=LACQUER_EDGE, width=4)
        for x in range(14, w-16, 24):
            d.rectangle((x, 27, x+13, h-28), fill=(202, 123, 66))
            wash(glow, (x+2, 29, x+10, h-30), LANTERN, 2, 220)
            d.line((x+15, 20, x+15, h-21), fill=(112, 104, 93), width=2)
        for y in (35, 62):
            d.line((8, y, w-9, y), fill=LACQUER, width=4)
            gd.line((8, y, w-9, y), fill=(0, 0, 0), width=4)

    if card == 'cyber_samurai_tank_plate':
        for x in range(24, w-12, 48):
            d.line((x, 0, x, h), fill=(42, 45, 49), width=2)
            d.line((x+2, 0, x+2, h), fill=TILE_LIGHT, width=1)
        for y in (16, h//2, h-18):
            d.rectangle((0, y-5, w, y+5), fill=LACQUER_EDGE)
            d.line((0, y+5, w, y+5), fill=(39, 42, 46), width=2)
            for x in range(14, w, 27):
                d.ellipse((x, y-2, x+4, y+2), fill=BRASS)
                rd.ellipse((x, y-2, x+4, y+2), fill=finish((.3,1)))

    if card == 'cyber_samurai_brass':
        for y in range(0, h, 5):
            d.line((0, y, w, y), fill=rng.choice(((137, 111, 66), (143, 118, 72), (130, 105, 61))))

    if card == 'toxic_industrial_ground':
        mask=Image.new('L',im.size)
        md=ImageDraw.Draw(mask)
        for _ in range(9):
            x,y,r=rng.randrange(w),rng.randrange(h),rng.randint(16,64)
            md.polygon([(x+r*rng.uniform(.5,1.2)*math.cos(a),y+r*rng.uniform(.4,1)*math.sin(a))
                        for a in (k*math.pi/5 for k in range(10))],fill=rng.randint(90,200))
        im.paste(SLAG,(0,0),mask.filter(ImageFilter.GaussianBlur(5)))
        for x0 in (110,150,250,290):
            d.line((x0,0,x0+rng.randint(-20,20),h),fill=(66,58,50),width=9)
            d.line((x0+5,0,x0+rng.randint(-15,25),h),fill=(108,96,82),width=2)
        puddle=[(30,262),(70,238),(132,246),(156,280),(118,318),(60,306)]
        d.polygon(puddle,fill=OILY)
        rd.polygon(puddle,fill=finish((.1,0)))
        d.line((62,258,118,252),fill=(78,70,92),width=3)

    if card == 'toxic_industrial_roof':
        for x in range(0,w,16):
            d.line((x,0,x,h),fill=(38,36,34),width=3)
            d.line((x+5,0,x+5,h),fill=(80,77,72),width=2)
        for y in (h//3,2*h//3):
            d.line((0,y,w,y),fill=(34,32,30),width=3)
        rust(im,24,h//3)
        soot(im,.6,150)

    if card == 'toxic_industrial_tank':
        for y in range(48,h,52):
            d.line((0,y-3,w,y-3),fill=(150,142,128),width=3)
            d.line((0,y,w,y),fill=(52,48,44),width=3)
            for x in range(6,w,14):
                d.point((x,y-7),fill=(170,160,144))
        d.rectangle((0,0,w,8),fill=(140,132,120))
        for x in range(64,w,64):
            d.line((x,0,x,h),fill=(56,52,47),width=2)
        rust(im,22,0)
        mask=Image.new('L',im.size)
        md=ImageDraw.Draw(mask)
        for _ in range(9):
            x=rng.randrange(w)
            md.line((x,140,x+rng.randint(-2,2),140+rng.randrange(30,100)),fill=rng.randint(90,180),width=rng.randint(3,6))
        im.paste(STAIN,(0,0),mask.filter(ImageFilter.GaussianBlur(1.5)))
        c=w//2
        d.rounded_rectangle((c-12,70,c+12,170),radius=6,fill=(38,36,34))
        d.rounded_rectangle((c-7,90,c+7,165),radius=4,fill=TOXIC_PAINT)
        rd.rounded_rectangle((c-7,90,c+7,165),radius=4,fill=finish((.1,0)))
        wash(glow,(c-5,92,c+5,163),TOXIC,3,220)
        soot(im,.35,140)

    if card == 'toxic_industrial_scaffold':
        for y in range(0,h,42):
            d.rectangle((0,y,w,y+8),fill=(88,84,78))
            for x in range(6,w,30):
                if rng.random()<.12:
                    d.rectangle((x,y+12,x+18,y+36),fill=FURNACE_PAINT)
                    wash(glow,(x+2,y+14,x+16,y+34),FURNACE,3,170)
        for y in range(20,h,42):
            d.line((0,y,w,y),fill=(150,140,118),width=4)
            d.line((0,y+3,w,y+3),fill=(70,66,60))
        for x in range(18,w,46):
            d.line((x,0,x,h),fill=(126,120,108),width=4)
        for y in range(0,h,42):
            for x in range(18,w-46,92):
                d.line((x,y,x+46,y+42),fill=(112,106,96),width=2)
        soot(im,.5,120)

    if card == 'toxic_industrial_stack':
        for y in (24,48,72):
            d.rectangle((0,y,w,y+10),fill=(70,66,61))
        d.rectangle((w//2-12,0,w//2+12,h),outline=(150,144,132),width=3)
        for y in range(4,h,14):
            d.line((w//2-12,y,w//2+12,y),fill=(150,144,132),width=2)
        for y in range(96,h,36):
            d.line((0,y,w,y),fill=(92,88,82))
        soot(im,.9,235)

    if card in ('toxic_industrial_concrete', 'toxic_industrial_cells', 'toxic_industrial_concrete_plain'):
        # Board-formed: each plank leaves its own tone and a faint seam.
        for y in range(0,h,12):
            tone=rng.randint(-7,7)
            im.paste((150,146,138) if tone>0 else (90,87,82),(0,y),Image.new('L',(w,12),abs(tone)*12))
            d.line((0,y,w,y),fill=(98,95,89))

    if card == 'toxic_industrial_concrete':
        ties=[(x,y) for x in range(32,w,64) for y in (30,102,170)]
        for x,y in ties:
            d.ellipse((x-3,y-3,x+3,y+3),fill=(58,55,51))
        mask=Image.new('L',im.size)
        md=ImageDraw.Draw(mask)
        for x,y in ties:
            if rng.random()<.6:
                md.line((x,y+4,x+rng.randint(-1,1),y+rng.randrange(14,44)),fill=rng.randint(90,170),width=3)
        im.paste(RUST,(0,0),mask.filter(ImageFilter.GaussianBlur(1.2)))
        mask=Image.new('L',im.size)
        md=ImageDraw.Draw(mask)
        for x0 in range(64,w,128):
            md.rectangle((x0-16,40,x0+16,158),fill=170)
        im.paste(SOOT,(0,0),mask.filter(ImageFilter.GaussianBlur(9)))
        for x0 in range(64,w,128):
            d.rectangle((x0-8,52,x0+8,150),fill=(66,63,58))
            lit=rng.random()<.4
            d.rectangle((x0-5,56,x0+5,150),fill=FURNACE_PAINT if lit else (24,23,22))
            if lit:
                wash(glow,(x0-3,60,x0+3,146),FURNACE,3,180)
        text(d,(w-70,36),'B-12',40,(178,174,164),True)
        drips(im,8)
        soot(im,1,245)
        grime(im,[(0,h-20,w,h,90)],30)

    if card == 'toxic_industrial_concrete_plain':
        ties=[(x,y) for x in range(32,w,64) for y in (30,102,170)]
        for x,y in ties:
            d.ellipse((x-3,y-3,x+3,y+3),fill=(58,55,51))
        mask=Image.new('L',im.size)
        md=ImageDraw.Draw(mask)
        for x,y in ties:
            if rng.random()<.6:
                md.line((x,y+4,x+rng.randint(-1,1),y+rng.randrange(14,44)),fill=rng.randint(90,170),width=3)
        im.paste(RUST,(0,0),mask.filter(ImageFilter.GaussianBlur(1.2)))
        drips(im,10)
        soot(im,1,245)
        grime(im,[(0,h-20,w,h,90)],30)

    if card == 'toxic_industrial_cells':
        for row in range(4):
            for col in range(12):
                x,y=col*40,row*40
                d.rectangle((x+7,y+7,x+33,y+33),fill=(46,44,41))
                d.polygon([(x+7,y+7),(x+33,y+7),(x+28,y+13),(x+12,y+13)],fill=(30,29,27))
                if rng.random()<.08:
                    d.rectangle((x+13,y+14,x+28,y+33),fill=FURNACE_PAINT)
                    wash(glow,(x+15,y+16,x+26,y+31),FURNACE,3,170)
                else:
                    d.rectangle((x+13,y+14,x+28,y+33),fill=(22,22,21))
                d.line((x+7,y+34,x+33,y+34),fill=(150,146,136),width=2)
        rust(im,18,0)
        soot(im,.7,190)

    if card == 'toxic_industrial_banner':
        d.rectangle((0,0,w,10),fill=CORRODED)
        rd.rectangle((0,0,w,10),fill=finish((.6,1)))
        for x in (8,w-14):
            d.rectangle((x,10,x+5,h),fill=OCHRE)
        smokestacks(d,w//2,72,34,OCHRE)
        d.rectangle((w//2-4,128,w//2+4,h-16),fill=OCHRE)
        soot(im,.4,90)

    if card == 'toxic_industrial_sludge':
        d.rounded_rectangle((0,0,w-1,h-1),radius=36,fill=(58,62,40))
        d.rounded_rectangle((18,16,w-19,h-17),radius=28,fill=TOXIC_PAINT)
        for _ in range(8):
            x,y=rng.randrange(30,w-60),rng.randrange(24,h-24)
            d.arc((x,y,x+rng.randint(20,50),y+12),190,350,fill=(96,110,56),width=3)
        mask=Image.new('L',glow.size)
        ImageDraw.Draw(mask).rounded_rectangle((34,30,w-35,h-31),radius=22,fill=170)
        glow.paste(TOXIC,(0,0),mask.filter(ImageFilter.GaussianBlur(14)))

    if card == 'toxic_industrial_emblem':
        smokestacks(d,w//2,h//2,50,STAIN)

    if card == 'toxic_industrial_stack_top':
        c=w//2
        d.ellipse((4,4,w-5,h-5),fill=(64,61,57))
        d.ellipse((22,22,w-23,h-23),fill=(24,22,21))
        d.ellipse((38,38,w-39,h-39),fill=FURNACE_PAINT)
        mask=Image.new('L',glow.size)
        ImageDraw.Draw(mask).ellipse((36,36,w-37,h-37),fill=200)
        glow.paste(FURNACE,(0,0),mask.filter(ImageFilter.GaussianBlur(8)))

    if card == 'toxic_industrial_furnace':
        d.rectangle((0,0,w-1,h-1),outline=CORRODED,width=14)
        d.rectangle((14,14,w-15,h-15),fill=FURNACE_PAINT)
        rd.rectangle((0,0,w-1,h-1),outline=finish((.6,1)),width=14)
        rd.rectangle((14,14,w-15,h-15),fill=finish((.9,0)))
        wash(glow,(18,22,w-19,h-15),FURNACE,8,240)
        rust(im,6,0)

    if card == 'toxic_industrial_steel':
        rust(im,14,0)
        soot(im,.5,110)

    if card == 'toxic_industrial_hazard':
        hazard(im,0,0,w-1,h-1,24)
        soot(im,1,90)
        grime(im,[],14)

    if card in ('toxic_industrial_pad', 'toxic_industrial_slab_top', 'toxic_industrial_slab'):
        joints(d,w,h,64,(78,75,70),(124,120,112),range(64,h,64))
        mask=Image.new('L',im.size)
        md=ImageDraw.Draw(mask)
        for _ in range(4):
            x,y=rng.randrange(w),rng.randrange(h)
            r=rng.randint(10,24)
            md.ellipse((x-r,y-r*.6,x+r,y+r*.6),fill=rng.randint(60,110))
        for k in range(24):
            md.rectangle((k,k,w-1-k,h-1-k),outline=round(150*(1-k/24)))
        im.paste(SOOT,(0,0),mask.filter(ImageFilter.GaussianBlur(5)))

    if card == 'toxic_industrial_pad':
        bay=(w-60)//3
        for i in range(3):
            x0=30+i*bay
            d.rectangle((x0+8,90,x0+bay-8,h-110),outline=(146,142,132),width=7)
            for k in range(3):
                y=150+k*60
                m=x0+bay//2
                d.line((m-28,y+18,m,y,m+28,y+18),fill=(146,142,132),width=7)
        hazard(im,20,h-88,w-21,h-60,20)
        d.rectangle((0,0,w-1,h-1),outline=MUD,width=18)
        soot(im,.15,90)

    if card == 'toxic_industrial_apron':
        for x0 in (60,110,w-120,w-70):
            d.line((x0,0,x0+rng.randint(-12,12),h),fill=(66,58,50),width=9)
        d.rectangle((96,0,w-97,h),fill=(100,96,89))
        joints(d,w,h,192,(78,75,70),(124,120,112),range(64,h,64))
        for x in (112,w-113):
            d.line((x,0,x,h),fill=(128,124,114),width=3)
        hazard(im,96,0,w-97,28,20)
        mask=Image.new('L',im.size)
        md=ImageDraw.Draw(mask)
        for x0 in (150,w-150):
            md.line((x0,0,x0+rng.randint(-10,10),h),fill=170,width=26)
        for _ in range(8):
            x,y,r=rng.randrange(96,w-96),rng.randrange(h),rng.randint(16,46)
            md.ellipse((x-r,y-r*.5,x+r,y+r*.5),fill=rng.randint(80,170))
        im.paste(SOOT,(0,0),mask.filter(ImageFilter.GaussianBlur(5)))
        mud=Image.new('L',im.size)
        ud=ImageDraw.Draw(mud)
        for _ in range(6):
            y=rng.randrange(h)
            ud.line((96,y,w-96,y+rng.randint(-30,30)),fill=rng.randint(90,170),width=rng.randint(8,18))
        im.paste(MUD,(0,0),mud.filter(ImageFilter.GaussianBlur(4)))

    if card == 'toxic_industrial_slab_top':
        for x,y in ((60,60),(w-60,h-60)):
            d.ellipse((x-12,y-12,x+12,y+12),fill=(36,34,32),outline=(70,66,61),width=3)
        smokestacks(d,w//2,h//2,110,OCHRE)
        soot(im,.3,80)

    if card == 'toxic_industrial_slab':
        for x,y in ((70,80),):
            d.ellipse((x-10,y-10,x+10,y+10),fill=(36,34,32),outline=(70,66,61),width=3)
        soot(im,.4,90)

    if card == 'toxic_industrial_wall_top':
        d.rectangle((0,8,w,h-8),fill=(34,32,30))
        for x in range(0,w,8):
            d.polygon([(x,8),(x+4,2),(x+8,8)],fill=(34,32,30))
            d.polygon([(x,h-8),(x+4,h-2),(x+8,h-8)],fill=(34,32,30))
        for x in range(-8,w,16):
            d.arc((x,8,x+22,h-8),200,300,fill=(150,146,138),width=2)
        soot(im,1,60)

    if card == 'toxic_industrial_tank_top':
        c=w//2
        for r in (122,96,64):
            d.ellipse((c-r,c-r,c+r,c+r),outline=(140,132,120),width=4)
            for k in range(int(r/4)):
                a=math.radians(k*360/int(r/4))
                d.point((c+(r-7)*math.cos(a),c+(r-7)*math.sin(a)),fill=(118,110,98))
        d.ellipse((c-26,c-26,c+26,c+26),fill=(52,48,44),outline=(110,102,92),width=4)
        rust(im,10,0)
        mask=Image.new('L',im.size)
        ImageDraw.Draw(mask).ellipse((c-90,c-90,c+90,c+90),fill=110)
        im.paste(SOOT,(0,0),mask.filter(ImageFilter.GaussianBlur(30)))

    if card == 'toxic_industrial_blast_door':
        c=w//2
        for y in range(12,h-30,22):
            d.rectangle((0,y,w,y+8),fill=(62,58,52))
            d.line((0,y,w,y),fill=(110,104,94),width=2)
        for y in range(14,h-30):
            d.line((c-34,y,c+34,y),fill=lerp((90,52,30),FURNACE_PAINT,y/(h-30)))
        rd.rectangle((c-34,14,c+34,h-30),fill=finish((.9,0)))
        for y in range(20,h-34,18):
            d.line((c-30,y,c+30,y),fill=(70,44,30),width=3)
        wash(glow,(c-32,18,c+32,h-32),FURNACE,8,250)
        hazard(im,0,h-30,w-1,h-1,20)
        rust(im,14,0)
        soot(im,.5,140)

    if card == 'cyber_samurai_tech_shell':
        seam = (20, 26, 35)
        bevel = (110, 130, 145)
        d.rectangle((3, 4, w-4, h-5), outline=seam, width=7)
        d.line((14, 14, w-15, 14), fill=bevel, width=3)
        d.line((14, h-15, w-15, h-15), fill=(78, 97, 112), width=4)
        d.polygon([(24, 26), (w-46, 26), (w-22, 50), (w-22, h-80),
                   (w-57, h-45), (37, h-45), (24, h-59)],
                  fill=(70, 84, 100), outline=seam, width=4)
        d.polygon([(48, 49), (w-82, 49), (w-50, 79), (w-50, h-95),
                   (w-72, h-73), (48, h-73)], fill=(48, 59, 73), outline=(87, 105, 122), width=2)
        d.polygon([(76, 56), (w-88, 56), (w-67, 78), (w-67, 109),
                   (w-148, 109), (w-176, 82), (76, 82)], fill=(81, 96, 112))
        d.line((49, h-46, 75, h-46, 106, h-77, 160, h-77), fill=bevel, width=4)
        d.line((w-31, 68, w-31, h-97), fill=(117, 133, 146), width=4)
        for x in range(118, w-76, 36):
            d.line((x, h-64, x, h-56), fill=(115, 133, 147), width=3)
        for line in (((26, h-65), (26, 94), (60, 60), (89, 60)),
                     ((w-42, h-53), (w-79, h-25), (w-147, h-25))):
            d.line(line, fill=(24, 30, 41), width=12)
            d.line(line, fill=(165, 73, 88), width=5)
            gd.line(line, fill=(128, 49, 63), width=4)
        d.line((114, 127, 114, 168, 132, 185, w-89, 185), fill=(25, 31, 39), width=3)
        d.line((132, 189, w-89, 189), fill=(92, 109, 124), width=2)

    if card == 'cyber_samurai_tech_wall':
        edge = (105, 125, 140)
        seam = (23, 29, 36)
        d.rectangle((3, 5, w-4, h-6), outline=seam, width=7)
        d.line((13, 14, w-14, 14), fill=edge, width=4)
        d.line((13, h-15, w-14, h-15), fill=edge, width=3)
        for x in (20, 142, 264):
            d.polygon([(x, 26), (x+84, 26), (x+103, 45), (x+103, 173),
                       (x+83, 194), (x, 194)], fill=(63, 77, 91), outline=seam, width=4)
            d.line((x+4, 29, x+81, 29, x+99, 47), fill=edge, width=3)
            d.rectangle((x+12, 48, x+88, 72), fill=(23, 32, 40))
            for u in range(x+18, x+82, 16):
                d.rectangle((u, 54, u+10, 61), fill=(113, 166, 187))
                gd.rectangle((u, 55, u+10, 60), fill=(57, 109, 135))
            d.line((x+13, 110, x+36, 110, x+50, 125, x+86, 125), fill=seam, width=3)
            d.polygon([(x+12, 155), (x+27, 143), (x+38, 143), (x+38, 179),
                       (x+12, 179)], fill=(155, 167, 168))
            rd.rectangle((x+14, 156, x+35, 177), fill=finish((.82,0)))

    if card == 'cyber_samurai_tech_edge':
        d.rectangle((0, 0, w-1, h-1), outline=(35, 42, 51), width=6)
        d.rectangle((10, 11, w-11, 24), fill=(111, 129, 143))
        d.line((10, 12, w-11, 12), fill=(153, 170, 180), width=3)
        d.line((10, h-22, w-11, h-22), fill=(51, 64, 76), width=5)
        d.line((10, h-16, w-11, h-16), fill=(100, 120, 133), width=2)
        for x in range(29, w-25, 41):
            d.line((x, h-36, x+9, h-36), fill=(119, 139, 153), width=2)

    if card == 'cyber_samurai_power_band':
        d.rectangle((3, 9, w-4, h-10), outline=(100, 120, 137), width=5)
        d.rectangle((13, 26, w-14, h-29), fill=(12, 24, 34))
        rd.rectangle((13, 26, w-14, h-29), fill=finish((.25,0)))
        for x in range(25, w-30, 42):
            d.polygon([(x, 42), (x+33, 42), (x+33, 67), (x+27, 76), (x, 76)],
                      fill=(78, 136, 161))
            d.line((x+2, 44, x+30, 44), fill=(165, 206, 222), width=4)
            wash(glow, (x+2, 46, x+30, 67), (117, 176, 203), 3, 210)

    if card == 'cyber_samurai_separator':
        c = w//2
        for r, color in ((155, (28, 37, 49)), (145, (109, 127, 141)),
                         (137, (59, 77, 94)), (117, (22, 38, 51)), (100, (79, 101, 120)),
                         (95, (44, 62, 79)), (72, (23, 38, 52)), (52, (75, 98, 115)),
                         (47, (34, 51, 66))):
            d.ellipse((c-r, c-r, c+r, c+r), fill=color)
        for a in range(0, 360, 45):
            d.arc((c-128, c-128, c+128, c+128), a+6, a+35, fill=(123, 176, 199), width=9)
            gd.arc((c-128, c-128, c+128, c+128), a+6, a+35, fill=(98, 164, 192), width=7)
            d.arc((c-82, c-82, c+82, c+82), a+2, a+40, fill=(96, 115, 128), width=4)
        d.polygon([(c, c-31), (c+26, c), (c, c+31), (c-26, c)],
                  fill=(69, 120, 141), outline=(110, 162, 184), width=3)
        gd.line((c-10, c, c+10, c), fill=(124, 176, 199), width=5)

    if card == 'cyber_samurai_forge_spine':
        d.rectangle((5, 6, w-6, h-7), outline=(105, 117, 126), width=5)
        d.rectangle((18, 18, w-19, h-19), fill=(20, 26, 33))
        for x in (33, 66, 134, 167):
            d.rectangle((x, 26, x+22, h-27), fill=(117, 77, 55))
            for y in range(39, h-48, 51):
                d.rectangle((x+4, y, x+17, y+33), fill=(217, 151, 96))
                wash(glow, (x+6, y+2, x+15, y+30), LANTERN, 2, 210)
                d.line((x+4, y+34, x+17, y+34), fill=(100, 69, 55), width=3)
        d.rectangle((96, 29, 128, h-30), fill=(57, 69, 83), outline=(76, 90, 104), width=3)
        for y in range(38, h-40, 44):
            d.line((102, y, 122, y), fill=(110, 124, 136), width=3)

    # Break up perfectly even paint without eroding the small lettering at game zoom.
    # The advanced utopian faction is spotless, so its cards skip it.
    if not card.startswith(UTOPIAN):
        stipple=Image.new('L',im.size)
        sd=ImageDraw.Draw(stipple)
        for _ in range(w*h//235):
            x,y=rng.randrange(w),rng.randrange(h)
            sd.line((x,y,x+rng.choice([0,1,2]),y),fill=rng.randrange(12,53))
        im.paste((55,55,49),(0,0),stipple)

    painted[card] = (im, glow, surface)


def paste(atlas, im, x, y):
    """Paste a card and bleed its edges into the padding so mipmaps don't pick up neighbors."""
    w, h = im.size
    atlas.paste(im,(x,y))
    atlas.paste(im.crop((0,0,1,h)).resize((PAD,h)),(x-PAD,y))
    atlas.paste(im.crop((w-1,0,w,h)).resize((PAD,h)),(x+w,y))
    strip=atlas.crop((x-PAD,y,x+w+PAD,y+1)).resize((w+2*PAD,PAD))
    atlas.paste(strip,(x-PAD,y-PAD))
    strip=atlas.crop((x-PAD,y+h-1,x+w+PAD,y+h)).resize((w+2*PAD,PAD))
    atlas.paste(strip,(x-PAD,y+h))


def page_gap(regions, page, width, height):
    """Find space for a padded card without moving cards already on this page."""
    offset = page * PAGE
    rects = []
    for name, (x, y) in regions.items():
        if offset <= x < offset + PAGE:
            w, h = CARDS[name][0]
            rects.append((x-offset-PAD, y-PAD, x-offset+w+PAD, y+h+PAD))
    xs = sorted({0, *(right for _, _, right, _ in rects)})
    ys = sorted({0, *(bottom for _, _, _, bottom in rects)})
    for y in ys:
        bottom = y + height + 2 * PAD
        for x in xs:
            right = x + width + 2 * PAD
            if right <= PAGE and bottom <= PAGE and all(
                right <= left or x >= r or bottom <= top or y >= b for left, top, r, b in rects
            ):
                return offset + x + PAD, y + PAD
    return None


def pack(names, *, fill_gaps=False):
    """Shelf-pack cards onto 2048-pixel pages, optionally filling gaps when a page overflows."""
    regions, page, x, y, row = {}, 0, PAD, PAD, 0
    filling_gaps = False
    for name in names:
        w, h = CARDS[name][0]
        if not filling_gaps and x + w + PAD > PAGE:
            x, y, row = PAD, y + row + 2 * PAD, 0
        if filling_gaps or y + h + PAD > PAGE:
            gap = page_gap(regions, page, w, h) if fill_gaps else None
            if gap is not None:
                regions[name] = gap
                filling_gaps = True
                continue
            page, x, y, row = page + 1, PAD, PAD, 0
            filling_gaps = False
        regions[name] = (page * PAGE + x, y)
        x += w + 2 * PAD
        row = max(row, h)
    return regions, page + 1


sets = [('themes', name, BASE + settings['cards'], settings) for name, settings in THEMES.items()]
sets += [('factions', name, settings['cards'], settings) for name, settings in FACTIONS.items()]
for kind, name, names, settings in sets:
    assert len(set(names)) == len(names), f'{name} lists a card twice'
    regions, pages = pack(names, fill_gaps=settings.get('fill_gaps', False))
    folder = HERE / kind / name
    folder.mkdir(parents=True, exist_ok=True)
    atlas = Image.new('RGB', (PAGE * pages, PAGE), (86, 91, 89))
    glow = Image.new('RGB', atlas.size, (0, 0, 0))
    surface = Image.new('RGB', atlas.size, finish((.86, 0)))
    for card in names:
        for layer, image in zip((atlas, glow, surface), painted[card]):
            paste(layer, image, *regions[card])
    atlas.save(folder / 'atlas.jpg', quality=88, subsampling=0, optimize=True)
    if settings['glow']:
        glow.save(folder / 'atlas-glow.jpg', quality=90, subsampling=0, optimize=True)
    if settings.get('surface'):
        surface.save(folder / 'atlas-surface.jpg', quality=92, subsampling=0, optimize=True)
    cards = {
        card: {'x': regions[card][0], 'y': regions[card][1], 'width': CARDS[card][0][0],
               'height': CARDS[card][0][1], 'shows': CARDS[card][2]}
        for card in names
    }
    document = {kind[:-1]: name, 'width': atlas.width, 'height': atlas.height, 'lighting': settings['lighting'],
                'glow': 'atlas-glow.jpg' if settings['glow'] else None,
                'surface': 'atlas-surface.jpg' if settings.get('surface') else None, 'cards': cards}
    (folder / 'atlas.json').write_text(json.dumps(document, indent=2) + '\n')
