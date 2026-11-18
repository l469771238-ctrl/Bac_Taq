#!/usr/bin/env python3
"""Recompress the scanned Arabic book to a phone-friendly size.

Every page is a single CamScanner JPEG (~1272x1800). We downscale to AR_WIDTH,
gently clean the paper background, save as grayscale JPEG and rebuild a clean
PDF. Text stays crisp because Arabic in the scan is vector-like print, not faint
handwriting."""
import io, os, sys, time
import pikepdf
from PIL import Image, ImageEnhance

SRC = sys.argv[1] if len(sys.argv) > 1 else 'app/web/books/arabic.pdf'
WIDTH = int(os.environ.get('AR_WIDTH', '1000'))
QUALITY = int(os.environ.get('AR_QUALITY', '66'))
OUT = sys.argv[2] if len(sys.argv) > 2 else SRC.replace('.pdf', '_opt.pdf')

def tune(im):
    g = im.convert('L')
    lut = [min(255, max(0, int(255 * ((i / 255) ** 0.80)))) for i in range(256)]
    g = g.point(lut)
    return ImageEnhance.Contrast(g).enhance(1.06)

t0 = time.time()
pdf = pikepdf.open(SRC, allow_overwriting_input=True)
replaced = 0
for idx, page in enumerate(pdf.pages):
    res = page.get('/Resources')
    if res is None:
        continue
    xo = res.get('/XObject')
    if xo is None:
        continue
    big = None
    for name, obj in xo.items():
        try:
            if obj.get('/Subtype') == '/Image' and int(obj.get('/Width', 0)) > 500:
                big = (name, obj)
                break
        except Exception:
            continue
    if not big:
        continue
    name, obj = big
    try:
        data = obj.read_raw_bytes()
        img = Image.open(io.BytesIO(data))
        img = tune(img)
        if img.width > WIDTH:
            img = img.resize((WIDTH, round(img.height * WIDTH / img.width)), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
        newobj = pikepdf.Stream(pdf, buf.getvalue())
        newobj['/Type'] = pikepdf.Name('/XObject')
        newobj['/Subtype'] = pikepdf.Name('/Image')
        newobj['/Width'] = img.width
        newobj['/Height'] = img.height
        newobj['/ColorSpace'] = pikepdf.Name('/DeviceGray')
        newobj['/BitsPerComponent'] = 8
        newobj['/Filter'] = pikepdf.Name('/DCTDecode')
        xo[name] = newobj
        replaced += 1
    except Exception as e:
        print('page', idx + 1, 'skipped:', e, flush=True)

pdf.docinfo['/Title'] = 'اللغة العربية — الأداءات والتقييمات'
pdf.docinfo['/Creator'] = 'Bac-Taq'
pdf.save(OUT, linearize=True, object_stream_mode=pikepdf.ObjectStreamMode.generate)
pdf.close()
print(f'replaced {replaced} images in {time.time()-t0:.1f}s')
print('wrote', OUT, round(os.path.getsize(OUT) / 1e6, 2), 'MB (was', round(os.path.getsize(SRC) / 1e6, 2), 'MB)')
