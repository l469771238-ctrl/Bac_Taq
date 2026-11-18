#!/usr/bin/env python3
"""Bac-Taq brand assets: mark (transparent), launcher icons, adaptive layers, PWA icons."""
import os
from PIL import Image, ImageDraw, ImageFilter

S = 512          # design space
SS = 2           # supersampling (kept low for memory)
OUT_WEB = 'app/web/img'
NAVY_A, NAVY_B = (26, 74, 158), (7, 26, 63)
GOLD_A, GOLD_B = (255, 209, 102), (243, 160, 32)
GREEN = (46, 211, 163)

def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def diagonal_gradient(w, h, c1, c2, angle=35):
    # build a rotated linear gradient large enough, then crop
    n = int(max(w, h) * 1.6)
    lin = Image.new('RGB', (1, n))
    for y in range(n):
        lin.putpixel((0, y), lerp(c1, c2, y / (n - 1)))
    big = lin.resize((n, n), Image.BILINEAR).rotate(angle, resample=Image.BICUBIC, expand=False)
    left = (n - w) // 2
    top = (n - h) // 2
    return big.crop((left, top, left + w, top + h))

def rounded_mask(w, h, r):
    m = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=255)
    return m

def draw_book_mark(size, with_badge=True, glow=True):
    """Transparent mark: open book (gold/white) + verified badge."""
    W = size * SS
    img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    k = W / 512.0

    def P(x, y):
        return (x * k, y * k)

    # ---- soft golden glow behind the book
    if glow:
        g = Image.new('RGBA', (W, W), (0, 0, 0, 0))
        gd = ImageDraw.Draw(g)
        gd.ellipse([P(60, 100), P(450, 460)], fill=(246, 183, 60, 55))
        g = g.filter(ImageFilter.GaussianBlur(28 * k))
        img.alpha_composite(g)

    # ---- open book: left gold page, right white page (symmetric, gentle perspective)
    left = [P(250, 172), P(88, 206), P(88, 384), P(250, 358)]
    right = [P(262, 172), P(424, 206), P(424, 384), P(262, 358)]
    # drop shadow under the book
    sh = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(sh).polygon([P(92, 372), P(420, 372), P(420, 412), P(92, 412)], fill=(3, 12, 30, 90))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(12 * k)))
    d = ImageDraw.Draw(img)
    d.polygon(right, fill=(255, 255, 255, 240))
    d.polygon(left, fill=(246, 176, 48, 255))
    # page thickness / top highlights
    d.polygon([P(250, 172), P(88, 206), P(94, 217), P(250, 184)], fill=(255, 226, 156, 255))
    d.polygon([P(262, 172), P(424, 206), P(418, 217), P(262, 184)], fill=(255, 255, 255, 255))
    d.polygon([P(88, 384), P(250, 358), P(250, 370), P(88, 397)], fill=(214, 138, 22, 255))
    d.polygon([P(424, 384), P(262, 358), P(262, 370), P(424, 397)], fill=(214, 222, 236, 255))
    # spine
    d.line([P(256, 176), P(256, 362)], fill=(7, 26, 63, 120), width=int(6 * k))
    # text lines
    for i, y in enumerate((236, 266, 296)):
        wlen = 116 if i < 2 else 74
        d.rounded_rectangle([P(114, y), P(114 + wlen, y + 12)], radius=6 * k, fill=(122, 74, 0, 165))
        d.rounded_rectangle([P(284, y), P(284 + wlen, y + 12)], radius=6 * k, fill=(26, 74, 158, 120))

    if with_badge:
        cx, cy, r = 366, 366, 66
        d.ellipse([P(cx - r - 7, cy - r - 7), P(cx + r + 7, cy + r + 7)], fill=(255, 255, 255, 255))
        d.ellipse([P(cx - r, cy - r), P(cx + r, cy + r)], fill=GREEN + (255,))
        pts = [P(cx - 28, cy + 2), P(cx - 7, cy + 23), P(cx + 31, cy - 22)]
        d.line(pts, fill=(255, 255, 255, 255), width=int(17 * k), joint='curve')
        for p in (pts[0], pts[-1]):
            d.ellipse([p[0] - 8.5 * k, p[1] - 8.5 * k, p[0] + 8.5 * k, p[1] + 8.5 * k], fill=(255, 255, 255, 255))

    return img.resize((size, size), Image.LANCZOS)

def composed_icon(size):
    W = size * SS
    bg = diagonal_gradient(W, W, NAVY_A, NAVY_B, angle=30).convert('RGBA')
    mark = draw_book_mark(W, with_badge=True, glow=False)
    bg.alpha_composite(mark)
    bg.putalpha(rounded_mask(W, W, int(W * 0.225)))
    return bg.resize((size, size), Image.LANCZOS)

def adaptive_foreground(size):
    """108dp canvas, content inside the central 66% safe zone."""
    W = size * SS
    canvas = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    inner = draw_book_mark(int(W * 0.72), with_badge=True, glow=False)
    off = (W - inner.width) // 2
    canvas.alpha_composite(inner, (off, off))
    return canvas.resize((size, size), Image.LANCZOS)

def round_icon(size):
    W = size * SS
    bg = diagonal_gradient(W, W, NAVY_A, NAVY_B, angle=30).convert('RGBA')
    bg.alpha_composite(draw_book_mark(W, with_badge=True, glow=False))
    bg.putalpha(rounded_mask(W, W, W // 2))
    return bg.resize((size, size), Image.LANCZOS)

def main():
    os.makedirs(OUT_WEB, exist_ok=True)
    dpi = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    fg = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
    for name, px in dpi.items():
        d = f'app/android/res/mipmap-{name}'
        os.makedirs(d, exist_ok=True)
        composed_icon(px).save(f'{d}/ic_launcher.png')
        round_icon(px).save(f'{d}/ic_launcher_round.png')
        adaptive_foreground(fg[name]).save(f'{d}/ic_launcher_foreground.png')
    # play-store style + web
    composed_icon(512).save(f'{OUT_WEB}/icon-512.png')
    composed_icon(192).save(f'{OUT_WEB}/icon-192.png')
    composed_icon(1024).save(f'{OUT_WEB}/icon-1024.png')
    draw_book_mark(512, with_badge=True, glow=True).save(f'{OUT_WEB}/logo.png')
    composed_icon(1024).save(f'{OUT_WEB}/logo@2x.png')
    # splash bitmap for the Android splash screen
    splash = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    splash.alpha_composite(draw_book_mark(560, with_badge=True, glow=True), (232, 232))
    splash.save(f'{OUT_WEB}/splash-mark.png')

if __name__ == '__main__':
    main()
