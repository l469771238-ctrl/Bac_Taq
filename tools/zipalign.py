#!/usr/bin/env python3
"""Minimal, correct zipalign replacement (pure python, no libc++ needed).

Re-emits the APK so every *uncompressed* entry whose data starts on a 4-byte
boundary stays aligned; padding is added through the ZIP extra field exactly
like the official tool. Deflated entries are copied untouched.
"""
import struct, sys, zlib, zipfile

ALIGN = 4
EXTRA_ID = 0xD935


def dos_time(dt):
    y, mo, d, h, mi, s = dt
    return (((h << 11) | (mi << 5) | (s // 2)) & 0xFFFF,
            (((max(y, 1980) - 1980) << 9) | (mo << 5) | d) & 0xFFFF)


def load(path):
    entries = []
    with zipfile.ZipFile(path) as z:
        for info in z.infolist():
            entries.append((info, z.read(info.filename)))
    return entries


def build(entries, dst):
    central = []
    offset = 0
    with open(dst, 'wb') as f:
        for info, data in entries:
            name = info.filename.encode('utf-8')
            extra = info.extra or b''
            method = info.compress_type
            if method == zipfile.ZIP_DEFLATED:
                # recompress with a raw deflate stream (no zlib header)
                co = zlib.compressobj(9, zlib.DEFLATED, -15)
                payload = co.compress(data) + co.flush()
                method = zipfile.ZIP_DEFLATED
            else:
                method, payload = zipfile.ZIP_STORED, data
            crc = zlib.crc32(data) & 0xFFFFFFFF
            if method == zipfile.ZIP_STORED:
                pad = (ALIGN - ((offset + 30 + len(name) + len(extra)) % ALIGN)) % ALIGN
                if pad:
                    if pad < 4:
                        pad += ALIGN
                    extra = extra + struct.pack('<HH', EXTRA_ID, pad - 4) + b'\x00' * (pad - 4)
                assert (offset + 30 + len(name) + len(extra)) % ALIGN == 0
            t, d = dos_time(info.date_time)
            # version needed: 20 for deflate/stored
            f.write(struct.pack('<IHHHHHIIIHH', 0x04034b50, 20, 0, method, t, d,
                                crc, len(payload), len(data), len(name), len(extra)))
            f.write(name)
            f.write(extra)
            f.write(payload)
            central.append((name, method, t, d, crc, len(payload), len(data), len(extra),
                            info.external_attr, offset))
            offset += 30 + len(name) + len(extra) + len(payload)
        cd_start = offset
        for (name, method, t, d, crc, csize, usize, extra_len, external, off) in central:
            cd_extra = struct.pack('<HH', EXTRA_ID, max(0, extra_len - 4)) + b'\x00' * max(0, extra_len - 4) if extra_len else b''
            f.write(struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 20, 20, 0, method,
                                t, d, crc, csize, usize, len(name), len(cd_extra), 0, 0, 0,
                                external, off))
            f.write(name)
            f.write(cd_extra)
            offset += 46 + len(name) + len(cd_extra)
        cd_size = offset - cd_start
        f.write(struct.pack('<IHHHHIIH', 0x06054b50, 0, 0, len(central), len(central),
                            cd_size, cd_start, 0))


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    build(load(src), dst)
    print('aligned ->', dst)
