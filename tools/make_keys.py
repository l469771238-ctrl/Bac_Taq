#!/usr/bin/env python3
"""Mint Bac-Taq device keys. Mirrors app/web/js/security.js (keep in sync).

token  = Base32( [slot>>4, (slot&0xF)<<4 | attempt, mac0, mac1, mac2, mac3] )[:10]
mac    = SHA-256("BacTaq|<slot>|<attempt>|x7Kq-2026")[0:4]
"""
import hashlib, sys

ALPHA = 'abcdefghijklmnopqrstuvwxyz234567'


def mac_bytes(slot, attempt):
    h = hashlib.sha256(f'BacTaq|{slot}|{attempt}|x7Kq-2026'.encode()).digest()
    return list(h[:4])


def b32(data):
    out, val, bits = '', 0, 0
    for byte in data:
        val = (val << 8) | byte
        bits += 8
        while bits >= 5:
            out += ALPHA[(val >> (bits - 5)) & 31]
            bits -= 5
    if bits:
        out += ALPHA[(val << (5 - bits)) & 31]
    return out


def token(slot: int, attempt: int = 0) -> str:
    payload = [(slot >> 4) & 0xFF, ((slot & 0x0F) << 4) | (attempt & 0x0F)]
    return b32(payload + mac_bytes(slot, attempt))


def pretty(slot: int, attempt: int = 0) -> str:
    t = token(slot, attempt)
    return '-'.join([t[0:4], t[4:7], t[7:10]])


if __name__ == '__main__':
    if len(sys.argv) == 1:
        for i in range(1, 11):
            print(f'slot {i:>3}: {token(i)}   ({pretty(i)})')
    else:
        slot = int(sys.argv[1])
        attempt = int(sys.argv[2]) if len(sys.argv) > 2 else 0
        print(token(slot, attempt))
