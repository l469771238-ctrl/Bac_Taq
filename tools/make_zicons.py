#!/usr/bin/env python3
"""Generate launcher icons + splash for Z-Project Workplace (navy/gold/green)."""
import os, sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'zworkplace', 'android', 'res')
SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
SS = 2  # supersample (128 MB sandbox friendly)


def logo(size, bg=True):
    s = size * SS
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    if bg:
        grad = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        gd = ImageDraw.Draw(grad)
        for y in range(s):
            t = y / max(1, s - 1)
            gd.line([(0, y), (s, y)], fill=(int(26 + (7 - 26) * t), int(74 + (26 - 74) * t), int(158 + (63 - 158) * t), 255))
        mask = Image.new('L', (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=255)
        im.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(im)
    # three "list" bars (gold) — drawn after the background so they stay visible
    bw = int(s * 0.46); bh = int(s * 0.085); x0 = int(s * 0.18)
    widths = [1.0, 0.84, 0.60]
    for i, w in enumerate(widths):
        y = int(s * (0.30 + i * 0.135))
        x1 = x0 + bw
        xa = x1 - int(bw * w)
        d.rounded_rectangle([xa, y, x1, y + bh], radius=max(2, bh // 2), fill=(255, 209, 102, 255))
    # green check badge
    cx, cy, cr = int(s * 0.71), int(s * 0.70), int(s * 0.175)
    d.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=(46, 211, 163, 255))
    lw = max(3, int(s * 0.038))
    d.line([(cx - cr * .42, cy + cr * .02), (cx - cr * .10, cy + cr * .34), (cx + cr * .46, cy - cr * .34)],
           fill=(4, 59, 43, 255), width=lw, joint='curve')
    return im.resize((size, size), Image.LANCZOS)


def main():
    for name, px in SIZES.items():
        d = os.path.join(RES, f'mipmap-{name}')
        os.makedirs(d, exist_ok=True)
        logo(px).save(os.path.join(d, 'ic_launcher.png'))
        logo(px).save(os.path.join(d, 'ic_launcher_round.png'))
        fg = Image.new('RGBA', (px * 2, px * 2), (0, 0, 0, 0))
        fg.paste(logo(int(px * 1.15), bg=False), (int(px * .43), int(px * .43)), logo(int(px * 1.15), bg=False))
        fg.save(os.path.join(d, 'ic_launcher_foreground.png'))
    os.makedirs(os.path.join(RES, 'drawable-xxhdpi'), exist_ok=True)
    logo(288).save(os.path.join(RES, 'drawable-xxhdpi', 'splash_logo.png'))
    os.makedirs(os.path.join(ROOT, 'zworkplace', 'assets'), exist_ok=True)
    logo(512).save(os.path.join(ROOT, 'zworkplace', 'assets', 'icon.png'))
    print('icons written')


if __name__ == '__main__':
    main()
