/* ═══════════════════════════════════════════════════════════
   أفاتارات الطلبة — ٢٨ وش كرتوني، SVG خالص.

   ليه SVG مش صور؟
     • الشكل الواحد ~١ كيلو نص. الـ٢٨ كلهم ~٣٠ كيلو.
     • صفر طلبات شبكة — بيتحمّلوا مع الصفحة مرة واحدة.
     • حادّين على أي شاشة (مافيش بكسل).
     • مفيش رفع، مفيش ضغط، مفيش مساحة تخزين.

   لو حطينا صورة بروفايل حقيقية لكل الـ٢٧٣ طالب:
     192px WebP → ٢.٦ ميجا · 400px JPEG → ١١.٤ ميجا
     وبتضيع مع إعادة تشغيل الاستضافة المجانية.

   التركيب (٦ طبقات، كله جوه دايرة radius 14):
     ١. خلفية بلون باستيل
     ٢. رقبة + هدوم (قميص/بلوزة)
     ٣. وش (بيضاوي) + أذنين
     ٤. شعر (فوق الوش أو حجاب أو كاب)
     ٥. عينين + حواجب + خدود + مناخير
     ٦. بق (ابتسامة/ضحة/مفتوح)
   ═══════════════════════════════════════════════════════════ */
(function (w) {
  'use strict';

  var SK = { l: '#f7d6bd', m: '#eab48f', t: '#c98a5e', d: '#8d5a3b' };
  var SK_SH = { l: '#efc4a6', m: '#dc9f75', t: '#b3754b', d: '#77492e' };

  var HR = {
    black: '#2b2118', brown: '#6b4423', blonde: '#d9a85c',
    auburn: '#8b3a1e', gray: '#8b8b8b'
  };

  var CL = {
    navy: '#1d4fa8', gold: '#e8a72c', mint: '#2aa585',
    pink: '#d9547a', violet: '#7a6bd8', white: '#ffffff'
  };

  var BG = {
    gold:   { b: '#fdf1d6', r: '#e8c274' },
    navy:   { b: '#e6ecf8', r: '#9db2d8' },
    mint:   { b: '#e0f7ef', r: '#8fdcc2' },
    pink:   { b: '#ffedf2', r: '#f5b3c4' },
    violet: { b: '#eeebfd', r: '#bdb1f0' },
    sky:    { b: '#e3f2fd', r: '#9cc7e8' }
  };

  var VB = 40, CX = 20, FY = 19;

  /* ── خلفية ── */
  function bg(k) {
    return '<rect width="' + VB + '" height="' + VB + '" rx="14" fill="' + BG[k].b + '"/>' +
      '<circle cx="' + CX + '" cy="' + CX + '" r="17.5" fill="none" stroke="' + BG[k].r + '" stroke-width="1" opacity=".5"/>';
  }

  /* ── رقبة ── */
  function neck(sk) {
    return '<path d="M16.6 25.4h6.8v4.2a3.4 3.4 0 0 1-6.8 0z" fill="' + SK_SH[sk] + '"/>';
  }

  /* ── هدوم ── */
  function body(cl) {
    return '<path d="M20 28.6c-5.6 0-9.4 2.4-10.2 6.2a14 14 0 0 0 20.4 0c-.8-3.8-4.6-6.2-10.2-6.2z" fill="' + CL[cl] + '"/>';
  }

  /* ── وش ── */
  function face(sk, w) {
    var rx = w || 8.4;
    var ex = CX - rx + .3;   /* مكان الأذن الشمال */
    var ex2 = CX + rx - .3;
    return '<ellipse cx="' + CX + '" cy="' + FY + '" rx="' + rx + '" ry="9.2" fill="' + SK[sk] + '"/>' +
      '<ellipse cx="' + ex + '" cy="' + (FY + 1.4) + '" rx="1.5" ry="2" fill="' + SK_SH[sk] + '"/>' +
      '<ellipse cx="' + ex2 + '" cy="' + (FY + 1.4) + '" rx="1.5" ry="2" fill="' + SK_SH[sk] + '"/>';
  }

  /* نضارة — إطار + عدستين */
  function specs(sk) {
    var ix = 3.3, ey = FY - 0.4;
    return '<circle cx="' + (CX - ix) + '" cy="' + ey + '" r="2.5" fill="#fff" opacity=".28" stroke="#3a3a3a" stroke-width=".95"/>' +
      '<circle cx="' + (CX + ix) + '" cy="' + ey + '" r="2.5" fill="#fff" opacity=".28" stroke="#3a3a3a" stroke-width=".95"/>' +
      '<path d="M' + (CX - ix + 2.5) + ' ' + ey + 'h1.6" stroke="#3a3a3a" stroke-width=".95"/>';
  }

  /* نمش على الخدود */
  function freckles() {
    var pts = [[15.2, 22.2], [16.4, 21.6], [17.3, 22.6], [24.8, 22.2], [23.6, 21.6], [22.7, 22.6]];
    var s = '';
    for (var i = 0; i < pts.length; i++) s += '<circle cx="' + pts[i][0] + '" cy="' + pts[i][1] + '" r=".42" fill="#b3754b" opacity=".55"/>';
    return s;
  }

  /* حلق — للبنات بس */
  function earring(sk, col) {
    return '<circle cx="' + (CX - 8.3) + '" cy="' + (FY + 3.4) + '" r="1.05" fill="' + col + '"/>' +
      '<circle cx="' + (CX + 8.3) + '" cy="' + (FY + 3.4) + '" r="1.05" fill="' + col + '"/>';
  }

  /* ── شعر ── */
  function hairShort(c) {
    return '<path d="M11.4 20.5c-.3-6.4 3.2-10.6 8.6-10.6s8.9 4.2 8.6 10.6c-.1 1.9-.6 1.9-.9.4-.5-2.6-1.2-3.9-2.2-4.4-2.2 1.5-8.4 1.9-11.2.3-1.2.9-1.8 2.3-2.2 4.6-.2 1.5-.6 1.5-.7-.9z" fill="' + c + '"/>';
  }
  function hairSide(c) {
    return '<path d="M11.5 19.4c-.4-5.8 3-9.7 8.5-9.7s8.9 3.9 8.5 9.7c-.08 1.3-.4 1.3-.6.1-.45-2.2-.9-3.7-1.9-4.4-1.5 1.7-3.6 2.7-6 2.7s-4.5-1-6-2.7c-1 .7-1.45 2.2-1.9 4.4-.2 1.2-.5 1.2-.6-.1z" fill="' + c + '"/>';
  }
  function hairLong(c) {
    return '<path d="M10.8 21.4c-.8-7.6 3.4-12.8 9.2-12.8s10 5.2 9.2 12.8c-.2 2-.4 5.2-.9 6.6-.4 1.2-1.4 1.6-2.2.6-1-1.4-1.4-4.2-1.4-7.2-1.6 1.2-3.4 1.8-5.6 1.8s-4-.6-5.6-1.8c0 3-.4 5.8-1.4 7.2-.8 1-1.8.6-2.2-.6-.5-1.4-.7-4.6-.9-6.6z" fill="' + c + '"/>';
  }
  /* ضفيرة: حبل من كيرات متداخلة بينزل على الكتف + ربط في الآخر */
  function hairBraid(c) {
    var s = hairLong(c);
    var seg = [[11.9, 26.4, 2.1], [11.2, 29, 2.0], [11.6, 31.6, 1.85], [11.0, 34, 1.65], [11.3, 36.1, 1.4]];
    for (var i = 0; i < seg.length; i++) {
      s += '<ellipse cx="' + seg[i][0] + '" cy="' + seg[i][1] + '" rx="' + seg[i][2] + '" ry="' + (seg[i][2] * 1.25) + '" fill="' + c + '"/>';
      /* خط فاصل بين الكيرات */
      if (i < seg.length - 1) {
        s += '<path d="M' + (seg[i][0] - seg[i][2] * .8) + ' ' + (seg[i][1] + seg[i][2] * .7) + 'q' + (seg[i][2] * .8) + ' .5 ' + (seg[i][2] * 1.6) + ' 0" fill="none" stroke="rgba(0,0,0,.16)" stroke-width=".7" stroke-linecap="round"/>';
      }
    }
    return s;
  }
  function hairCurly(c) {
    var p = [[11.4, 17.6, 2.5], [12.4, 13.4, 2.7], [15.4, 10.6, 2.8], [19.2, 9.4, 2.9],
      [23, 10.4, 2.8], [26.1, 13, 2.7], [27.4, 16.9, 2.5], [27.9, 20.4, 2.2]];
    var s = '';
    for (var i = 0; i < p.length; i++) s += '<circle cx="' + p[i][0] + '" cy="' + p[i][1] + '" r="' + p[i][2] + '" fill="' + c + '"/>';
    return s;
  }
  function hairCurlyLong(c) {
    var p = [[10.6, 18.4, 2.4], [11.2, 14.2, 2.5], [13.4, 11, 2.6], [16.8, 9.4, 2.7],
      [20.4, 9.2, 2.7], [24, 10.2, 2.6], [26.6, 12.8, 2.5], [28, 16.2, 2.4], [28.6, 20, 2.2],
      [10.4, 22.6, 2.2], [10.8, 26.4, 2.1], [11.6, 29.6, 1.9],
      [29, 22.4, 2.2], [28.6, 26.2, 2.1], [27.8, 29.4, 1.9]];
    var s = '';
    for (var i = 0; i < p.length; i++) s += '<circle cx="' + p[i][0] + '" cy="' + p[i][1] + '" r="' + p[i][2] + '" fill="' + c + '"/>';
    return s;
  }
  /* الحجاب: إطار حوالين الوش + رقبة مغطّاة.
     الوش بيتـرسم بعد الحجاب (شوف person) فملامحه بتفضل باينة. */
  function hijab(c, trim) {
    /* الجزء اللي حوالين الوش — فتحة بيضاوية في النص */
    return '<path d="M20 7.6c-5.6 0-9.2 3.8-9.2 9 0 4.6 1.6 8.2 3.4 10.2 1 1.1 1.4 2.1 1.3 3.2h9c-.1-1.1.3-2.1 1.3-3.2 1.8-2 3.4-5.6 3.4-10.2 0-5.2-3.6-9-9.2-9z" fill="' + c + '"/>' +
      /* حاشية فاتحة جوه الحجاب */
      /* حاشية «الوش» جوه الحجاب — بيضاء فاتحة زي قماش الحجاب نفسه */
      '<path d="M20 10.2c-4.3 0-6.9 3-6.9 7 0 3.6 1.2 6.4 2.6 8.1.7.8 1 1.5.9 2.2h6.8c-.1-.7.2-1.4.9-2.2 1.4-1.7 2.6-4.5 2.6-8.1 0-4-2.6-7-6.9-7z" fill="#fff" opacity=".22"/>' +
      /* الجزء اللي على الكتفين */
      '<path d="M12.6 24.4c-1.9 2.1-2.8 4.4-2.8 6.6 0 2.6 2 4.6 10.2 4.6s10.2-2 10.2-4.6c0-2.2-.9-4.5-2.8-6.6-1.3 3.1-3.8 5-7.4 5s-6.1-1.9-7.4-5z" fill="' + c + '"/>';
  }
  /* شعر عالي — كتلة فوق مقدمة الراس + خصلة طالعة */
  function hairQuiff(c) {
    return '<path d="M11.5 19.2c-.5-6 3-10.4 8.5-10.4 5.6 0 9.1 4.4 8.6 10.4-.06 1.2-.4 1.2-.6.1-.4-2-.9-3.4-1.8-4.1-1.6 1.6-3.7 2.5-6.2 2.5-2.4 0-4.5-.9-6.1-2.5-.9.7-1.4 2.1-1.8 4.1-.2 1.1-.5 1.1-.6-.1z" fill="' + c + '"/>' +
      /* الخصلة الطالعة */
      '<path d="M14.6 12.2c.6-2.4 2.4-3.9 5-4.2 2.3-.3 4.4.5 5.6 2.2-2.1-.6-4.3-.4-6.1.5-1.8.9-3.2 2.1-4.5 1.5z" fill="' + c + '"/>';
  }

  /* شعر مرتب لورا */
  function hairPomp(c) {
    return '<path d="M11.5 19.4c-.4-5.8 3-9.9 8.5-9.9s8.9 4.1 8.5 9.9c-.06 1.2-.4 1.2-.6.1-.4-2.1-.9-3.5-1.9-4.2-1.5 1.7-3.6 2.6-6 2.6s-4.5-.9-6-2.6c-1 .7-1.5 2.1-1.9 4.2-.2 1.1-.5 1.1-.6-.1z" fill="' + c + '"/>' +
      /* موجة لورا */
      '<path d="M13 12.4q2.6-3.6 7-3.4 4.3.2 6.2 3.6-3.2-1.8-6.4-1.6-3.2.2-6.8 1.4z" fill="' + c + '"/>';
  }

  /* ── عينين ── */
  function eyes(sk, mood, spread, big) {
    var ix = spread || 3.3, ey = FY - 0.4;
    var er = big ? 1.85 : 1.55, erh = big ? 2.15 : 1.85;
    var s = '<path d="M' + (CX - ix - 1.7) + ' ' + (ey - 3.2) + 'q1.7-1.1 3.4 0" fill="none" stroke="' + SK_SH[sk] + '" stroke-width="1.15" stroke-linecap="round"/>' +
      '<path d="M' + (CX + ix - 1.7) + ' ' + (ey - 3.2) + 'q1.7-1.1 3.4 0" fill="none" stroke="' + SK_SH[sk] + '" stroke-width="1.15" stroke-linecap="round"/>';
    if (mood === 'happy') {
      return s +
        '<path d="M' + (CX - ix - 1.5) + ' ' + (ey + .4) + 'q1.5-2.2 3-.4" fill="none" stroke="#2b2118" stroke-width="1.5" stroke-linecap="round"/>' +
        '<path d="M' + (CX + ix - 1.5) + ' ' + (ey + .4) + 'q1.5-2.2 3-.4" fill="none" stroke="#2b2118" stroke-width="1.5" stroke-linecap="round"/>';
    }
    return s +
      '<ellipse cx="' + (CX - ix) + '" cy="' + ey + '" rx="' + er + '" ry="' + erh + '" fill="#2b2118"/>' +
      '<ellipse cx="' + (CX + ix) + '" cy="' + ey + '" rx="' + er + '" ry="' + erh + '" fill="#2b2118"/>' +
      '<circle cx="' + (CX - ix + .5) + '" cy="' + (ey - .6) + '" r=".5" fill="#fff"/>' +
      '<circle cx="' + (CX + ix + .5) + '" cy="' + (ey - .6) + '" r=".5" fill="#fff"/>';
  }

  function nose(sk) {
    return '<path d="M' + (CX - .8) + ' ' + (FY + 2.2) + 'q.8 1.1 1.6 0" fill="none" stroke="' + SK_SH[sk] + '" stroke-width="1.05" stroke-linecap="round"/>';
  }

  function blush() {
    return '<ellipse cx="' + (CX - 5.4) + '" cy="' + (FY + 2.6) + '" rx="1.7" ry="1.1" fill="#f08fa8" opacity=".42"/>' +
      '<ellipse cx="' + (CX + 5.4) + '" cy="' + (FY + 2.6) + '" rx="1.7" ry="1.1" fill="#f08fa8" opacity=".42"/>';
  }

  function mouth(mood) {
    if (mood === 'smile')
      return '<path d="M' + (CX - 2.4) + ' ' + (FY + 5) + 'q2.4 2.1 4.8 0" fill="none" stroke="#a8443f" stroke-width="1.35" stroke-linecap="round"/>';
    if (mood === 'open')
      return '<path d="M' + (CX - 2.6) + ' ' + (FY + 4.6) + 'q2.6 3.1 5.2 0z" fill="#a8443f"/>' +
        '<path d="M' + (CX - 1.6) + ' ' + (FY + 5.2) + 'q1.6 1.2 3.2 0z" fill="#f08fa8"/>';
    return '<path d="M' + (CX - 1.8) + ' ' + (FY + 5.2) + 'q1.8 1.3 3.6 0" fill="none" stroke="#a8443f" stroke-width="1.25" stroke-linecap="round"/>';
  }

  /* ── تركيب ── */
  function person(o) {
    var s = bg(o.bg);
    if (o.back) s += o.back();
    s += neck(o.sk);
    s += body(o.cl);
    if (o.frame) s += o.frame();
    s += face(o.sk, o.fw);
    if (o.hair) s += o.hair();
    s += blush();
    if (o.freckles) s += freckles();
    s += eyes(o.sk, o.mood, o.spread, o.bigEyes);
    if (o.specs) s += specs(o.sk);
    s += nose(o.sk);
    s += mouth(o.mood);
    if (o.earring) s += earring(o.sk, o.earring);
    return s;
  }

  function hs(c) { return function () { return hairShort(c); }; }
  function hsi(c) { return function () { return hairSide(c); }; }
  function hl(c) { return function () { return hairLong(c); }; }
  function hbr(c) { return function () { return hairBraid(c); }; }
  function hc(c) { return function () { return hairCurly(c); }; }
  function hcl(c) { return function () { return hairCurlyLong(c); }; }
  function hj(c, t) { return function () { return hijab(c, t); }; }
  function hq(c) { return function () { return hairQuiff(c); }; }
  function hp(c) { return function () { return hairPomp(c); }; }

  /* ── الـ١٤ ولاد ── */
  var BOYS = {
    b1:  function () { return person({ bg: 'navy',   sk: 'm', cl: 'navy',   mood: 'smile', hair: hs(HR.black) }); },
    b2:  function () { return person({ bg: 'gold',   sk: 'l', cl: 'gold',   mood: 'open',  hair: hsi(HR.brown), fw: 8.9 }); },
    b3:  function () { return person({ bg: 'mint',   sk: 'd', cl: 'mint',   mood: 'open',  hair: hc(HR.black), bigEyes: 1 }); },
    b4:  function () { return person({ bg: 'sky',    sk: 't', cl: 'violet', mood: 'smile', hair: hs(HR.auburn), freckles: 1 }); },
    b5:  function () { return person({ bg: 'violet', sk: 'l', cl: 'violet', mood: 'happy', hair: hc(HR.brown), spread: 3.7 }); },
    b6:  function () { return person({ bg: 'pink',   sk: 'm', cl: 'navy',   mood: 'smile', hair: hq(HR.black), fw: 8.0 }); },
    b7:  function () { return person({ bg: 'gold',   sk: 't', cl: 'white',  mood: 'open',  hair: hs(HR.black), specs: 1 }); },
    b8:  function () { return person({ bg: 'mint',   sk: 'l', cl: 'mint',   mood: 'smile', hair: hsi(HR.blonde), fw: 9.0, freckles: 1 }); },
    b9:  function () { return person({ bg: 'navy',   sk: 'd', cl: 'gold',   mood: 'happy', hair: hs(HR.black), bigEyes: 1 }); },
    b10: function () { return person({ bg: 'sky',    sk: 'm', cl: 'white',  mood: 'open',  hair: hc(HR.auburn), spread: 3.8 }); },
    b11: function () { return person({ bg: 'violet', sk: 't', cl: 'navy',   mood: 'smile', hair: hsi(HR.black), fw: 8.5, specs: 1 }); },
    b12: function () { return person({ bg: 'pink',   sk: 'l', cl: 'mint',   mood: 'happy', hair: hs(HR.gray), freckles: 1 }); },
    b13: function () { return person({ bg: 'gold',   sk: 'd', cl: 'violet', mood: 'open',  hair: hc(HR.black), fw: 8.8 }); },
    b14: function () { return person({ bg: 'mint',   sk: 'm', cl: 'gold',   mood: 'smile', hair: hp(HR.brown), bigEyes: 1 }); }
  };

  /* ── الـ١٤ بنات ── */
  var GIRLS = {
    g1:  function () { return person({ bg: 'pink',   sk: 'm', cl: 'pink',   mood: 'smile', back: hl(HR.black),  hair: hs(HR.black), earring: '#e8a72c' }); },
    g2:  function () { return person({ bg: 'violet', sk: 'l', cl: 'violet', mood: 'open',  frame: hj('#7a6bd8', '#bdb1f0'), fw: 8.9 }); },
    g3:  function () { return person({ bg: 'mint',   sk: 't', cl: 'pink',   mood: 'smile', back: hbr(HR.brown), hair: hsi(HR.brown), freckles: 1, earring: '#e8a72c' }); },
    g4:  function () { return person({ bg: 'gold',   sk: 'l', cl: 'gold',   mood: 'happy', back: hcl(HR.black), hair: hc(HR.black), bigEyes: 1 }); },
    g5:  function () { return person({ bg: 'sky',    sk: 'd', cl: 'mint',   mood: 'smile', frame: hj('#1d4fa8', '#9db2d8'), bigEyes: 1 }); },
    g6:  function () { return person({ bg: 'pink',   sk: 'm', cl: 'white',  mood: 'open',  back: hl(HR.auburn), hair: hsi(HR.auburn), freckles: 1, spread: 3.7 }); },
    g7:  function () { return person({ bg: 'navy',   sk: 't', cl: 'pink',   mood: 'happy', frame: hj('#b8446b', '#e8a0b4'), fw: 8.7 }); },
    g8:  function () { return person({ bg: 'violet', sk: 'l', cl: 'violet', mood: 'smile', back: hbr(HR.blonde),hair: hsi(HR.blonde), earring: '#d9547a', spread: 3.6 }); },
    g9:  function () { return person({ bg: 'mint',   sk: 'm', cl: 'mint',   mood: 'open',  back: hcl(HR.brown), hair: hc(HR.brown), bigEyes: 1, earring: '#e8a72c' }); },
    g10: function () { return person({ bg: 'gold',   sk: 'd', cl: 'pink',   mood: 'happy', frame: hj('#2aa585', '#8fdcc2'), bigEyes: 1 }); },
    g11: function () { return person({ bg: 'sky',    sk: 'l', cl: 'navy',   mood: 'smile', back: hl(HR.black),  hair: hs(HR.black), fw: 8.9, earring: '#1d4fa8' }); },
    g12: function () { return person({ bg: 'pink',   sk: 'm', cl: 'gold',   mood: 'open',  back: hbr(HR.black), hair: hc(HR.black), spread: 3.8, earring: '#d9547a' }); },
    g13: function () { return person({ bg: 'navy',   sk: 't', cl: 'white',  mood: 'smile', frame: hj('#3b2a8c', '#bdb1f0'), fw: 8.5, bigEyes: 1 }); },
    g14: function () { return person({ bg: 'mint',   sk: 'l', cl: 'violet', mood: 'happy', back: hl(HR.auburn), hair: hsi(HR.auburn), freckles: 1, earring: '#e8a72c' }); }
  };

  var NAMES = {
    b1: 'شعر أسود', b2: 'شعر بني', b3: 'كيرلي', b4: 'نحاسي', b5: 'كيرلي بني',
    b6: 'شعر عالي', b7: 'شعر أسود', b8: 'أشقر', b9: 'بشرة غامقة', b10: 'كيرلي نحاسي',
    b11: 'فرق نص', b12: 'شعر رمادي', b13: 'كيرلي غامق', b14: 'شعر مرتب',
    g1: 'شعر طويل', g2: 'حجاب بنفسجي', g3: 'ضفيرة بني', g4: 'كيرلي طويل',
    g5: 'حجاب نيڤي', g6: 'طويل نحاسي', g7: 'حجاب وردي', g8: 'ضفيرة أشقر',
    g9: 'كيرلي بني', g10: 'حجاب منت', g11: 'طويل أسود', g12: 'ضفيرة سودة',
    g13: 'حجاب نيڤي غامق', g14: 'طويل نحاسي'
  };

  var BOY_KEYS = Object.keys(BOYS);
  var GIRL_KEYS = Object.keys(GIRLS);
  var ALL = BOY_KEYS.concat(GIRL_KEYS);

  function build(k) {
    var fn = BOYS[k] || GIRLS[k];
    if (!fn) return '';
    return '<svg class="ic av" viewBox="0 0 ' + VB + ' ' + VB + '" aria-hidden="true">' +
      '<defs><clipPath id="avc' + k + '"><rect width="' + VB + '" height="' + VB + '" rx="14"/></clipPath></defs>' +
      '<g clip-path="url(#avc' + k + ')">' + fn() + '</g></svg>';
  }

  w.ZAvatar = {
    list: ALL,
    boys: BOY_KEYS,
    girls: GIRL_KEYS,
    svg: build,
    forGender: function (g) { return g === 'girl' ? GIRL_KEYS.slice() : BOY_KEYS.slice(); },
    label: function (k) { return NAMES[k] || k; },
    has: function (k) { return Object.prototype.hasOwnProperty.call(BOYS, k) || Object.prototype.hasOwnProperty.call(GIRLS, k); },
    kind: function (k) { return BOY_KEYS.indexOf(k) >= 0 ? 'boy' : 'girl'; }
  };
})(window);
