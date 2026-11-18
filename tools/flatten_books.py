#!/usr/bin/env python3
"""Render pages of a broken-text PDF to faithful images and wrap them in a new PDF.

Why: three of the bundled books ship a text layer whose font subsets decode to
garbage (programming: AbdoLine custom encoding; history: Dubai subset with a
broken ToUnicode). Some viewers place those spans on top of each other, so the
page reads like overlapping text. Flattening each page to a rendered image makes
every viewer show exactly what the publisher intended.

Usage:
    python3 tools/flatten_books.py in.pdf out.pdf --dpi 96 --quality 60
    python3 tools/flatten_books.py in.pdf out.pdf --pages 1-72
"""
import argparse, io, os, sys

import pymupdf
from PIL import Image


def flatten(src, dst, dpi=96, quality=60, gray=False, pages=None, keep_bookmarks=True):
    doc = pymupdf.open(src)
    out = pymupdf.open()
    todo = pages or range(doc.page_count)
    for i in todo:
        page = doc[i]
        pix = page.get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY if gray else pymupdf.csRGB, alpha=False)
        img = Image.frombytes('L' if gray else 'RGB', (pix.width, pix.height), pix.samples)
        buf = io.BytesIO()
        img.save(buf, 'JPEG', quality=quality, optimize=True, progressive=True)
        jpg = buf.getvalue()

        # page geometry in points, so the reader keeps the original aspect ratio
        w_pt, h_pt = page.rect.width, page.rect.height
        new = out.new_page(width=w_pt, height=h_pt)
        new.insert_image(new.rect, stream=jpg, keep_proportion=True)
        out.set_page_labels([]) if False else None
        print(f'  page {i + 1:>4}/{doc.page_count}: {pix.width}x{pix.height}px  {len(jpg) // 1024:>4} KB', flush=True)

    out.set_metadata({
        'title': os.path.basename(dst).rsplit('.', 1)[0],
        'producer': 'Bac-Taq flatten_books',
        'creator': 'Bac-Taq',
    })
    tmp = dst + '.tmp'
    out.save(tmp, garbage=4, deflate=True, clean=True)
    out.close()
    doc.close()
    os.replace(tmp, dst)
    print(f'wrote {dst} ({os.path.getsize(dst) / 1048576:.1f} MB)')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--dpi', type=int, default=96)
    ap.add_argument('--quality', type=int, default=60)
    ap.add_argument('--gray', action='store_true')
    a = ap.parse_args()
    flatten(a.src, a.dst, a.dpi, a.quality, a.gray)
