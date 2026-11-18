"""Paint each theme's texture atlas, glow map, and card map.

Run from the repo root:

    uv run --with pillow python art/blender/materials/city_atlas.py

Each card is a painted surface that structures map faces onto. CARDS defines
every card once. BASE lists the theme-neutral cards that every theme's atlas
carries, and THEMES lists each theme's own cards and tool settings. Each theme
gets art/blender/materials/themes/<theme>/atlas.jpg and atlas.json, plus
atlas-glow.jpg when the theme glows. Cards pack in list order onto 2048-pixel
pages laid side by side.

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
    'cyberpunk': {'lighting': 'night', 'glow': True, 'cards': [
        'cyber_hospital_ward', 'cyber_hospital_lobby', 'cyber_hospital_pad',
        'cyber_apron_bays', 'cyber_clinic_street', 'cyber_clinic_tower', 'cyber_clinic_upper', 'cyber_landing_deck',
        'cyber_roof_tar', 'cyber_wall_channels', 'cyber_lift_shaft', 'cyber_sign_pharmacy', 'cyber_metal_rust',
        'cyber_canopy_fascia', 'cyber_trim_cyan', 'cyber_lamp']},
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
    w,h=size
    is_wall=card.startswith(('wall_office_', 'wall_garage_', 'wall_ward_'))
    broad={'roof_flat_large','lot_two_bay','roof_flat_small','apron_paved','cyber_apron_bays','cyber_roof_tar'}
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

    # Break up perfectly even paint without eroding the small lettering at game zoom.
    stipple=Image.new('L',im.size)
    sd=ImageDraw.Draw(stipple)
    for _ in range(w*h//235):
        x,y=rng.randrange(w),rng.randrange(h)
        sd.line((x,y,x+rng.choice([0,1,2]),y),fill=rng.randrange(12,53))
    im.paste((55,55,49),(0,0),stipple)

    painted[card] = (im, glow)


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


def pack(names):
    """Shelf-pack cards in order onto 2048-pixel pages, starting a page when one fills."""
    regions, page, x, y, row = {}, 0, PAD, PAD, 0
    for name in names:
        w, h = CARDS[name][0]
        if x + w + PAD > PAGE:
            x, y, row = PAD, y + row + 2 * PAD, 0
        if y + h + PAD > PAGE:
            page, x, y, row = page + 1, PAD, PAD, 0
        regions[name] = (page * PAGE + x, y)
        x += w + 2 * PAD
        row = max(row, h)
    return regions, page + 1


for theme, settings in THEMES.items():
    names = BASE + settings['cards']
    assert len(set(names)) == len(names), f'{theme} lists a card twice'
    regions, pages = pack(names)
    folder = HERE / 'themes' / theme
    folder.mkdir(parents=True, exist_ok=True)
    atlas = Image.new('RGB', (PAGE * pages, PAGE), (86, 91, 89))
    glow = Image.new('RGB', atlas.size, (0, 0, 0))
    for name in names:
        paste(atlas, painted[name][0], *regions[name])
        paste(glow, painted[name][1], *regions[name])
    atlas.save(folder / 'atlas.jpg', quality=88, subsampling=0, optimize=True)
    if settings['glow']:
        glow.save(folder / 'atlas-glow.jpg', quality=90, subsampling=0, optimize=True)
    cards = {
        name: {'x': regions[name][0], 'y': regions[name][1], 'width': CARDS[name][0][0],
               'height': CARDS[name][0][1], 'shows': CARDS[name][2]}
        for name in names
    }
    document = {'theme': theme, 'width': atlas.width, 'height': atlas.height, 'lighting': settings['lighting'],
                'glow': 'atlas-glow.jpg' if settings['glow'] else None, 'cards': cards}
    (folder / 'atlas.json').write_text(json.dumps(document, indent=2) + '\n')
