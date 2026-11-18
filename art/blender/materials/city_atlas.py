"""Paint the shared city texture atlas and its card map.

Run from the repo root:

    uv run --with pillow python art/blender/materials/city_atlas.py

Each card is a painted surface that structures map faces onto. Reuse cards
before adding one. Add new cards at the end of the last page and never resize,
reorder, or remove an existing card: positions come from packing in order, so
either moves cards that shipped models already point at. When the last page is
full, start a new page. Pages sit side by side, each 2048 pixels square, so a
new page widens the atlas and existing cards keep their pixels. Models mapped
with atlas_cards.py pick up the new width when mapped again. Scale the U of any
model mapped by hand.

Pillow is used because the signs need real font rendering. Only this script
needs it, and only when the atlas changes.
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
PAGES = [{
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
    'wall_ward_front': ((460, 241), CONCRETE, 'Two-storey front: continuous upper window band, glazed entrance at the center, small ground-floor windows. Unused'),
    'apron_paved': ((512, 410), (112, 111, 104), 'Plain paved apron with slab joints, a kerb edge, and stains'),
    'sign_hospital_roof': ((256, 250), (150, 152, 146), 'Hospital rooftop helipad: a red H inside a white ring on a light panel'),
    'sign_hospital_fascia': ((258, 24), (128, 50, 45), 'Muted red canopy fascia reading EMERGENCY'),
    'roof_barrel_seam': ((300, 300), (80, 84, 66), 'Army olive corrugated metal for curved hut roofs, with five broad ribs across the curve'),
    'gable_steel_louvre': ((350, 100), (90, 99, 97), 'Ribbed steel gable cladding with a louvre in the lower middle. Unused'),
    'marking_ambulance_bays': ((228, 80), (112, 111, 104), 'Paving decal with two outlined ambulance bays and a hatched kerb strip'),
}, {
    'wall_ward_slab': ((440, 278), CONCRETE, 'Three-storey hospital ward slab: continuous window bands and a red stair-core stripe left of center'),
    'wall_ward_slab_end': ((150, 278), CONCRETE, 'Narrow three-storey end wall with one small window per floor'),
    'wall_podium_entrance': ((320, 89), CONCRETE, 'Single-storey hospital podium front: red cornice band, glazed entrance left of center, windows to the right'),
    'gable_quonset_end': ((220, 110), (80, 84, 68), 'Olive end wall of a half-round hut: centered personnel door, two small windows, stencilled number'),
    'marking_muster_yard': ((360, 100), (112, 111, 104), 'Paving decal for a muster yard: painted border, rows of formation marks, a walkway'),
    'flag_army': ((94, 60), (84, 96, 62), 'Olive flag with a cream star'),
}]
CARDS = {name: card for page in PAGES for name, card in page.items()}

REGIONS = {}
for number, page in enumerate(PAGES):
    x, y, row = PAD, PAD, 0
    for name, ((w, h), _, _) in page.items():
        if x + w + PAD > PAGE:
            x, y, row = PAD, y + row + 2 * PAD, 0
        assert y + h + PAD <= PAGE, f'{name} does not fit on page {number + 1}. Start a new page.'
        REGIONS[name] = (number * PAGE + x, y)
        x += w + 2 * PAD
        row = max(row, h)

atlas = Image.new('RGB', (PAGE * len(PAGES), PAGE), (86, 91, 89))
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

for card, (size, base, _) in CARDS.items():
    # Each card seeds its own noise, so adding a card never repaints the others.
    rng = random.Random(card)
    w,h=size
    is_wall=card.startswith(('wall_office_', 'wall_garage_', 'wall_ward_'))
    broad={'roof_flat_large','lot_two_bay','roof_flat_small','apron_paved'}
    im=field(size,base,16 if card in broad else 8,4,12)
    d=ImageDraw.Draw(im)

    if is_wall:
        if card.startswith('wall_office_'):
            lower=[78,164,h-17]
        elif card.startswith('wall_ward_slab'):
            lower=[h//3,2*h//3,h-17]
        elif card.startswith('wall_ward_'):
            lower=[h*47//100,h-17]
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

    if card == 'wall_ward_front':
        # The upper band spans the ward floor. The entrance sits at the center under a canopy.
        d.rectangle((14,34,446,100),fill=(109,113,109))
        for a,b in [(20,160),(166,300),(306,440)]:
            glass(d,a,40,b,94,4)
        d.rectangle((128,146,300,236),fill=(117,120,113))
        glass(d,138,156,290,234,4,True)
        for x0 in (24,356):
            glass(d,x0,160,x0+80,200,2)
        grime(im,[(12,98,446,108,48),(126,142,300,150,50),(0,0,w,7,47),(24,202,104,210,46),(356,202,436,210,46)],85)

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

    if card == 'gable_steel_louvre':
        for x in range(4,w,10):
            d.line((x,0,x,h),fill=(74,82,80))
            d.line((x+1,0,x+1,h),fill=(118,126,122))
        d.rectangle((83,51,267,88),fill=(48,55,56))
        for y in range(55,86,6):
            d.rectangle((86,y,264,y+2),fill=(128,136,131))
        grime(im,[(83,86,267,96,50),(0,h-6,w,h,45)],20)

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

    # Break up perfectly even paint without eroding the small lettering at game zoom.
    stipple=Image.new('L',im.size)
    sd=ImageDraw.Draw(stipple)
    for _ in range(w*h//235):
        x,y=rng.randrange(w),rng.randrange(h)
        sd.line((x,y,x+rng.choice([0,1,2]),y),fill=rng.randrange(12,53))
    im.paste((55,55,49),(0,0),stipple)

    x,y=REGIONS[card]
    atlas.paste(im,(x,y))
    atlas.paste(im.crop((0,0,1,h)).resize((PAD,h)),(x-PAD,y))
    atlas.paste(im.crop((w-1,0,w,h)).resize((PAD,h)),(x+w,y))
    strip=atlas.crop((x-PAD,y,x+w+PAD,y+1)).resize((w+2*PAD,PAD))
    atlas.paste(strip,(x-PAD,y-PAD))
    strip=atlas.crop((x-PAD,y+h-1,x+w+PAD,y+h)).resize((w+2*PAD,PAD))
    atlas.paste(strip,(x-PAD,y+h))


atlas.save(HERE / 'city-atlas.jpg', quality=88, subsampling=0, optimize=True)
cards = {
    name: {'x': REGIONS[name][0], 'y': REGIONS[name][1], 'width': w, 'height': h, 'shows': shows}
    for name, ((w, h), _, shows) in CARDS.items()
}
(HERE / 'city-atlas.json').write_text(json.dumps({'width': atlas.width, 'height': atlas.height, 'cards': cards}, indent=2) + '\n')
