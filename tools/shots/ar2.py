"""رسم نص عربي مشكّل — بنرسم جليف واحد واحد من مساراته"""
from PIL import Image, ImageDraw
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
import functools

_cache = {}

def get(path):
    if path in _cache: return _cache[path]
    data = open(path,'rb').read()
    face = hb.Face(data); font = hb.Font(face)
    tt = TTFont(path)
    gs = tt.getGlyphSet()
    order = tt.getGlyphOrder()
    _cache[path] = (face, font, face.upem, gs, order)
    return _cache[path]

class Pen(BasePen):
    def __init__(self, gs, scale, ox, oy):
        super().__init__(gs); self.pts=[]; self.scale=scale; self.ox=ox; self.oy=oy
        self.cur=[]
    def _moveTo(self,p): self._flush(); self.cur=[(p,)]
    def _lineTo(self,p): self.cur.append((p,))
    def _curveToOne(self,p1,p2,p3): self.cur.append((p1,p2,p3))
    def _closePath(self): self._flush()
    def _endPath(self): self._flush()
    def _flush(self):
        if self.cur: self.pts.append(self.cur); self.cur=[]

def shape_text(text, fontpath, size):
    face, hbfont, upem, gs, order = get(fontpath)
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(hbfont, buf)
    sc = size/upem
    return hbfont, buf.glyph_infos, buf.glyph_positions, sc, gs, order

def measure(text, fontpath, size):
    _, infos, poss, sc, gs, order = shape_text(text, fontpath, size)
    return sum(p.x_advance for p in poss)*sc

def draw_text(img, xy, text, fontpath, size, fill, anchor='la'):
    """يرسم النص العربي صح. anchor: la/lm/ls/ma/mm/ms/ra/rm/rs"""
    hbfont, infos, poss, sc, gs, order = shape_text(text, fontpath, size)
    total = sum(p.x_advance for p in poss)*sc
    x, y = xy          # x هو نقطة الارتكاز الأصلية (مش مزحزحة)

    # نجمع كل المسارات في طبقة واحدة
    layer = Image.new('RGBA', img.size, (0,0,0,0))
    d = ImageDraw.Draw(layer)

    # نقطة البداية: النص العربي بيترسم من اليمين — HarfBuzz بيطلع
    # جليفات بترتيب بصري من اليمين لليسار، و x_advance موجب.
    # يعني أول جليف هو أقصى اليمين.
    pen_x = 0
    allpolys = []
    for info, pos in zip(infos, poss):
        gname = order[info.codepoint]
        ox = pen_x + pos.x_offset*sc
        oy = y - pos.y_offset*sc
        pen = Pen(gs, sc, ox, oy)
        try:
            gs[gname].draw(pen)
        except Exception:
            pass
        # نحوّل النقاط لإحداثيات البكسل (y مقلوب)
        for contour in pen.pts:
            pts=[]
            for node in contour:
                a = node[-1]
                pts.append((ox + a[0]*sc, oy - a[1]*sc))
            allpolys.append(pts)
        pen_x += pos.x_advance*sc

    # نزيح كل الأشكال حسب الـanchor
    if allpolys:
        allx = [p[0] for poly in allpolys for p in poly]
        L, R = min(allx), max(allx)
        shift = 0
        if anchor[0]=='m': shift = x - (L+R)/2
        elif anchor[0]=='r': shift = x - R
        else: shift = x - L
        allpolys = [[(p[0]+shift, p[1]) for p in poly] for poly in allpolys]

    # نرسم كل شكل مغلق
    if allpolys:
        mask = Image.new('L', img.size, 0)
        md = ImageDraw.Draw(mask)
        # كل contour = مضلع، نملأهم كلهم (even-odd بسيط)
        for pts in allpolys:
            if len(pts) >= 3:
                md.polygon(pts, fill=255)
        layer = Image.new('RGBA', img.size, fill+(0,))
        layer.putalpha(mask)
        img.alpha_composite(layer)
    return total
