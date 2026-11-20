# -*- coding: utf-8 -*-
"""
يرسم شاشات Z-Project بمقاسات CSS الحقيقية.
كل رقم هنا مأخوذ حرفيًا من css/app.css.

    python3 tools/shots/render.py
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image, ImageDraw, ImageFilter
from ar2 import draw_text
from ic import icon_paths, draw_icon

# ═══════════ المقاسات ═══════════
CW, CH = 390, 844          # إطار الموبايل (CSS px)
S = 2                      # كثافة البكسل @2x
W, H = CW*S, CH*S

F = os.path.join(HERE, 'fonts')
# النص — IBM Plex Sans Arabic
A4 = F+'/ibm-plex-sans-arabic-arabic-400.ttf'
A6 = F+'/ibm-plex-sans-arabic-arabic-600.ttf'
A7 = F+'/ibm-plex-sans-arabic-arabic-700.ttf'
# العناوين — Alexandria
A8 = F+'/alexandria-arabic-800.ttf'
# أرقام لاتينية — IBM Plex
L4 = F+'/ibm-plex-sans-arabic-latin-400.ttf'
L6 = F+'/ibm-plex-sans-arabic-latin-600.ttf'
L7 = F+'/ibm-plex-sans-arabic-latin-700.ttf'
L8 = F+'/alexandria-latin-800.ttf'

ICONS = os.path.join(HERE, '..', '..', 'zworkplace', 'js', 'icons.js')

# ═══════════ الألوان — من :root ═══════════
NAVY9 = (7, 26, 63);   NAVY8 = (10, 36, 82);  NAVY7 = (14, 47, 107)
NAVY6 = (20, 59, 133); NAVY5 = (29, 79, 168)
GOLD = (246, 183, 60); GOLD2 = (255, 209, 102)
MINT = (46, 211, 163); PINK = (255, 122, 156)
INK = (13, 27, 51);    INK2 = (74, 90, 117);  INK3 = (135, 148, 171)
PAPER = (244, 246, 251); WHITE = (255, 255, 255)
T_ICO_BLUE = (232, 238, 250)    # rgba(29,79,168,.10) على أبيض
T_ICO_GOLD = (253, 243, 225)    # rgba(246,183,60,.16)
T_ICO_GREEN = (225, 249, 242)   # rgba(46,211,163,.14)
T_ICO_NAVY = (233, 238, 245)    # rgba(20,59,133,.09)

def px(v):
    """CSS px → بكسل الصورة"""
    return int(round(v*S))

def grad(w, h, c1, c2, diag=True):
    s = Image.new('RGB', (2, 2))
    if diag:
        s.putpixel((0, 0), c1)
        s.putpixel((1, 0), tuple((c1[i]+c2[i])//2 for i in range(3)))
        s.putpixel((0, 1), tuple((c1[i]+c2[i])//2 for i in range(3)))
        s.putpixel((1, 1), c2)
    else:
        s.putpixel((0, 0), c1); s.putpixel((1, 0), c1)
        s.putpixel((0, 1), c2); s.putpixel((1, 1), c2)
    return s.resize((w, h), Image.BICUBIC)

BRAND = (NAVY7, NAVY5)

def brandfill(w, h):
    """--grad-brand: 135deg، من navy-700 → navy-500 (تمرّ بـ navy-600)"""
    img = Image.new('RGB', (3, 3))
    img.putpixel((2, 0), NAVY7)
    img.putpixel((1, 1), NAVY6)
    img.putpixel((0, 2), NAVY5)
    img.putpixel((0, 0), NAVY7); img.putpixel((1, 0), NAVY7)
    img.putpixel((0, 1), NAVY6); img.putpixel((2, 1), NAVY6)
    img.putpixel((2, 2), NAVY5); img.putpixel((1, 2), NAVY5)
    return img.resize((w, h), Image.BICUBIC)

def shadow(img, box, r, blur=9, alpha=40, dy=4):
    sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        (box[0], box[1]+dy, box[2], box[3]+dy), radius=r, fill=(7, 26, 63, alpha))
    return Image.alpha_composite(img, sh.filter(ImageFilter.GaussianBlur(blur)))

def card(img, box, r, fill=WHITE, blur=9, alpha=40, dy=4):
    """--shadow-1: 0 2px 10px rgba(7,26,63,.07) هو أفتح — لكن الشكل محتاج وضوح"""
    img = shadow(img, box, r, blur, alpha, dy)
    ImageDraw.Draw(img).rounded_rectangle(box, radius=r, fill=fill)
    return img

def TA(img, xy, s, fpath, size, fill, anchor='la'):
    return draw_text(img, (xy[0]*S, xy[1]*S), s, fpath, px(size), fill, anchor)

def TL(img, xy, s, fpath, size, fill, anchor='la'):
    from PIL import ImageFont
    d = ImageDraw.Draw(img)
    d.text((xy[0]*S, xy[1]*S), s, font=ImageFont.truetype(fpath, px(size)),
           fill=fill, anchor=anchor)

def ICO(img, name, cx, cy, size, color, width=1.5):
    d = icon_paths(name, ICONS)
    if not d:
        return img
    return draw_icon(img, d, (px(cx-size/2), px(cy-size/2),
                              px(cx+size/2), px(cy+size/2)), color, width)

def ico_in(name, box, size, color):
    """box = (x, y, w, h) مربع الأيقونة بالـCSS px"""
    x, y, w, h = box
    return (name, x+w/2, y+h/2, size, color)

def rr(img, box, r, fill=None, outline=None, width=1):
    """rounded rect بالـCSS px"""
    b = [px(box[0]), px(box[1]), px(box[2]), px(box[3])]
    ImageDraw.Draw(img).rounded_rectangle(b, radius=px(r), fill=fill,
                                          outline=outline,
                                          width=px(width) if width else 0)
    return img

def save(img, name):
    os.makedirs(os.path.join(HERE, '..', '..', 'shots', 'zproj'), exist_ok=True)
    out = os.path.join(HERE, '..', '..', 'shots', 'zproj', name)
    img.convert('RGB').save(out, 'PNG', optimize=True)
    print('✅', name)
    return out


# ═══════════ رسم شفاف (PIL بيلغي الشفافية مباشرة) ═══════════
def rr_a(img, box, r, fill=None, outline=None, width=1):
    """يرسم مستطيل مدوّر ويخلط الشفافية صح."""
    lay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(lay).rounded_rectangle(
        [px(box[0]), px(box[1]), px(box[2]), px(box[3])],
        radius=px(r), fill=fill, outline=outline,
        width=px(width) if width else 0)
    return Image.alpha_composite(img, lay)


def circle_a(img, box, fill):
    lay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(lay).ellipse([px(box[0]), px(box[1]), px(box[2]), px(box[3])], fill=fill)
    return Image.alpha_composite(img, lay)


def _ascent(fpath, size):
    """مسافة أعلى الجليف فوق خط الأساس (بالبكسل)"""
    from fontTools.ttLib import TTFont
    tt = TTFont(fpath)
    upem = tt['head'].unitsPerEm
    asc = tt['hhea'].ascent
    tt.close()
    return asc/upem*size


def TT(img, xy, txt, fpath, size, fill, anchor='la'):
    """نص بـy = أعلى النص (مش خط الأساس) — زي CSS"""
    a = _ascent(fpath, size)
    return draw_text(img, (xy[0]*S, (xy[1]+a)*S), txt, fpath, px(size), fill, anchor)


def TTm(img, xy, txt, fpath, size, fill, anchor='ma'):
    """مركزي أفقيًا، y = أعلى النص"""
    a = _ascent(fpath, size)
    return draw_text(img, (xy[0]*S, (xy[1]+a)*S), txt, fpath, px(size), fill, anchor)
