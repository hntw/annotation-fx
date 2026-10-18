/*! Annotation FX 1.0.0 · hand-drawn annotations in the styles of science, art and history · MIT · (c) 2026 Jamie Grove */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AnnotationFX = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '1.2.0';
  var PI = Math.PI, TAU = PI * 2;
  var hasDOM = typeof window !== 'undefined' && typeof document !== 'undefined';

  // ---------------------------------------------------------------- math
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function seg(t, a, b) { return b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a), 0, 1); }
  function outCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function inOutSine(t) { return -(Math.cos(PI * t) - 1) / 2; }
  function outBack(t) { var k = 1.70158, u = t - 1; return 1 + (k + 1) * u * u * u + k * u * u; }
  function spring(t, w, d) { return t <= 0 ? 0 : 1 - Math.exp(-d * t) * Math.cos(w * t); }
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // smooth 1D noise from three sines with random phases: f(u) in about [-1, 1]
  function wave(r) {
    var ph = [r() * TAU, r() * TAU, r() * TAU], fr = [1, 2.17 * (0.8 + 0.4 * r()), 4.31 * (0.8 + 0.4 * r())];
    return function (u) { return (Math.sin(u * fr[0] + ph[0]) + 0.5 * Math.sin(u * fr[1] + ph[1]) + 0.27 * Math.sin(u * fr[2] + ph[2])) / 1.77; };
  }
  function hexRgb(c) {
    if (typeof c !== 'string') return null;
    if (c.charAt(0) === '#') {
      var h = c.slice(1); if (h.length === 3) h = h.replace(/./g, function (x) { return x + x; });
      var n = parseInt(h.slice(0, 6), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255];
    }
    var m = c.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  }
  function alpha(c, a) { var r = hexRgb(c); return r ? 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')' : c; }
  function shade(c, k) { var r = hexRgb(c); return r ? 'rgb(' + r.map(function (v) { return Math.round(clamp(v * k, 0, 255)); }).join(',') + ')' : c; }
  function luma(c) { var r = hexRgb(c); return r ? (0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2]) / 255 : 0; }

  // ---------------------------------------------------------------- polylines
  function cum(p) { var c = [0]; for (var i = 1; i < p.length; i++) c.push(c[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return c; }
  function cutTo(p, c, L) {
    var n = p.length; if (n < 2 || L >= c[n - 1]) return p;
    if (L <= 0) return [p[0]];
    var i = 1; while (i < n && c[i] < L) i++;
    var u = (L - c[i - 1]) / ((c[i] - c[i - 1]) || 1), out = p.slice(0, i);
    out.push([lerp(p[i - 1][0], p[i][0], u), lerp(p[i - 1][1], p[i][1], u)]);
    return out;
  }
  // point and heading at distance L along p
  function at(p, c, L) {
    var n = p.length; if (n < 2) return [p[0][0], p[0][1], 0];
    L = clamp(L, 0, c[n - 1]); var i = 1; while (i < n - 1 && c[i] < L) i++;
    var u = (L - c[i - 1]) / ((c[i] - c[i - 1]) || 1);
    return [lerp(p[i - 1][0], p[i][0], u), lerp(p[i - 1][1], p[i][1], u), Math.atan2(p[i][1] - p[i - 1][1], p[i][0] - p[i - 1][0])];
  }
  function resample(p, step) {
    var c = cum(p), L = c[c.length - 1], n = Math.max(2, Math.ceil(L / step) + 1), out = [];
    for (var i = 0; i < n; i++) { var q = at(p, c, L * i / (n - 1)); out.push([q[0], q[1]]); }
    return out;
  }
  function normals(p) {
    var n = p.length, out = [];
    for (var i = 0; i < n; i++) {
      var a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      out.push([-dy / d, dx / d]);
    }
    return out;
  }
  // push points sideways by smooth noise: the hand's wobble
  function jitter(p, amp, per, r) {
    if (!amp || p.length < 2) return p;
    var q = resample(p, Math.max(1.5, per / 12)), c = cum(q), N = normals(q), f = wave(r), out = [];
    for (var i = 0; i < q.length; i++) { var o = amp * f(c[i] / per * TAU); out.push([q[i][0] + N[i][0] * o, q[i][1] + N[i][1] * o]); }
    return out;
  }
  function lineP(a, b) { return [[a[0], a[1]], [b[0], b[1]]]; }
  function quadP(a, k, b, n) {
    var out = []; n = n || 24;
    for (var i = 0; i <= n; i++) { var t = i / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * k[0] + t * t * b[0], u * u * a[1] + 2 * u * t * k[1] + t * t * b[1]]); }
    return out;
  }
  function ellipseP(cx, cy, rx, ry, a0, sweep, tilt, n, rf) {
    var out = [], ct = Math.cos(tilt || 0), st = Math.sin(tilt || 0);
    n = n || Math.max(24, Math.ceil(Math.abs(sweep) / 0.09));
    for (var i = 0; i <= n; i++) {
      var u = i / n, a = a0 + sweep * u, k = rf ? rf(a, u) : 1, x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
      out.push([cx + x * ct - y * st, cy + x * st + y * ct]);
    }
    return out;
  }
  function rectP(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]; }
  function xform(p, ox, oy, ang, sc) {
    var c = Math.cos(ang), s = Math.sin(ang);
    return p.map(function (q) { return [ox + (q[0] * c - q[1] * s) * sc, oy + (q[0] * s + q[1] * c) * sc]; });
  }
  function path(c, p) { c.beginPath(); c.moveTo(p[0][0], p[0][1]); for (var i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1]); }
  function taper(d, T, w, a, b) { return Math.max(0.05, Math.min(1, a + (1 - a) * d / (3 * w + 1e-6), b + (1 - b) * (T - d) / (4 * w + 1e-6))); }
  // a filled stroke whose width varies along its length (wf(i, distance) -> width)
  function ribbon(c, p, wf, caps) {
    var n = p.length; if (n < 2) return;
    var N = normals(p), cl = cum(p), L = [], R = [], i;
    for (i = 0; i < n; i++) {
      var hw = wf(i, cl[i]) / 2;
      L.push([p[i][0] + N[i][0] * hw, p[i][1] + N[i][1] * hw]); R.push([p[i][0] - N[i][0] * hw, p[i][1] - N[i][1] * hw]);
    }
    c.beginPath(); c.moveTo(L[0][0], L[0][1]);
    for (i = 1; i < n; i++) c.lineTo(L[i][0], L[i][1]);
    for (i = n - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
    c.closePath(); c.fill();
    if (caps !== false) {
      var h0 = wf(0, 0) / 2, h1 = wf(n - 1, cl[n - 1]) / 2;
      if (h0 > 0.6) { c.beginPath(); c.arc(p[0][0], p[0][1], h0, 0, TAU); c.fill(); }
      if (h1 > 0.6) { c.beginPath(); c.arc(p[n - 1][0], p[n - 1][1], h1, 0, TAU); c.fill(); }
    }
  }
  function dot(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.3, r), 0, TAU); c.fill(); }

  // ---------------------------------------------------------------- pens
  // pen(c, S, L, s, post): draw stroke S up to length L. S = { pts, c, len, w, col, seed, ... }. post = seconds since done.
  var PENS = {
    ink: function (c, S, L, s) {
      var q = cutTo(S.pts, S.c, L), f = wave(rng(S.seed)), w = S.w, T = S.len;
      c.fillStyle = S.col;
      ribbon(c, q, function (i, d) { return w * taper(d, T, w, 0.35, 0.3) * (1 + 0.16 * f(d / (30 * s))); });
    },
    // dip pen with a broad nib held at 45 degrees: thick and thin by direction
    nib: function (c, S, L, s) {
      var q = cutTo(S.pts, S.c, L), w = S.w, T = S.len, n = q.length, th = [];
      for (var i = 0; i < n; i++) { var a = q[Math.max(0, i - 1)], b = q[Math.min(n - 1, i + 1)]; th.push(Math.atan2(b[1] - a[1], b[0] - a[0])); }
      c.fillStyle = S.col;
      ribbon(c, q, function (i, d) { return w * (0.22 + 0.95 * Math.abs(Math.sin(th[i] + PI / 4))) * taper(d, T, w, 0.5, 0.4); });
    },
    pencil: function (c, S, L, s) {
      var q = cutTo(S.pts, S.c, L), A = c.globalAlpha;
      c.strokeStyle = S.col; c.lineCap = 'round'; c.lineJoin = 'round';
      c.globalAlpha = A * 0.88; c.lineWidth = S.w * 0.55; path(c, q); c.stroke();
      c.globalAlpha = A * 0.32; c.lineWidth = S.w; c.translate(0.6 * s, 0.5 * s); path(c, q); c.stroke();
    },
    chalk: function (c, S, L, s) {
      var q = cutTo(S.pts, S.c, L), r = rng(S.seed), A = c.globalAlpha;
      c.strokeStyle = S.col; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = S.w;
      c.setLineDash([9 * s, 1.6 * s, 4 * s, 1.2 * s, 14 * s, 2.2 * s]); c.globalAlpha = A * 0.8; path(c, q); c.stroke();
      c.setLineDash([]); c.lineWidth = S.w * 0.35; c.globalAlpha = A * 0.5; c.save(); c.translate(0.9 * s, -0.7 * s); path(c, q); c.stroke(); c.restore();
      c.fillStyle = S.col;
      var n = Math.floor(S.len / (2.2 * s));
      for (var i = 0; i < n; i++) {
        var d = r() * S.len, ox = (r() - 0.5) * S.w * 2.4, oy = (r() - 0.5) * S.w * 2.4, z = (0.4 + r() * 1.2) * s, a = r();
        if (d > L) continue;
        var p = at(S.pts, S.c, d); c.globalAlpha = A * (0.15 + 0.3 * a); c.fillRect(p[0] + ox, p[1] + oy, z, z);
      }
    },
    charcoal: function (c, S, L, s) {
      var q = cutTo(S.pts, S.c, L), A = c.globalAlpha;
      c.strokeStyle = S.col; c.lineCap = 'round'; c.lineJoin = 'round';
      c.globalAlpha = A * 0.13; c.lineWidth = S.w * 2.6; path(c, q); c.stroke();
      c.globalAlpha = A; PENS.chalk(c, S, L, s);
    },
    // sumi brush: strong taper, dry-brush streaks breaking up toward the end
    brush: function (c, S, L, s) {
      var q = cutTo(S.pts, S.c, L), T = S.len, w = S.w, r = rng(S.seed), f = wave(r);
      c.fillStyle = S.col;
      ribbon(c, q, function (i, d) { return w * taper(d, T, w, 0.15, 0.04) * (0.82 + 0.22 * f(d / (40 * s))); });
      if (q.length < 3) return;
      var N = normals(q), cl = cum(q);
      c.strokeStyle = S.col; c.lineWidth = Math.max(0.6, w * 0.11); c.lineCap = 'round';
      for (var k = 0; k < 5; k++) {
        var off = (k / 4 - 0.5) * w * 1.1, g = wave(r), on = false;
        c.beginPath();
        for (var i = 0; i < q.length; i++) {
          var d = cl[i], u = d / T, tp = taper(d, T, w, 0.15, 0.04), ok = u > 0.45 && g(d / (8 * s)) > -0.15 + u * 0.3;
          var x = q[i][0] + N[i][0] * off * tp, y = q[i][1] + N[i][1] * off * tp;
          if (ok) { if (on) c.lineTo(x, y); else c.moveTo(x, y); on = true; } else on = false;
        }
        c.stroke();
      }
    },
    marker: function (c, S, L) {
      var q = cutTo(S.pts, S.c, L);
      c.strokeStyle = S.col; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = S.w; path(c, q); c.stroke();
    },
    highlighter: function (c, S, L) {
      var q = cutTo(S.pts, S.c, L);
      c.globalCompositeOperation = S.comp || 'multiply';
      c.strokeStyle = S.col; c.lineCap = 'butt'; c.lineJoin = 'round'; c.lineWidth = S.w; path(c, q); c.stroke();
    },
    crayon: function (c, S, L, s) {
      var q = cutTo(S.pts, S.c, L), r = rng(S.seed), A = c.globalAlpha;
      c.strokeStyle = S.col; c.lineCap = 'round'; c.lineJoin = 'round';
      for (var k = 0; k < 3; k++) {
        c.save(); c.setLineDash([(1 + r() * 3) * s, (0.4 + r() * 1.2) * s]); c.lineWidth = S.w * 0.45; c.globalAlpha = A * 0.65;
        c.translate((r() - 0.5) * S.w * 0.5, (r() - 0.5) * S.w * 0.5); path(c, q); c.stroke(); c.restore();
      }
    },
    grease: function (c, S, L, s) {
      var q = cutTo(S.pts, S.c, L), A = c.globalAlpha;
      c.strokeStyle = S.col; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = S.w; c.globalAlpha = A * 0.92; path(c, q); c.stroke();
      c.setLineDash([1.2 * s, 3.4 * s]); c.lineWidth = S.w * 0.32; c.globalAlpha = A * 0.4; c.strokeStyle = '#ffffff';
      c.save(); c.translate(-S.w * 0.18, -S.w * 0.18); path(c, q); c.stroke(); c.restore();
    },
    // wool laid on linen, held down by short slanted stitches
    stitch: function (c, S, L, s) {
      var q = cutTo(S.pts, S.c, L); if (q.length < 2) return;
      var cl = cum(q), tot = cl[cl.length - 1], w = S.w, step = Math.max(1.6 * s, w * 0.42);
      c.lineCap = 'round'; c.strokeStyle = alpha(S.col, 0.45); c.lineWidth = w * 0.8; path(c, q); c.stroke();
      c.lineWidth = Math.max(1, w * 0.24);
      for (var d = 0, j = 0; d < tot; d += step, j++) {
        var p = at(q, cl, d), a = p[2], nx = -Math.sin(a), ny = Math.cos(a), tx = Math.cos(a), ty = Math.sin(a), hw = w * 0.52;
        c.strokeStyle = j % 2 ? S.col : shade(S.col, 0.78);
        c.beginPath(); c.moveTo(p[0] - nx * hw - tx * hw * 0.6, p[1] - ny * hw - ty * hw * 0.6); c.lineTo(p[0] + nx * hw + tx * hw * 0.6, p[1] + ny * hw + ty * hw * 0.6); c.stroke();
        if (j % 7 === 3) { c.strokeStyle = shade(S.col, 0.55); c.beginPath(); c.moveTo(p[0] - nx * hw * 1.1, p[1] - ny * hw * 1.1); c.lineTo(p[0] + nx * hw * 1.1, p[1] + ny * hw * 1.1); c.stroke(); }
      }
    },
    // short thick comma dashes in two or three colors, laid along the path (impasto)
    swirl: function (c, S, L, s) {
      var q = cutTo(S.pts, S.c, L); if (q.length < 2) return;
      var cl = cum(q), tot = cl[cl.length - 1], r = rng(S.seed), pal = S.pal || [S.col], step = 3.1 * s * (S.w / 7);
      c.lineCap = 'round'; c.lineWidth = S.w * 0.34;
      for (var d = 0; d < tot; d += step) {
        var p = at(q, cl, d), a = p[2] + (r() - 0.5) * 0.3, len = (5 + r() * 6) * s * (S.w / 7), off = (r() - 0.5) * S.w, col = pal[Math.floor(r() * pal.length)];
        var nx = -Math.sin(p[2]), ny = Math.cos(p[2]), x = p[0] + nx * off, y = p[1] + ny * off;
        c.strokeStyle = col; c.beginPath(); c.moveTo(x - Math.cos(a) * len / 2, y - Math.sin(a) * len / 2);
        c.quadraticCurveTo(x, y, x + Math.cos(a + 0.35) * len / 2, y + Math.sin(a + 0.35) * len / 2); c.stroke();
      }
    },
    // cut paper: flat color, even width, scissor-cut ends
    cut: function (c, S, L, s) {
      var q = cutTo(S.pts, S.c, L), f = wave(rng(S.seed)), w = S.w;
      c.fillStyle = S.col;
      ribbon(c, q, function (i, d) { return w * (1 + 0.1 * f(d / (22 * s))); }, false);
    },
    // flung enamel: erratic width plus spatter that lands as the line passes
    splat: function (c, S, L, s) {
      var q = cutTo(S.pts, S.c, L), r = rng(S.seed), f = wave(r), w = S.w;
      c.fillStyle = S.col;
      ribbon(c, q, function (i, d) { return w * (0.35 + 0.95 * Math.abs(f(d / (16 * s)))); });
      var n = Math.floor(S.len / (11 * s));
      for (var i = 0; i < n; i++) {
        var d = r() * S.len, ang = r() * TAU, dist = r() * r() * w * 9, rad = (0.25 + r() * r() * 1.8) * w * 0.42;
        if (d > L) continue;
        var p = at(S.pts, S.c, d); dot(c, p[0] + Math.cos(ang) * dist, p[1] + Math.sin(ang) * dist, rad);
      }
    },
    // ink that keeps running after the line is drawn
    drip: function (c, S, L, s, post) {
      PENS.ink(c, S, L, s);
      var r = rng(S.seed + 7), n = Math.max(1, Math.floor(S.len / (85 * s)));
      for (var i = 0; i < n; i++) {
        var d = (i + 0.3 + r() * 0.4) * S.len / n, mx = (10 + r() * 30) * s;
        if (d > L) continue;
        var p = at(S.pts, S.c, d), g = Math.min(1, (L - d) / (90 * s)) * 0.45 + 0.55 * outCubic(clamp((post || 0) / 2.2, 0, 1));
        var len = mx * g; if (len < 1) continue;
        var w0 = S.w * 0.75;
        ribbon(c, [[p[0], p[1]], [p[0], p[1] + len * 0.5], [p[0], p[1] + len]], function (j) { return w0 * (1 - j * 0.28); }, false);
        dot(c, p[0], p[1] + len, w0 * 0.55);
      }
    },
    // silkscreen: two color passes slightly out of register, black on top
    pop: function (c, S, L, s) {
      var q = cutTo(S.pts, S.c, L);
      c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = S.w;
      c.strokeStyle = S.c2 || '#19c3e6'; c.save(); c.translate(2.6 * s, -2.2 * s); path(c, q); c.stroke(); c.restore();
      c.strokeStyle = S.c1 || '#ff3d9a'; c.save(); c.translate(-2.2 * s, 1.8 * s); path(c, q); c.stroke(); c.restore();
      c.strokeStyle = S.col; c.lineWidth = S.w * 0.5; path(c, q); c.stroke();
    },
    // ink with a soft glow that keeps pulsing after the line is down (radium)
    glow: function (c, S, L, s, post) {
      c.save(); c.shadowColor = S.glow || 'rgba(60,225,185,1)'; c.shadowBlur = (11 + 6 * Math.sin((post || 0) * 2.4)) * s;
      PENS.ink(c, S, L, s); c.restore(); PENS.ink(c, S, L, s);
    },
    // round dots of uneven size laid along the path
    polka: function (c, S, L, s) {
      var r = rng(S.seed), w = S.w, step = w * 1.9;
      c.fillStyle = S.col;
      for (var d = 0; d <= S.len; d += step) { var z = w * (0.32 + 0.3 * r()); if (d > L) break; var p = at(S.pts, S.c, d); dot(c, p[0], p[1], z); }
    },
    // a running stitch: even dashes with gaps
    running: function (c, S, L, s) {
      var q = cutTo(S.pts, S.c, L);
      c.strokeStyle = S.col; c.lineCap = 'round'; c.lineWidth = S.w * 0.6; c.setLineDash([S.w * 2.2, S.w * 1.5]); path(c, q); c.stroke();
    },
    rule: function (c, S, L) {
      var q = cutTo(S.pts, S.c, L);
      c.strokeStyle = S.col; c.lineCap = 'butt'; c.lineJoin = 'miter'; c.lineWidth = Math.max(0.8, S.w * 0.55); path(c, q); c.stroke();
    },
    bar: function (c, S, L) {
      var q = cutTo(S.pts, S.c, L);
      c.strokeStyle = S.col; c.lineCap = 'square'; c.lineJoin = 'miter'; c.lineWidth = S.w; path(c, q); c.stroke();
    },
    dotted: function (c, S, L) {
      var q = cutTo(S.pts, S.c, L);
      c.strokeStyle = S.col; c.lineCap = 'round'; c.lineWidth = S.w; c.setLineDash([0.01, S.w * 2.6]); path(c, q); c.stroke();
    },
    // a flow band whose width is the quantity, wide at the start
    flow: function (c, S, L, s) {
      var q = cutTo(S.pts, S.c, L), T = S.len, w = S.w;
      c.fillStyle = S.col;
      ribbon(c, q, function (i, d) { return w * lerp(1, 0.28, d / T); }, false);
      c.strokeStyle = S.edge || '#1a1a1a'; c.lineWidth = Math.max(0.7, 0.9 * s); c.stroke();
    },
    // typewriter glyphs set along the path
    typed: function (c, S, L, s) {
      var r = rng(S.seed), z = S.w, step = S.step || z * 0.62, A = c.globalAlpha;
      c.fillStyle = S.col; c.font = Math.round(z * 10) / 10 + 'px ' + (S.font || 'monospace'); c.textAlign = 'center'; c.textBaseline = 'middle';
      for (var d = 0; d <= S.len; d += step) {
        var a = r(); if (d > L) break;
        var p = at(S.pts, S.c, d); c.globalAlpha = A * (0.7 + 0.3 * a); c.fillText(S.glyph || '.', p[0], p[1]);
      }
    }
  };

  // ---------------------------------------------------------------- fonts and text
  function fontStr(F, px) { return (F.i ? 'italic ' : '') + (F.wt || 400) + ' ' + px.toFixed(1) + 'px ' + F.f; }
  function wrap(c, text, maxW) {
    var out = [];
    String(text).split('\n').forEach(function (par) {
      var words = par.split(/\s+/).filter(Boolean), line = '';
      words.forEach(function (wd) {
        var t = line ? line + ' ' + wd : wd;
        if (line && c.measureText(t).width > maxW) { out.push(line); line = wd; } else line = t;
      });
      if (line) out.push(line);
    });
    return out;
  }

  // ---------------------------------------------------------------- the builder
  // A mark becomes a list of items: strokes ('s'), fills ('f'), text ('t') and custom draws ('fn').
  // Draw-phase items share the mark's draw time in proportion to their length, like one hand drawing them in order.
  function Builder(c, m, b, W, H, s, st, K) {
    this.c = c; this.m = m; this.b = b; this.W = W; this.H = H; this.s = s; this.st = st; this.K = K;
    this.r = rng((m.seed | 0) * 7919 + 13);
    var h = st.hand || {}, rough = m.rough == null ? 1 : +m.rough;
    this.h = { wob: (h.wob == null ? 1 : h.wob) * rough, over: (h.over == null ? 0.5 : h.over) * rough, loops: h.loops || 1, bend: h.bend == null ? 0.18 : h.bend, geo: !!st.geo };
    this.items = [];
  }
  Builder.prototype = {
    hand: function (p, mul) {
      var a = this.h.wob * 1.6 * this.s * (mul == null ? 1 : mul);
      return a ? jitter(p, a, (60 + 50 * this.r()) * this.s, this.r) : p;
    },
    stroke: function (p, o) {
      o = o || {};
      var it = { k: 's', pts: p, seed: (this.r() * 1e9) | 0 };
      for (var key in o) if (key !== 'w') it[key] = o[key];
      it.pen = o.pen || this.st.pen; it.col = o.col || this.K.ink; it.w = (o.w || this.st.w) * this.s;
      this.items.push(it); return it;
    },
    fill: function (p, o) {
      o = o || {};
      var it = { k: 'f', pts: p };
      for (var key in o) it[key] = o[key];
      it.col = o.col || this.K.accent; it.rev = o.rev || 'fade';
      this.items.push(it); return it;
    },
    fn: function (draw, o) {
      var it = { k: 'fn', draw: draw }; o = o || {};
      for (var key in o) it[key] = o[key];
      this.items.push(it); return it;
    },
    text: function (o) { o.k = 't'; o.ph = o.ph || 'note'; this.items.push(o); return o; },
    font: function (px) { return fontStr(this.F, px); },
    ellipse: function () {
      var b = this.b, s = this.s, m = this.m, pad = m.pad == null ? 1 : m.pad;
      var rx = b.w / 2 + Math.max(9 * s, 0.1 * b.w) * pad, ry = b.h / 2 + Math.max(9 * s, 0.2 * b.h) * pad;
      return { cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: rx, ry: ry };
    },
    // a hand-drawn loop around the box: starts upper right, goes round anticlockwise, overshoots
    loop: function (E, o) {
      o = o || {};
      var r = this.r, h = this.h, loops = o.loops || h.loops, geo = o.geo != null ? o.geo : h.geo;
      if (geo) return ellipseP(E.cx, E.cy, E.rx, E.ry, -PI / 2, -TAU, 0);
      var a0 = -PI * 0.3 + (r() - 0.5) * 0.5, sweep = -(TAU * loops + h.over * PI * 0.45), f = wave(r), drift = 0.035 * (loops - 1) + 0.03 * h.over;
      var tilt = (r() - 0.5) * 0.14 * h.wob;
      return ellipseP(E.cx, E.cy, E.rx, E.ry, a0, sweep, tilt, 0, function (a, u) { return 1 + 0.03 * h.wob * f(a * 1.3) + drift * (u - 0.5) * 2; });
    },
    side: function (bw, bh) {
      var m = this.m, b = this.b, W = this.W, H = this.H;
      if (m.side && m.side !== 'auto') return m.side;
      var room = { right: W - (b.x + b.w) - bw, left: b.x - bw, top: (b.y - bh) * 1.1, bottom: (H - (b.y + b.h) - bh) * 0.95 };
      var best = 'right', v = -1e9;
      ['right', 'top', 'left', 'bottom'].forEach(function (k) { if (room[k] > v + 1) { v = room[k]; best = k; } });
      return best;
    }
  };

  var DIRS = { right: [1, 0], left: [-1, 0], top: [0, -1], bottom: [0, 1] };
  function rectEdge(b, pad, T) {
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = T[0] - cx, dy = T[1] - cy;
    var k = Math.min((b.w / 2 + pad) / (Math.abs(dx) || 1e-6), (b.h / 2 + pad) / (Math.abs(dy) || 1e-6));
    return [cx + dx * k, cy + dy * k];
  }
  function ellEdge(E, gap, T) {
    var dx = T[0] - E.cx, dy = T[1] - E.cy, k = 1 / Math.sqrt((dx * dx) / (E.rx * E.rx) + (dy * dy) / (E.ry * E.ry) || 1e-9);
    var d = Math.hypot(dx, dy) || 1;
    return [E.cx + dx * k + dx / d * gap, E.cy + dy * k + dy / d * gap];
  }
  function nearestOnRect(R, P) { return [clamp(P[0], R.x, R.x + R.w), clamp(P[1], R.y, R.y + R.h)]; }

  // ---------------------------------------------------------------- generic marks
  var MARKS = {
    circle: function (B) { var E = B.ellipse(); B.stroke(B.loop(E)); B.edge = function (T) { return ellEdge(E, 5 * B.s, T); }; B.E = E; },
    box: function (B) {
      var b = B.b, s = B.s, p = 7 * s * (B.m.pad == null ? 1 : B.m.pad), x0 = b.x - p, y0 = b.y - p, x1 = b.x + b.w + p, y1 = b.y + b.h + p;
      if (B.h.geo) B.stroke(rectP(x0, y0, x1 - x0, y1 - y0));
      else {
        var o = B.h.over * 10 * s, r = B.r;
        [[[x0 - o, y0], [x1 + o * 0.6, y0 + (r() - 0.5) * 3 * s]], [[x1, y0 - o * 0.6], [x1 + (r() - 0.5) * 3 * s, y1 + o]],
         [[x1 + o, y1], [x0 - o * 0.5, y1 + (r() - 0.5) * 3 * s]], [[x0, y1 + o * 0.5], [x0 + (r() - 0.5) * 3 * s, y0 - o]]]
          .forEach(function (l) { B.stroke(B.hand(lineP(l[0], l[1]), 0.6)); });
      }
      B.edge = function (T) { return rectEdge(b, p + 5 * s, T); };
    },
    underline: function (B) {
      var b = B.b, s = B.s, r = B.r, y = b.y + b.h + 5 * s, x0 = b.x - 3 * s, x1 = b.x + b.w + 5 * s * (1 + B.h.over);
      var sl = B.h.geo ? 0 : (r() - 0.6) * 0.03 * b.w;
      B.stroke(B.hand(quadP([x0, y], [(x0 + x1) / 2, y + (B.h.geo ? 0 : 2.5 * s)], [x1, y + sl], 16), 0.5));
      if (B.st.double) B.stroke(B.hand(lineP([x0 + 0.08 * b.w, y + 6 * s], [x1 - 0.12 * b.w, y + 6 * s + sl]), 0.5), { w: B.st.w * 0.8 });
      B.edge = function (T) { return rectEdge(b, 6 * s, T); };
    },
    strike: function (B) {
      var b = B.b, s = B.s, r = B.r, y = b.y + b.h * 0.55, sl = B.h.geo ? 0 : (r() - 0.5) * 0.04 * b.w;
      B.stroke(B.hand(lineP([b.x - 5 * s, y - sl], [b.x + b.w + 5 * s, y + sl]), 0.4));
      B.edge = function (T) { return rectEdge(b, 6 * s, T); };
    },
    cross: function (B) {
      var b = B.b, s = B.s, o = 5 * s * (1 + B.h.over);
      B.stroke(B.hand(lineP([b.x - o, b.y - o], [b.x + b.w + o, b.y + b.h + o]), 0.5));
      B.stroke(B.hand(lineP([b.x + b.w + o, b.y - o], [b.x - o, b.y + b.h + o]), 0.5));
      B.edge = function (T) { return rectEdge(b, 6 * s, T); };
    },
    highlight: function (B) {
      var b = B.b, s = B.s, y = b.y + b.h / 2, dark = B.st.ground === 'dark';
      B.stroke(B.hand(lineP([b.x - 4 * s, y + 1.5 * s], [b.x + b.w + 4 * s, y - 1.5 * s]), 0.15),
        { pen: 'highlighter', w: (b.h + 6 * s) / s, col: B.K.hl, comp: dark ? 'screen' : 'multiply' });
      B.edge = function (T) { return rectEdge(b, 6 * s, T); };
    },
    bracket: function (B) {
      var b = B.b, s = B.s, right = B.side(0, 0) !== 'left', sx = right ? 1 : -1, x = right ? b.x + b.w + 8 * s : b.x - 8 * s;
      var d = 9 * s, y0 = b.y - 2 * s, y1 = b.y + b.h + 2 * s, ym = (y0 + y1) / 2, p = [];
      p = p.concat(quadP([x - sx * d * 0.3, y0], [x + sx * d * 0.5, y0], [x + sx * d * 0.5, y0 + d], 6));
      p = p.concat(lineP([x + sx * d * 0.5, y0 + d], [x + sx * d * 0.5, ym - d]));
      p = p.concat(quadP([x + sx * d * 0.5, ym - d], [x + sx * d * 0.5, ym], [x + sx * d * 1.3, ym], 6));
      p = p.concat(quadP([x + sx * d * 1.3, ym], [x + sx * d * 0.5, ym], [x + sx * d * 0.5, ym + d], 6));
      p = p.concat(lineP([x + sx * d * 0.5, ym + d], [x + sx * d * 0.5, y1 - d]));
      p = p.concat(quadP([x + sx * d * 0.5, y1 - d], [x + sx * d * 0.5, y1], [x - sx * d * 0.3, y1], 6));
      B.stroke(B.hand(resample(p, 3 * s), 0.3));
      var tipP = [x + sx * d * 1.4, ym];
      B.edge = function () { return tipP; };
      B.forceSide = right ? 'right' : 'left';
    },
    arrow: function (B) { B.edge = function (T) { return rectEdge(B.b, 7 * B.s, T); }; B.wantHead = true; B.wantLeader = true; },
    note: function (B) { B.edge = function (T) { return rectEdge(B.b, 6 * B.s, T); }; B.wantLeader = true; B.dotEnd = true; },
    connect: function (B) {
      var a = B.b, b = B.to, s = B.s;
      if (!b) return;
      var tail = rectEdge(a, 6 * s, [b.x + b.w / 2, b.y + b.h / 2]), tip = rectEdge(b, 7 * s, [a.x + a.w / 2, a.y + a.h / 2]);
      shaft(B, tail, tip, true);
      B.edge = function (T) { return rectEdge(a, 6 * s, T); };
    }
  };

  // the line from tail to tip (arrow, leader or connector), with an optional head; styles can replace both parts
  function shaft(B, tail, tip, head) {
    var st = B.st, s = B.s, r = B.r;
    var dx = tip[0] - tail[0], dy = tip[1] - tail[1], len = Math.hypot(dx, dy) || 1;
    var bend = (B.m.bend != null ? B.m.bend : B.h.bend) * (r() < 0.5 ? -1 : 1);
    var ctl = [(tail[0] + tip[0]) / 2 - dy / len * bend * len * 0.5, (tail[1] + tip[1]) / 2 + dx / len * bend * len * 0.5];
    var p = st.shaft ? st.shaft(B, tail, tip, ctl) : B.hand(quadP(tail, ctl, tip, 24), 0.45);
    if (p && p.length) B.stroke(p, B.shaftOpt || {});
    var ang = p && p.length > 1 ? Math.atan2(p[p.length - 1][1] - p[p.length - 2][1], p[p.length - 1][0] - p[p.length - 2][0]) : Math.atan2(dy, dx);
    if (p && p.length > 3) { var q = p[Math.max(0, p.length - 4)]; ang = Math.atan2(tip[1] - q[1], tip[0] - q[0]); }
    if (head) headAt(B, tip, ang, st.head || 'barbs');
    return { pts: p, ang: ang, len: len };
  }
  function headAt(B, tip, ang, kind) {
    var s = B.s, z = (B.st.headSize || 13) * s, r = B.r;
    if (kind === 'none') return;
    if (B.st.headFn) { B.st.headFn(B, tip, ang, z); return; }
    var sp = 0.42 + (B.h.geo ? 0 : (r() - 0.5) * 0.12);
    var a1 = [tip[0] - Math.cos(ang - sp) * z, tip[1] - Math.sin(ang - sp) * z], a2 = [tip[0] - Math.cos(ang + sp) * z, tip[1] - Math.sin(ang + sp) * z];
    if (kind === 'tri') {
      B.fill([a1, [tip[0], tip[1]], a2, [tip[0] - Math.cos(ang) * z * 0.7, tip[1] - Math.sin(ang) * z * 0.7], a1], { col: B.st.headCol || B.K.ink, rev: 'grow', cx: tip[0], cy: tip[1], len: z });
    } else if (kind === 'dot') {
      B.fn(function (c, u) { c.fillStyle = B.K.ink; dot(c, tip[0], tip[1], 3.2 * s * outBack(u)); }, { len: z * 0.6 });
    } else {
      B.stroke(B.hand([a1, [tip[0], tip[1]], a2], 0.15), { w: B.st.w * (B.st.headW || 0.85) });
    }
  }

  // note text placed in the roomiest direction, a leader or arrow to the shape, and the style's extras
  function addNote(B) {
    var c = B.c, m = B.m, st = B.st, s = B.s, b = B.b;
    var F = B.F, px = (m.noteSize || st.size || 28) * s, text = m.note == null ? '' : String(m.note);
    if (st.caps) text = text.toUpperCase();
    c.save(); c.font = fontStr(F, px);
    var lines = text ? wrap(c, text, (m.noteWidth || 280) * s) : [], bw = 0;
    lines.forEach(function (l) { bw = Math.max(bw, c.measureText(l).width); });
    c.restore();
    var lh = px * (st.leading || 1.18), bh = lines.length * lh, iw = st.initial && lines.length ? lh * 1.7 : 0;
    bw += iw;
    var side = B.forceSide || B.side(bw + 40 * s, bh + 30 * s), D = DIRS[side] || DIRS.right;
    var roomv = side === 'right' ? B.W - (b.x + b.w) : side === 'left' ? b.x : side === 'top' ? b.y : B.H - (b.y + b.h);
    var gap = B.E ? (side === 'right' || side === 'left' ? B.E.rx - b.w / 2 : B.E.ry - b.h / 2) : 0;
    var dist = m.distance != null ? m.distance * s : clamp((roomv - gap - (D[0] ? bw : bh)) * 0.45, 30 * s, 150 * s);
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2, T;
    if (side === 'right') T = [b.x + b.w + gap + dist, cy - dist * 0.5];
    else if (side === 'left') T = [b.x - gap - dist, cy - dist * 0.5];
    else if (side === 'top') T = [cx + Math.min(dist * 0.6, b.w * 0.3), b.y - gap - dist * 0.8];
    else T = [cx + Math.min(dist * 0.6, b.w * 0.3), b.y + b.h + gap + dist * 0.8];
    if (m.from) T = [m.from[0], m.from[1]];
    var R = null;
    if (lines.length) {
      var x0 = side === 'right' ? T[0] : side === 'left' ? T[0] - bw : T[0] - bw / 2;
      var y0 = side === 'top' ? T[1] - bh : side === 'bottom' ? T[1] : T[1] - bh / 2;
      x0 = clamp(x0, 8 * s, Math.max(8 * s, B.W - bw - 8 * s)); y0 = clamp(y0, 8 * s, Math.max(8 * s, B.H - bh - 8 * s));
      R = { x: x0, y: y0, w: bw, h: bh };
    }
    var tip = B.edge(R ? [R.x + R.w / 2, R.y + R.h / 2] : T), tail = T;
    if (R) {
      var E = { x: R.x - 7 * s, y: R.y - 5 * s, w: R.w + 14 * s, h: R.h + 10 * s };
      tail = nearestOnRect(E, tip);
      if (tip[0] > E.x && tip[0] < E.x + E.w && tip[1] > E.y && tip[1] < E.y + E.h) tail = null;
    }
    var A = { side: side, tail: tail, tip: tip, R: R, lines: lines, px: px, lh: lh, iw: iw, D: D };
    B.A = A;
    if (tail && (B.wantLeader || lines.length) && Math.hypot(tip[0] - tail[0], tip[1] - tail[1]) > 6 * s) {
      var sh = shaft(B, tail, tip, !!B.wantHead);
      A.shaft = sh;
      if (B.dotEnd && !B.wantHead && st.noteEnd !== 'none') headAt(B, tip, sh.ang, 'dot');
    }
    if (lines.length) {
      if (iw) {
        var ch = lines[0].charAt(0); lines[0] = lines[0].slice(1);
        B.fn(function (c, u) {
          var z = lh * 1.55, x = R.x, y = R.y - lh * 0.15;
          c.globalAlpha *= u; c.fillStyle = st.gold || '#c9a227'; c.fillRect(x, y, z, z);
          c.strokeStyle = B.K.accent; c.lineWidth = 1.2 * s; c.strokeRect(x + 2 * s, y + 2 * s, z - 4 * s, z - 4 * s);
          c.fillStyle = B.K.accent; c.font = fontStr(F, z * 0.82); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, x + z / 2, y + z * 0.56);
        }, { ph: 'note', at: [0, 0.25] });
      }
      B.text({ lines: lines, x: R.x + iw, y: R.y, w: R.w - iw, lh: lh, px: px, F: F, col: B.K.text, mirror: !!st.mirror, rev: st.reveal || 'write', bg: st.noteBg });
    }
    if (st.noteDeco && (lines.length || B.wantHead)) st.noteDeco(B, A);
  }

  // ---------------------------------------------------------------- styles
  // Each style: who, field, year, about, pen, w, ink/accent, font, hand, plus optional mark overrides and extras.
  var SERIF_FELL = "'IM Fell English', 'IM Fell DW Pica', Georgia, serif";
  var STYLES = {};
  function def(id, o) { o.id = id; STYLES[id] = o; }

  // ---- science
  def('lyell', {
    name: 'Lyell', who: 'Charles Lyell', field: 'science', year: 1830,
    about: "Geologist's field book: iron-gall ink, double rules, highlights laid down as strata from the bottom up.",
    pen: 'nib', w: 2.6, ink: '#3d2614', accent: '#9b6a3c', font: { f: SERIF_FELL, i: true }, size: 27, hand: { wob: 0.6, over: 0.3 }, double: true,
    marks: {
      highlight: function (B) {
        var b = B.b, s = B.s, n = 4, hh = (b.h + 6 * s) / n, x = b.x - 4 * s, w = b.w + 8 * s, top = b.y - 3 * s, acc = B.K.accent;
        for (var j = 0; j < n; j++) {
          (function (j) {
            var y0 = top + (n - 1 - j) * hh;
            B.fill(rectP(x, y0, w, hh), { col: alpha(acc, 0.12 + 0.07 * (j % 2)), rev: 'wipe', dir: 'up', len: w * 0.6 });
            B.fn(function (c, u) {
              c.save(); c.beginPath(); c.rect(x, y0 + hh * (1 - u), w, hh * u); c.clip();
              c.strokeStyle = alpha(B.K.ink, 0.55); c.fillStyle = alpha(B.K.ink, 0.5); c.lineWidth = 0.8 * s;
              var k, r = rng(j * 31 + 5);
              if (j % 3 === 0) { for (k = 1; k < 3; k++) { c.beginPath(); c.moveTo(x, y0 + hh * k / 3); c.lineTo(x + w, y0 + hh * k / 3 + (r() - 0.5) * 2 * s); c.stroke(); } }
              else if (j % 3 === 1) { for (k = 0; k < w * hh / (60 * s * s); k++) dot(c, x + r() * w, y0 + r() * hh, 0.9 * s); }
              else { for (k = 0; k < w; k += 9 * s) { c.beginPath(); c.moveTo(x + k, y0 + hh * 0.8); c.lineTo(x + k + 5 * s, y0 + hh * 0.2); c.stroke(); } }
              c.restore();
            }, { with: true });
          })(j);
        }
        B.stroke(lineP([x, top + n * hh], [x + w, top + n * hh]), { pen: 'rule', w: 1.6 });
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    }
  });

  def('darwin', {
    name: 'Darwin', who: 'Charles Darwin', field: 'science', year: 1837,
    about: 'Notebook B, the "I think" page: brown ink, a quick hand, arrows that branch like the tree of life.',
    pen: 'ink', w: 2.2, ink: '#4b3621', accent: '#8b6b4a', font: { f: "'Homemade Apple', 'Caveat', cursive" }, size: 21, leading: 1.5,
    hand: { wob: 1.5, over: 0.7, bend: 0.22 },
    noteDeco: function (B, A) {
      if (!A.shaft || !A.shaft.pts || A.shaft.pts.length < 4) return;
      var p = A.shaft.pts, cl = cum(p), L = cl[cl.length - 1], s = B.s, r = B.r, letters = ['A', 'B', 'C', 'D'], li = 0;
      [0.38, 0.58, 0.74].forEach(function (u, i) {
        var q = at(p, cl, L * u), sg = i % 2 ? 1 : -1, a = q[2] + sg * (0.55 + r() * 0.3), bl = L * (0.2 + 0.1 * r());
        var e = [q[0] + Math.cos(a) * bl, q[1] + Math.sin(a) * bl];
        B.stroke(B.hand(quadP([q[0], q[1]], [q[0] + Math.cos(a - sg * 0.3) * bl * 0.5, q[1] + Math.sin(a - sg * 0.3) * bl * 0.5], e, 10), 0.3), { w: 1.7 });
        // a crossbar marks a living tip; the others end bare
        if (i !== 1) {
          var n = [-Math.sin(a) * 5 * s, Math.cos(a) * 5 * s];
          B.stroke(lineP([e[0] - n[0], e[1] - n[1]], [e[0] + n[0], e[1] + n[1]]), { w: 1.6 });
          var lt = letters[li++];
          B.fn(function (c, uu) { c.globalAlpha *= uu; c.fillStyle = B.K.ink; c.font = fontStr({ f: "'Homemade Apple', cursive" }, 13 * s); c.textAlign = 'center'; c.fillText(lt, e[0] + Math.cos(a) * 11 * s, e[1] + Math.sin(a) * 11 * s + 4 * s); }, { len: 8 * s });
        }
      });
      var t0 = A.tail;
      B.fn(function (c, uu) { c.globalAlpha *= uu; c.fillStyle = B.K.ink; c.font = fontStr({ f: "'Homemade Apple', cursive" }, 13 * s); c.textAlign = 'center'; c.fillText('1', t0[0] - 6 * s, t0[1] - 6 * s); }, { len: 8 * s });
    }
  });

  def('davinci', {
    name: 'Da Vinci', who: 'Leonardo da Vinci', field: 'science', year: 1490,
    about: "Notebook sepia: left-handed hatching that slopes down to the right, and notes in mirror writing, right to left.",
    pen: 'nib', w: 2.2, ink: '#5a3a1e', accent: '#a0522d', font: { f: SERIF_FELL, i: true }, size: 26, mirror: true, hand: { wob: 0.8, over: 0.4 },
    marks: {
      highlight: function (B) { hatch(B, [1]); },
      circle: function (B) {
        MARKS.circle(B);
        var E = B.E;
        B.stroke(ellipseP(E.cx, E.cy, E.rx * 1.08, E.ry * 1.08, -PI / 2, -TAU, 0), { pen: 'rule', w: 0.9, col: alpha(B.K.ink, 0.35) });
      }
    }
  });
  // parallel hatching clipped to the box; dirs: 1 = down-right (left hand), -1 = down-left, 0 = vertical
  function hatch(B, dirs, gap, o) {
    var b = B.b, s = B.s, x = b.x - 4 * s, y = b.y - 3 * s, w = b.w + 8 * s, h = b.h + 6 * s, g = (gap || 7) * s;
    o = o || {};
    dirs.forEach(function (dr, di) {
      B.fn(function (c, u) {
        c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
        c.strokeStyle = o.col || alpha(B.K.ink, 0.75); c.lineWidth = (o.w || 0.9) * s; c.lineCap = 'round';
        var n = Math.ceil((w + h) / g), r = rng(di * 17 + 3), shown = Math.floor(n * u);
        for (var k = 0; k < shown; k++) {
          var off = k * g + (r() - 0.5) * g * 0.3;
          c.beginPath();
          if (dr === 0) { c.moveTo(x + off, y); c.lineTo(x + off, y + h); }
          else if (dr > 0) { c.moveTo(x + off - h, y); c.lineTo(x + off, y + h); }
          else { c.moveTo(x + off, y); c.lineTo(x + off - h, y + h); }
          c.stroke();
        }
        c.restore();
      }, { len: (w + h) * 0.8 });
    });
    B.edge = function (T) { return rectEdge(b, 6 * s, T); };
  }

  def('hooke', {
    name: 'Hooke', who: 'Robert Hooke', field: 'science', year: 1665,
    about: 'Micrographia plates: fine engraved line, cross-hatching, and lettered callouts instead of arrowheads.',
    pen: 'rule', w: 1.7, ink: '#151515', accent: '#555', font: { f: "'IM Fell English SC', " + SERIF_FELL }, size: 24, hand: { wob: 0.25, over: 0.05, bend: 0.08 },
    head: 'none',
    marks: {
      highlight: function (B) { hatch(B, [1, -1], 6); },
      box: function (B) {
        MARKS.box(B);
        var b = B.b, s = B.s, p = 13 * B.s;
        B.stroke(rectP(b.x - p, b.y - p, b.w + 2 * p, b.h + 2 * p), { w: 1 });
        B.fn(function (c, u) { c.globalAlpha *= u; c.fillStyle = B.K.ink; c.font = fontStr({ f: SERIF_FELL, i: true }, 15 * s); c.textAlign = 'right'; c.fillText('Fig. 1.', b.x + b.w + p, b.y + b.h + p + 17 * s); }, { len: 10 * s });
      }
    },
    noteDeco: function (B, A) {
      var s = B.s, t = A.tip, a = Math.atan2(A.tip[1] - (A.tail || A.tip)[1], A.tip[0] - (A.tail || A.tip)[0]);
      B.fn(function (c, u) { c.globalAlpha *= u; c.fillStyle = B.K.ink; c.font = fontStr({ f: SERIF_FELL, i: true }, 17 * s); c.textAlign = 'center'; c.fillText('A', t[0] - Math.cos(a) * 12 * s + Math.sin(a) * 9 * s, t[1] - Math.sin(a) * 12 * s - Math.cos(a) * 9 * s + 5 * s); }, { len: 10 * s });
    }
  });

  def('newton', {
    name: 'Newton', who: 'Isaac Newton', field: 'science', year: 1687,
    about: 'Principia diagrams: compass circles, ruled lines, and every point named with a letter.',
    pen: 'rule', w: 1.9, ink: '#151515', accent: '#151515', font: { f: SERIF_FELL, i: true }, size: 26, geo: true, hand: { wob: 0, over: 0, bend: 0 },
    head: 'none',
    marks: {
      circle: function (B) {
        var E = B.ellipse(), s = B.s, R = Math.max(E.rx, E.ry);
        E.rx = E.ry = R; B.E = E;
        B.stroke(ellipseP(E.cx, E.cy, R, R, -PI / 2, -TAU, 0));
        var pa = -PI / 6, P = [E.cx + Math.cos(pa) * R, E.cy + Math.sin(pa) * R];
        B.stroke(lineP([E.cx, E.cy], P), { w: 1.2 });
        letterAt(B, 'S', E.cx - 10 * s, E.cy + 16 * s); letterAt(B, 'P', P[0] + 12 * s, P[1] - 4 * s);
        B.fn(function (c, u) { c.fillStyle = B.K.ink; dot(c, E.cx, E.cy, 2.6 * s * u); }, { len: 6 * s });
        B.edge = function (T) { return ellEdge(E, 5 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.tail) return;
      var s = B.s, t = A.tail, p = A.tip, a = Math.atan2(p[1] - t[1], p[0] - t[0]);
      [[t, 'A', -1], [p, 'B', 1]].forEach(function (q) {
        B.fn(function (c, u) { c.fillStyle = B.K.ink; dot(c, q[0][0], q[0][1], 2.2 * s * u); }, { len: 4 * s });
        letterAt(B, q[1], q[0][0] - Math.sin(a) * 13 * s + q[2] * Math.cos(a) * 6 * s, q[0][1] + Math.cos(a) * 13 * s + 5 * s);
      });
    }
  });
  function letterAt(B, ch, x, y, px) {
    var s = B.s;
    B.fn(function (c, u) { c.globalAlpha *= u; c.fillStyle = B.K.ink; c.font = fontStr({ f: SERIF_FELL, i: true }, (px || 17) * s); c.textAlign = 'center'; c.fillText(ch, x, y); }, { len: 8 * s });
  }

  def('galileo', {
    name: 'Galileo', who: 'Galileo Galilei', field: 'science', year: 1610,
    about: 'Sidereus Nuncius: grey ink wash, a ruled moon log of stars and Jupiter beside each note.',
    pen: 'ink', w: 2, ink: '#2b2b2b', accent: 'rgba(70,70,82,0.26)', font: { f: SERIF_FELL, i: true }, size: 26, hand: { wob: 0.7, over: 0.35 },
    marks: {
      circle: function (B) {
        var E = B.ellipse(), f = wave(B.r);
        B.fill(ellipseP(E.cx, E.cy, E.rx * 0.97, E.ry * 0.97, 0, TAU, 0, 64, function (a) { return 1 + 0.05 * f(a * 2); }), { col: B.K.accent, rev: 'fade', len: E.rx });
        MARKS.circle(B);
      },
      highlight: function (B) {
        var b = B.b, s = B.s, f = wave(B.r), E = { cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: b.w / 2 + 8 * s, ry: b.h / 2 + 6 * s };
        B.fill(ellipseP(E.cx, E.cy, E.rx, E.ry, 0, TAU, 0, 64, function (a) { return 1 + 0.08 * f(a * 2); }), { col: B.K.accent, rev: 'wipe', dir: 'right', len: b.w });
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, y = R.y - 12 * s, x0 = R.x + 6 * s, marks = ['*', '*', 'O', '*'];
      B.fn(function (c, u) {
        c.strokeStyle = B.K.ink; c.fillStyle = B.K.ink; c.lineWidth = 1.1 * s;
        var shown = Math.ceil(u * marks.length);
        for (var i = 0; i < shown; i++) {
          var x = x0 + i * 17 * s + (i === 2 ? 4 * s : 0);
          if (marks[i] === 'O') { c.beginPath(); c.arc(x, y, 5 * s, 0, TAU); c.stroke(); }
          else for (var k = 0; k < 3; k++) { var a = k * PI / 3 + 0.3; c.beginPath(); c.moveTo(x - Math.cos(a) * 3.5 * s, y - Math.sin(a) * 3.5 * s); c.lineTo(x + Math.cos(a) * 3.5 * s, y + Math.sin(a) * 3.5 * s); c.stroke(); }
        }
        c.beginPath(); c.moveTo(x0 - 6 * s, y + 9 * s); c.lineTo(x0 - 6 * s + 80 * s * u, y + 9 * s); c.lineWidth = 0.7 * s; c.stroke();
      }, { ph: 'note', at: [0.6, 1.2] });
    }
  });

  def('haeckel', {
    name: 'Haeckel', who: 'Ernst Haeckel', field: 'science', year: 1904,
    about: 'Kunstformen der Natur: symmetric radiolarian rings with spokes, beads and spines, drawn round like a compass.',
    pen: 'rule', w: 1.6, ink: '#1b2a33', accent: '#3f7f8c', font: { f: "'Cormorant Garamond', Georgia, serif", i: true, wt: 500 }, size: 27, geo: true, hand: { wob: 0, over: 0, bend: 0.15 },
    marks: {
      circle: function (B) {
        var E = B.ellipse(), s = B.s, n = 24;
        B.E = E;
        B.stroke(ellipseP(E.cx, E.cy, E.rx, E.ry, -PI / 2, -TAU, 0), { w: 1.8 });
        B.stroke(ellipseP(E.cx, E.cy, E.rx + 9 * s, E.ry + 9 * s, -PI / 2, -TAU, 0), { w: 1.1, with: true });
        B.fn(function (c, u) {
          c.strokeStyle = B.K.ink; c.fillStyle = B.K.accent; c.lineWidth = 0.9 * s;
          var shown = Math.floor(n * u + 1e-6);
          for (var i = 0; i < shown; i++) {
            var a = -PI / 2 + i * TAU / n, ca = Math.cos(a), sa = Math.sin(a);
            var x1 = E.cx + ca * E.rx, y1 = E.cy + sa * E.ry, x2 = E.cx + ca * (E.rx + 9 * s), y2 = E.cy + sa * (E.ry + 9 * s);
            c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
            if (i % 2 === 0) { c.beginPath(); c.moveTo(x2, y2); c.lineTo(E.cx + ca * (E.rx + 20 * s), E.cy + sa * (E.ry + 20 * s)); c.stroke(); dot(c, E.cx + ca * (E.rx + 21 * s), E.cy + sa * (E.ry + 21 * s), 1.8 * s); }
            else { c.beginPath(); c.arc(E.cx + ca * (E.rx + 4.5 * s), E.cy + sa * (E.ry + 4.5 * s), 2.2 * s, 0, TAU); c.stroke(); }
          }
        }, { len: E.rx * 3 });
        B.edge = function (T) { return ellEdge({ cx: E.cx, cy: E.cy, rx: E.rx + 18 * s, ry: E.ry + 18 * s }, 4 * s, T); };
      }
    }
  });

  def('cajal', {
    name: 'Cajal', who: 'Santiago Ramón y Cajal', field: 'science', year: 1899,
    about: 'Neuron drawings in India ink: arrows grow dendrites at the tail, with tiny arrows showing which way the signal runs.',
    pen: 'ink', w: 3, ink: '#0d0d0d', accent: '#7a2e2e', font: { f: "'Caveat', cursive", wt: 600 }, size: 30, hand: { wob: 0.9, over: 0.4, bend: 0.25 },
    noteDeco: function (B, A) {
      var s = B.s;
      if (A.shaft && A.shaft.pts && A.shaft.pts.length > 4) {
        var p = A.shaft.pts, cl = cum(p), L = cl[cl.length - 1];
        [0.35, 0.65].forEach(function (u) {
          var q = at(p, cl, L * u), z = 6 * s, a = q[2];
          B.stroke([[q[0] - Math.cos(a - 0.5) * z, q[1] - Math.sin(a - 0.5) * z], [q[0], q[1]], [q[0] - Math.cos(a + 0.5) * z, q[1] - Math.sin(a + 0.5) * z]], { w: 1.4 });
        });
      }
      if (A.tail && A.shaft) dendrites(B, A.tail, A.shaft.ang + PI, 5, 26);
    },
    after: function (B) { if (B.E && B.m.mark === 'circle') { var E = B.E, r = B.r; for (var i = 0; i < 4; i++) { var a = -PI * 0.8 + i * PI * 0.45 + (r() - 0.5) * 0.4; dendrites(B, [E.cx + Math.cos(a) * E.rx, E.cy + Math.sin(a) * E.ry], a, 2, 18); } } }
  });
  function dendrites(B, o, ang, n, len) {
    var s = B.s, r = B.r;
    for (var i = 0; i < n; i++) {
      var a = ang + (i - (n - 1) / 2) * (1.1 / Math.max(1, n - 1)) * 1.4 + (r() - 0.5) * 0.3, l = (len + r() * len * 0.6) * s;
      var e = [o[0] + Math.cos(a) * l, o[1] + Math.sin(a) * l];
      B.stroke(B.hand(quadP(o, [o[0] + Math.cos(a + 0.3) * l * 0.5, o[1] + Math.sin(a + 0.3) * l * 0.5], e, 8), 0.3), { w: 1.8 });
      for (var k = -1; k <= 1; k += 2) {
        var b2 = a + k * 0.5, l2 = l * 0.45;
        B.stroke(lineP(e, [e[0] + Math.cos(b2) * l2, e[1] + Math.sin(b2) * l2]), { w: 1.0, with: true });
      }
    }
  }

  def('feynman', {
    name: 'Feynman', who: 'Richard Feynman', field: 'science', year: 1949,
    about: 'Chalkboard diagrams: dusty chalk, wavy photon lines for arrows, and an arrow riding the middle of the line.',
    pen: 'chalk', w: 3.6, ink: '#f2f0e6', accent: '#f6d36b', ground: 'dark', paper: '#1f2b24', font: { f: "'Architects Daughter', cursive" }, size: 26,
    hand: { wob: 0.7, over: 0.5, bend: 0.1 }, hl: 'rgba(246,211,107,0.35)',
    shaft: function (B, tail, tip) {
      var s = B.s, p = resample(lineP(tail, tip), 2 * s), cl = cum(p), L = cl[cl.length - 1], N = normals(p), per = 15 * s, amp = 6 * s;
      return p.map(function (q, i) { var u = cl[i] / L, k = Math.min(1, u / 0.08, (1 - u) / 0.12); return [q[0] + N[i][0] * Math.sin(cl[i] / per * TAU) * amp * k, q[1] + N[i][1] * Math.sin(cl[i] / per * TAU) * amp * k]; });
    },
    marks: {
      underline: function (B) {
        MARKS.underline(B);
        var b = B.b, s = B.s, y = b.y + b.h + 5 * s, x = b.x + b.w / 2;
        B.stroke([[x - 5 * s, y - 6 * s], [x + 4 * s, y], [x - 5 * s, y + 6 * s]], { w: 3 });
      }
    }
  });

  def('nightingale', {
    name: 'Nightingale', who: 'Florence Nightingale', field: 'science', year: 1858,
    about: 'The rose diagram: circles bloom into polar wedges in soft blue, pink and grey.',
    pen: 'rule', w: 1.4, ink: '#3a3a3a', accent: '#7aa3c8', font: { f: "'Cormorant Garamond', Georgia, serif", i: true, wt: 600 }, size: 27, geo: true, hand: { wob: 0.3, over: 0, bend: 0.15 },
    hl: 'rgba(220,140,150,0.4)',
    marks: {
      circle: function (B) {
        var E = B.ellipse(), s = B.s, n = 12, r = B.r, pal = ['rgba(122,163,200,0.62)', 'rgba(220,140,150,0.62)', 'rgba(150,150,150,0.55)'], ext = [];
        for (var i = 0; i < n; i++) ext.push(0.2 + 0.75 * r() * r() + 0.15 * Math.sin(i * 0.9));
        B.E = E;
        B.stroke(ellipseP(E.cx, E.cy, E.rx, E.ry, -PI / 2, -TAU, 0), { w: 1.2 });
        var M = Math.min(E.rx, E.ry);
        B.fn(function (c, u) {
          for (var i = 0; i < n; i++) {
            var g = seg(u, i / n * 0.7, i / n * 0.7 + 0.3); if (g <= 0) continue;
            var a0 = -PI / 2 + i * TAU / n, a1 = a0 + TAU / n, k = 1 + ext[i] * M / Math.max(E.rx, E.ry) * outCubic(g) * 1.2;
            c.beginPath(); c.moveTo(E.cx + Math.cos(a0) * E.rx, E.cy + Math.sin(a0) * E.ry);
            for (var j = 0; j <= 8; j++) { var a = lerp(a0, a1, j / 8); c.lineTo(E.cx + Math.cos(a) * E.rx * k, E.cy + Math.sin(a) * E.ry * k); }
            for (j = 8; j >= 0; j--) { a = lerp(a0, a1, j / 8); c.lineTo(E.cx + Math.cos(a) * E.rx, E.cy + Math.sin(a) * E.ry); }
            c.closePath(); c.fillStyle = pal[i % 3]; c.fill(); c.strokeStyle = B.K.ink; c.lineWidth = 0.8 * s; c.stroke();
          }
        }, { len: E.rx * 3 });
        B.edge = function (T) { return ellEdge({ cx: E.cx, cy: E.cy, rx: E.rx * 1.5, ry: E.ry * 1.5 }, 2 * s, T); };
      }
    }
  });

  def('edison', {
    name: 'Edison', who: 'Thomas Edison', field: 'science', year: 1880,
    about: 'Patent drawing: ruled lines, wavy lead lines that touch the part, reference numerals, Fig. 1.',
    pen: 'rule', w: 1.7, ink: '#111111', accent: '#111111', font: { f: SERIF_FELL }, size: 26, geo: true, hand: { wob: 0, over: 0, bend: 0.3 },
    head: 'none',
    shaft: function (B, tail, tip) {
      var s = B.s, dx = tip[0] - tail[0], dy = tip[1] - tail[1], L = Math.hypot(dx, dy) || 1, n = [-dy / L, dx / L], k = 0.18 * L;
      var p = [], m = 30;
      for (var i = 0; i <= m; i++) { var u = i / m, w = Math.sin(u * TAU) * k * 0.35; p.push([tail[0] + dx * u + n[0] * w, tail[1] + dy * u + n[1] * w]); }
      return p;
    },
    marks: {
      box: function (B) {
        MARKS.box(B);
        var b = B.b, s = B.s;
        B.fn(function (c, u) { c.globalAlpha *= u; c.fillStyle = B.K.ink; c.font = fontStr({ f: SERIF_FELL, i: true }, 22 * s); c.textAlign = 'center'; c.fillText('Fig. 1.', b.x + b.w / 2, b.y + b.h + 36 * s); }, { len: 20 * s });
      },
      highlight: function (B) { hatch(B, [-1], 6, { w: 1 }); }
    }
  });

  def('leavitt', {
    name: 'Leavitt', who: 'Henrietta Swan Leavitt', field: 'science', year: 1912,
    about: 'Harvard plate stacks: a tiny neat ring and two tick marks on the glass, notes in a small careful hand.',
    pen: 'ink', w: 1.6, ink: '#2d2a6e', accent: '#2d2a6e', font: { f: "'Caveat', cursive", wt: 500 }, size: 27, hand: { wob: 0.25, over: 0.15, bend: 0.1 },
    marks: {
      circle: function (B) {
        var m = B.m; m.pad = m.pad == null ? 0.45 : m.pad;
        var E = B.ellipse(), s = B.s; B.E = E;
        B.stroke(B.loop(E));
        var g = 5 * s, l = 12 * s;
        B.stroke(lineP([E.cx, E.cy - E.ry - g - l], [E.cx, E.cy - E.ry - g]), { w: 1.4 });
        B.stroke(lineP([E.cx - E.rx - g - l, E.cy], [E.cx - E.rx - g, E.cy]), { w: 1.4 });
        B.edge = function (T) { return ellEdge(E, 5 * s, T); };
      }
    }
  });

  // ---- art
  def('picasso', {
    name: 'Picasso', who: 'Pablo Picasso', field: 'art', year: 1950,
    about: 'One-line drawing: a bold black line that never lifts, with cubist corners where a circle would be.',
    pen: 'ink', w: 4.2, ink: '#111111', accent: '#c0392b', font: { f: "'Caveat Brush', 'Caveat', cursive" }, size: 32, oneLine: true, hand: { wob: 0.4, over: 0.8, bend: 0.4 },
    marks: {
      circle: function (B) {
        var E = B.ellipse(), r = B.r, n = 7, pts = [], s = B.s; B.E = E;
        var a0 = -PI * 0.25;
        for (var i = 0; i <= n + 2; i++) {
          var a = a0 - i * TAU / n + (r() - 0.5) * 0.35, k = 1 + (r() - 0.5) * 0.24 + (i > n ? 0.12 : 0);
          pts.push([E.cx + Math.cos(a) * E.rx * k, E.cy + Math.sin(a) * E.ry * k]);
        }
        B.stroke(B.hand(resample(pts, 3 * s), 0.3));
        B.edge = function (T) { return ellEdge(E, 8 * s, T); };
      }
    }
  });

  def('dali', {
    name: 'Dalí', who: 'Salvador Dalí', field: 'art', year: 1931,
    about: 'Soft watches: circles sag and drip after they are drawn, an ant walks the line, arrows sprout a waxed mustache.',
    pen: 'drip', w: 3.2, ink: '#2a1a10', accent: '#c58b2a', font: { f: "'Pinyon Script', cursive" }, size: 34, hand: { wob: 0.7, over: 0.5, bend: 0.3 },
    marks: {
      circle: function (B) {
        MARKS.circle(B);
        var E = B.E, it = B.items[B.items.length - 1];
        it.warp = function (p, post) {
          var g = 0.38 * outCubic(clamp(post / 2.6, 0, 1));
          if (g <= 0) return p;
          return p.map(function (q) {
            var dy = (q[1] - E.cy) / E.ry, dx = Math.abs(q[0] - E.cx) / E.rx;
            return dy <= 0 ? q : [q[0], q[1] + Math.pow(dy, 2) * Math.pow(Math.max(0, 1 - dx * 0.8), 1.4) * E.ry * g];
          });
        };
        var ring = it;
        B.fn(function (c, u, post) {
          if (post === undefined) return;
          var p = ring.warp(ring.pts, post), cl = cum(p), L = cl[cl.length - 1], d = (L * 0.2 + post * 34 * B.s) % L, q = at(p, cl, d);
          ant(c, q[0], q[1], q[2], 1.05 * B.s, B.K.ink, post);
        }, { ph: 'deco', at: [1.0, 1.05] });
      }
    },
    noteDeco: function (B, A) {
      if (!A.tail || !A.shaft) return;
      var s = B.s, t = A.tail, a = A.shaft.ang + PI;
      [-1, 1].forEach(function (k) {
        var p = [], n = 30;
        for (var i = 0; i <= n; i++) {
          var u = i / n, R = 16 * s * (1 - u * 0.85), th = a + k * (PI / 2 + u * 2.3 * PI * 0.9);
          var cx = t[0] + Math.cos(a + k * PI / 2) * 16 * s * u * 0.6, cy = t[1] + Math.sin(a + k * PI / 2) * 16 * s * u * 0.6 - u * 10 * s;
          p.push([cx + Math.cos(th) * R * u, cy + Math.sin(th) * R * u]);
        }
        B.stroke(p, { w: 2.2, pen: 'ink', with: k > 0 });
      });
    }
  });
  function ant(c, x, y, a, s, col, post) {
    c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 0.8 * s;
    var g = Math.sin(post * 22) * 1.2 * s;
    for (var k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(k * 2.2 * s, 0); c.lineTo(k * 2.2 * s + g * (k ? 1 : -1), -5 * s); c.moveTo(k * 2.2 * s, 0); c.lineTo(k * 2.2 * s - g * (k ? 1 : -1), 5 * s); c.stroke(); }
    c.beginPath(); c.ellipse(-4.2 * s, 0, 2.8 * s, 2 * s, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(0, 0, 1.8 * s, 1.3 * s, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(3.2 * s, 0, 1.7 * s, 1.5 * s, 0, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(4.5 * s, -0.5 * s); c.quadraticCurveTo(6.5 * s, -2.5 * s, 7.5 * s, -3 * s); c.moveTo(4.5 * s, 0.5 * s); c.quadraticCurveTo(6.5 * s, 2.5 * s, 7.5 * s, 3 * s); c.stroke();
    c.restore();
  }

  def('vangogh', {
    name: 'Van Gogh', who: 'Vincent van Gogh', field: 'art', year: 1889,
    about: 'Starry Night strokes: short thick dashes in ultramarine and chrome yellow, circles that spiral in, a halo of light.',
    pen: 'swirl', w: 7.5, ink: '#1f3d8a', accent: '#f2c230', font: { f: "'Caveat Brush', cursive" }, size: 32, hand: { wob: 0.8, over: 0.6, bend: 0.3 },
    pal: ['#1f3d8a', '#2f5fb3', '#8fb3e8', '#f2c230'], textCol: '#1f3d8a',
    marks: {
      circle: function (B) {
        var E = B.ellipse(), s = B.s; B.E = E;
        B.stroke(ellipseP(E.cx, E.cy, E.rx, E.ry, -PI * 0.3, -TAU * 1.55, 0, 0, function (a, u) { return 1 - 0.3 * u; }));
        B.fn(function (c, u) {
          c.strokeStyle = B.K.accent; c.lineCap = 'round'; c.lineWidth = 3 * s;
          var n = 22, shown = Math.floor(n * u);
          for (var i = 0; i < shown; i++) {
            var a = -PI / 2 + i * TAU / n, r0 = 1.14 + 0.05 * (i % 2), r1 = r0 + 0.09;
            c.strokeStyle = i % 3 ? B.K.accent : '#f7e08a';
            c.beginPath(); c.moveTo(E.cx + Math.cos(a) * E.rx * r0, E.cy + Math.sin(a) * E.ry * r0);
            c.quadraticCurveTo(E.cx + Math.cos(a + 0.06) * E.rx * (r0 + r1) / 2, E.cy + Math.sin(a + 0.06) * E.ry * (r0 + r1) / 2, E.cx + Math.cos(a + 0.1) * E.rx * r1, E.cy + Math.sin(a + 0.1) * E.ry * r1);
            c.stroke();
          }
        }, { len: E.rx * 2 });
        B.edge = function (T) { return ellEdge({ cx: E.cx, cy: E.cy, rx: E.rx * 1.25, ry: E.ry * 1.25 }, 3 * s, T); };
      }
    }
  });

  def('matisse', {
    name: 'Matisse', who: 'Henri Matisse', field: 'art', year: 1952,
    about: 'Paper cut-outs: flat gouache shapes in cobalt, coral and lemon, with seaweed fronds growing from the corners.',
    pen: 'cut', w: 10, ink: '#1f4fb3', accent: '#ee6a4d', font: { f: "'Caveat Brush', cursive" }, size: 32, hand: { wob: 0.9, over: 0.4, bend: 0.3 },
    head: 'tri', headSize: 22, third: '#f4c430', hl: 'rgba(238,106,77,0.5)',
    marks: {
      highlight: function (B) {
        var b = B.b, s = B.s, f = wave(B.r), E = { cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: b.w / 2 + 12 * s, ry: b.h / 2 + 9 * s };
        B.fill(ellipseP(E.cx, E.cy, E.rx, E.ry, 0, TAU, 0, 48, function (a) { return 1 + 0.1 * f(a * 2.5); }), { col: alpha(B.K.accent, 0.55), rev: 'grow', cx: E.cx, cy: E.cy, len: b.w, comp: 'multiply' });
        frond(B, [b.x - 6 * s, b.y + b.h + 6 * s], -PI * 0.62, 46, B.st.third);
        frond(B, [b.x + b.w + 6 * s, b.y + b.h + 6 * s], -PI * 0.38, 38, B.K.ink);
        B.edge = function (T) { return rectEdge(b, 8 * s, T); };
      }
    },
    noteDeco: function (B, A) { if (A.R) frond(B, [A.R.x - 14 * B.s, A.R.y + A.R.h], -PI / 2 - 0.15, 34, B.st.third); }
  });
  // a cut-paper frond: a stem with alternating lobes, grown from its base
  function frond(B, base, ang, len, col) {
    var s = B.s, L = len * s, W = L * 0.32, l = [], r = [], n = 28;
    for (var i = 0; i <= n; i++) {
      var u = i / n, w = Math.sin(u * PI) * W * (0.45 + 0.55 * Math.abs(Math.sin(u * PI * 3.5))) * (1 - u * 0.3);
      l.push([u * L, -w]); r.push([u * L, w * 0.9]);
    }
    var poly = l.concat(r.reverse());
    B.fill(xform(poly, base[0], base[1], ang, 1), { col: col, rev: 'grow', cx: base[0], cy: base[1], len: L });
  }

  def('mondrian', {
    name: 'Mondrian', who: 'Piet Mondrian', field: 'art', year: 1930,
    about: 'Composition with red, blue and yellow: no curves allowed. Circles come out square, arrows turn corners.',
    pen: 'bar', w: 7, ink: '#111111', accent: '#d4281c', font: { f: "'Jost', 'Futura', sans-serif", wt: 700 }, size: 22, caps: true, geo: true,
    hand: { wob: 0, over: 0, bend: 0 }, head: 'none', hl: 'rgba(246,209,10,0.85)',
    shaft: function (B, tail, tip) {
      var s = B.s, mid = [tip[0], tail[1]];
      if (Math.abs(tip[0] - tail[0]) < Math.abs(tip[1] - tail[1])) mid = [tail[0], tip[1]];
      B.fill(rectP(tail[0] - 7 * s, tail[1] - 7 * s, 14 * s, 14 * s), { col: '#f6d10a', rev: 'grow', cx: tail[0], cy: tail[1], len: 14 * s });
      return [tail, mid, tip];
    },
    marks: {
      circle: function (B) { mondrianFrame(B); },
      box: function (B) { mondrianFrame(B); },
      underline: function (B) {
        var b = B.b, s = B.s, y = b.y + b.h + 7 * s;
        B.stroke([[b.x - 4 * s, y], [b.x + b.w + 4 * s, y]]);
        B.fill(rectP(b.x + b.w + 10 * s, y - 9 * s, 26 * s, 18 * s), { col: '#d4281c', rev: 'wipe', dir: 'right', len: 26 * s });
        B.edge = function (T) { return rectEdge(b, 10 * s, T); };
      },
      highlight: function (B) {
        var b = B.b, s = B.s;
        B.fill(rectP(b.x - 5 * s, b.y - 4 * s, b.w + 10 * s, b.h + 8 * s), { col: B.K.hl, rev: 'wipe', dir: 'right', len: b.w, comp: 'multiply' });
        B.stroke(lineP([b.x - 5 * s, b.y + b.h + 4 * s], [b.x + b.w + 5 * s, b.y + b.h + 4 * s]), { w: 5 });
        B.edge = function (T) { return rectEdge(b, 8 * s, T); };
      }
    }
  });
  function mondrianFrame(B) {
    var b = B.b, s = B.s, p = 10 * s, e = 26 * s, x0 = b.x - p, y0 = b.y - p, x1 = b.x + b.w + p, y1 = b.y + b.h + p;
    B.stroke([[x0 - e, y0], [x1 + e, y0]]); B.stroke([[x1, y0 - e], [x1, y1 + e]]);
    B.stroke([[x1 + e, y1], [x0 - e, y1]]); B.stroke([[x0, y1 + e], [x0, y0 - e]]);
    var h = 3.5 * s;
    B.fill(rectP(x0 - e, y0 - e, e - h, e - h), { col: '#d4281c', rev: 'wipe', dir: 'right', len: e });
    B.fill(rectP(x1 + h, y1 + h, e - h, e - h), { col: '#1f4fa8', rev: 'wipe', dir: 'down', len: e });
    B.fill(rectP(x1 + h, y0 - e, e - h, e - h), { col: '#f6d10a', rev: 'wipe', dir: 'up', len: e });
    B.edge = function (T) { return rectEdge(b, p + e * 0.6, T); };
  }

  def('kandinsky', {
    name: 'Kandinsky', who: 'Wassily Kandinsky', field: 'art', year: 1926,
    about: 'Point and Line to Plane: rings in three colors, a sharp line, a red triangle for a head, a checkerboard accent.',
    pen: 'rule', w: 3, ink: '#141414', accent: '#e2412e', font: { f: "'Jost', 'Futura', sans-serif", wt: 500 }, size: 22, geo: true, hand: { wob: 0, over: 0, bend: 0 },
    head: 'tri', headCol: '#e2412e', headSize: 18,
    marks: {
      circle: function (B) {
        var E = B.ellipse(), s = B.s, R = Math.max(E.rx, E.ry); B.E = E;
        B.fill(ellipseP(E.cx + 6 * s, E.cy - 4 * s, R * 0.62, R * 0.62, 0, TAU, 0, 48), { col: 'rgba(242,193,46,0.45)', rev: 'grow', cx: E.cx, cy: E.cy, len: R, comp: 'multiply' });
        [['#2d5fd3', 1, 0, 0, 3], ['#e2412e', 0.86, -5, 4, 2.2], ['#141414', 1.14, 3, 2, 1.4]].forEach(function (q) {
          B.stroke(ellipseP(E.cx + q[2] * s, E.cy + q[3] * s, R * q[1], R * q[1], -PI / 2, -TAU, 0), { col: q[0], w: q[4] });
        });
        B.edge = function (T) { return ellEdge({ cx: E.cx, cy: E.cy, rx: R * 1.14, ry: R * 1.14 }, 5 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      var s = B.s;
      if (A.tail) { var t = A.tail; B.fn(function (c, u) { c.fillStyle = '#141414'; dot(c, t[0], t[1], 5 * s * outBack(u)); }, { len: 8 * s }); }
      if (A.R) {
        var x = A.R.x + A.R.w + 10 * s, y = A.R.y - 4 * s, z = 7 * s;
        B.fn(function (c, u) { c.fillStyle = '#141414'; var n = Math.ceil(9 * u); for (var i = 0; i < n; i++) if ((i + Math.floor(i / 3)) % 2 === 0) c.fillRect(x + (i % 3) * z, y + Math.floor(i / 3) * z, z, z); c.strokeStyle = '#141414'; c.lineWidth = s; c.strokeRect(x, y, 3 * z, 3 * z); }, { ph: 'note', at: [0.5, 1] });
      }
    }
  });

  def('pollock', {
    name: 'Pollock', who: 'Jackson Pollock', field: 'art', year: 1950,
    about: 'Drip painting: flung skeins of black and white enamel, spatter everywhere, never the same twice.',
    pen: 'splat', w: 3.4, ink: '#141414', accent: '#e8e2d4', font: { f: "'Permanent Marker', cursive" }, size: 26, hand: { wob: 2.4, over: 1, loops: 2, bend: 0.45 },
    third: '#b0412e', hl: 'rgba(176,65,46,0.35)',
    after: function (B) {
      var b = B.b, s = B.s, r = B.r;
      [[B.K.accent, 1.6], [B.st.third, 1.1]].forEach(function (q) {
        var pts = [];
        for (var i = 0; i < 6; i++) pts.push([b.x - b.w * 0.25 + r() * b.w * 1.5, b.y - b.h * 0.3 + r() * b.h * 1.6]);
        var p = [];
        for (i = 0; i < pts.length - 2; i++) p = p.concat(quadP(i ? [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2] : pts[0], pts[i + 1], [(pts[i + 1][0] + pts[i + 2][0]) / 2, (pts[i + 1][1] + pts[i + 2][1]) / 2], 12));
        B.stroke(p, { col: q[0], w: q[1] });
      });
    }
  });

  def('hokusai', {
    name: 'Hokusai', who: 'Katsushika Hokusai', field: 'art', year: 1831,
    about: 'Great Wave brushwork: Prussian blue ink, open brush rings, arrows that start in a curling wave with claws.',
    pen: 'brush', w: 6.5, ink: '#1d3557', accent: '#457b9d', font: { f: "'Caveat Brush', cursive" }, size: 30, hand: { wob: 0.6, over: 0, bend: 0.3 },
    hl: 'rgba(69,123,157,0.32)',
    marks: {
      circle: function (B) {
        var E = B.ellipse(), s = B.s; B.E = E;
        B.stroke(ellipseP(E.cx, E.cy, E.rx, E.ry, PI * 0.62, -TAU * 0.93, -0.05, 0, function (a, u) { return 1 + 0.04 * Math.sin(u * 5); }), { w: 8 });
        B.edge = function (T) { return ellEdge(E, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.tail || !A.shaft) return;
      var s = B.s, t = A.tail, a = A.shaft.ang, k = -1, R = 15 * s, p = [];
      for (var i = 0; i <= 34; i++) { var u = i / 34, th = a + PI / 2 * k - u * 1.6 * PI * k, rr = R * (1 - u * 0.75); p.push([t[0] + Math.cos(a + PI / 2 * k) * R + Math.cos(th + PI) * rr, t[1] + Math.sin(a + PI / 2 * k) * R + Math.sin(th + PI) * rr]); }
      B.stroke(p, { w: 4.5 });
      for (var j = 0; j < 4; j++) {
        var th2 = a + PI / 2 * k + PI + (j - 1.5) * 0.45, cx = t[0] + Math.cos(a + PI / 2 * k) * R, cy = t[1] + Math.sin(a + PI / 2 * k) * R;
        var o = [cx + Math.cos(th2) * R * 1.05, cy + Math.sin(th2) * R * 1.05], e = [cx + Math.cos(th2 - 0.35 * k) * R * 1.55, cy + Math.sin(th2 - 0.35 * k) * R * 1.55];
        B.stroke(quadP(o, [(o[0] + e[0]) / 2 + Math.cos(th2) * 3 * s, (o[1] + e[1]) / 2 + Math.sin(th2) * 3 * s], e, 6), { w: 2.4 });
      }
    }
  });

  def('warhol', {
    name: 'Warhol', who: 'Andy Warhol', field: 'art', year: 1964,
    about: 'Silkscreen pop: hot pink and cyan out of register under black, halftone dots for highlights.',
    pen: 'pop', w: 5, ink: '#141414', accent: '#ff3d9a', font: { f: "'Bungee', 'Impact', sans-serif" }, size: 22, caps: true, hand: { wob: 0.5, over: 0.3, bend: 0.2 },
    noteBg: '#ffe14d',
    marks: {
      highlight: function (B) {
        var b = B.b, s = B.s, x = b.x - 5 * s, y = b.y - 4 * s, w = b.w + 10 * s, h = b.h + 8 * s, g = 7 * s;
        B.fn(function (c, u) {
          c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = B.K.accent;
          for (var yy = y + g / 2, row = 0; yy < y + h; yy += g, row++) for (var xx = x + g / 2 + (row % 2) * g / 2; xx < x + w * u; xx += g) dot(c, xx, yy, g * 0.46 * (0.45 + 0.55 * (xx - x) / w));
          c.restore();
        }, { len: w });
        B.edge = function (T) { return rectEdge(b, 8 * s, T); };
      }
    }
  });

  def('haring', {
    name: 'Haring', who: 'Keith Haring', field: 'art', year: 1982,
    about: 'Subway chalk drawings: one thick even outline, radiant lines that make it buzz, bold color.',
    pen: 'marker', w: 6.5, ink: '#111111', accent: '#e8322b', font: { f: "'Permanent Marker', cursive" }, size: 26, caps: true, hand: { wob: 0.4, over: 0.15, bend: 0.25 },
    hl: 'rgba(255,210,0,0.6)', third: '#ffd200',
    after: function (B) {
      var b = B.b, s = B.s, mk = B.m.mark;
      if (mk !== 'circle' && mk !== 'box' && mk !== 'underline') return;
      var E = B.E || { cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: b.w / 2 + 12 * s, ry: b.h / 2 + 12 * s };
      if (mk === 'underline') E = { cx: b.x + b.w / 2, cy: b.y + b.h + 5 * s, rx: b.w / 2 + 6 * s, ry: 6 * s };
      var n = mk === 'underline' ? 6 : 12;
      B.fn(function (c, u) {
        c.strokeStyle = B.K.ink; c.lineWidth = 4.2 * s; c.lineCap = 'round';
        var shown = Math.ceil(n * u);
        for (var i = 0; i < shown; i++) {
          var a = mk === 'underline' ? PI * 0.15 + i * PI * 0.7 / (n - 1) : -PI / 2 + i * TAU / n;
          var k0 = 1 + 18 * s / Math.max(E.rx, E.ry), k1 = k0 + 14 * s / Math.max(E.rx, E.ry);
          c.beginPath(); c.moveTo(E.cx + Math.cos(a) * (E.rx + 10 * s), E.cy + Math.sin(a) * (E.ry + 10 * s)); c.lineTo(E.cx + Math.cos(a) * (E.rx + 22 * s), E.cy + Math.sin(a) * (E.ry + 22 * s)); c.stroke();
        }
      }, { ph: 'deco', at: [1.0, 1.35] });
    }
  });

  // ---- history
  def('lascaux', {
    name: 'Lascaux', who: 'Lascaux cave painters', field: 'history', year: -17000,
    about: 'Charcoal and red ochre on stone: rows of ochre dots, and a hand stencil sprayed beside each note.',
    pen: 'charcoal', w: 4.6, ink: '#231a14', accent: '#b5512b', font: { f: "'Rock Salt', cursive" }, size: 18, leading: 1.6, hand: { wob: 1.1, over: 0.5, bend: 0.25 },
    paper: '#e6d3b3', hl: 'rgba(181,81,43,0.35)',
    marks: {
      circle: function (B) {
        var E = B.ellipse(), f = wave(B.r);
        B.fill(ellipseP(E.cx, E.cy, E.rx * 0.95, E.ry * 0.95, 0, TAU, 0, 48, function (a) { return 1 + 0.08 * f(a * 2); }), { col: alpha(B.K.accent, 0.2), rev: 'fade', len: E.rx, comp: 'multiply' });
        MARKS.circle(B);
      }
    },
    noteDeco: function (B, A) {
      var s = B.s;
      if (A.shaft && A.shaft.pts && A.shaft.pts.length > 3) {
        var p = A.shaft.pts, cl = cum(p), L = cl[cl.length - 1];
        B.fn(function (c, u) {
          c.fillStyle = B.K.accent; var n = Math.floor(L / (14 * s));
          for (var i = 1; i < n * u; i++) { var q = at(p, cl, i * 14 * s); dot(c, q[0] - Math.sin(q[2]) * 9 * s, q[1] + Math.cos(q[2]) * 9 * s, 2.6 * s); }
        }, { len: L * 0.5 });
      }
      if (!A.R) return;
      var R = A.R, z = Math.min(64 * s, Math.max(40 * s, R.h * 1.4)), right = A.side === 'left';
      var hx = right ? R.x + R.w + z * 0.7 : R.x - z * 0.7, hy = R.y + R.h / 2;
      if (hx - z * 0.6 < 0 || hx + z * 0.6 > B.W) hx = R.x + R.w / 2, hy = R.y + R.h + z * 0.75;
      handStencil(B, hx, hy, z, right ? 0.2 : -0.2);
    }
  });
  function handStencil(B, x, y, z, rot) {
    var r = rng(B.m.seed * 3 + 11), dots = [], k = z / 60;
    function inHand(px, py) {
      var c = Math.cos(-rot), s = Math.sin(-rot), u = ((px - x) * c - (py - y) * s) / k, v = ((px - x) * s + (py - y) * c) / k;
      if ((u * u) / (17 * 17) + ((v - 8) * (v - 8)) / (19 * 19) < 1) return true;
      var F = [[-15, -6, -30, 4.2], [-6, -12, -50, 4.6], [3, -12, -54, 4.6], [11, -10, -48, 4.4], [17, -5, -36, 4]];
      for (var i = 0; i < 5; i++) {
        var f = F[i], ax = f[0], ay = f[1], bx = f[0] * 1.25 + (i === 0 ? -14 : 0), by = f[2] + (i === 0 ? 18 : 0);
        var dx = bx - ax, dy = by - ay, t = clamp(((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy), 0, 1);
        if (Math.hypot(u - ax - dx * t, v - ay - dy * t) < f[3]) return true;
      }
      return false;
    }
    for (var i = 0; i < 900; i++) {
      var a = r() * TAU, d = Math.sqrt(r()) * z * 0.95, px = x + Math.cos(a) * d * 0.85, py = y + Math.sin(a) * d - z * 0.1;
      if (!inHand(px, py)) dots.push([px, py, (0.6 + r() * 1.6) * B.s, r()]);
    }
    B.fn(function (c, u) {
      c.fillStyle = B.K.accent;
      for (var i = 0; i < dots.length; i++) { var q = dots[i]; if (q[3] > u) continue; c.globalAlpha = 0.55; dot(c, q[0], q[1], q[2]); }
    }, { ph: 'note', at: [0.2, 1.1] });
  }

  def('scriptorium', {
    name: 'Scriptorium', who: 'Medieval scribes', field: 'history', year: 1200,
    about: 'Manuscript margins: red rubrics, a pointing manicule for an arrow, and an illuminated initial on every note.',
    pen: 'nib', w: 2.4, ink: '#2a1a12', accent: '#b3261e', font: { f: "'UnifrakturMaguntia', 'Old English Text MT', serif" }, size: 26, hand: { wob: 0.5, over: 0.3, bend: 0.1 },
    initial: true, gold: '#c9a227', hl: 'rgba(179,38,30,0.25)', head: 'none',
    shaft: function (B, tail, tip) {
      var s = B.s, a = Math.atan2(tip[1] - tail[1], tip[0] - tail[0]), L = Math.hypot(tip[0] - tail[0], tip[1] - tail[1]), z = Math.min(64 * s, L * 0.9);
      var flip = Math.cos(a) < 0 ? -1 : 1;
      manicule(B, tip, a, z, flip);
      var cuff = [tip[0] - Math.cos(a) * z, tip[1] - Math.sin(a) * z];
      if (L - z > 10 * s) B.shaftOpt = { col: B.K.accent, w: 1.6 };
      else B.shaftOpt = null;
      return L - z > 10 * s ? B.hand(lineP(tail, cuff), 0.2) : null;
    },
    marks: { underline: function (B) { MARKS.underline(B); B.items[B.items.length - 1].col = B.K.accent; } }
  });
  // a pointing hand, drawn in local units (finger tip at 0,0 pointing +x, length 1)
  function manicule(B, tip, a, z, flip) {
    var P = [[-1, -0.13], [-0.74, -0.13], [-0.5, -0.19], [-0.32, -0.1], [-0.02, -0.06], [0.01, -0.03], [0.01, 0.02], [-0.02, 0.04], [-0.3, 0.04]];
    for (var i = 0; i < 3; i++) { var x0 = -0.33 - i * 0.12; P.push([x0 - 0.01, 0.08]); P.push([x0 - 0.05, 0.13]); P.push([x0 - 0.1, 0.1]); }
    P.push([-0.7, 0.12]); P.push([-0.74, 0.13]); P.push([-1, 0.13]);
    var F = function (p) { return xform(p.map(function (q) { return [q[0], q[1] * flip]; }), tip[0], tip[1], a, z); };
    B.stroke(F(P), { w: 2 });
    B.stroke(F([[-0.5, -0.12], [-0.36, -0.06], [-0.3, -0.06]]), { w: 1.4 });
    B.stroke(F([[-0.74, -0.13], [-0.74, 0.13]]), { w: 1.4 });
    B.stroke(F([[-0.86, -0.13], [-0.86, 0.13]]), { w: 1.2, col: B.K.accent });
  }

  def('champollion', {
    name: 'Champollion', who: 'Jean-François Champollion', field: 'history', year: 1822,
    about: 'Decipherment notes: names ringed in the Egyptian scribes’ cartouche, with its end bar, in black and red ochre.',
    pen: 'ink', w: 2.8, ink: '#1a1a1a', accent: '#a63a1f', font: { f: "'Cinzel', 'Trajan Pro', serif", wt: 600 }, size: 20, caps: true, hand: { wob: 0.35, over: 0.1, bend: 0.18 },
    marks: {
      circle: function (B) { cartouche(B); },
      box: function (B) { cartouche(B); }
    }
  });
  function cartouche(B) {
    var b = B.b, s = B.s, p = 9 * s, x0 = b.x - p, y0 = b.y - p, x1 = b.x + b.w + p, y1 = b.y + b.h + p, R = (y1 - y0) / 2;
    var pts = [].concat(lineP([x0 + R, y0], [x1 - R, y0]), ellipseP(x1 - R, y0 + R, R, R, -PI / 2, PI, 0, 16), lineP([x1 - R, y1], [x0 + R, y1]), ellipseP(x0 + R, y0 + R, R, R, PI / 2, PI, 0, 16));
    B.stroke(B.hand(resample(pts, 3 * s), 0.25));
    B.stroke(B.hand(lineP([x1 + 5 * s, y0 - 2 * s], [x1 + 5 * s, y1 + 2 * s]), 0.2), { col: B.K.accent, w: 4 });
    B.edge = function (T) { return rectEdge(b, p + 7 * s, T); };
  }

  def('bayeux', {
    name: 'Bayeux', who: 'Bayeux Tapestry embroiderers', field: 'history', year: 1070,
    about: 'Wool on linen, most likely stitched by English women: laid-and-couched stitches in terracotta, sage and blue.',
    pen: 'stitch', w: 6, ink: '#a0462d', accent: '#5f7f4f', font: { f: "'Uncial Antiqua', serif" }, size: 22, caps: true, hand: { wob: 0.6, over: 0.3, bend: 0.2 },
    paper: '#ece2c9', textCol: '#2f4a73', hl: 'rgba(95,127,79,0.35)',
    after: function (B) { var it = B.items; for (var i = 0; i < it.length; i++) if (it[i].k === 's' && i % 2 === 1 && it[i].pen === 'stitch') it[i].col = B.K.accent; }
  });

  def('mercator', {
    name: 'Mercator', who: 'Gerardus Mercator', field: 'history', year: 1569,
    about: 'Sea chart: red dotted routes, coastline hatching inside a ring, a compass rose that swings to north.',
    pen: 'dotted', w: 2.6, ink: '#8a1f1f', accent: '#2b2b2b', font: { f: SERIF_FELL, i: true }, size: 26, hand: { wob: 0.4, over: 0.2, bend: 0.3 },
    head: 'tri', headCol: '#8a1f1f', textCol: '#2b2b2b', hl: 'rgba(138,31,31,0.2)',
    marks: {
      circle: function (B) {
        MARKS.circle(B);
        var E = B.E, s = B.s;
        B.fn(function (c, u) {
          c.strokeStyle = B.K.accent; c.lineWidth = 0.9 * s; var n = 60, shown = Math.floor(n * u);
          for (var i = 0; i < shown; i++) { var a = i * TAU / n; c.beginPath(); c.moveTo(E.cx + Math.cos(a) * E.rx * 0.97, E.cy + Math.sin(a) * E.ry * 0.97); c.lineTo(E.cx + Math.cos(a) * (E.rx * 0.97 - 6 * s), E.cy + Math.sin(a) * (E.ry * 0.97 - 6 * s)); c.stroke(); }
        }, { len: E.rx * 2 });
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, z = 22 * s, x = A.side === 'left' ? R.x - z - 4 * s : R.x + R.w + z + 4 * s, y = R.y + R.h / 2;
      if (x - z < 0 || x + z > B.W) { x = R.x + R.w / 2; y = R.y - z - 6 * s; }
      B.fn(function (c, u, post) {
        var sw = (1 - spring((post || 0) + u * 0.4, 9, 4)) * 0.9;
        c.save(); c.translate(x, y); c.rotate(sw); c.globalAlpha *= u;
        c.strokeStyle = B.K.accent; c.lineWidth = 0.9 * s; c.beginPath(); c.arc(0, 0, z * 0.62, 0, TAU); c.stroke();
        for (var i = 0; i < 8; i++) {
          var a = -PI / 2 + i * PI / 4, l = i % 2 ? z * 0.55 : z, wd = z * 0.16;
          for (var h = -1; h <= 1; h += 2) {
            c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * l, Math.sin(a) * l); c.lineTo(Math.cos(a + h * PI / 2) * wd, Math.sin(a + h * PI / 2) * wd); c.closePath();
            c.fillStyle = h > 0 ? B.K.accent : (i === 0 ? B.K.ink : '#f3ead6'); c.fill(); c.stroke();
          }
        }
        c.fillStyle = B.K.ink; c.font = fontStr({ f: SERIF_FELL, i: true }, 12 * s); c.textAlign = 'center'; c.fillText('N', 0, -z - 3 * s);
        c.restore();
      }, { ph: 'note', at: [0.3, 0.9] });
    }
  });

  def('minard', {
    name: 'Minard', who: 'Charles Joseph Minard', field: 'history', year: 1869,
    about: "The map of Napoleon's march: arrows become flow bands that thin as they go, with a black line for the return.",
    pen: 'flow', w: 18, ink: '#1a1a1a', accent: '#d8b88a', font: { f: "'Cormorant Garamond', Georgia, serif", i: true, wt: 600 }, size: 24, hand: { wob: 0.2, over: 0.1, bend: 0.25 },
    head: 'none', hl: 'rgba(216,184,138,0.55)',
    shaft: function (B, tail, tip, ctl) { B.shaftOpt = { col: B.K.accent, pen: 'flow', edge: B.K.ink }; return quadP(tail, ctl, tip, 30); },
    marks: {
      underline: function (B) {
        var b = B.b, s = B.s, y = b.y + b.h + 9 * s;
        B.stroke(lineP([b.x - 4 * s, y], [b.x + b.w + 6 * s, y]), { pen: 'flow', col: B.K.accent, w: 12, edge: B.K.ink });
        B.edge = function (T) { return rectEdge(b, 10 * s, T); };
      },
      circle: function (B) { MARKS.circle(B); var it = B.items[B.items.length - 1]; it.pen = 'rule'; it.w = 2 * B.s; }
    },
    noteDeco: function (B, A) {
      if (!A.shaft || !A.shaft.pts) return;
      var s = B.s, p = A.shaft.pts.slice().reverse(), N = normals(p), off = 13 * s;
      B.stroke(p.map(function (q, i) { return [q[0] - N[i][0] * off, q[1] - N[i][1] * off]; }), { pen: 'rule', w: 3.2, col: B.K.ink });
    }
  });

  def('bletchley', {
    name: 'Bletchley', who: 'Bletchley Park', field: 'history', year: 1942,
    about: 'Typed intercepts from a staff that was mostly women: typewriter x-outs and underscores, redaction bars, and a red MOST SECRET stamp.',
    pen: 'typed', w: 16, ink: '#222222', accent: '#b22222', font: { f: "'Special Elite', 'Courier New', monospace" }, size: 21, reveal: 'type', geo: true,
    hand: { wob: 0, over: 0, bend: 0 }, head: 'none',
    shaft: function (B, tail, tip) { B.shaftOpt = { glyph: '-', font: "'Special Elite', monospace" }; return lineP(tail, tip); },
    headFn: null,
    marks: {
      circle: function (B) { var E = B.ellipse(); B.E = E; B.stroke(ellipseP(E.cx, E.cy, E.rx, E.ry, -PI / 2, -TAU, 0), { glyph: '*', font: "'Special Elite', monospace", step: 11 * B.s }); B.edge = function (T) { return ellEdge(E, 6 * B.s, T); }; },
      strike: function (B) { var b = B.b, y = b.y + b.h * 0.58; B.stroke(lineP([b.x, y], [b.x + b.w, y]), { glyph: 'x', font: "'Special Elite', monospace", w: Math.max(14, b.h * 0.9 / B.s) }); B.edge = function (T) { return rectEdge(b, 6 * B.s, T); }; },
      underline: function (B) { var b = B.b, y = b.y + b.h + 2 * B.s; B.stroke(lineP([b.x, y], [b.x + b.w, y]), { glyph: '_', font: "'Special Elite', monospace" }); B.edge = function (T) { return rectEdge(b, 6 * B.s, T); }; },
      highlight: function (B) {
        var b = B.b, s = B.s;
        B.fill(rectP(b.x - 3 * s, b.y + b.h * 0.05, b.w + 6 * s, b.h * 0.95), { col: '#111111', rev: 'wipe', dir: 'right', len: b.w });
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, x = R.x + R.w * 0.55, y = R.y + R.h + 26 * s;
      if (y + 20 * s > B.H) y = R.y - 26 * s;
      B.fn(function (c, u) {
        if (u <= 0) return;
        var k = 1 + 0.5 * (1 - outCubic(u));
        c.save(); c.translate(x, y); c.rotate(-0.08); c.scale(k, k); c.globalAlpha *= 0.85 * u;
        c.strokeStyle = B.K.accent; c.fillStyle = B.K.accent; c.lineWidth = 2.2 * s; c.font = fontStr({ f: "'Special Elite', monospace", wt: 700 }, 17 * s);
        c.textAlign = 'center'; c.textBaseline = 'middle';
        var tw = c.measureText('MOST SECRET').width;
        c.setLineDash([14 * s, 1.5 * s, 6 * s, 1 * s]); c.strokeRect(-tw / 2 - 8 * s, -14 * s, tw + 16 * s, 28 * s); c.setLineDash([]);
        c.fillText('MOST SECRET', 0, 1 * s); c.restore();
      }, { ph: 'note', at: [1.05, 1.35] });
    }
  });

  def('apollo', {
    name: 'Apollo', who: 'Apollo mission control', field: 'history', year: 1969,
    about: 'Grease pencil on the acetate over a console: waxy yellow, quick confident loops, block capitals.',
    pen: 'grease', w: 5, ink: '#ffd23f', accent: '#ff8c42', ground: 'dark', paper: '#0e1a24', font: { f: "'Permanent Marker', cursive" }, size: 24, caps: true,
    hand: { wob: 0.8, over: 0.7, bend: 0.2 }, hl: 'rgba(255,210,63,0.32)'
  });

  def('perkins', {
    name: 'Perkins', who: 'Maxwell Perkins', field: 'history', year: 1925,
    about: "An editor's red pencil: loose rings, carets, and the proofreader's delete loop on every strike.",
    pen: 'pencil', w: 2.8, ink: '#c1121f', accent: '#c1121f', font: { f: "'Caveat', cursive", wt: 600 }, size: 30, hand: { wob: 1, over: 0.6, bend: 0.2 },
    hl: 'rgba(193,18,31,0.18)',
    marks: {
      strike: function (B) {
        MARKS.strike(B);
        var b = B.b, s = B.s, x = b.x + b.w + 5 * s, y = b.y + b.h * 0.55, p = [];
        for (var i = 0; i <= 30; i++) { var u = i / 30, a = -PI / 2 - u * TAU * 1.05, R = 7 * s; p.push([x + 6 * s * u + Math.cos(a) * R, y - R + Math.sin(a) * R + (u > 0.85 ? (u - 0.85) * 60 * s : 0)]); }
        p.unshift([x, y]);
        B.stroke(B.hand(p, 0.15));
      }
    }
  });

  // ---- v1.2: twenty more hands (science, art, history)
  function rrectP(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    return [].concat(lineP([x + r, y], [x + w - r, y]), ellipseP(x + w - r, y + r, r, r, -PI / 2, PI / 2, 0, 8),
      lineP([x + w, y + r], [x + w, y + h - r]), ellipseP(x + w - r, y + h - r, r, r, 0, PI / 2, 0, 8),
      lineP([x + w - r, y + h], [x + r, y + h]), ellipseP(x + r, y + h - r, r, r, PI / 2, PI / 2, 0, 8),
      lineP([x, y + h - r], [x, y + r]), ellipseP(x + r, y + r, r, r, PI, PI / 2, 0, 8));
  }
  // a small text item drawn in its own window (ph 'note' or 'deco')
  function tag(B, txt, x, y, px, o) {
    o = o || {};
    B.fn(function (c, u) {
      c.globalAlpha *= u; c.fillStyle = o.col || B.K.ink; c.font = fontStr(o.F || B.F, px * B.s);
      c.textAlign = o.align || 'center'; c.textBaseline = 'middle'; c.fillText(txt, x, y);
    }, o.ph ? { ph: o.ph, at: o.at } : { len: 10 * B.s });
  }
  // the note's background box, as renderText draws it
  function noteBox(B, A, pad) {
    var s = B.s, R = A.R, p = pad || 0;
    return { x: R.x - 6 * s - p, y: R.y - 4 * s - p, w: R.w + 12 * s + 2 * p, h: A.lines.length * A.lh + 6 * s + 2 * p };
  }
  // put an item just before the note text, so it draws under it
  function underText(B, it) {
    var items = B.items, i = items.indexOf(it), j;
    if (i < 0) return;
    items.splice(i, 1);
    for (j = items.length - 1; j >= 0; j--) if (items[j].k === 't') break;
    items.splice(j < 0 ? items.length : j, 0, it);
  }
  // somewhere beside the note that stays on the canvas
  function besideNote(B, A, z) {
    var s = B.s, R = A.R, x = A.side === 'left' ? R.x - z - 8 * s : R.x + R.w + z + 8 * s, y = R.y + R.h / 2;
    if (x - z < 0 || x + z > B.W) { x = R.x + R.w / 2; y = R.y + R.h + z + 8 * s; if (y + z > B.H) y = R.y - z - 8 * s; }
    return [x, y];
  }
  function ammonite(B, cx, cy, R, a0) {
    var s = B.s, turns = 2.4;
    B.stroke(ellipseP(cx, cy, R, R, a0, -TAU * turns, 0, 60, function (a, u) { return 1 - 0.9 * u; }), { w: 1.6 });
    B.fn(function (c, u) {
      c.strokeStyle = B.K.ink; c.lineWidth = 0.9 * s; var n = 14, shown = Math.floor(n * u);
      for (var i = 0; i < shown; i++) {
        var uu = i / n / turns, a = a0 - TAU * turns * uu, k0 = 1 - 0.9 * uu, k1 = 1 - 0.9 * (uu + 1 / turns);
        c.beginPath(); c.moveTo(cx + Math.cos(a) * R * k0, cy + Math.sin(a) * R * k0); c.lineTo(cx + Math.cos(a) * R * k1, cy + Math.sin(a) * R * k1); c.stroke();
      }
    }, { len: R * 2 });
  }

  def('anning', {
    name: 'Anning', who: 'Mary Anning', field: 'science', year: 1823,
    about: 'Fossil hunting at Lyme Regis: rings that end in a ribbed ammonite, highlights dotted out like an imprint, notes on a specimen label.',
    pen: 'ink', w: 2.2, ink: '#2b2a26', accent: '#8a6d3b', paper: '#d9dbd4', font: { f: "'La Belle Aurore', cursive" }, size: 25, leading: 1.45,
    hand: { wob: 0.7, over: 0.25, bend: 0.2 }, hl: 'rgba(138,109,59,0.22)', noteBg: '#f1ece0',
    marks: {
      circle: function (B) {
        MARKS.circle(B);
        var E = B.E, s = B.s, a = -PI * 0.3, R = Math.max(12 * s, Math.min(26 * s, E.ry * 0.45));
        ammonite(B, E.cx + Math.cos(a) * (E.rx + R * 0.9), E.cy + Math.sin(a) * (E.ry + R * 0.9), R, a + PI);
        B.edge = function (T) { return ellEdge(E, 5 * s, T); };
      },
      highlight: function (B) {
        var b = B.b, s = B.s, x = b.x - 6 * s, y = b.y - 5 * s, w = b.w + 12 * s, h = b.h + 10 * s;
        B.fill(rrectP(x, y, w, h, 12 * s), { col: B.K.hl, rev: 'fade', len: w * 0.3, comp: 'multiply' });
        B.stroke(rrectP(x, y, w, h, 12 * s), { pen: 'dotted', w: 2.4 });
        B.edge = function (T) { return rectEdge(b, 8 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, Q = noteBox(B, A), F = { f: "'La Belle Aurore', cursive" };
      B.fn(function (c, u) {
        c.globalAlpha *= u; c.strokeStyle = B.K.accent; c.lineWidth = 1.2 * s; c.strokeRect(Q.x, Q.y, Q.w, Q.h);
        c.fillStyle = B.K.accent; c.font = fontStr(F, 12 * s); c.textAlign = 'right'; c.fillText('Lyme Regis', Q.x + Q.w - 3 * s, Q.y + Q.h + 13 * s);
      }, { ph: 'note', at: [0, 0.3] });
    }
  });

  def('lovelace', {
    name: 'Lovelace', who: 'Ada Lovelace', field: 'science', year: 1843,
    about: 'Her Notes on the Analytical Engine: a lettered footnote mark on what she rings, and a rule over each note.',
    pen: 'nib', w: 1.9, ink: '#1e2a44', accent: '#6b4c8a', font: { f: "'Cormorant Garamond', Georgia, serif", i: true, wt: 600 }, size: 28,
    hand: { wob: 0.4, over: 0.2, bend: 0.15 },
    after: function (B) {
      if (B.m.mark !== 'circle' && B.m.mark !== 'box') return;
      var b = B.b, s = B.s, x = B.E ? B.E.cx + B.E.rx * 0.78 : b.x + b.w + 6 * s, y = B.E ? B.E.cy - B.E.ry * 0.82 : b.y - 4 * s;
      tag(B, 'G', x + 6 * s, y - 4 * s, 17, { col: B.K.accent });
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, y = R.y - 9 * s, w = Math.min(R.w, 110 * s);
      B.stroke(lineP([R.x, y], [R.x + w, y]), { pen: 'rule', w: 1.4, col: B.K.accent, ph: 'note', at: [0, 0.25] });
    }
  });

  function moth(c, x, y, z, col) {
    c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 0.08 * z;
    [[-1, -0.35, 0.55, 0.34, -0.5], [1, -0.35, 0.55, 0.34, 0.5], [-1, 0.32, 0.4, 0.26, 0.6], [1, 0.32, 0.4, 0.26, -0.6]].forEach(function (q) {
      c.save(); c.globalAlpha *= 0.55; c.beginPath(); c.ellipse(x + q[0] * z * 0.42, y + q[1] * z, q[2] * z, q[3] * z, q[4], 0, TAU); c.fill(); c.restore();
    });
    c.beginPath(); c.ellipse(x, y, 0.1 * z, 0.48 * z, 0, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(x, y - 0.45 * z); c.quadraticCurveTo(x - 0.15 * z, y - 0.8 * z, x - 0.35 * z, y - 0.85 * z);
    c.moveTo(x, y - 0.45 * z); c.quadraticCurveTo(x + 0.15 * z, y - 0.8 * z, x + 0.35 * z, y - 0.85 * z); c.stroke();
  }
  def('hopper', {
    name: 'Hopper', who: 'Grace Hopper', field: 'science', year: 1947,
    about: 'The Mark II logbook: pencil entries with a time stamp, and a moth taped to the page as the first actual bug.',
    pen: 'pencil', w: 2.6, ink: '#2b2b2b', accent: '#7a6a3a', font: { f: "'Reenie Beanie', cursive" }, size: 33, hand: { wob: 0.9, over: 0.5, bend: 0.15 },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, z = 22 * s, P = besideNote(B, A, z);
      tag(B, '1545', R.x, R.y - 9 * s, 20, { align: 'left', ph: 'note', at: [0, 0.2] });
      B.fn(function (c, u) {
        c.save(); c.globalAlpha *= u; c.translate(P[0], P[1]); c.rotate(0.25);
        moth(c, 0, 0, z, '#5b4a32');
        c.rotate(-0.45); c.fillStyle = 'rgba(232,222,186,0.62)'; c.fillRect(-z * 1.1, -z * 0.3, z * 2.2, z * 0.6);
        c.restore();
      }, { ph: 'note', at: [0.8, 1.15] });
    }
  });

  def('curie', {
    name: 'Curie', who: 'Marie Curie', field: 'science', year: 1898,
    about: 'Lab notebooks from the radium years: a careful hand, and every line keeps a faint blue-green glow.',
    pen: 'glow', w: 2.1, ink: '#26313f', accent: '#2f8f7f', font: { f: "'Nothing You Could Do', cursive" }, size: 24, leading: 1.4,
    hand: { wob: 0.6, over: 0.3, bend: 0.15 }, hl: 'rgba(110,235,205,0.3)',
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R;
      tag(B, 'Ra', R.x + R.w + 14 * s, R.y + 6 * s, 15, { col: B.K.accent, F: { f: SERIF_FELL, i: true }, ph: 'note', at: [0.7, 1] });
    }
  });

  def('merian', {
    name: 'Merian', who: 'Maria Sibylla Merian', field: 'science', year: 1705,
    about: 'Metamorphosis of the insects of Surinam: watercolor washes, and arrows that pass from egg to caterpillar to chrysalis to wing.',
    pen: 'ink', w: 1.8, ink: '#3b4a2a', accent: '#7aa35a', font: { f: SERIF_FELL, i: true }, size: 26, hand: { wob: 0.6, over: 0.3, bend: 0.28 },
    hl: 'rgba(122,163,90,0.3)', third: '#d98b4a',
    marks: {
      circle: function (B) {
        var E = B.ellipse(), f = wave(B.r);
        B.fill(ellipseP(E.cx, E.cy, E.rx, E.ry, 0, TAU, 0, 64, function (a) { return 1 + 0.06 * f(a * 2); }), { col: 'rgba(122,163,90,0.18)', rev: 'fade', len: E.rx, comp: 'multiply' });
        MARKS.circle(B);
      }
    },
    noteDeco: function (B, A) {
      var s = B.s;
      if (A.shaft && A.shaft.pts && A.shaft.pts.length > 4) {
        var p = A.shaft.pts, cl = cum(p), L = cl[cl.length - 1];
        var g = function (u) { var q = at(p, cl, L * u); return [q[0] - Math.sin(q[2]) * 11 * s, q[1] + Math.cos(q[2]) * 11 * s, q[2]]; };
        var egg = g(0.78), lar = g(0.52), pup = g(0.27);
        B.fn(function (c, u) {
          c.strokeStyle = B.K.ink; c.lineWidth = 0.9 * s;
          if (u > 0) { c.fillStyle = '#efe6c8'; c.beginPath(); c.ellipse(egg[0], egg[1], 3 * s, 4 * s, egg[2], 0, TAU); c.fill(); c.stroke(); }
          if (u > 0.33) { c.fillStyle = B.K.accent; for (var i = 0; i < 5; i++) dot(c, lar[0] + Math.cos(lar[2]) * (i - 2) * 4.2 * s, lar[1] + Math.sin(lar[2]) * (i - 2) * 4.2 * s, (i === 4 ? 3 : 2.6) * s); }
          if (u > 0.66) { c.fillStyle = '#b59a5a'; c.beginPath(); c.ellipse(pup[0], pup[1], 8 * s, 3.6 * s, pup[2], 0, TAU); c.fill(); c.stroke(); }
        }, { len: 30 * s });
      }
      if (!A.R) return;
      var z = 13 * s, P = besideNote(B, A, z);
      B.fn(function (c, u) {
        c.save(); c.translate(P[0], P[1]); c.scale(outBack(u), outBack(u)); c.strokeStyle = B.K.ink; c.lineWidth = 0.9 * s;
        [[-1, -1, B.st.third], [1, -1, B.st.third], [-1, 1, B.K.accent], [1, 1, B.K.accent]].forEach(function (q) {
          c.fillStyle = q[2]; c.beginPath(); c.ellipse(q[0] * z * 0.55, q[1] * z * (q[1] < 0 ? 0.42 : 0.38), z * (q[1] < 0 ? 0.6 : 0.42), z * 0.36, q[0] * q[1] * 0.6, 0, TAU); c.fill(); c.stroke();
        });
        c.fillStyle = B.K.ink; c.beginPath(); c.ellipse(0, 0, 1.6 * s, z * 0.55, 0, 0, TAU); c.fill();
        c.restore();
      }, { ph: 'note', at: [0.7, 1.1] });
    }
  });

  def('franklin', {
    name: 'Franklin', who: 'Rosalind Franklin', field: 'science', year: 1952,
    about: 'Photo 51 on X-ray film: highlights come out as the X of a helix, notes get a measured scale bar.',
    pen: 'pencil', w: 2.2, ink: '#ece8dc', accent: '#a9c4d9', ground: 'dark', paper: '#24272c', font: { f: "'Patrick Hand', cursive" }, size: 27,
    hand: { wob: 0.4, over: 0.2, bend: 0.12 }, hl: 'rgba(169,196,217,0.3)',
    marks: {
      highlight: function (B) {
        var b = B.b, s = B.s, cx = b.x + b.w / 2, cy = b.y + b.h / 2, hh = b.h / 2 + 6 * s, hw = Math.min(b.w / 2 + 6 * s, hh * 1.6), n = 9;
        B.fn(function (c, u) {
          c.save(); c.globalCompositeOperation = 'screen'; c.fillStyle = 'rgba(214,226,236,0.5)';
          var shown = Math.ceil(n * u);
          for (var i = 0; i < shown; i++) {
            var v = (i / (n - 1)) * 2 - 1, y = cy + v * hh, x = Math.abs(v) * hw, l = (5 + 4 * (1 - Math.abs(v))) * s;
            if (i === (n - 1) / 2) { c.fillRect(cx - l, y - 1.4 * s, 2 * l, 2.8 * s); continue; }
            c.fillRect(cx - x - l, y - 1.4 * s, 2 * l, 2.8 * s); c.fillRect(cx + x - l, y - 1.4 * s, 2 * l, 2.8 * s);
          }
          c.restore();
        }, { len: b.w });
        B.edge = function (T) { return rectEdge(b, 8 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, x0 = R.x, y = R.y + R.h + 9 * s, w = Math.min(R.w, 70 * s);
      B.fn(function (c, u) {
        c.strokeStyle = B.K.accent; c.lineWidth = 1.1 * s; c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + w * u, y);
        for (var k = 0; k <= 4; k++) if (k / 4 <= u) { c.moveTo(x0 + w * k / 4, y - (k % 4 ? 3 : 5) * s); c.lineTo(x0 + w * k / 4, y + (k % 4 ? 3 : 5) * s); }
        c.stroke();
        if (u >= 1) { c.fillStyle = B.K.accent; c.font = fontStr(B.F, 14 * s); c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('3.4 Å', x0 + w + 6 * s, y); }
      }, { ph: 'note', at: [0.5, 1] });
    }
  });

  function check(B, x, y, z, o) {
    var s = B.s;
    B.stroke(B.hand([[x - z * 0.5, y - z * 0.05], [x - z * 0.15, y + z * 0.35], [x + z * 0.6, y - z * 0.55]], 0.1), o || { w: 2.2 });
  }
  def('johnson', {
    name: 'Johnson', who: 'Katherine Johnson', field: 'science', year: 1962,
    about: 'Hand-checked orbits: circles drawn as a tilted orbit with a capsule riding it, and a check mark once the numbers hold.',
    pen: 'pencil', w: 2.3, ink: '#22311f', accent: '#2f6a4a', paper: '#f2f5ee', font: { f: "'Patrick Hand', cursive" }, size: 28, hand: { wob: 0.5, over: 0.3, bend: 0.18 },
    marks: {
      circle: function (B) {
        var E = B.ellipse(), s = B.s, tilt = -0.12; B.E = E;
        var rx = E.rx * 1.05, ry = E.ry * 1.05;
        B.stroke(ellipseP(E.cx, E.cy, rx, ry, -PI * 0.2, -TAU * 1.04, tilt));
        B.fn(function (c, u, post) {
          if (post === undefined) return;
          var a = -PI * 0.2 - post * 0.9, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
          c.fillStyle = B.K.accent; dot(c, E.cx + x * Math.cos(tilt) - y * Math.sin(tilt), E.cy + x * Math.sin(tilt) + y * Math.cos(tilt), 3.4 * s);
        }, { ph: 'deco', at: [1, 1.05] });
        check(B, E.cx + rx * 0.92, E.cy - ry * 0.95, 16 * s);
        B.edge = function (T) { return ellEdge({ cx: E.cx, cy: E.cy, rx: rx, ry: ry }, 5 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, x = R.x + R.w + 16 * s;
      if (x + 12 * s > B.W) x = R.x - 16 * s;
      B.stroke(B.hand([[x - 8 * s, R.y + 10 * s], [x - 2 * s, R.y + 17 * s], [x + 10 * s, R.y + 2 * s]], 0.1), { w: 2.4, col: B.K.accent, ph: 'note', at: [0.85, 1.1] });
    }
  });

  def('ramanujan', {
    name: 'Ramanujan', who: 'Srinivasa Ramanujan', field: 'science', year: 1913,
    about: 'The notebooks: results stated without proof, each with its entry number, boxes ruled twice, a sigma riding the underline.',
    pen: 'ink', w: 2, ink: '#1f3355', accent: '#2f6f5f', font: { f: "'Kalam', cursive" }, size: 25, hand: { wob: 0.5, over: 0.3, bend: 0.15 },
    marks: {
      box: function (B) {
        MARKS.box(B);
        var b = B.b, s = B.s, p = 12 * s;
        B.stroke(B.hand(rectP(b.x - p, b.y - p, b.w + 2 * p, b.h + 2 * p), 0.3), { w: 1.3 });
        B.edge = function (T) { return rectEdge(b, p + 5 * s, T); };
      },
      underline: function (B) {
        MARKS.underline(B);
        var b = B.b, s = B.s;
        tag(B, '∑', b.x - 14 * s, b.y + b.h + 4 * s, 26, { F: { f: SERIF_FELL } });
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, x = R.x - 8 * s;
      if (x - 30 * s < 0) x = R.x + R.w + 36 * s;
      tag(B, '(7)', x, R.y + A.lh * 0.5, 17, { align: 'right', col: B.K.accent, ph: 'note', at: [0, 0.2] });
    }
  });

  def('alhaytham', {
    name: 'Ibn al-Haytham', who: 'Ibn al-Haytham', field: 'science', year: 1021,
    about: 'Book of Optics: compass circles, straight rays that fan from the eye to the edges, every point lettered alif, ba, jim, dal.',
    pen: 'nib', w: 1.7, ink: '#2a1d12', accent: '#a3342a', font: { f: "'Amiri', Georgia, serif" }, size: 27, geo: true, hand: { wob: 0.15, over: 0, bend: 0 },
    head: 'tri', headCol: '#a3342a', headSize: 11,
    marks: {
      circle: function (B) {
        var E = B.ellipse(), s = B.s; B.E = E;
        B.stroke(ellipseP(E.cx, E.cy, E.rx, E.ry, -PI / 2, -TAU, 0));
        B.fn(function (c, u) { c.fillStyle = B.K.accent; dot(c, E.cx, E.cy - E.ry, 2.4 * s * u); }, { len: 6 * s });
        B.edge = function (T) { return ellEdge(E, 5 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.tail) return;
      var s = B.s, b = B.b, t = A.tail, F = { f: "'Amiri', serif" };
      var corners = [[b.x, b.y], [b.x + b.w, b.y + b.h]];
      if (Math.abs(A.D[1]) > 0) corners = [[b.x, b.y + (A.D[1] > 0 ? b.h : 0)], [b.x + b.w, b.y + (A.D[1] > 0 ? b.h : 0)]];
      else corners = [[b.x + (A.D[0] > 0 ? b.w : 0), b.y], [b.x + (A.D[0] > 0 ? b.w : 0), b.y + b.h]];
      corners.forEach(function (q) { B.stroke(lineP(t, q), { pen: 'rule', w: 1, col: alpha(B.K.ink, 0.6) }); });
      tag(B, 'ا', t[0] - A.D[0] * 12 * s, t[1] - A.D[1] * 12 * s - (A.D[1] ? 0 : 10 * s), 18, { F: F, col: B.K.accent });
      tag(B, 'ج', corners[0][0] - 9 * s, corners[0][1] - 8 * s, 17, { F: F, col: B.K.accent });
      tag(B, 'د', corners[1][0] + 9 * s, corners[1][1] + 10 * s, 17, { F: F, col: B.K.accent });
      tag(B, 'ب', A.tip[0] + A.D[0] * 10 * s + (A.D[1] ? 12 * s : 0), A.tip[1] + A.D[1] * 10 * s - (A.D[1] ? 0 : 10 * s), 17, { F: F, col: B.K.accent });
    }
  });

  function star(c, x, y, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) { var a = -PI / 2 + i * PI / 5, k = i % 2 ? 0.42 : 1; c.lineTo(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k); }
    c.closePath(); c.fill();
  }
  def('banneker', {
    name: 'Banneker', who: 'Benjamin Banneker', field: 'science', year: 1792,
    about: 'Almanac astronomy: rings set with stars like a sky chart, doubled rules, and a crescent moon beside each note.',
    pen: 'nib', w: 2, ink: '#2a2418', accent: '#7a5a1a', font: { f: SERIF_FELL, i: true }, size: 26, double: true, hand: { wob: 0.4, over: 0.25, bend: 0.2 },
    hl: 'rgba(122,90,26,0.2)',
    marks: {
      circle: function (B) {
        MARKS.circle(B);
        var E = B.E, s = B.s, pts = [-0.6, 0.9, 2.2, 3.6];
        B.fn(function (c, u) {
          c.fillStyle = B.K.accent;
          pts.forEach(function (a, i) { if (i / pts.length < u) star(c, E.cx + Math.cos(a) * E.rx, E.cy + Math.sin(a) * E.ry, (i % 2 ? 4 : 6) * s); });
        }, { ph: 'deco', at: [1, 1.3] });
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, z = 13 * s, P = besideNote(B, A, z);
      B.fn(function (c, u) {
        c.save(); c.globalAlpha *= u; c.fillStyle = B.K.accent;
        c.beginPath(); c.arc(P[0], P[1], z, PI * 0.35, PI * 1.65); c.arc(P[0] + z * 0.45, P[1], z * 0.82, PI * 1.62, PI * 0.38, true); c.closePath(); c.fill();
        star(c, P[0] + z * 1.1, P[1] - z * 0.9, 3 * s); star(c, P[0] + z * 1.6, P[1] + z * 0.2, 2.2 * s);
        c.restore();
      }, { ph: 'note', at: [0.6, 1] });
    }
  });

  // ---- v1.2 art
  def('afklint', {
    name: 'af Klint', who: 'Hilma af Klint', field: 'art', year: 1907,
    about: 'Paintings for the Temple: two overlapping rings in blue and yellow, pastel washes, and a snail spiral where each arrow starts.',
    pen: 'ink', w: 2.4, ink: '#3a3361', accent: '#e8a4b8', paper: '#f0e6d2', font: { f: "'Cormorant Garamond', Georgia, serif", i: true, wt: 600 }, size: 28,
    hand: { wob: 0.3, over: 0.1, bend: 0.3 }, third: '#f2c76b', hl: 'rgba(232,164,184,0.45)',
    marks: {
      circle: function (B) {
        var E = B.ellipse(), s = B.s, d = Math.min(E.rx * 0.18, 30 * s); B.E = E;
        B.fill(ellipseP(E.cx - d, E.cy, E.rx, E.ry, 0, TAU, 0, 60), { col: 'rgba(110,150,210,0.22)', rev: 'grow', cx: E.cx - d, cy: E.cy, len: E.rx, comp: 'multiply' });
        B.fill(ellipseP(E.cx + d, E.cy, E.rx, E.ry, 0, TAU, 0, 60), { col: 'rgba(242,199,107,0.3)', rev: 'grow', cx: E.cx + d, cy: E.cy, len: E.rx, comp: 'multiply' });
        B.stroke(ellipseP(E.cx - d, E.cy, E.rx, E.ry, -PI / 2, -TAU, 0), { w: 1.8, col: '#4a6fb0' });
        B.stroke(ellipseP(E.cx + d, E.cy, E.rx, E.ry, -PI / 2, TAU, 0), { w: 1.8, col: '#c9932a' });
        B.edge = function (T) { return ellEdge({ cx: E.cx, cy: E.cy, rx: E.rx + d, ry: E.ry }, 5 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = 13 * s, P = besideNote(B, A, R), cx = P[0], cy = P[1];
      B.stroke(ellipseP(cx, cy, R, R, -PI / 2, TAU * 2.2, 0, 70, function (a, u) { return 1 - 0.92 * u; }), { w: 1.6, col: B.K.ink });
    }
  });

  def('kusama', {
    name: 'Kusama', who: 'Yayoi Kusama', field: 'art', year: 1965,
    about: 'Infinity nets: every line is made of dots, and more dots keep spreading around whatever she marks.',
    pen: 'polka', w: 7, ink: '#141414', accent: '#d7261e', paper: '#f6d31f', font: { f: "'Jost', 'Futura', sans-serif", wt: 700 }, size: 23, caps: true,
    hand: { wob: 0.6, over: 0.3, bend: 0.25 },
    marks: {
      highlight: function (B) {
        var b = B.b, s = B.s, r = B.r, x = b.x - 5 * s, y = b.y - 4 * s, w = b.w + 10 * s, h = b.h + 8 * s, g = 9 * s, P = [];
        for (var yy = y + g / 2, row = 0; yy < y + h; yy += g, row++) for (var xx = x + g / 2 + (row % 2) * g / 2; xx < x + w; xx += g) P.push([xx, yy, g * (0.18 + 0.2 * r())]);
        B.fn(function (c, u) { c.fillStyle = B.K.accent; c.globalAlpha *= 0.85; P.forEach(function (q) { if (q[0] < x + w * u) dot(c, q[0], q[1], q[2]); }); }, { len: w });
        B.edge = function (T) { return rectEdge(b, 8 * s, T); };
      }
    },
    after: function (B) {
      var mk = B.m.mark; if (mk === 'connect' || mk === 'highlight') return;
      var b = B.b, s = B.s, r = B.r, P = [], n = 14;
      for (var i = 0; i < n; i++) {
        var a = r() * TAU, d = 1.15 + r() * 0.3, rx = b.w / 2 + 14 * s, ry = b.h / 2 + 12 * s;
        P.push([b.x + b.w / 2 + Math.cos(a) * rx * d, b.y + b.h / 2 + Math.sin(a) * ry * d, (1.2 + r() * 2.2) * s, r()]);
      }
      B.fn(function (c, u, post) {
        var g = Math.min(1, u + (post || 0) * 0.25);
        c.fillStyle = B.K.accent; P.forEach(function (q) { if (q[3] < g) dot(c, q[0], q[1], q[2] * outBack(clamp((g - q[3]) * 4, 0, 1))); });
      }, { ph: 'deco', at: [1, 1.5] });
    }
  });

  def('kahlo', {
    name: 'Kahlo', who: 'Frida Kahlo', field: 'art', year: 1931,
    about: 'Painted ribbons that carry the words, flowers crowning every circle, deep green leaf ink with red and marigold.',
    pen: 'ink', w: 2.6, ink: '#2d5a3d', accent: '#c8323f', font: { f: "'Caveat Brush', cursive" }, size: 30, hand: { wob: 0.5, over: 0.3, bend: 0.25 },
    third: '#f2a93b', hl: 'rgba(200,50,63,0.25)', textCol: '#2a2420',
    marks: {
      circle: function (B) {
        MARKS.circle(B);
        var E = B.E, s = B.s, at3 = [-PI / 2 - 0.55, -PI / 2, -PI / 2 + 0.55];
        B.fn(function (c, u) {
          at3.forEach(function (a, i) {
            var g = outBack(clamp(u * 3 - i, 0, 1)); if (g <= 0) return;
            var x = E.cx + Math.cos(a) * E.rx, y = E.cy + Math.sin(a) * E.ry, z = (i === 1 ? 9 : 7) * s * g;
            c.fillStyle = i === 1 ? B.K.accent : B.st.third;
            for (var k = 0; k < 5; k++) { var b2 = k * TAU / 5 - PI / 2; c.beginPath(); c.ellipse(x + Math.cos(b2) * z * 0.62, y + Math.sin(b2) * z * 0.62, z * 0.5, z * 0.32, b2, 0, TAU); c.fill(); }
            c.fillStyle = '#5a3a1a'; dot(c, x, y, z * 0.28);
          });
        }, { ph: 'deco', at: [1, 1.4] });
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, Q = noteBox(B, A, 3 * s), f = 12 * s;
      var poly = [[Q.x, Q.y], [Q.x + Q.w, Q.y], [Q.x + Q.w + f, Q.y - 3 * s], [Q.x + Q.w + f * 0.45, Q.y + Q.h / 2], [Q.x + Q.w + f, Q.y + Q.h + 3 * s],
        [Q.x + Q.w, Q.y + Q.h], [Q.x, Q.y + Q.h], [Q.x - f, Q.y + Q.h + 3 * s], [Q.x - f * 0.45, Q.y + Q.h / 2], [Q.x - f, Q.y - 3 * s], [Q.x, Q.y]];
      underText(B, B.fill(poly, { col: '#f6dccf', rev: 'wipe', dir: 'right', ph: 'note', at: [0, 0.3], stroke: B.K.accent, strokeW: 1.4 * s }));
    }
  });

  function crown(B, x, y, z) {
    var p = [[x, y], [x + z * 0.1, y - z * 0.7], [x + z * 0.32, y - z * 0.25], [x + z * 0.5, y - z * 0.85], [x + z * 0.68, y - z * 0.25], [x + z * 0.9, y - z * 0.7], [x + z, y], [x, y]];
    B.stroke(B.hand(resample(p, 3 * B.s), 0.25), { w: 3.2, col: B.st.third });
    B.fn(function (c, u) { c.fillStyle = B.st.third; [[0.1, -0.7], [0.5, -0.85], [0.9, -0.7]].forEach(function (q) { dot(c, x + q[0] * z, y + q[1] * z - 3 * B.s, 2.6 * B.s * u); }); }, { len: 8 * B.s });
  }
  def('basquiat', {
    name: 'Basquiat', who: 'Jean-Michel Basquiat', field: 'art', year: 1982,
    about: 'Oilstick on canvas: a three-point crown over what matters, words crossed out so you read them harder, a copyright mark on the note.',
    pen: 'crayon', w: 5, ink: '#141414', accent: '#c8102e', font: { f: "'Permanent Marker', cursive" }, size: 25, caps: true,
    hand: { wob: 1, over: 0.6, bend: 0.25 }, third: '#e8b21a', hl: 'rgba(232,178,26,0.45)',
    marks: {
      strike: function (B) {
        var b = B.b, s = B.s;
        [0.42, 0.62].forEach(function (k, i) { B.stroke(B.hand(lineP([b.x - 6 * s, b.y + b.h * k + (i ? 2 : -2) * s], [b.x + b.w + 6 * s, b.y + b.h * k + (i ? -3 : 2) * s]), 0.5)); });
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    after: function (B) {
      var mk = B.m.mark; if (mk !== 'circle' && mk !== 'box') return;
      var b = B.b, s = B.s, z = Math.min(40 * s, Math.max(24 * s, b.h * 0.8)), top = B.E ? B.E.cy - B.E.ry : b.y - 6 * s;
      crown(B, b.x + b.w * 0.5 - z / 2, top - 5 * s, z);
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, c = B.c, last = A.lines[A.lines.length - 1];
      c.save(); c.font = fontStr(B.F, A.px); var w = c.measureText(last).width; c.restore();
      var x = A.R.x + w + 14 * s, y = A.R.y + A.lh * (A.lines.length - 0.5);
      tag(B, '©', x, y, 22, { col: B.K.accent, ph: 'note', at: [0.9, 1.1] });
    }
  });

  def('ringgold', {
    name: 'Ringgold', who: 'Faith Ringgold', field: 'art', year: 1988,
    about: 'Story quilts: boxes and rings get a pieced border of bright squares, lines run in a stitch, notes sit on a strip of cloth.',
    pen: 'running', w: 3, ink: '#2a2a5a', accent: '#d9643a', font: { f: "'Gochi Hand', cursive" }, size: 28, hand: { wob: 0.5, over: 0.3, bend: 0.2 },
    noteBg: '#f6eedd', hl: 'rgba(217,100,58,0.3)', pal: ['#d9643a', '#2f7f6f', '#f2c14e', '#3a5a9a', '#b8336a'],
    marks: {
      box: function (B) { quilt(B); },
      circle: function (B) { quilt(B); }
    }
  });
  function quilt(B) {
    var b = B.b, s = B.s, z = Math.max(6 * s, Math.min(12 * s, b.h * 0.24)), p = 4 * s, x0 = b.x - p - z, y0 = b.y - p - z, x1 = b.x + b.w + p, y1 = b.y + b.h + p;
    var nx = Math.max(2, Math.round((x1 - x0) / z)), ny = Math.max(2, Math.round((y1 - y0) / z)), zx = (x1 - x0) / nx, zy = (y1 - y0) / ny, pal = B.st.pal, sq = [];
    for (var i = 0; i < nx; i++) sq.push([x0 + i * zx, y0, zx, z]);
    for (i = 0; i < ny; i++) sq.push([x1, y0 + i * zy, z, zy]);
    for (i = nx; i > 0; i--) sq.push([x0 + i * zx, y1, zx, z]);
    for (i = ny; i > 0; i--) sq.push([x0, y0 + i * zy, z, zy]);
    var tot = sq.length;
    B.fn(function (c, u) {
      var shown = Math.floor(tot * u + 1e-6);
      for (var j = 0; j < shown; j++) { var q = sq[j]; c.fillStyle = pal[j % pal.length]; c.fillRect(q[0] + 0.8 * s, q[1] + 0.8 * s, q[2] - 1.6 * s, q[3] - 1.6 * s); }
    }, { len: (x1 - x0 + y1 - y0) * 1.2 });
    B.stroke(rectP(x0 + z * 0.5, y0 + z * 0.5, x1 - x0, y1 - y0), { w: 1.6, col: B.K.ink, with: true });
    B.edge = function (T) { return rectEdge(b, p + z + 4 * s, T); };
  }

  def('lawrence', {
    name: 'Lawrence', who: 'Jacob Lawrence', field: 'art', year: 1941,
    about: 'The Migration Series: flat angular shapes in ochre and black, and every note is a numbered caption.',
    pen: 'cut', w: 5, ink: '#1a1a1a', accent: '#c8742b', font: { f: "'Jost', 'Futura', sans-serif", wt: 500 }, size: 22, hand: { wob: 0.5, over: 0.3, bend: 0.2 },
    third: '#2e5c8a', hl: 'rgba(200,116,43,0.45)',
    marks: {
      circle: function (B) {
        var E = B.ellipse(), r = B.r, s = B.s, n = 6, pts = []; B.E = E;
        for (var i = 0; i <= n; i++) { var a = -PI * 0.2 - i * TAU / n + (i % n ? (r() - 0.5) * 0.3 : 0), k = i % n ? 1.06 + (r() - 0.5) * 0.12 : 1.06; pts.push([E.cx + Math.cos(a) * E.rx * k, E.cy + Math.sin(a) * E.ry * k]); }
        pts[n] = pts[0];
        B.fill(pts, { col: alpha(B.K.accent, 0.4), rev: 'grow', cx: E.cx, cy: E.cy, len: E.rx, comp: 'multiply' });
        B.stroke(resample(pts, 3 * s));
        B.edge = function (T) { return ellEdge({ cx: E.cx, cy: E.cy, rx: E.rx * 1.12, ry: E.ry * 1.12 }, 4 * s, T); };
      },
      highlight: function (B) {
        var b = B.b, s = B.s;
        B.fill([[b.x - 8 * s, b.y + b.h * 0.1], [b.x + b.w + 4 * s, b.y - 4 * s], [b.x + b.w + 8 * s, b.y + b.h * 0.85], [b.x - 3 * s, b.y + b.h + 4 * s]], { col: B.K.hl, rev: 'wipe', dir: 'right', len: b.w, comp: 'multiply' });
        B.edge = function (T) { return rectEdge(b, 8 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, x = R.x - 10 * s, y = R.y + A.lh * 0.5;
      if (x - 20 * s < 0) { x = R.x; y = R.y - 12 * s; }
      tag(B, '1.', x, y, 22, { align: x === R.x ? 'left' : 'right', F: { f: "'Jost', sans-serif", wt: 700 }, ph: 'note', at: [0, 0.15] });
    }
  });

  // ---- v1.2 history
  def('hildegard', {
    name: 'Hildegard', who: 'Hildegard of Bingen', field: 'history', year: 1151,
    about: 'Scivias visions: rings of gold laid over ink, red tongues of flame around them, gilded strokes under the words.',
    pen: 'nib', w: 2.3, ink: '#2a1f3d', accent: '#c9a227', font: { f: "'Uncial Antiqua', serif" }, size: 22, hand: { wob: 0.4, over: 0.2, bend: 0.18 },
    third: '#b3261e', hl: 'rgba(201,162,39,0.35)',
    marks: {
      circle: function (B) {
        var E = B.ellipse(), s = B.s, n = 16; B.E = E;
        B.stroke(ellipseP(E.cx, E.cy, E.rx + 4 * s, E.ry + 4 * s, -PI / 2, -TAU, 0), { pen: 'marker', w: 6, col: B.K.accent });
        B.stroke(ellipseP(E.cx, E.cy, E.rx, E.ry, -PI / 2, -TAU, 0), { w: 1.4, with: true });
        B.stroke(ellipseP(E.cx, E.cy, E.rx + 8 * s, E.ry + 8 * s, -PI / 2, -TAU, 0), { w: 1.4, with: true });
        B.fn(function (c, u, post) {
          c.fillStyle = B.st.third; var shown = Math.floor(n * u), fl = 1 + 0.15 * Math.sin((post || 0) * 5);
          for (var i = 0; i < shown; i++) {
            var a = -PI / 2 + i * TAU / n, ca = Math.cos(a), sa = Math.sin(a), bx = E.cx + ca * (E.rx + 10 * s), by = E.cy + sa * (E.ry + 10 * s), l = (10 + 4 * (i % 2)) * s * (i % 2 ? fl : 2 - fl), w = 3.5 * s;
            c.beginPath(); c.moveTo(bx - sa * w, by + ca * w); c.quadraticCurveTo(bx + ca * l * 0.6 + sa * w, by + sa * l * 0.6 - ca * w, bx + ca * l, by + sa * l); c.quadraticCurveTo(bx + ca * l * 0.4 - sa * w, by + sa * l * 0.4 + ca * w, bx + sa * w, by - ca * w); c.closePath(); c.fill();
          }
        }, { ph: 'deco', at: [1, 1.5] });
        B.edge = function (T) { return ellEdge({ cx: E.cx, cy: E.cy, rx: E.rx + 22 * s, ry: E.ry + 22 * s }, 3 * s, T); };
      },
      underline: function (B) { MARKS.underline(B); var it = B.items[B.items.length - 1]; it.col = B.K.accent; it.pen = 'marker'; it.w = 4 * B.s; }
    }
  });

  function gearP(cx, cy, rx, ry, n, depth, ph) {
    var p = [], m = n * 4;
    for (var i = 0; i <= m; i++) { var a = ph + i * TAU / m, k = (i % 4 === 1 || i % 4 === 2) ? 1 + depth : 1; p.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
    return p;
  }
  def('aljazari', {
    name: 'al-Jazari', who: 'Ismail al-Jazari', field: 'history', year: 1206,
    about: 'The Book of Ingenious Devices: rings cut with gear teeth that keep turning, a small cog driving each arrow, water blue and red.',
    pen: 'ink', w: 2.2, ink: '#2b1d10', accent: '#2f6f8f', paper: '#efe2c4', font: { f: "'Amiri', Georgia, serif" }, size: 27, hand: { wob: 0.25, over: 0.1, bend: 0.2 },
    third: '#b0402a', hl: 'rgba(47,111,143,0.25)', head: 'tri', headCol: '#b0402a',
    marks: {
      circle: function (B) {
        var E = B.ellipse(), s = B.s, n = Math.max(14, Math.round((E.rx + E.ry) / (9 * s))), dep = 7 * s / Math.max(E.rx, E.ry); B.E = E;
        B.stroke(ellipseP(E.cx, E.cy, E.rx, E.ry, -PI / 2, -TAU, 0), { w: 1.4 });
        B.fn(function (c, u, post) {
          var p = gearP(E.cx, E.cy, E.rx, E.ry, n, dep, -PI / 2 + (post || 0) * 0.18), m = Math.floor((p.length - 1) * u);
          c.strokeStyle = B.K.ink; c.lineWidth = 1.8 * s; c.lineJoin = 'round'; c.beginPath(); c.moveTo(p[0][0], p[0][1]);
          for (var i = 1; i <= m; i++) c.lineTo(p[i][0], p[i][1]);
          c.stroke();
        }, { len: E.rx * 3 });
        B.edge = function (T) { return ellEdge({ cx: E.cx, cy: E.cy, rx: E.rx * (1 + dep), ry: E.ry * (1 + dep) }, 5 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.tail) return;
      var s = B.s, t = A.tail, R = 10 * s, a = A.shaft ? A.shaft.ang : 0, cx = t[0] - Math.sin(a) * R * 1.7 + Math.cos(a) * R * 0.6, cy = t[1] + Math.cos(a) * R * 1.7 + Math.sin(a) * R * 0.6;
      B.fn(function (c, u, post) {
        var g = outBack(u), p = gearP(cx, cy, R * g, R * g, 8, 0.32, -(post || 0) * 0.9);
        c.strokeStyle = B.st.third; c.fillStyle = alpha(B.st.third, 0.15); c.lineWidth = 1.5 * s; path(c, p); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = B.st.third; dot(c, cx, cy, 2 * s * g);
      }, { len: 20 * s });
    }
  });

  function seal(B, x, y, w, h, at, rot) {
    var s = B.s, r = rng(B.m.seed * 5 + Math.round(x)), L = [];
    for (var i = 0; i < 5; i++) L.push([r(), r(), r() < 0.5]);
    B.fn(function (c, u) {
      if (u <= 0) return;
      var k = 1 + 0.35 * (1 - outCubic(u));
      c.save(); c.translate(x, y); c.rotate(rot || 0); c.scale(k, k); c.globalAlpha *= 0.88 * Math.min(1, u * 2);
      c.strokeStyle = B.K.accent; c.fillStyle = B.K.accent; c.lineWidth = 2.4 * s; c.strokeRect(-w / 2, -h / 2, w, h);
      c.lineWidth = 2 * s; c.lineCap = 'square';
      for (var i = 0; i < L.length; i++) {
        var q = L[i], col = i < 3 ? -w * 0.22 : w * 0.22, yy = -h / 2 + h * (0.2 + 0.6 * ((i % 3) / 2));
        c.beginPath();
        if (q[2]) { c.moveTo(col - w * 0.15, yy); c.lineTo(col + w * 0.15, yy); c.moveTo(col, yy - h * 0.08); c.lineTo(col, yy + h * 0.12); }
        else { c.moveTo(col - w * 0.14, yy - h * 0.08); c.lineTo(col + w * 0.14, yy - h * 0.08); c.lineTo(col + w * 0.14, yy + h * 0.1); c.moveTo(col - w * 0.14, yy + h * 0.02); c.lineTo(col + w * 0.06, yy + h * 0.02); }
        c.stroke();
      }
      c.restore();
    }, { ph: 'deco', at: at });
  }
  def('seals', {
    name: 'Collector Seals', who: 'Chinese scroll collectors', field: 'history', year: 1750,
    about: 'Owners’ marks on old scrolls: brush ink in black, and a red seal stamped beside everything worth keeping.',
    pen: 'brush', w: 4.4, ink: '#1a1a1a', accent: '#b8231c', font: { f: "'Caveat Brush', cursive" }, size: 28, hand: { wob: 0.5, over: 0.3, bend: 0.25 },
    hl: 'rgba(184,35,28,0.2)',
    after: function (B) {
      if (B.m.mark !== 'circle' && B.m.mark !== 'box') return;
      var b = B.b, s = B.s, z = 20 * s, x = B.E ? B.E.cx + B.E.rx * 0.8 + z * 0.4 : b.x + b.w + z * 0.9, y = B.E ? B.E.cy + B.E.ry * 0.7 + z * 0.3 : b.y + b.h + z * 0.4;
      seal(B, Math.min(x, B.W - z), Math.min(y, B.H - z), z, z, [1.05, 1.3], 0.04);
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, P = besideNote(B, A, 16 * s);
      seal(B, P[0], P[1], 18 * s, 30 * s, [1.3, 1.55], -0.03);
    }
  });

  function mayaNumber(B, x, y, n, z, at) {
    var bars = Math.floor(n / 5), dots = n % 5, s = B.s;
    B.fn(function (c, u) {
      c.save(); c.globalAlpha *= u; c.fillStyle = B.K.ink;
      for (var i = 0; i < bars; i++) { var yy = y + z * 0.3 + i * z * 0.42; c.fillRect(x - z * 0.7, yy, z * 1.4, z * 0.26); }
      for (var j = 0; j < dots; j++) dot(c, x + (j - (dots - 1) / 2) * z * 0.42, y, z * 0.15);
      c.restore();
    }, { ph: 'note', at: at });
  }
  def('maya', {
    name: 'Maya', who: 'Maya scribes', field: 'history', year: 1200,
    about: 'A folding bark-paper codex: rings drawn as rounded glyph blocks in red, Maya blue washes, a bar-and-dot number by each note.',
    pen: 'ink', w: 3, ink: '#2a1a12', accent: '#b5452b', paper: '#ecdcb9', font: { f: "'Cinzel', 'Trajan Pro', serif", wt: 600 }, size: 19, caps: true,
    hand: { wob: 0.4, over: 0.15, bend: 0.2 }, third: '#4f9aa0', hl: 'rgba(79,154,160,0.35)',
    marks: {
      circle: function (B) { glyphBlock(B); },
      box: function (B) { glyphBlock(B); }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, z = 15 * s, P = besideNote(B, A, z);
      mayaNumber(B, P[0], P[1] - z * 0.5, 13, z, [0.6, 1]);
    }
  });
  function glyphBlock(B) {
    var b = B.b, s = B.s, p = 9 * s, x = b.x - p, y = b.y - p, w = b.w + 2 * p, h = b.h + 2 * p, r = Math.min(h, w) * 0.32;
    B.fill(rrectP(x, y, w, h, r), { col: alpha(B.st.third, 0.22), rev: 'fade', len: w * 0.3, comp: 'multiply' });
    B.stroke(B.hand(resample(rrectP(x, y, w, h, r), 3 * s), 0.2), { col: B.K.accent });
    B.stroke(B.hand(resample(rrectP(x - 5 * s, y - 5 * s, w + 10 * s, h + 10 * s, r + 5 * s), 3 * s), 0.2), { w: 1.4 });
    B.edge = function (T) { return rectEdge(b, p + 9 * s, T); };
  }

  // ---- profiles: who each hand belonged to, in a few plain sentences
  var BIOS = {
    lyell: 'Charles Lyell (1797-1875) was a Scottish geologist. His Principles of Geology argued that the slow forces you can watch today, given enough time, shaped the whole Earth. Darwin read it on the Beagle.',
    darwin: 'Charles Darwin (1809-1882) was an English naturalist. In 1837 he sketched a branching tree in Notebook B under the words "I think." Twenty-two years later On the Origin of Species made the case for evolution by natural selection.',
    davinci: 'Leonardo da Vinci (1452-1519) was an Italian painter, engineer and anatomist. He filled thousands of notebook pages with machines, bodies and water, mostly in mirror writing. He was left-handed, and his hatching slopes the left-hander\'s way.',
    hooke: 'Robert Hooke (1635-1703) was an English experimenter. His Micrographia (1665) showed a flea, a fly\'s eye and cork through a microscope, and gave us the word "cell." The plates were engraved from his own drawings.',
    newton: 'Isaac Newton (1643-1727) was an English mathematician and physicist. His Principia (1687) set out the laws of motion and universal gravitation, proved with geometric diagrams where every point gets a letter.',
    galileo: 'Galileo Galilei (1564-1642) was an Italian astronomer. In 1610 his Sidereus Nuncius showed mountains on the Moon and four moons circling Jupiter, logged night by night in little star diagrams.',
    haeckel: 'Ernst Haeckel (1834-1919) was a German biologist who named thousands of species and coined the word "ecology." His Kunstformen der Natur (1899-1904) turned radiolarians and jellyfish into a hundred plates of symmetric art.',
    cajal: 'Santiago Ramón y Cajal (1852-1934) was a Spanish neuroscientist. His ink drawings showed the brain is made of separate nerve cells, and his little arrows showed which way the signal runs. He shared the 1906 Nobel Prize.',
    feynman: 'Richard Feynman (1918-1988) was an American physicist. His simple line diagrams of particles meeting and parting made quantum electrodynamics something you could draw on a blackboard. He shared the 1965 Nobel Prize.',
    nightingale: 'Florence Nightingale (1820-1910) was an English nurse and statistician. Her 1858 rose diagram showed that more soldiers in the Crimean War died of preventable disease than of wounds. She was the first woman elected to the Royal Statistical Society.',
    edison: 'Thomas Edison (1847-1931) was an American inventor who held over a thousand US patents, including the phonograph and a practical light bulb. Each patent came with formal drawings: ruled lines, lead lines and numbered parts.',
    leavitt: 'Henrietta Swan Leavitt (1868-1921) was an American astronomer, hired as a "computer" at the Harvard Observatory to study glass photographic plates. She found that a Cepheid star\'s period gives its true brightness, the yardstick later used to measure the universe.',
    anning: 'Mary Anning (1799-1847) hunted fossils on the cliffs of Lyme Regis in England. She found the first complete plesiosaur (1823) and Britain\'s first pterosaur. The Geological Society would not admit her, and men often published her finds without naming her.',
    lovelace: 'Ada Lovelace (1815-1852) was an English mathematician. In 1843 she translated a paper on Charles Babbage\'s Analytical Engine and added Notes A to G, three times its length. Note G sets out steps for the machine to compute Bernoulli numbers, often called the first computer program.',
    hopper: 'Grace Hopper (1906-1992) was an American computer scientist and a rear admiral in the US Navy. On the Harvard Mark II in 1947 her team taped a moth into the logbook as the "first actual case of bug being found." She built one of the first compilers and helped create COBOL.',
    curie: 'Marie Curie (1867-1934) was a Polish-French physicist and chemist. With Pierre Curie she discovered polonium and radium in 1898. She was the first woman to win a Nobel Prize and the only person to win in two sciences. Her notebooks are still radioactive and kept in lead-lined boxes.',
    merian: 'Maria Sibylla Merian (1647-1717) was a German naturalist and artist. At 52 she sailed to Surinam with her daughter to study insects. Her Metamorphosis (1705) painted each one through its life on its food plant, when many still thought insects grew out of mud.',
    franklin: 'Rosalind Franklin (1920-1958) was an English chemist and X-ray crystallographer. Photo 51, made in her lab in 1952, showed DNA\'s helix. It was shown to James Watson without her knowledge. She died at 37, four years before the Nobel for the double helix went to three men.',
    johnson: 'Katherine Johnson (1918-2020) was an American mathematician at NASA. She calculated the path of the first American in space, and before John Glenn\'s 1962 orbit he asked that she check the electronic computer\'s numbers by hand. She received the Presidential Medal of Freedom in 2015.',
    ramanujan: 'Srinivasa Ramanujan (1887-1920) was an Indian mathematician, largely self-taught. In 1913 he wrote to G. H. Hardy at Cambridge with pages of results and was soon working there. His notebooks hold thousands of formulas, often with no proof, and people are still proving them.',
    alhaytham: 'Ibn al-Haytham (about 965-1040) was a scholar from Basra who worked in Cairo. His Book of Optics showed that we see because light comes into the eye, not out of it, and he tested ideas with experiments. He is often called a pioneer of the scientific method.',
    banneker: 'Benjamin Banneker (1731-1806) was a free Black American astronomer and surveyor, largely self-taught. He built a wooden clock, helped survey the boundary of Washington, D.C., and published almanacs from 1792. He wrote to Thomas Jefferson arguing against slavery.',
    picasso: 'Pablo Picasso (1881-1973) was a Spanish painter and sculptor who co-founded Cubism. Later he made famous drawings in a single unbroken line, including ones drawn with light for a camera.',
    dali: 'Salvador Dalí (1904-1989) was a Spanish Surrealist. The Persistence of Memory (1931) gave the world its melting watches, with ants crawling over one. His waxed mustache was nearly as famous.',
    vangogh: 'Vincent van Gogh (1853-1890) was a Dutch painter. He painted The Starry Night in 1889 from his window at the asylum in Saint-Rémy, in thick swirling strokes. He sold very little in his lifetime.',
    matisse: 'Henri Matisse (1869-1954) was a French painter. After surgery left him mostly in a wheelchair, he cut shapes from painted paper with scissors and called it drawing with scissors.',
    mondrian: 'Piet Mondrian (1872-1944) was a Dutch painter of the De Stijl movement. He reduced painting to black lines and blocks of red, blue and yellow, as in Composition with Red, Blue and Yellow (1930).',
    kandinsky: 'Wassily Kandinsky (1866-1944) was a Russian painter and Bauhaus teacher. His book Point and Line to Plane (1926) treated points, lines and colors like notes in music.',
    pollock: 'Jackson Pollock (1912-1956) was an American painter. He laid canvases on the floor and poured, dripped and flung paint across them, most famously between 1947 and 1950.',
    hokusai: 'Katsushika Hokusai (1760-1849) was a Japanese printmaker and painter. The Great Wave off Kanagawa (about 1831) used the new Prussian blue. He signed some late work "the old man mad about painting."',
    warhol: 'Andy Warhol (1928-1987) was an American Pop artist. He silkscreened soup cans, Marilyn Monroe and dollar bills in loud color, often slightly out of register, at a studio he called the Factory.',
    haring: 'Keith Haring (1958-1990) was an American artist. He drew in white chalk on the black paper covering empty New York subway ad panels, thousands of times. He was an AIDS activist and died of AIDS-related illness at 31.',
    afklint: 'Hilma af Klint (1862-1944) was a Swedish painter. She made large abstract paintings years before Kandinsky, including The Ten Largest (1907). She asked that the work stay hidden until long after her death, and it was barely shown until the 1980s.',
    kusama: 'Yayoi Kusama (born 1929) is a Japanese artist. Polka dots and "infinity nets" have covered her paintings, rooms and pumpkins since the 1950s. Her first Infinity Mirror Room opened in 1965.',
    kahlo: 'Frida Kahlo (1907-1954) was a Mexican painter, best known for self-portraits made through years of pain after a bus accident at 18. She often painted words on ribbons and banners inside the picture.',
    basquiat: 'Jean-Michel Basquiat (1960-1988) was an American painter from Brooklyn who started out writing SAMO graffiti. His paintings are full of crowns, copyright marks and crossed-out words. He said crossing words out made you want to read them more.',
    ringgold: 'Faith Ringgold (1930-2024) was an American artist from Harlem. Her story quilts join painting, quilting and handwritten text. Tar Beach (1988), a girl flying over the city from her rooftop, became a picture book.',
    lawrence: 'Jacob Lawrence (1917-2000) was an American painter raised in Harlem. His Migration Series (1940-41) told the Great Migration of Black Americans to the North in 60 numbered panels, each with a caption.',
    lascaux: 'The Lascaux cave in southwest France holds paintings about 17,000 years old: horses, aurochs and deer in charcoal and ochre. Teenagers found it in 1940. Hand stencils like the one in this style appear in caves across Europe, and one study of their size suggests many were made by women.',
    scriptorium: 'A scriptorium was the writing room of a medieval monastery or convent, where books were copied by hand. Monks and nuns both did the work: in 2019, lapis lazuli found in a medieval woman\'s teeth showed she had been painting with the costliest blue.',
    champollion: 'Jean-François Champollion (1790-1832) was a French scholar who deciphered Egyptian hieroglyphs in 1822, starting from royal names on the Rosetta Stone. The ring around those names, the cartouche, was the Egyptian scribes\' own mark.',
    bayeux: 'The Bayeux Tapestry is a strip of embroidered linen about 70 meters long telling the Norman conquest of England in 1066. It is stitched, not woven, most likely by English women, whose names were not recorded.',
    mercator: 'Gerardus Mercator (1512-1594) was a Flemish mapmaker. His 1569 world map stretched the globe so that a constant compass course shows as a straight line, which is why sailors loved it.',
    minard: 'Charles Joseph Minard (1781-1870) was a French civil engineer. His 1869 map of Napoleon\'s march on Moscow shows the army as a band that thins from 422,000 men to about 10,000.',
    bletchley: 'Bletchley Park was Britain\'s codebreaking center in the Second World War, where Enigma and other ciphers were broken. By 1945 about three quarters of its roughly 10,000 staff were women.',
    apollo: 'Mission control in Houston ran the Apollo flights, writing on consoles and plotting boards with grease pencils. Poppy Northcutt, who worked out return paths for Apollo 8, was the first woman engineer in that room.',
    perkins: 'Maxwell Perkins (1884-1947) was an American book editor at Scribner\'s. He edited F. Scott Fitzgerald, Ernest Hemingway and Thomas Wolfe, and Gatsby (1925) went through his pencil.',
    hildegard: 'Hildegard of Bingen (1098-1179) was a German abbess, writer and composer. Her book Scivias (1151) set down her visions, and its pictures are full of gold rings and red flame. She also wrote on medicine and plants, and her music is still sung.',
    aljazari: 'Ismail al-Jazari (1136-1206) was an engineer at a court in what is now southeast Turkey. His Book of Knowledge of Ingenious Mechanical Devices (1206) drew fifty machines, from water-raising pumps to an elephant clock, with every part named.',
    seals: 'Chinese collectors stamped red seals and wrote inscriptions on the paintings and calligraphy they owned, so an old scroll carries the marks of everyone who treasured it. The Qianlong Emperor (reigned 1735-1796) stamped and inscribed a great many, some of them dozens of times.',
    maya: 'Maya scribes wrote in a script of glyph blocks on folding books of bark paper. Only four of those books survive, among them the Dresden Codex. Their bar-and-dot numbers used a sign for zero.'
  };
  Object.keys(BIOS).forEach(function (k) { if (STYLES[k]) STYLES[k].bio = BIOS[k]; });

  // ---------------------------------------------------------------- build a mark
  function skinFor(m, st) {
    var K = { ink: m.color || st.ink, accent: m.accent || st.accent || st.ink };
    K.text = m.textColor || st.textCol || K.ink;
    K.hl = m.highlightColor || st.hl || alpha(K.accent, st.ground === 'dark' ? 0.4 : 0.35);
    if (!st.hl && !m.highlightColor && luma(K.accent) < 0.2) K.hl = 'rgba(255,214,0,0.45)';
    return K;
  }
  function build(c, m, b, W, H, s, to) {
    var st = STYLES[m.style], K = skinFor(m, st), B = new Builder(c, m, b, W, H, s, st, K);
    B.F = m.font ? { f: m.font } : st.font; B.to = to;
    var mk = MARKS[m.mark] ? m.mark : 'circle';
    (st.marks && st.marks[mk] || MARKS[mk])(B);
    if (st.after) st.after(B);
    if (mk !== 'connect' && ( m.note != null && m.note !== '' || mk === 'arrow' || mk === 'note')) addNote(B);
    var items = B.items;
    if (st.pal) items.forEach(function (it) { if (it.k === 's' && it.pen === 'swirl' && !it.pal) it.pal = st.pal; });
    if (st.oneLine) items = joinLine(items, s);
    items.forEach(function (it) {
      if (it.k === 's') { it.c = cum(it.pts); it.len = it.c[it.c.length - 1] || 1; if (it.pen === 'pop') { it.c1 = K.accent; it.c2 = st.third || '#19c3e6'; } }
    });
    schedule(items, m);
    return items;
  }
  // one continuous line: chain the draw-phase strokes so the pen never lifts
  function joinLine(items, s) {
    var out = [], acc = null;
    items.forEach(function (it) {
      if (it.k === 's' && !it.ph && it.pen !== 'highlighter') {
        if (!acc) { acc = { k: 's', pts: it.pts.slice(), pen: it.pen, w: it.w, col: it.col, seed: it.seed }; out.push(acc); }
        else acc.pts = acc.pts.concat(resample(lineP(acc.pts[acc.pts.length - 1], it.pts[0]), 4 * s).slice(1), it.pts);
      } else out.push(it);
    });
    return out;
  }
  function itemLen(it) {
    if (it.len != null) return it.len;
    if (it.k === 's') return it.len;
    if (it.k === 'f') { var c = cum(it.pts); return c[c.length - 1] * 0.4; }
    return 40;
  }
  // timing: draw items share D by length; note items follow; deco items take explicit windows (in units of D)
  function schedule(items, m) {
    var D = m.D, tot = 0, t = 0, prev = null, i, it;
    for (i = 0; i < items.length; i++) { it = items[i]; if (!it.ph && !it.with) tot += itemLen(it); }
    tot = tot || 1;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (it.ph) continue;
      if (it.with && prev) { it.a = prev.a; it.b = prev.b; continue; }
      it.a = t / tot * D; t += itemLen(it); it.b = t / tot * D; prev = it;
    }
    var N0 = D * 0.8, chars = 0;
    items.forEach(function (x) { if (x.k === 't') x.lines.forEach(function (l) { chars += l.length; }); });
    var ND = (m.noteDuration != null ? m.noteDuration : Math.min(1.8, 0.35 + 0.03 * chars) * m.tempo);
    items.forEach(function (x) {
      if (x.ph === 'note') { var w = x.at || [0, 1]; x.a = N0 + w[0] * ND; x.b = N0 + w[1] * ND; if (x.k === 't' && x.rev === 'type') x.b = N0 + Math.max(ND, chars * 0.045 * m.tempo); }
      else if (x.ph === 'deco') { var w2 = x.at || [1, 1.4]; x.a = w2[0] * D; x.b = w2[1] * D; }
    });
  }

  // ---------------------------------------------------------------- render
  function renderItems(c, items, k, s) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i], u = seg(k, it.a, it.b);
      if (k < it.a || (u <= 0 && it.b > it.a)) continue;
      var post = k - it.b;
      c.save();
      if (it.alpha != null) c.globalAlpha *= it.alpha;
      if (it.k === 's') {
        var S = it;
        if (it.warp) { var wp = it.warp(it.pts, post); S = {}; for (var key in it) S[key] = it[key]; S.pts = wp; S.c = cum(wp); S.len = S.c[S.c.length - 1] || 1; }
        var e = u < 1 ? 0.3 * inOutSine(u) + 0.7 * u : 1;
        (PENS[S.pen] || PENS.ink)(c, S, e * S.len, s, Math.max(0, post));
      } else if (it.k === 'f') renderFill(c, it, u);
      else if (it.k === 't') renderText(c, it, u, s);
      else if (it.k === 'fn') it.draw(c, u, post >= 0 ? post : undefined, k);
      c.restore();
    }
  }
  function renderFill(c, it, u) {
    var p = it.pts, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    p.forEach(function (q) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); });
    if (it.comp) c.globalCompositeOperation = it.comp;
    if (it.rev === 'fade') c.globalAlpha *= u;
    else if (it.rev === 'grow') { var g = outBack(u), cx = it.cx != null ? it.cx : (x0 + x1) / 2, cy = it.cy != null ? it.cy : (y0 + y1) / 2; c.translate(cx, cy); c.scale(g, g); c.translate(-cx, -cy); }
    else if (it.rev === 'wipe') {
      c.beginPath();
      var d = it.dir || 'right', w = x1 - x0, h = y1 - y0;
      if (d === 'right') c.rect(x0, y0, w * u, h); else if (d === 'left') c.rect(x1 - w * u, y0, w * u, h);
      else if (d === 'up') c.rect(x0, y1 - h * u, w, h * u); else c.rect(x0, y0, w, h * u);
      c.clip();
    }
    c.fillStyle = it.col; path(c, p); c.closePath(); c.fill();
    if (it.stroke) { c.strokeStyle = it.stroke; c.lineWidth = it.strokeW || 1; c.stroke(); }
  }
  function renderText(c, it, u, s) {
    var n = it.lines.length; if (!n) return;
    c.font = fontStr(it.F, it.px); c.textBaseline = 'alphabetic';
    if (it.bg) {
      c.save(); c.globalAlpha *= clamp(u * 3, 0, 1);
      c.fillStyle = it.bg; c.fillRect(it.x - 6 * s, it.y - 4 * s, it.w + 12 * s, n * it.lh + 6 * s);
      c.restore();
    }
    c.fillStyle = it.col;
    if (it.rev === 'type') {
      var total = 0; it.lines.forEach(function (l) { total += l.length; });
      var shown = Math.floor(total * u + 1e-6);
      for (var i = 0; i < n && shown > 0; i++) {
        var l = it.lines[i], part = l.slice(0, shown); shown -= l.length;
        c.fillText(part, it.x, it.y + it.lh * (i + 0.78));
      }
      return;
    }
    for (var j = 0; j < n; j++) {
      var f = clamp(u * n - j, 0, 1); if (f <= 0) break;
      var y = it.y + it.lh * j, lw = c.measureText(it.lines[j]).width, x = it.x;
      c.save();
      c.beginPath();
      if (it.mirror) c.rect(x + it.w - (it.w * f) - 2, y - it.lh * 0.3, it.w * f + 4, it.lh * 1.4);
      else c.rect(x - 2, y - it.lh * 0.3, lw * f + 4 * s + 2, it.lh * 1.4);
      c.clip();
      if (it.mirror) { c.translate(x + it.w / 2, 0); c.scale(-1, 1); c.translate(-(x + it.w / 2), 0); c.fillText(it.lines[j], x + it.w - lw, y + it.lh * 0.78); }
      else c.fillText(it.lines[j], x, y + it.lh * 0.78);
      c.restore();
    }
  }

  // ---------------------------------------------------------------- geometry of the target
  function contentRect(mw, mh, W, H, fit, pos) {
    if (!mw || !mh || fit === 'fill') return { x: 0, y: 0, w: W, h: H };
    var k;
    if (fit === 'cover') k = Math.max(W / mw, H / mh);
    else if (fit === 'none') k = 1;
    else if (fit === 'scale-down') k = Math.min(1, W / mw, H / mh);
    else k = Math.min(W / mw, H / mh);
    var w = mw * k, h = mh * k, px = pos ? pos[0] : 0.5, py = pos ? pos[1] : 0.5;
    return { x: (W - w) * px, y: (H - h) * py, w: w, h: h };
  }
  function keyAt(keys, t) {
    if (t <= keys[0].t) return keys[0];
    for (var i = 1; i < keys.length; i++) {
      if (t <= keys[i].t) {
        var a = keys[i - 1], b = keys[i], u = (t - a.t) / ((b.t - a.t) || 1);
        return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), w: lerp(a.w, b.w, u), h: lerp(a.h, b.h, u) };
      }
    }
    return keys[keys.length - 1];
  }
  function boxAt(src, X, mt) {
    if (!src) return null;
    if (typeof src === 'function') src = src(mt);
    if (Array.isArray(src) && src.length && typeof src[0] === 'object' && src[0] && src[0].t != null) src = keyAt(src, mt);
    if (Array.isArray(src)) src = { x: src[0], y: src[1], w: src[2] || 0, h: src[3] || 0 };
    if (!src || src.x == null) return null;
    return { x: X.ox + src.x * X.sx, y: X.oy + src.y * X.sy, w: (src.w || 0) * X.sx, h: (src.h || 0) * X.sy };
  }
  function spaceOf(m, W, H, env) {
    var mw = env.mediaW, mh = env.mediaH, rect = env.rect || (mw ? contentRect(mw, mh, W, H, m.fit || 'contain') : { x: 0, y: 0, w: W, h: H });
    var sp = m.space || (mw ? 'px' : 'css'), off = env.off || 0;
    if (sp === 'norm') return { ox: rect.x, oy: rect.y, sx: rect.w, sy: rect.h };
    if (sp === 'px' && mw) return { ox: rect.x, oy: rect.y, sx: rect.w / mw, sy: rect.h / mh };
    return { ox: off, oy: off, sx: 1, sy: 1 };
  }

  // ---------------------------------------------------------------- options and the pure draw
  var DEF = { style: 'perkins', mark: 'circle', scale: 1, tempo: 1, speed: 1, hold: Infinity, out: 'fade', stagger: 0.9, seed: 1 };
  // speed: a number (2 = twice as fast) or a name. It scales how fast each mark draws, never an explicit delay.
  var SPEEDS = { slow: 0.6, calm: 0.8, normal: 1, brisk: 1.3, fast: 1.7, snap: 2.6 };
  function speedOf(v) { var n = typeof v === 'string' && SPEEDS[v] ? SPEEDS[v] : +v; return n > 0 && isFinite(n) ? n : 1; }
  function resolveList(opts) {
    var list = opts.marks && opts.marks.length ? opts.marks : [{}], out = [];
    for (var i = 0; i < list.length; i++) {
      var m = {}, k;
      for (k in DEF) m[k] = DEF[k];
      for (k in opts) if (k !== 'marks') m[k] = opts[k];
      for (k in list[i]) m[k] = list[i][k];
      if (!STYLES[m.style]) m.style = 'perkins';
      if (!MARKS[m.mark]) m.mark = 'circle';
      m.tempo = +m.tempo || 1;
      m.sp = speedOf(m.speed);
      m.D = (m.duration || 0.85) * m.tempo;
      // delay in seconds; 'wait' (or anything not a number) holds the mark until it is fired
      m.delay = list[i].delay != null ? (isFinite(+list[i].delay) ? +list[i].delay : Infinity) : (opts.delay == null ? 0 : isFinite(+opts.delay) ? +opts.delay : Infinity) + i * m.stagger * m.tempo / m.sp;
      m.seed = (m.seed | 0) + i * 101;
      out.push(m);
    }
    return out;
  }
  function spanOf(m) {
    var n = m.note != null && m.note !== '' || m.mark === 'arrow' || m.mark === 'note';
    var t = m.D * 1.45 + (n ? m.D * 0.8 + 1.9 * m.tempo : 0);
    if (m.style === 'dali') t = Math.max(t, m.D + 3.2);
    return t;
  }
  function length(opts) {
    var list = resolveList(opts || {}), t = 0;
    list.forEach(function (m) {
      if (!isFinite(m.delay)) return;
      var e = m.delay + spanOf(m) / m.sp; if (isFinite(m.hold)) e += m.hold + 0.5 * m.tempo / m.sp; t = Math.max(t, e);
    });
    return t;
  }

  // draw(ctx, t, w, h, opts[, env]): everything on screen is a function of t. env = { rect, mediaW, mediaH, mediaTime }.
  function draw(ctx, t, w, h, opts, env) {
    env = env || {};
    if (env.mediaTime == null) env.mediaTime = t;
    var list = resolveList(opts || {}), sBase = Math.max(Math.min(w, h) / 1080, 0.46);
    for (var i = 0; i < list.length; i++) {
      var m = list[i], k = (t - m.delay) * m.sp;
      if (!(k >= 0)) continue;
      var s = m.size ? +m.size : sBase * m.scale, X = spaceOf(m, w, h, env);
      var b = boxAt(m.box, X, env.mediaTime);
      if (!b) continue;
      var to = m.to ? boxAt(m.to, X, env.mediaTime) : null;
      if (m.from) { var f = m.from; m.from = [X.ox + f[0] * X.sx, X.oy + f[1] * X.sy]; }
      var outA = 1, kk = k, span = spanOf(m);
      if (isFinite(m.hold)) {
        var t0 = span + m.hold * m.sp, o = outCubic(seg(k, t0, t0 + 0.5 * m.tempo));
        if (o >= 1) continue;
        if (m.out === 'erase') kk = k < t0 ? k : Math.min(k, span) * (1 - o); else outA = 1 - o;
      }
      var items = build(ctx, m, b, w, h, s, to);
      ctx.save();
      ctx.globalAlpha *= (m.opacity == null ? 1 : +m.opacity) * outA;
      if (m.halo) {
        var st = STYLES[m.style], hc = m.halo === true ? (luma(m.color || st.ink) > 0.5 ? 'rgba(0,0,0,0.75)' : 'rgba(255,250,240,0.9)') : m.halo;
        var dpr = ctx.getTransform ? Math.hypot(ctx.getTransform().a, ctx.getTransform().b) : 1;
        ctx.shadowColor = hc; ctx.shadowBlur = 6 * s * dpr;
      }
      renderItems(ctx, items, kk, s);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- live overlay on a page element
  var live = typeof Map !== 'undefined' ? new Map() : null;
  function mediaSize(el) {
    if (!el) return [0, 0];
    if (el.tagName === 'IMG') return [el.naturalWidth, el.naturalHeight];
    if (el.tagName === 'VIDEO') return [el.videoWidth, el.videoHeight];
    if (el.tagName === 'CANVAS') return [el.width, el.height];
    return [0, 0];
  }
  function elRect(el, mw, mh) {
    var cs = getComputedStyle(el);
    var bl = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0;
    var pl = parseFloat(cs.paddingLeft) || 0, pt = parseFloat(cs.paddingTop) || 0;
    var cw = el.clientWidth - pl - (parseFloat(cs.paddingRight) || 0), ch = el.clientHeight - pt - (parseFloat(cs.paddingBottom) || 0);
    var fit = el.tagName === 'IMG' || el.tagName === 'VIDEO' ? (cs.objectFit || 'fill') : 'fill';
    if (el.tagName === 'VIDEO' && fit === 'fill' && !el.style.objectFit) fit = 'contain';
    var pos = (cs.objectPosition || '50% 50%').split(' ').map(function (v) { return v.indexOf('%') > 0 ? parseFloat(v) / 100 : 0.5; });
    var r = contentRect(mw, mh, cw, ch, fit, pos);
    r.x += bl + pl; r.y += bt + pt;
    return r;
  }
  // a box given as a selector or element is measured against the target each frame (css px)
  function elBox(target, sel) {
    var el = typeof sel === 'string' ? target.querySelector(sel) || document.querySelector(sel) : sel;
    if (!el || !el.getBoundingClientRect) return null;
    var a = target.getBoundingClientRect(), b = el.getBoundingClientRect();
    return [b.left - a.left, b.top - a.top, b.width, b.height];
  }
  function isElRef(v) { return typeof v === 'string' || (v && v.nodeType === 1); }
  function resolveEls(target, opts) {
    var o = {}, k;
    for (k in opts) o[k] = opts[k];
    var fix = function (m) {
      var n = {}, j; for (j in m) n[j] = m[j];
      if (isElRef(n.box)) { n.box = elBox(target, n.box); n.space = 'css'; }
      if (isElRef(n.to)) n.to = elBox(target, n.to);
      return n;
    };
    if (o.marks) o.marks = o.marks.map(fix); else o = fix(o);
    return o;
  }

  // hooks: an on<Name> option and a bubbling 'annotationfx:<name>' DOM event (start, mark, done)
  function emit(target, opts, name, detail) {
    var fn = opts['on' + name.charAt(0).toUpperCase() + name.slice(1)];
    if (typeof fn === 'function') { try { fn(detail); } catch (e) { if (typeof console !== 'undefined') console.warn('AnnotationFX: on' + name + ' threw', e); } }
    try { target.dispatchEvent(new CustomEvent('annotationfx:' + name, { bubbles: true, detail: detail })); } catch (e) {}
  }
  function elOf(target, sel) {
    if (typeof sel === 'string') { try { return target.querySelector(sel) || document.querySelector(sel); } catch (e) { return null; } }
    return sel && sel.nodeType === 1 ? sel : null;
  }

  function play(target, opts) {
    if (!hasDOM) return null;
    if (typeof target === 'string') target = document.querySelector(target);
    if (!target) return null;
    stop(target);
    opts = opts || {};
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var rm = opts.reducedMotion || 'hold';
    if (reduce && rm === 'skip') return null;
    var cv = document.createElement('canvas'), bleed = opts.bleed || 0;
    cv.className = 'annotationfx'; cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:absolute;pointer-events:none;z-index:' + (opts.zIndex || 3) + ';';
    var host = target.offsetParent || document.body;
    host.appendChild(cv);
    var st = { target: target, cv: cv, opts: opts, raf: 0, t0: 0, started: false, dead: false, dpr: Math.min(opts.dpr || 2, window.devicePixelRatio || 1), slow: [], adaptStep: 0,
      fired: {}, sig: {}, lastFire: null, doneSent: false, still: (reduce && rm === 'hold') || !!opts.still,
      sync: target.tagName === 'VIDEO' && opts.sync === 'media' };
    // A mark waits to be fired when its delay is 'wait' (or the top-level delay is), or, under when: 'each', when its box
    // is an element: it fires as that element scrolls into view. Fired marks start at the moment they are fired.
    var marks = opts.marks && opts.marks.length ? opts.marks : [{}], each = opts.when === 'each';
    var topWait = opts.delay != null && !isFinite(+opts.delay);
    var waits = marks.map(function (m) {
      if (m.delay != null) return !isFinite(+m.delay);
      if (topWait) return true;
      return each && isElRef(m.box != null ? m.box : opts.box);
    });
    function timed() {
      var o = {}, k;
      for (k in opts) if (k !== 'marks' && !(k === 'delay' && topWait)) o[k] = opts[k];
      o.marks = marks.map(function (m, i) {
        var n = {}, j; for (j in m) n[j] = m[j];
        if (waits[i]) n.delay = st.fired[i] != null ? st.fired[i] : Infinity;
        return n;
      });
      return o;
    }
    function relen() { st.len = length(timed()) + 0.3; if (st.handle) st.handle.length = st.len; return st.len; }
    relen();
    function pending() { for (var i = 0; i < marks.length; i++) if (waits[i] && st.fired[i] == null) return true; return false; }
    function layout() {
      st.w = Math.max(1, target.offsetWidth) + 2 * bleed; st.h = Math.max(1, target.offsetHeight) + 2 * bleed;
      cv.style.left = (target.offsetLeft - bleed) + 'px'; cv.style.top = (target.offsetTop - bleed) + 'px';
      cv.style.width = st.w + 'px'; cv.style.height = st.h + 'px';
      var W = Math.round(st.w * st.dpr), H = Math.round(st.h * st.dpr);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    }
    function paint(t) {
      if (st.dead) return;
      try {
        var ms = mediaSize(target), ctx = cv.getContext('2d');
        var r = ms[0] ? elRect(target, ms[0], ms[1]) : { x: 0, y: 0, w: target.offsetWidth, h: target.offsetHeight };
        r.x += bleed; r.y += bleed;
        var env = { mediaW: ms[0], mediaH: ms[1], rect: r, off: bleed };
        if (target.tagName === 'VIDEO' && opts.track !== 'clock') env.mediaTime = target.currentTime;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
        draw(ctx, t, st.w, st.h, resolveEls(target, timed()), env);
        st.last = t;
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('AnnotationFX: frame failed, overlay removed.', e);
        stop(target); if (target.classList) target.classList.add('annotationfx-failed');
      }
    }
    // tell hooks when each mark starts drawing (seeking a synced video back re-arms them)
    function signal(t) {
      var R = resolveList(timed());
      for (var i = 0; i < R.length; i++) {
        var d = R[i].delay;
        if (t >= d && !st.sig[i]) { st.sig[i] = true; emit(target, opts, 'mark', { index: i, id: marks[i].id, mark: R[i].mark, time: d, handle: st.handle }); }
        else if (t < d && st.sig[i] && st.sync) st.sig[i] = false;
      }
    }
    function settle() {
      if (st.doneSent || pending()) return;
      st.doneSent = true;
      if (opts.end === 'clear') stop(target);
      emit(target, opts, 'done', { handle: st.handle });
    }
    function clock() {
      if (st.sync) return target.currentTime;
      if (st.paused) return st.pausedAt;
      return st.t0 ? (performance.now() - st.t0) / 1000 : 0;
    }
    var keyed = function (m) { return typeof m.box === 'function' || (Array.isArray(m.box) && m.box[0] && m.box[0].t != null); };
    var tracked = keyed(opts) || (opts.marks || []).some(keyed);
    function frame(now) {
      st.raf = 0;
      if (st.dead || st.paused) return;
      if (!st.t0) st.t0 = now;
      var t = st.sync ? target.currentTime : (now - st.t0) / 1000;
      if (opts.adapt !== false) {
        if (st.prev) { st.slow.push(now - st.prev); if (st.slow.length > 20) st.slow.shift(); }
        st.prev = now;
        if (st.slow.length === 20 && st.adaptStep < 2) {
          var srt = st.slow.slice().sort(function (a, b) { return a - b; });
          if (srt[10] > 25) { st.dpr = Math.max(1, st.dpr * 0.75); st.adaptStep++; st.slow = []; layout(); }
        }
      }
      paint(t);
      if (st.dead) return;
      signal(t);
      var videoLive = target.tagName === 'VIDEO' && (tracked || st.sync) && !target.paused;
      if (st.sync ? !target.paused : (t < st.len || videoLive)) st.raf = requestAnimationFrame(frame);
      else {
        st.prev = 0;
        settle();
        if (target.tagName === 'VIDEO' && tracked && !st.sync) target.addEventListener('play', resumeVideo, { once: true });
      }
    }
    function run() { if (!st.dead && !st.raf && !st.paused && st.started) st.raf = requestAnimationFrame(frame); }
    function resumeVideo() { if (!st.dead && !st.raf) { st.t0 = performance.now() - (st.last || 0) * 1000; run(); } }
    function start() {
      if (st.started || st.dead) return;
      st.started = true;
      layout();
      emit(target, opts, 'start', { handle: st.handle });
      if (st.still) { paint(1e6); signal(1e6); settle(); return; }
      run();
    }
    function reset() {
      if (st.raf) cancelAnimationFrame(st.raf);
      st.raf = 0; st.started = false; st.t0 = 0; st.prev = 0; st.fired = {}; st.sig = {}; st.lastFire = null; st.doneSent = false; st.paused = false;
      var ctx = cv.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      relen();
    }
    // fire(): the next waiting mark; fire(i) or fire('id'): that mark (again, if it already drew); fire('*'): all waiting.
    // Marks fired together are spaced by half their stagger so they still read as one hand.
    function fire(which) {
      if (st.dead) return handle;
      var idx = [], i;
      if (which == null) { for (i = 0; i < marks.length; i++) if (waits[i] && st.fired[i] == null) { idx.push(i); break; } }
      else if (which === '*' || which === true) { for (i = 0; i < marks.length; i++) if (waits[i] && st.fired[i] == null) idx.push(i); }
      else if (typeof which === 'number') { if (marks[which]) idx.push(which); }
      else for (i = 0; i < marks.length; i++) if (marks[i].id === which) idx.push(i);
      if (!idx.length) return handle;
      if (!st.started) { ready(start); if (!st.started) { st.queued = (st.queued || []).concat([which]); return handle; } }
      var t = st.still ? 0 : clock(), R = resolveList(timed());
      idx.forEach(function (j) {
        waits[j] = true;
        var g = 0.5 * R[j].stagger * R[j].tempo / R[j].sp, at = st.lastFire != null ? Math.max(t, st.lastFire + g) : t;
        st.fired[j] = at; st.lastFire = at; st.sig[j] = false;
      });
      st.doneSent = false;
      relen();
      if (st.still) { paint(1e6); signal(1e6); settle(); } else run();
      return handle;
    }
    function unfire(j) {
      delete st.fired[j]; st.sig[j] = false; st.doneSent = false; relen();
      if (!st.raf && st.started) paint(clock());
    }
    function ready(fn) {
      var ms = mediaSize(target);
      if ((target.tagName === 'IMG' && !target.complete) || (target.tagName === 'VIDEO' && !ms[0])) {
        target.addEventListener(target.tagName === 'IMG' ? 'load' : 'loadedmetadata', function () { fn(); if (st.queued) { var q = st.queued; st.queued = null; q.forEach(fire); } }, { once: true });
      } else fn();
    }
    var ioOpt = { threshold: opts.threshold != null ? opts.threshold : 0.5, rootMargin: opts.rootMargin || '0px' };
    function whenVisible(fn) {
      var w = opts.when || 'visible';
      var go = function () {
        if (document.hidden) { document.addEventListener('visibilitychange', function v() { if (!document.hidden) { document.removeEventListener('visibilitychange', v); fn(); } }); }
        else fn();
      };
      if (w === 'manual') return;
      if (w === 'each') { go(); watchEach(); return; }
      if (w === 'now' || typeof IntersectionObserver === 'undefined') return go();
      st.io = new IntersectionObserver(function (es) {
        var vis = es.some(function (e) { return e.isIntersecting; });
        if (vis && !st.started) go();
        else if (!vis && st.started && opts.repeat) reset();
        if (vis && !opts.repeat) st.io.disconnect();
      }, ioOpt);
      st.io.observe(target);
    }
    // when: 'each': every mark whose box is an element fires when that element scrolls in (repeat: true re-arms on leave)
    function watchEach() {
      var map = typeof Map !== 'undefined' ? new Map() : null, i;
      if (!map) { fire('*'); return; }
      for (i = 0; i < marks.length; i++) {
        if (!waits[i] || marks[i].delay != null || topWait) continue;
        var el = elOf(target, marks[i].box != null ? marks[i].box : opts.box);
        if (!el) { fire(i); continue; }
        if (!map.has(el)) map.set(el, []);
        map.get(el).push(i);
      }
      if (typeof IntersectionObserver === 'undefined') { map.forEach(function (ids) { ids.forEach(fire); }); return; }
      st.ioEach = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          var ids = map.get(e.target) || [];
          if (e.isIntersecting) ids.forEach(function (j) { if (st.fired[j] == null) fire(j); });
          else if (opts.repeat) ids.forEach(function (j) { if (st.fired[j] != null) unfire(j); });
          if (e.isIntersecting && !opts.repeat) st.ioEach.unobserve(e.target);
        });
      }, ioOpt);
      map.forEach(function (ids, el) { st.ioEach.observe(el); });
    }
    st.repaint = function () { if (!st.started) return; layout(); if (!st.raf) paint(st.last != null ? st.last : st.len); };
    if (typeof ResizeObserver !== 'undefined') { st.ro = new ResizeObserver(st.repaint); st.ro.observe(target); }
    window.addEventListener('resize', st.repaint);
    if (target.tagName === 'VIDEO') {
      target.addEventListener('seeked', st.repaint);
      if (st.sync) { st.onPlay = function () { run(); }; target.addEventListener('play', st.onPlay); }
    }
    if (live) live.set(target, st);
    var handle = {
      canvas: cv, length: st.len,
      start: function () { ready(start); return handle; },
      stop: function () { stop(target); },
      replay: function () { return play(target, opts); },
      seek: function (t) { st.started = true; layout(); if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; paint(t); return handle; },
      pause: function () { if (!st.paused && !st.sync) { st.pausedAt = clock(); st.paused = true; if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; } return handle; },
      resume: function () { if (st.paused) { st.paused = false; st.t0 = performance.now() - st.pausedAt * 1000; run(); } return handle; },
      fire: fire,
      reset: function () { reset(); return handle; },
      time: clock
    };
    st.handle = handle;
    ready(function () { whenVisible(start); });
    return handle;
  }
  function stop(target) {
    if (!hasDOM) return;
    if (typeof target === 'string') target = document.querySelector(target);
    if (!target || !live) return;
    var st = live.get(target);
    if (!st) return;
    st.dead = true;
    if (st.raf) cancelAnimationFrame(st.raf);
    if (st.io) st.io.disconnect();
    if (st.ioEach) st.ioEach.disconnect();
    if (st.ro) st.ro.disconnect();
    window.removeEventListener('resize', st.repaint);
    if (target.tagName === 'VIDEO') target.removeEventListener('seeked', st.repaint);
    if (st.onPlay) target.removeEventListener('play', st.onPlay);
    if (st.cv.parentNode) st.cv.parentNode.removeChild(st.cv);
    live.delete(target);
  }
  function replay(target) {
    if (typeof target === 'string' && hasDOM) target = document.querySelector(target);
    var st = live && target && live.get(target);
    return st ? play(target, st.opts) : null;
  }
  // fire(target[, which]): start a waiting mark on a playing overlay (see play: delay 'wait', when 'each')
  function fire(target, which) {
    if (typeof target === 'string' && hasDOM) target = document.querySelector(target);
    var st = live && target && live.get(target);
    return st ? st.handle.fire(which) : null;
  }
  // drop-in: <p data-annotate='{"style":"darwin","marks":[{"mark":"circle","box":"#word"}]}'>; [data-annotate-replay] replays
  function auto(root) {
    if (!hasDOM) return;
    (root || document).querySelectorAll('[data-annotate]').forEach(function (el) {
      try { play(el, JSON.parse(el.getAttribute('data-annotate'))); } catch (e) { if (typeof console !== 'undefined') console.warn('AnnotationFX: bad data-annotate JSON', el, e); }
    });
  }
  if (hasDOM) {
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest && e.target.closest('[data-annotate-replay]');
      if (!b) return;
      var sel = b.getAttribute('data-annotate-replay'), el = sel ? document.querySelector(sel) : null;
      if (el) replay(el);
    });
    // canvas text needs the fonts: repaint held overlays when web fonts arrive
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { if (live) live.forEach(function (st) { st.repaint(); }); });
    var cs = document.currentScript;
    if (cs && cs.hasAttribute('data-auto')) {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { auto(); });
      else auto();
    }
  }

  var FIELDS = { science: 'Science', art: 'Art', history: 'History' };
  return {
    version: VERSION,
    play: play, stop: stop, replay: replay, draw: draw, length: length, auto: auto, fire: fire,
    speeds: SPEEDS,
    styles: Object.keys(STYLES).map(function (k) { var o = STYLES[k]; return { id: k, name: o.name, who: o.who, field: o.field, year: o.year, about: o.about, bio: o.bio || '', ground: o.ground || 'light', paper: o.paper || null, font: o.font.f }; }),
    marks: Object.keys(MARKS), fields: FIELDS, pens: Object.keys(PENS),
    _internal: { STYLES: STYLES, MARKS: MARKS, PENS: PENS, build: build, resolveList: resolveList }
  };
}));
