#!/usr/bin/env python3
"""Fetch Bac-Taq books from the shared Google Drive folder, optimise them and
write them into app/web/books together with metadata and cover images."""
import json, os, re, subprocess, sys

FOLDER = "1V7hPlrPv2AlmKeHMhkDYqjyQWbAytT5x"
# drive display name -> (file key, arabic title, subtitle)
TARGETS = {
    "عربي":    ("arabic",      "اللغة العربية", "الأداءات والتقييمات — الصف الثالث الثانوي"),
    "انجلش":   ("english",     "English",       "إجابات تقييمات الوزارة — الصف الثالث الثانوي"),
    "تاريخ":   ("history",     "التاريخ",       "الامتحان — الدراسات الاجتماعية"),
    "برمجة":   ("programming", "البرمجة",       "الأداءات والتقييمات — الصف الثالث الثانوي"),
}
OUT = "app/web"

def sh(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)

def listing():
    html = subprocess.run(["curl", "-sSL", "-A", "Mozilla/5.0",
        f"https://drive.google.com/embeddedfolderview?id={FOLDER}#list"],
        check=True, capture_output=True, text=True).stdout
    pairs = re.findall(r'/file/d/([-\w]{28,})/.*?flip-entry-title">([^<]*)<', html, re.S)
    if not pairs:
        ids = re.findall(r'/file/d/([-\w]{28,})/', html)
        names = re.findall(r'flip-entry-title">([^<]*)<', html)
        pairs = list(zip(ids, names))
    return [(i, n.strip()) for i, n in pairs]

def pages(path):
    info = subprocess.run(["pdfinfo", path], capture_output=True, text=True).stdout
    for line in info.splitlines():
        if line.startswith("Pages:"):
            return int(line.split()[1])
    return 0

def gs(src, dst, settings, dpi=None, quality=None):
    cmd = ["gs", "-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=pdfwrite",
           "-dCompatibilityLevel=1.5", "-dAutoRotatePages=/None",
           f"-dPDFSETTINGS=/{settings}", f"-sOutputFile={dst}", src]
    if dpi:
        cmd[8:8] = [
            "-dDownsampleColorImages=true", "-dColorImageDownsampleType=/Bicubic",
            f"-dColorImageResolution={dpi}",
            "-dDownsampleGrayImages=true", "-dGrayImageDownsampleType=/Bicubic",
            f"-dGrayImageResolution={dpi}",
            "-dDownsampleMonoImages=true", "-dMonoImageDownsampleType=/Subsample",
            f"-dMonoImageResolution={dpi*2}",
        ]
        if quality:
            cmd.insert(8, f"-dJPEGQ={quality}")
    sh(cmd)
    return os.path.getsize(dst)

def main():
    os.makedirs(f"{OUT}/books", exist_ok=True)
    os.makedirs(f"{OUT}/covers", exist_ok=True)
    files = listing()
    print("drive listing:", files, flush=True)
    meta = {}
    for idx, (fid, name) in enumerate(files):
        key = None
        for needle, info in TARGETS.items():
            if needle in name:
                key = info
                break
        if key is None:
            print("skip unknown entry", name, flush=True)
            continue
        file_key, title, subtitle = key
        src = f"/tmp/src_{file_key}.pdf"
        subprocess.run(["curl", "-sSL", "-A", "Mozilla/5.0", "-o", src,
            f"https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t"],
            check=True)
        orig = os.path.getsize(src)
        n = pages(src)
        a = f"/tmp/{file_key}_ebook.pdf"
        b = f"/tmp/{file_key}_small.pdf"
        size_a = gs(src, a, "ebook")
        size_b = gs(src, b, "screen", dpi=110, quality=72)
        if size_a <= 8 * 1024 * 1024:
            chosen, chosen_size = a, size_a
        elif size_b <= 12 * 1024 * 1024:
            chosen, chosen_size = b, size_b
        else:
            chosen, chosen_size = (a, size_a) if size_a < size_b else (b, size_b)
        dest = f"{OUT}/books/{file_key}.pdf"
        sh(["cp", chosen, dest])
        # cover images
        subprocess.run(["pdftoppm", "-jpeg", "-f", "1", "-l", "1", "-scale-to", "900",
                        "-jpegopt", "quality=86", "-singlefile", dest,
                        f"{OUT}/covers/{file_key}"], check=True)
        subprocess.run(["pdftoppm", "-jpeg", "-f", "1", "-l", "1", "-scale-to", "360",
                        "-jpegopt", "quality=82", "-singlefile", dest,
                        f"{OUT}/covers/{file_key}_thumb"], check=True)
        subprocess.run(["pdftoppm", "-jpeg", "-f", "3", "-l", "3", "-scale-to", "1000",
                        "-jpegopt", "quality=88", "-singlefile", dest,
                        f"/tmp/variant_{file_key}_p3"], check=False)
        meta[file_key] = dict(title=title, subtitle=subtitle, drive_name=name,
                              drive_id=fid, pages=n, bytes=chosen_size,
                              original_bytes=orig, variant="ebook" if chosen == a else "screen")
        print(f"{name}: pages={n} original={orig/1e6:.1f}MB "
              f"ebook={size_a/1e6:.1f}MB screen={size_b/1e6:.1f}MB -> {chosen_size/1e6:.1f}MB",
              flush=True)
    json.dump(meta, open(f"{OUT}/books/meta.json", "w"), ensure_ascii=False, indent=1)
    print(json.dumps(meta, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
