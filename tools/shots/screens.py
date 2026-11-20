# -*- coding: utf-8 -*-
"""الشاشات — مطابقة لـ index.html + css/app.css بالبكسل."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from render import *   # noqa
from PIL import Image, ImageDraw, ImageFilter

# ═══════════════════════════════════════════════
#  ١. البداية  —  #screen-home .home
# ═══════════════════════════════════════════════
def home():
    img = brandfill(W, H).convert('RGBA')

    # .home::before — دايرة بيضاء 340px عند -130,-130 بـopacity .055
    ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    d.ellipse([px(-130), px(-130), px(-130+340), px(-130+340)], fill=(255, 255, 255, 14))
    # .home::after — دايرة ذهبية 280px عند bottom:-120 right:-100
    d.ellipse([px(CW-100-280), px(CH-120-280), px(CW-100), px(CH-120)], fill=(*GOLD, 26))
    img = Image.alpha_composite(img, ov.filter(ImageFilter.GaussianBlur(px(18))))

    # padding: 40px 22px 28px
    cx = CW/2

    # .brand-mark — 92px, radius 26, grad-gold
    mk = 92
    my = 150          # موضع بصري متوازن
    g = grad(px(mk), px(mk), GOLD2, GOLD)
    mask = Image.new('L', (px(mk), px(mk)), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, px(mk)-1, px(mk)-1], radius=px(26), fill=255)
    # ظل ذهبي: 0 14px 34px rgba(246,183,60,.36)
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        [px(cx-mk/2), px(my+14), px(cx+mk/2), px(my+mk+14)], radius=px(26), fill=(*GOLD, 92))
    img = Image.alpha_composite(img, sh.filter(ImageFilter.GaussianBlur(px(12))))
    img.paste(g, (px(cx-mk/2), px(my)), mask)
    TL(img, (cx, my+mk/2+1), 'Z', L8, 46, NAVY8, 'mm')   # font-size:46px

    # .brand h1 — 33px / weight 800
    TL(img, (cx, my+mk+34), 'Z Project Workspace', L8, 33, WHITE, 'mm')
    # .brand p — 14px, #c8d6f2, margin-top 8
    TTm(img, (cx, my+mk+74), 'مساحة عمل الفصل', A6, 14, (200, 214, 242))

    # .home-actions — gap 12, padding-top 36, ومثبّت تحت
    acts_bottom = CH - 28
    n = 3; bh = 78; gap = 12
    total = n*bh + (n-1)*gap
    by = acts_bottom - total

    bw = CW - 44       # padding 22 يمين وشمال
    bx = 22

    items = [
        ('mail', 'طلب انضمام', 'لو معاك كود من المس أسماء', T_ICO_BLUE, NAVY6),
        ('key',  'تسجيل دخول', 'عندك حساب بالفعل',        T_ICO_GREEN, (18, 166, 124)),
    ]
    for i, (ic, t1, t2, ibg, icol) in enumerate(items):
        y = by + i*(bh+gap)
        img = card(img, [px(bx), px(y), px(bx+bw), px(y+bh)], px(18), WHITE, px(9), 62, px(5))
        # .bb-ico 44px radius 14 — على اليمين (RTL)
        ir = bx + bw - 20        # padding 20
        il = ir - 44
        rr(img, [il, y+17, ir, y+17+44], 14, fill=ibg)
        img = ICO(img, ic, il+22, y+17+22, 22, icol, 1.5)
        # .bb-txt — ينتهي عند شمال الأيقونة بـgap 14
        tx = il - 14
        TT(img, (tx, y+21), t1, A8, 16.5, NAVY8, 'ra')
        TT(img, (tx, y+46), t2, A6, 12.5, (120, 133, 155), 'ra')

    # .big-btn.ghost — آخر زرار
    y = by + 2*(bh+gap)
    gh = 66
    img = rr_a(img, [bx, y, bx+bw, y+gh], 18, fill=(255, 255, 255, 31),
               outline=(255, 255, 255, 56), width=1.5)
    ir = bx + bw - 20; il = ir - 44
    img = rr_a(img, [il, y+11, ir, y+11+44], 14, fill=(255, 255, 255, 41))
    img = ICO(img, 'user', il+22, y+11+22, 22, WHITE, 1.5)
    tx = il - 14
    TT(img, (tx, y+16), 'أنا مس أسماء', A7, 15, WHITE, 'ra')
    TT(img, (tx, y+40), 'لوحة الإدارة', A6, 12.5, (212, 222, 240), 'ra')
    return save(img, '01-home.png')


# ═══════════════════════════════════════════════
#  ٢. المس — الرئيسية
# ═══════════════════════════════════════════════
def teacher():
    img = Image.new('RGBA', (W, H), PAPER+(255,))

    # .th-top — padding 22 20 26
    hh = 94
    hdr = brandfill(W, px(hh)).convert('RGBA')
    ov = Image.new('RGBA', hdr.size, (0, 0, 0, 0))
    ImageDraw.Draw(ov).ellipse([px(-60), px(-90), px(-60+200), px(-90+200)], fill=(255, 255, 255, 15))
    hdr = Image.alpha_composite(hdr, ov)
    mask = Image.new('L', hdr.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W-1, px(hh)], radius=px(20), fill=255)
    img.paste(hdr.convert('RGB'), (0, 0), mask)

    # العنوان — على اليمين (padding-top 22)
    tr = CW - 20
    TT(img, (tr, 22), 'مساحة العمل', A6, 12.5, (200, 214, 242), 'ra')
    TT(img, (tr, 40), 'مس أسماء', A8, 25, WHITE, 'ra')

    # أزرار الإعدادات والخروج — على الشمال
    bl = 20
    for i, ic in enumerate(['settings', 'logout']):
        x = bl + i*(42+8)
        img = rr_a(img, [x, 30, x+42, 30+42], 14, fill=(255, 255, 255, 36),
                   outline=(255, 255, 255, 41), width=1.5)
        img = ICO(img, ic, x+21, 30+21, 20, WHITE, 1.5)

    # .scroll — padding 16 16
    y = hh
    # .sec-head — margin 24 4 13 (أول واحد margin-top 4)
    y += 4
    TT(img, (CW-20, y), 'نظرة سريعة', A8, 17, INK, 'ra')
    y += 13 + 17

    # .stats4 — grid 2 أعمدة، gap 11
    gap = 11; sw = (CW - 32 - gap)/2; sh = 78
    stats = [('0', 'طلبات مستنية', PINK), ('273', 'طلاب مفعّلين', NAVY5),
             ('1', 'فصول', GOLD), ('2', 'مجموعات', MINT)]
    for i, (n, l, c) in enumerate(stats):
        col_i, row_i = i % 2, i // 2
        x = CW - 16 - sw - col_i*(sw+gap)     # RTL: أول واحد على اليمين
        yy = y + row_i*(sh+gap)
        img = card(img, [px(x), px(yy), px(x+sw), px(yy+sh)], px(13), WHITE, px(8), 34, px(3))
        # .stat b — 26px
        TL(img, (x+sw/2, yy+24), n, L8, 26, INK, 'mm')
        TTm(img, (x+sw/2, yy+50), l, A6, 12, INK3)
        # .stat::after — 5px على الشمال
        rr(img, [x, yy, x+5, yy+sh], 3, fill=c)
        rr(img, [x, yy, x+5, yy+5], 0, fill=c)

    y += 2*sh + gap + 6
    # .sec-head الثاني
    y += 24
    TT(img, (CW-20, y), 'الأقسام', A8, 17, INK, 'ra')
    y += 13 + 17

    # .tiles — gap 11
    tiles = [('grid', 'لوحة التنظيم', 'فصول · مجموعات · شارات', T_ICO_BLUE, NAVY5, None),
             ('bell', 'الإشعارات', 'طلبات الانضمام', T_ICO_GOLD, (201, 138, 13), '0'),
             ('chat', 'التواصل', 'إعلانات · دردشة', T_ICO_GREEN, (18, 166, 124), None),
             ('folder', 'مساحة الملفات', 'شغل المجموعات', T_ICO_NAVY, NAVY6, None)]
    th = 88
    for i, (ic, t1, t2, ibg, icol, badge) in enumerate(tiles):
        yy = y + i*(th+gap)
        img = card(img, [px(16), px(yy), px(CW-16), px(yy+th)], px(18), WHITE, px(9), 40, px(4))
        # .t-ico 52px radius 17 — على اليمين
        ir = CW - 16 - 18; il = ir - 52
        rr(img, [il, yy+18, ir, yy+18+52], 17, fill=ibg)
        img = ICO(img, ic, il+26, yy+18+26, 24, icol, 1.5)
        tx = il - 15
        TT(img, (tx, yy+23), t1, A8, 16.5, INK, 'ra')
        TT(img, (tx, yy+48), t2, A6, 12.5, INK3, 'ra')
        if badge:
            rr(img, [16+16, yy+14, 16+16+22, yy+14+22], 8, fill=PINK)
            TL(img, (16+16+11, yy+14+11), badge, L8, 11.5, WHITE, 'mm')
    return save(img, '02-teacher.png')


# ═══════════════════════════════════════════════
#  ٣. الطالب — الرئيسية
# ═══════════════════════════════════════════════
def student():
    img = Image.new('RGBA', (W, H), PAPER+(255,))
    hh = 94
    hdr = brandfill(W, px(hh)).convert('RGBA')
    ov = Image.new('RGBA', hdr.size, (0, 0, 0, 0))
    ImageDraw.Draw(ov).ellipse([px(-60), px(-90), px(-60+200), px(-90+200)], fill=(255, 255, 255, 15))
    hdr = Image.alpha_composite(hdr, ov)
    mask = Image.new('L', hdr.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W-1, px(hh)], radius=px(20), fill=255)
    img.paste(hdr.convert('RGB'), (0, 0), mask)

    tr = CW - 20
    TT(img, (tr, 22), 'أهلاً بيك', A6, 12.5, (200, 214, 242), 'ra')
    TT(img, (tr, 40), 'سارة محمد', A8, 25, WHITE, 'ra')

    bl = 20
    for i, ic in enumerate(['bell', 'logout']):
        x = bl + i*(42+8)
        img = rr_a(img, [x, 34, x+42, 34+42], 14, fill=(255, 255, 255, 36),
                   outline=(255, 255, 255, 41), width=1.5)
        img = ICO(img, ic, x+21, 34+21, 20, WHITE, 1.5)
        if ic == 'bell':
            # .icon-btn .badge — top -4 left -4
            rr(img, [x-4, 30, x-4+19, 30+19], 7, fill=PINK, outline=PAPER, width=2.5)
            TL(img, (x-4+9.5, 30+9.5), '2', L8, 10, WHITE, 'mm')

    y = hh + 16
    # .my-card — padding 22, grad-brand
    ch = 210
    cg = brandfill(px(CW-32), px(ch))
    cm = Image.new('L', (px(CW-32), px(ch)), 0)
    ImageDraw.Draw(cm).rounded_rectangle([0, 0, px(CW-32)-1, px(ch)-1], radius=px(18), fill=255)
    img.paste(cg, (px(16), px(y)), cm)

    # .my-card::after — دايرة بيضاء .07 على الشمال فوق
    cir = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(cir).ellipse([px(16-50), px(y-80), px(16-50+180), px(y-80+180)],
                                fill=(255, 255, 255, 18))
    cir = cir.filter(ImageFilter.GaussianBlur(px(1)))
    keep = Image.new('L', (W, H), 0)
    ImageDraw.Draw(keep).rounded_rectangle([px(16), px(y), px(CW-16), px(y+ch)], radius=px(18), fill=255)
    cir.putalpha(Image.composite(cir.getchannel('A'), Image.new('L', (W, H), 0), keep))
    img = Image.alpha_composite(img, cir)

    # .mc-top — padding 22، أفاتار 44 + الاسم على يمينها
    ax = CW - 16 - 22 - 44
    img = rr_a(img, [ax, y+22, ax+44, y+22+44], 15, fill=(255, 255, 255, 36))
    from PIL import ImageFont
    _d2 = ImageDraw.Draw(img)
    _d2.text((px(ax+22), px(y+22+22)), 'سم', font=ImageFont.truetype(A8, px(15)),
             fill=WHITE, anchor='mm')
    tx = ax - 12
    TT(img, (tx, y+24), 'سارة محمد', A8, 21, WHITE, 'ra')
    TT(img, (tx, y+52), 'الصف الثالث الثانوي', A6, 12, (190, 206, 235), 'ra')

    # .mc-grid — عمودين × عمودين
    gy = y + 22 + 44 + 16
    gh = (ch - (gy - y) - 22) / 2
    gw = (CW - 44) / 2
    cells = [('كودك', '102438', False), ('المجموعة', 'الياسمين', False),
             ('دورك', 'قائد', True), ('الحساب', 'مفعّل', False)]
    for i, (k, v, gold) in enumerate(cells):
        ci, ri = i % 2, i // 2
        cx0 = CW - 16 - 22 - ci*gw          # من اليمين للشمال
        cy0 = gy + ri*gh
        img = rr_a(img, [cx0-gw, cy0, cx0, cy0+gh], 0, fill=(255, 255, 255, 26))
        TTm(img, (cx0-gw/2, cy0+9), k, A6, 10.5, (143, 167, 204))
        if v.isdigit():
            from PIL import ImageFont
            _d = ImageDraw.Draw(img)
            _d.text((px(cx0-gw/2), px(cy0+36)), v, font=ImageFont.truetype(L8, px(14)),
                    fill=GOLD2 if gold else WHITE, anchor='mm')
        else:
            TTm(img, (cx0-gw/2, cy0+27), v, A8, 14, GOLD2 if gold else WHITE)
    # فواصل 1px
    img = rr_a(img, [CW-16-22-gw-0.5, gy, CW-16-22-gw+0.5, gy+2*gh], 0,
               fill=(255, 255, 255, 40))
    img = rr_a(img, [CW-16-22-2*gw, gy+gh-0.5, CW-16-22, gy+gh+0.5], 0,
               fill=(255, 255, 255, 40))

    y = y + ch + 6
    # .sec-head
    y += 24
    TT(img, (CW-20, y), 'مساحاتي', A8, 17, INK, 'ra')
    y += 13 + 17

    tiles = [('chat', 'مساحة الدردشة', 'مجموعتك · فصلك', T_ICO_BLUE, NAVY5, None),
             ('upload', 'مساحة التسليم', 'المطلوب منك', T_ICO_GOLD, (201, 138, 13), '3'),
             ('folder', 'ملفات مجموعتي', 'شغلنا كله', T_ICO_GREEN, (18, 166, 124), None),
             ('bell', 'الإشعارات', 'إعلانات المس', T_ICO_NAVY, NAVY6, '5')]
    th = 88; gap = 11
    for i, (ic, t1, t2, ibg, icol, badge) in enumerate(tiles):
        yy = y + i*(th+gap)
        img = card(img, [px(16), px(yy), px(CW-16), px(yy+th)], px(18), WHITE, px(9), 40, px(4))
        ir = CW - 16 - 18; il = ir - 52
        rr(img, [il, yy+18, ir, yy+18+52], 17, fill=ibg)
        img = ICO(img, ic, il+26, yy+18+26, 24, icol, 1.5)
        tx = il - 15
        TT(img, (tx, yy+23), t1, A8, 16.5, INK, 'ra')
        TT(img, (tx, yy+48), t2, A6, 12.5, INK3, 'ra')
        if badge:
            rr(img, [32, yy+14, 54, yy+36], 8, fill=PINK)
            TL(img, (43, yy+25), badge, L8, 11.5, WHITE, 'mm')
    return save(img, '03-student.png')


if __name__ == '__main__':
    home(); teacher(); student()


# ═══════════════════════════════════════════════
#  ٤. تسجيل الدخول — #screen-login
# ═══════════════════════════════════════════════
def login():
    img = Image.new('RGBA', (W, H), PAPER+(255,))
    # .top — padding 12 16
    img = rr_a(img, [20, 26, 64, 26+44], 15, fill=(238, 241, 248, 255))
    img = ICO(img, 'back', 42, 48, 20, NAVY7, 1.5)
    TL(img, (px(84), px(48)), '‹', L8, 1, WHITE, 'mm')  # مساحة
    TT(img, (CW-16, 34), 'تسجيل دخول', A8, 17.5, INK, 'ra')

    y = 90
    # .intro
    TT(img, (CW-16, y+6), 'أهلاً بيك تاني', A8, 20, INK, 'ra')
    y += 46

    # .field — الكود
    for label, val, ph in [('الكود المدرسي', '102438', None), ('كلمة المرور', None, '••••••')]:
        TT(img, (CW-16, y), label, A7, 13, INK2, 'ra')
        y += 24
        img = rr_a(img, [16, y, CW-16, y+52], 16, fill=(244, 246, 251, 255),
                   outline=(231, 236, 247, 255), width=2)
        if val:
            from PIL import ImageFont
            ImageDraw.Draw(img).text((px(CW-16-16), px(y+16)), val,
                                     font=ImageFont.truetype(L7, px(15)), fill=INK, anchor='ra')
        else:
            TT(img, (CW-30, y+14), ph, A6, 15, (169, 180, 200), 'ra')
        y += 52 + 18

    # .btn.primary
    y += 2
    img = rr_a(img, [16, y, CW-16, y+56], 17, fill=NAVY7)
    grad_btn = brandfill(px(CW-32), px(56))
    gm = Image.new('L', (px(CW-32), px(56)), 0)
    ImageDraw.Draw(gm).rounded_rectangle([0, 0, px(CW-32)-1, px(56)-1], radius=px(17), fill=255)
    img.paste(grad_btn, (px(16), px(y)), gm)
    TTm(img, (CW/2, y+18), 'دخول', A8, 16, WHITE)
    return save(img, '04-login.png')


# ═══════════════════════════════════════════════
#  ٥. التواصل — #screen-comm
# ═══════════════════════════════════════════════
def comm():
    img = Image.new('RGBA', (W, H), PAPER+(255,))
    img = rr_a(img, [20, 26, 64, 26+44], 15, fill=(238, 241, 248, 255))
    img = ICO(img, 'back', 42, 48, 20, NAVY7, 1.5)
    TT(img, (CW-16, 34), 'التواصل', A8, 17.5, INK, 'ra')

    # .tabs — padding 4 16 14
    y = 88
    tabs = [('إعلان', True), ('دردشة مجموعة', False), ('دردشة عضو', False)]
    x = CW - 16
    for t, on in tabs:
        w = 26 + len(t)*8.5
        if on:
            img = rr_a(img, [x-w, y, x, y+40], 999, fill=NAVY7)
            TT(img, (x-13, y+11), t, A7, 13.5, WHITE, 'ra')
        else:
            img = card(img, [px(x-w), px(y), px(x), px(y+40)], px(999), WHITE, px(6), 30, px(2))
            TT(img, (x-13, y+11), t, A7, 13.5, INK3, 'ra')
        x -= w + 9

    # .msg — الرسايل
    y = 148
    msgs = [('إعلان لكل الفصل: امتحان يوم الأحد الساعة 10 صباحًا', 'المس أسماء', 'اليوم 9:40', False),
            ('تمام يا مس، هنذاكر الباب الخامس', 'سارة محمد', 'اليوم 9:45', True),
            ('متنسوش تسلموا الواجب قبل السبت', 'المس أسماء', 'اليوم 10:05', False),
            ('حاضر يا مس، هبعت الواجب', 'منة الله', 'اليوم 10:12', True)]
    for body, who, when, mine in msgs:
        h = 96
        img = card(img, [px(16), px(y), px(CW-16), px(y+h)], px(13),
                   (238, 243, 253) if mine else WHITE, px(8), 34, px(3))
        # رأس: أفاتار + الاسم + الوقت
        ax = CW - 16 - 15 - 32
        img = rr_a(img, [ax, y+14, ax+32, y+14+32], 11,
                   fill=(226, 233, 247, 255) if mine else (240, 243, 249, 255))
        TTm(img, (ax+16, y+14+7), who[0], A8, 13, NAVY7)
        tx = ax - 9
        TT(img, (tx, y+15), who, A7, 12.5, INK, 'ra')
        from PIL import ImageFont
        _t, _num = when.rsplit(' ', 1)
        _wd = ImageDraw.Draw(img).textlength(_num, font=ImageFont.truetype(L6, px(10.5)))
        _wd = ImageDraw.Draw(img).textlength(_num, font=ImageFont.truetype(L6, px(10.5)))
        ImageDraw.Draw(img).text((px(tx), px(y+38)), _num,
                                 font=ImageFont.truetype(L6, px(10.5)), fill=INK3, anchor='ra')
        TT(img, (tx - _wd/S - 4, y+31), _t, A6, 10.5, INK3, 'ra')
        # النص
        TT(img, (CW-31, y+56), body, A6, 13, INK2, 'ra')
        y += h + 10
    return save(img, '05-comm.png')
