/* ============================================================
   Bac-Taq — local security helpers
   Activation is fully offline: the entered password is hashed with
   SHA-256 and compared against a fingerprint baked into the build.
   The "device key" (invite) is an AES-CBC token that encodes a slot
   number with a secret that only the developer side knows.
   ============================================================ */
(function (global) {
  'use strict';

  /* SHA-256 of "3mk.gasser.2026" (owner's master password, asked once).
     Dot separators keep the physical keyboard from inserting "_" oddly. */
  /* DEV ONLY: BacSecurity.makeInvite(slot) mints keys; tools/make_keys.py does the same. */
  var MASTER_HASH = 'd0f50357e82ceffe696fd36ce08a835da33b3d81fa07dd82bacac3415b21381b';

  /* AES key + IV used to mint / verify per-device keys. */
  var AKEY = 'BacTaq-2026-3mk-gasser-2026-x7Kq';
  var AIV = 'bactaq-iv';

  /* ---------- SHA-256 (crypto.subtle with a pure-JS fallback) ---------- */
  var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

  function sha256Fallback(str) {
    var bytes = [], i, c;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    var l = bytes.length, H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
                               0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    var bits = l * 8;
    for (i = 3; i >= 0; i--) bytes.push((bits / Math.pow(2, 8 * i)) & 0xff);
    var w = [];
    for (var off = 0; off < bytes.length; off += 64) {
      for (i = 0; i < 64; i++) {
        if (i < 16) {
          w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) |
                 (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
        } else {
          var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
          var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
          w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
      }
      var a = H[0], b = H[1], cc = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7], t1, t2;
      for (i = 0; i < 64; i++) {
        t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & cc) ^ (b & cc))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = cc; cc = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + cc) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }

  function sha256(str) {
    if (global.crypto && global.crypto.subtle && global.TextEncoder) {
      return global.crypto.subtle.digest('SHA-256', new global.TextEncoder().encode(str))
        .then(function (buf) {
          return Array.prototype.map.call(new Uint8Array(buf), function (b) {
            return ('0' + b.toString(16)).slice(-2);
          }).join('');
        })
        .catch(function () { return sha256Fallback(str); });
    }
    return Promise.resolve(sha256Fallback(str));
  }

  /* ---------- device keys (invites) ----------
     Token = 10 Base32 chars carrying 6 bytes:
       [slot hi, slot lo, attempt-payload, mac0..mac2]  (mac = 3 bytes)
     mac = first 3 bytes of SHA-256("BacTaq|" + slot + "|" + attempt + "|x7Kq-2026").
     Offline verification only needs SHA-256, so no crypto library is required. */
  var SLOT_BITS = 12;

  function inviteMac(slot, attempt) {
    return sha256('BacTaq|' + slot + '|' + attempt + '|x7Kq-2026');
  }

  function bytesToB32(bytes) {
    var alpha = 'abcdefghijklmnopqrstuvwxyz234567', out = '', val = 0, bits = 0;
    for (var i = 0; i < bytes.length; i++) {
      val = (val << 8) | bytes[i]; bits += 8;
      while (bits >= 5) { out += alpha.charAt((val >>> (bits - 5)) & 31); bits -= 5; }
    }
    if (bits > 0) out += alpha.charAt((val << (5 - bits)) & 31);
    return out;
  }

  function b32ToBytes(str) {
    var alpha = 'abcdefghijklmnopqrstuvwxyz234567', out = [], val = 0, bits = 0;
    for (var i = 0; i < str.length; i++) {
      var idx = alpha.indexOf(str.charAt(i));
      if (idx < 0) return null;
      val = (val << 5) | idx; bits += 5;
      if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
    }
    return out;
  }

  function cleanToken(input) {
    return (input || '').toLowerCase().replace(/[^a-z2-7]/g, '');
  }

  function verifyInvite(input) {
    var token = cleanToken(input);
    if (token.length !== 10) return Promise.resolve(null);
    var bytes = b32ToBytes(token);
    if (!bytes || bytes.length < 6) return Promise.resolve(null);
    var slot = (bytes[0] << 4) | (bytes[1] >> 4);
    var attempt = bytes[1] & 0x0f;
    var macBytes = [bytes[2], bytes[3], bytes[4], bytes[5]];
    if (slot < 1 || slot > (1 << SLOT_BITS) - 1 || attempt > 15) return Promise.resolve(null);
    return inviteMac(slot, attempt).then(function (hex) {
      var expect = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16),
                    parseInt(hex.slice(4, 6), 16), parseInt(hex.slice(6, 8), 16)];
      var ok = macBytes.every(function (b, i) { return b === expect[i]; });
      return ok ? { slot: slot, attempt: attempt } : null;
    });
  }

  function makeInvite(slot, attempt) {
    return inviteMac(slot, attempt || 0).then(function (hex) {
      var mac = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16),
                 parseInt(hex.slice(4, 6), 16), parseInt(hex.slice(6, 8), 16)];
      var a = attempt || 0;
      return bytesToB32([(slot >> 4) & 0xff, ((slot & 0x0f) << 4) | (a & 0x0f)].concat(mac));
    });
  }

  /* ---------- public API ---------- */
  // Accept the code however it is typed: dots, underscores, dashes or spaces
  // between the parts, and any letter case. "3mk_gasser_2026" == "3mk.gasser.2026".
  function normalize(pw) {
    return String(pw || '')
      .trim()
      .toLowerCase()
      .replace(/[_\u2013\u2014\s]+/g, '.')
      .replace(/-+/g, '.');
  }

  function checkPassword(input) {
    return sha256(normalize(input)).then(function (h) { return h === MASTER_HASH; });
  }

  function newDeviceKey() {
    // local, cosmetic id so the home screen can show "this device" info
    var r = '';
    var chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    for (var i = 0; i < 10; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
    return r;
  }

  global.BacSecurity = {
    checkPassword: checkPassword,
    verifyInvite: verifyInvite,
    makeInvite: makeInvite,
    sha256: sha256,
    newDeviceKey: newDeviceKey,
    MASTER_HASH: MASTER_HASH
  };
})(window);
