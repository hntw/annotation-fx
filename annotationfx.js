/*! Annotation FX 1.0.0 · hand-drawn annotations in the styles of science, art and history · MIT · (c) 2026 Jamie Grove */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AnnotationFX = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '2.0.0';
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










  // ---- art











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







  function check(B, x, y, z, o) {
    var s = B.s;
    B.stroke(B.hand([[x - z * 0.5, y - z * 0.05], [x - z * 0.15, y + z * 0.35], [x + z * 0.6, y - z * 0.55]], 0.1), o || { w: 2.2 });
  }




  // ---- v1.2 art



  function crown(B, x, y, z) {
    var p = [[x, y], [x + z * 0.1, y - z * 0.7], [x + z * 0.32, y - z * 0.25], [x + z * 0.5, y - z * 0.85], [x + z * 0.68, y - z * 0.25], [x + z * 0.9, y - z * 0.7], [x + z, y], [x, y]];
    B.stroke(B.hand(resample(p, 3 * B.s), 0.25), { w: 3.2, col: B.st.third });
    B.fn(function (c, u) { c.fillStyle = B.st.third; [[0.1, -0.7], [0.5, -0.85], [0.9, -0.7]].forEach(function (q) { dot(c, x + q[0] * z, y + q[1] * z - 3 * B.s, 2.6 * B.s * u); }); }, { len: 8 * B.s });
  }



  // ---- v1.2 history




  // a tree-ring section: the loop, two wider freehand rings and radii crossing them, as in his notebook sketch
  function lyell_rings(B) {
    var E = B.ellipse(), s = B.s, r = B.r, f = wave(r);
    B.stroke(B.loop(E));
    [1.16, 1.32].forEach(function (k, i) {
      var a0 = -PI * 0.25 + (r() - 0.5) * 0.6;
      B.stroke(ellipseP(E.cx, E.cy, E.rx * k + 3 * s * i, E.ry * k + 3 * s * i, a0, -TAU * (0.92 + 0.05 * r()), 0, 0, function (a) { return 1 + 0.025 * f(a * 1.7 + i); }), { w: B.st.w * 0.7 });
    });
    var n = 7, k0 = 1.03, k1 = 1.42;
    for (var i = 0; i < n; i++) {
      var a = -PI / 2 + i * TAU / n + (r() - 0.5) * 0.35;
      B.stroke(B.hand(lineP([E.cx + Math.cos(a) * E.rx * k0, E.cy + Math.sin(a) * E.ry * k0], [E.cx + Math.cos(a) * (E.rx * k1 + 6 * s), E.cy + Math.sin(a) * (E.ry * k1 + 6 * s)]), 0.2), { w: B.st.w * 0.5 });
    }
    E = { cx: E.cx, cy: E.cy, rx: E.rx * k1, ry: E.ry * k1 };
    B.E = E; B.edge = function (T) { return ellEdge(E, 4 * s, T); };
  }
  // the small ruled grid he drew to show cell structure: fine parallel lines crossed by a few others
  function lyell_cells(B) {
    var b = B.b, s = B.s, x = b.x - 4 * s, y = b.y - 2 * s, w = b.w + 8 * s, h = b.h + 4 * s, r = rng(B.m.seed * 13 + 7);
    var gx = 4.2 * s, gy = 6.5 * s, jy = [], jx = [], i;
    for (i = 0; i * gy <= h; i++) jy.push((r() - 0.5) * 1.6 * s);
    for (i = 0; i * gx <= w; i++) jx.push((r() - 0.5) * 1.2 * s);
    B.fn(function (c, u) {
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
      c.strokeStyle = alpha(B.K.ink, 0.42); c.lineWidth = 0.75 * s; c.lineCap = 'round';
      var ny = Math.ceil(jy.length * Math.min(1, u * 2)), nx = Math.ceil(jx.length * clamp(u * 2 - 1, 0, 1));
      for (var j = 0; j < ny; j++) { c.beginPath(); c.moveTo(x, y + j * gy + jy[j]); c.lineTo(x + w, y + j * gy - jy[j]); c.stroke(); }
      for (j = 0; j < nx; j++) { c.beginPath(); c.moveTo(x + j * gx + jx[j], y); c.lineTo(x + j * gx - jx[j] * 0.5, y + h); c.stroke(); }
      c.restore();
    }, { len: (w + h) * 1.2 });
    B.edge = function (T) { return rectEdge(b, 6 * s, T); };
  }
  def('lyell', {
    name: 'Lyell', who: 'Charles Lyell', field: 'science', year: 1830,
    bio: 'Charles Lyell (1797-1875) was a Scottish geologist. His Principles of Geology (1830-1833) argued that slow forces you can watch today, given enough time, shaped the whole Earth. Darwin read it on the Beagle. He kept field notebooks all his life, filled with quick sketches.',
    about: 'A page of his field notebook: brown ink, a fast slanted hand with flat word endings, a tree section drawn in freehand rings and radii, and a ruled patch for the cells.',
    source: { text: 'Field notebook No. 4, page with a section of a coniferous tree and notes on the Irish Elk', where: 'University of Edinburgh, Heritage Collections (Lyell notebooks)', url: 'https://images.is.ed.ac.uk/luna/servlet/detail/UoEsha~5~5~88394~397641' },
    pen: 'ink', w: 1.8, ink: '#4a3423', accent: '#8b6a4a', font: { f: "'La Belle Aurore', cursive" }, size: 27, leading: 1.3,
    hand: { wob: 0.6, over: 0.3, bend: 0.14 },
    hl: 'rgba(139,106,74,0.2)',
    marks: {
      circle: lyell_rings,
      highlight: lyell_cells,
      strike: function (B) { MARKS.strike(B); B.items[B.items.length - 1].w = 1.3 * B.s; }
    }
  });
  // Darwin marked his own books in pencil and wrote his notes in brown ink
  var DARWIN_PENCIL = '#646464';
  var DARWIN_F = { f: "'Zeyada', cursive" };
  function darwin_pencil(B) { return { pen: 'pencil', col: B.m.color || DARWIN_PENCIL, w: 2.7 }; }
  // margin scoring: one or two short pencil lines beside the passage
  function darwin_score(B) {
    var b = B.b, s = B.s, right = B.side(0, 0) === 'right', sx = right ? 1 : -1, x = right ? b.x + b.w + 12 * s : b.x - 12 * s;
    var y0 = b.y - 2 * s, y1 = b.y + b.h + 2 * s, n = b.h > 40 * s ? 2 : 1;
    for (var i = 0; i < n; i++) {
      var xx = x + sx * i * 5 * s;
      B.stroke(B.hand(lineP([xx + sx * 1 * s, y0 + i * 3 * s], [xx, y1 - i * 2 * s]), 0.25), darwin_pencil(B));
    }
    var tip = [x + sx * (n * 5 + 4) * s, (y0 + y1) / 2];
    B.edge = function () { return tip; };
    B.forceSide = right ? 'right' : 'left';
  }
  // the lasso: a loose loop drawn round a side note to fence it off (Notebook B)
  function darwin_lasso(B) {
    var b = B.b, s = B.s, r = B.r, p = 10 * s, x = b.x - p, y = b.y - p, w = b.w + 2 * p, h = b.h + 2 * p;
    var E = { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 }, a0 = -PI * 0.15 + (r() - 0.5) * 0.3, f = wave(r);
    // a squared-off ellipse (superellipse) so a long passage gets a long sausage of a loop
    var pts = [];
    for (var i = 0; i <= 90; i++) {
      var u = i / 90, a = a0 - (TAU + 0.5) * u, ca = Math.cos(a), sa = Math.sin(a), k = 1 + 0.04 * f(a * 1.4) + 0.05 * u;
      pts.push([E.cx + Math.sign(ca) * Math.pow(Math.abs(ca), 0.55) * E.rx * k, E.cy + Math.sign(sa) * Math.pow(Math.abs(sa), 0.55) * E.ry * k]);
    }
    B.stroke(B.hand(pts, 0.4), { w: 1.4 });
    B.edge = function (T) { return rectEdge(b, p + 5 * s, T); };
  }
  function darwin_text(B, txt, x, y, px) {
    B.fn(function (c, u) { c.globalAlpha *= u; c.fillStyle = B.K.ink; c.font = fontStr(DARWIN_F, px * B.s); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, x, y); }, { len: 8 * B.s });
  }
  def('darwin', {
    name: 'Darwin', who: 'Charles Darwin', field: 'science', year: 1837,
    bio: 'Charles Darwin (1809-1882) was an English naturalist. In 1837 he sketched a branching tree in Notebook B under the words "I think." On the Origin of Species (1859) made the case for evolution by natural selection. He marked his own books heavily in pencil.',
    about: 'Notebook B and his pencil-marked Origin: a fast cramped brown hand, the branching tree with lettered tips and a circled 1, a lasso round a side note, and pencil scoring, crosses and carets in the margins.',
    source: { text: 'Notebook B, page 36 (1837), the "I think" tree', where: 'Cambridge University Library, DAR 121', url: 'https://commons.wikimedia.org/wiki/File:Darwin_Tree_1837.png' },
    pen: 'ink', w: 2.4, ink: '#3b2a1a', accent: '#8b6b4a', font: DARWIN_F, size: 30, leading: 1.25,
    hand: { wob: 1.5, over: 0.7, bend: 0.22 }, hl: 'rgba(110,110,110,0.16)',
    marks: {
      bracket: darwin_score,
      box: darwin_lasso,
      underline: function (B) {
        var b = B.b, s = B.s, r = B.r, y = b.y + b.h + 4 * s, x0 = b.x - 2 * s, x1 = b.x + b.w + 4 * s;
        var p = resample(lineP([x0, y], [x1, y + (r() - 0.5) * 3 * s]), 3 * s), f = wave(r);
        p = p.map(function (q, i) { return [q[0], q[1] + 1.4 * s * f(i * 0.5)]; });
        B.stroke(B.hand(p, 0.3), darwin_pencil(B));
        if (B.m.double) B.stroke(B.hand(lineP([x0 + 0.1 * b.w, y + 5 * s], [x1 - 0.1 * b.w, y + 5.5 * s]), 0.3), darwin_pencil(B));
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      },
      strike: function (B) { MARKS.strike(B); var it = B.items[B.items.length - 1], o = darwin_pencil(B); it.pen = o.pen; it.col = o.col; it.w = o.w * B.s; },
      cross: function (B) {
        // his small pencil x: about a letter high, not a slash across the whole word
        var b = B.b, s = B.s, z = Math.min(b.h * 0.6, 14 * s), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        B.stroke(B.hand(lineP([cx - z, cy - z], [cx + z, cy + z]), 0.2), darwin_pencil(B));
        B.stroke(B.hand(lineP([cx + z * 1.05, cy - z * 0.95], [cx - z, cy + z]), 0.2), darwin_pencil(B));
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      },
      note: function (B) {
        // a caret under the word, then a long hairline down to the note
        var b = B.b, s = B.s, tipP = [b.x + b.w * 0.5, b.y + b.h + 3 * s];
        B.stroke(B.hand([[tipP[0] - 5 * s, tipP[1] + 7 * s], tipP, [tipP[0] + 5 * s, tipP[1] + 7 * s]], 0.1), darwin_pencil(B));
        B.edge = function (T) { return T[1] < b.y ? [tipP[0], b.y - 3 * s] : [tipP[0], tipP[1] + 7 * s]; };
        if ((!B.m.side || B.m.side === 'auto') && B.H - (b.y + b.h) > 120 * s) B.forceSide = 'bottom';
        B.wantLeader = true; B.shaftOpt = { pen: 'pencil', col: B.m.color || DARWIN_PENCIL, w: 1.2 };
      }
    },
    noteDeco: function (B, A) {
      if (B.m.mark !== 'arrow' || !A.shaft || !A.shaft.pts || A.shaft.pts.length < 4) return;
      // the tree: side branches, crossbars on the living tips, letters A to D, the root numbered 1 and circled
      var p = A.shaft.pts, cl = cum(p), L = cl[cl.length - 1], s = B.s, r = B.r, letters = ['A', 'B', 'C', 'D'], li = 0;
      if (L < 90 * s) return;
      [0.38, 0.58, 0.74].forEach(function (u, i) {
        var q = at(p, cl, L * u), sg = i % 2 ? 1 : -1, a = q[2] + sg * (0.55 + r() * 0.3), bl = Math.min(60 * s, L * (0.2 + 0.1 * r()));
        var e = [q[0] + Math.cos(a) * bl, q[1] + Math.sin(a) * bl];
        B.stroke(B.hand(quadP([q[0], q[1]], [q[0] + Math.cos(a - sg * 0.3) * bl * 0.5, q[1] + Math.sin(a - sg * 0.3) * bl * 0.5], e, 10), 0.3), { w: 2 });
        if (i !== 1) {
          var n = [-Math.sin(a) * 5 * s, Math.cos(a) * 5 * s];
          B.stroke(lineP([e[0] - n[0], e[1] - n[1]], [e[0] + n[0], e[1] + n[1]]), { w: 1.8 });
          darwin_text(B, letters[li++], e[0] + Math.cos(a) * 13 * s, e[1] + Math.sin(a) * 13 * s, 22);
        }
      });
      var t0 = A.tail, a0 = A.shaft.ang, c0 = [t0[0] - Math.cos(a0) * 14 * s, t0[1] - Math.sin(a0) * 14 * s];
      darwin_text(B, '1', c0[0], c0[1] + 1 * s, 20);
      B.stroke(B.hand(ellipseP(c0[0], c0[1], 10 * s, 9 * s, -PI * 0.3, -TAU - 0.4, 0), 0.2), { w: 1.3 });
    }
  });
  var DAVINCI_F = { f: "'Felipa', 'IM Fell English', Georgia, serif" };
  // a capital letter naming a point, as on his diagrams (written the normal way round)
  function davinci_letter(B, ch, x, y) {
    B.fn(function (c, u) { c.globalAlpha *= u; c.fillStyle = B.K.ink; c.font = fontStr(DAVINCI_F, 20 * B.s); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, x, y); }, { len: 8 * B.s });
  }
  // of the two spots beside P across the line at angle a, the one farther from point C
  function davinci_beside(P, a, C, d) {
    var n = [-Math.sin(a) * d, Math.cos(a) * d], p1 = [P[0] + n[0], P[1] + n[1]], p2 = [P[0] - n[0], P[1] - n[1]];
    return Math.hypot(p1[0] - C[0], p1[1] - C[1]) > Math.hypot(p2[0] - C[0], p2[1] - C[1]) ? p1 : p2;
  }
  def('davinci', {
    name: 'Da Vinci', who: 'Leonardo da Vinci', field: 'science', year: 1508,
    bio: 'Leonardo da Vinci (1452-1519) was an Italian painter, engineer and anatomist. He filled thousands of notebook pages with machines, bodies, light and water, mostly in mirror writing from right to left. He was left-handed, and his hatching slopes the left-hander\'s way.',
    about: 'The Codex Leicester: small round mirror script in brown ink, left-handed hatching, faint compass construction lines, thin rays that meet at a point, and capital letters naming the points.',
    source: { text: 'Codex Leicester, three pages on light, the Moon and water (c. 1508-1510)', where: 'Private collection (Bill Gates)', url: 'https://commons.wikimedia.org/wiki/File:CodexLeicester.jpg' },
    pen: 'nib', w: 1.9, ink: '#5e3d1f', accent: '#a0522d', paper: '#f1e6cf', font: DAVINCI_F, size: 27, leading: 1.3, mirror: true,
    hand: { wob: 0.6, over: 0.3, bend: 0.12 }, hl: 'rgba(160,82,45,0.18)',
    marks: {
      highlight: function (B) { hatch(B, [1], 5, { col: alpha(B.K.ink, 0.6), w: 0.8 }); },
      circle: function (B) {
        MARKS.circle(B);
        var E = B.E;
        B.stroke(ellipseP(E.cx, E.cy, E.rx * 1.1, E.ry * 1.1, -PI / 2, -TAU, 0), { pen: 'rule', w: 0.8, col: alpha(B.K.ink, 0.35) });
      },
      connect: function (B) {
        // rays from the near edge of one word that meet at a point on the other, ruled thin
        var a = B.b, b = B.to, s = B.s;
        if (!b) return;
        var tip = rectEdge(b, 5 * s, [a.x + a.w / 2, a.y + a.h / 2]), mid = rectEdge(a, 4 * s, tip);
        var dx = tip[0] - mid[0], dy = tip[1] - mid[1], d = Math.hypot(dx, dy) || 1, n = [-dy / d, dx / d], spread = Math.max(a.h, 14 * s) * 0.7;
        [-1, 0, 1].forEach(function (k) {
          var t0 = [mid[0] + n[0] * spread * k, mid[1] + n[1] * spread * k];
          B.stroke(lineP(t0, tip), { pen: 'rule', w: k ? 0.9 : 1.3 });
        });
        B.fn(function (c, u) { c.fillStyle = B.K.ink; dot(c, tip[0], tip[1], 2.4 * s * u); }, { len: 5 * s });
        davinci_letter(B, 'A', tip[0] + n[0] * 14 * s, tip[1] + n[1] * 14 * s);
        B.edge = function (T) { return rectEdge(a, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (B.m.mark !== 'arrow' || !A.tail) return;
      var s = B.s, a = A.shaft ? A.shaft.ang : 0, b = B.b, C = [b.x + b.w / 2, b.y + b.h / 2], N = A.R ? [A.R.x + A.R.w / 2, A.R.y + A.R.h / 2] : C;
      var pa = davinci_beside(A.tail, a, N, 13 * s), pb = davinci_beside([A.tip[0] - Math.cos(a) * 8 * s, A.tip[1] - Math.sin(a) * 8 * s], a, C, 14 * s);
      davinci_letter(B, 'A', pa[0], pa[1]); davinci_letter(B, 'B', pb[0], pb[1]);
    }
  });
  var HOOKE_PLATE = { f: "'IM Fell English', Georgia, serif", i: true };
  // his crossing-out: the pen dragged back and forth over the word until it is a thick blotted bar
  function hooke_blot(B) {
    var b = B.b, s = B.s, r = B.r, y = b.y + b.h * 0.55, x0 = b.x - 3 * s, x1 = b.x + b.w + 3 * s, p = [], n = 3;
    for (var i = 0; i <= n; i++) {
      var yy = y + (i - n / 2) * 2.2 * s + (r() - 0.5) * s;
      p.push(i % 2 ? [x0 + r() * 3 * s, yy] : [x1 - r() * 3 * s, yy]);
    }
    p.unshift([x0, y - 3 * s]);
    B.stroke(B.hand(resample(p, 3 * s), 0.25), { w: 3.4 });
    B.edge = function (T) { return rectEdge(b, 6 * s, T); };
  }
  def('hooke', {
    name: 'Hooke', who: 'Robert Hooke', field: 'science', year: 1677,
    bio: 'Robert Hooke (1635-1703) was an English experimenter and the Royal Society\'s Curator of Experiments. His Micrographia (1665) showed a flea, a fly\'s eye and cork through a microscope, and gave us the word "cell." He also kept the Society\'s rough minutes in his own hand.',
    about: 'His Royal Society minutes of 1677: a fast brown italic, thick blotted crossings-out, carets for words put in between the lines, parentheses round asides, long dashes to fill a line, and the lettered keys and Fig. numbers of his Micrographia plates.',
    source: { text: 'Hooke Folio, rough Royal Society minutes in Hooke\'s hand, folio 133 (December 1677)', where: 'The Royal Society, London (Hooke Folio)', url: 'https://www.livesandletters.ac.uk/cell/Hooke/hooke_folio.php?id=131&option=image' },
    pen: 'nib', w: 1.6, ink: '#3a2414', accent: '#6b4a30', font: { f: "'Mr De Haviland', cursive" }, fonts: ["'IM Fell English', Georgia, serif"],
    size: 32, leading: 1.15, hand: { wob: 0.5, over: 0.25, bend: 0.1 }, hl: 'rgba(107,74,48,0.2)',
    head: 'none',
    marks: {
      highlight: function (B) { hatch(B, [1, -1], 6, { col: alpha(B.K.ink, 0.5), w: 0.7 }); },
      strike: hooke_blot,
      bracket: function (B) {
        // a pair of tall parentheses round the aside
        var b = B.b, s = B.s, y0 = b.y - 3 * s, y1 = b.y + b.h + 3 * s, d = Math.max(5 * s, (y1 - y0) * 0.14);
        B.stroke(B.hand(quadP([b.x - 4 * s, y0], [b.x - 4 * s - d * 2, (y0 + y1) / 2], [b.x - 4 * s, y1], 14), 0.2));
        var xr = b.x + b.w + 4 * s;
        B.stroke(B.hand(quadP([xr, y0], [xr + d * 2, (y0 + y1) / 2], [xr, y1], 14), 0.2));
        var tip = [xr + d + 6 * s, (y0 + y1) / 2];
        B.edge = function () { return tip; }; B.forceSide = 'right';
      },
      box: function (B) {
        MARKS.box(B);
        var b = B.b, s = B.s, p = 7 * s;
        tag(B, 'Fig. 1.', b.x + b.w + p, b.y + b.h + p + 15 * s, 15, { F: HOOKE_PLATE, align: 'right' });
        tag(B, 'Schem. I.', b.x - p, b.y - p - 10 * s, 14, { F: HOOKE_PLATE, align: 'left' });
      },
      note: function (B) {
        // a caret under the line where the words go in
        var b = B.b, s = B.s, t = [b.x + b.w * 0.5, b.y + b.h + 1 * s];
        B.stroke([[t[0] - 6 * s, t[1] + 9 * s], t, [t[0] + 6 * s, t[1] + 9 * s]], { w: 1.7 });
        B.edge = function (T) { return T[1] < b.y ? [t[0], b.y - 3 * s] : [t[0], t[1] + 9 * s]; };
        if (!B.m.side || B.m.side === 'auto') B.forceSide = 'top';
        B.wantLeader = true;
      }
    },
    noteDeco: function (B, A) {
      var s = B.s;
      if (B.m.mark === 'arrow' && A.tail) {
        // plate callouts: a letter at the end of the line instead of an arrowhead
        var t = A.tip, a = Math.atan2(t[1] - A.tail[1], t[0] - A.tail[0]);
        tag(B, 'A', t[0] - Math.cos(a) * 10 * s + Math.sin(a) * 10 * s, t[1] - Math.sin(a) * 10 * s - Math.cos(a) * 10 * s, 17, { F: HOOKE_PLATE });
      }
      if (A.R && A.lines.length) {
        // the long dash he ran out to the end of a line
        var c = B.c; c.save(); c.font = fontStr(B.F, A.px); var lw = c.measureText(A.lines[A.lines.length - 1]).width; c.restore();
        var y = A.R.y + A.lh * (A.lines.length - 1) + A.lh * 0.62, x = A.R.x + lw + 5 * s;
        B.stroke(B.hand(lineP([x, y], [x + 26 * s, y - 1 * s]), 0.15), { w: 1.3, ph: 'note', at: [0.9, 1.1] });
      }
    }
  });
  // a capital naming a point, in his hand
  function newton_letter(B, ch, x, y) {
    B.fn(function (c, u) { c.globalAlpha *= u; c.fillStyle = B.K.ink; c.font = fontStr(B.F, 20 * B.s); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, x, y); }, { len: 8 * B.s });
  }
  function newton_point(B, P, ch, off) {
    var s = B.s;
    B.fn(function (c, u) { c.fillStyle = B.K.ink; dot(c, P[0], P[1], 2.2 * s * u); }, { len: 4 * s });
    newton_letter(B, ch, P[0] + off[0] * s, P[1] + off[1] * s);
  }
  // of the two spots beside P across the line at angle a, the one farther from point C
  function newton_beside(P, a, C, d) {
    var n = [-Math.sin(a) * d, Math.cos(a) * d], p1 = [P[0] + n[0], P[1] + n[1]], p2 = [P[0] - n[0], P[1] - n[1]];
    return Math.hypot(p1[0] - C[0], p1[1] - C[1]) > Math.hypot(p2[0] - C[0], p2[1] - C[1]) ? p1 : p2;
  }
  def('newton', {
    name: 'Newton', who: 'Isaac Newton', field: 'science', year: 1666,
    bio: 'Isaac Newton (1643-1727) was an English mathematician and physicist. As a young Cambridge fellow he filled notebooks with experiments on light and color. His Principia (1687) set out the laws of motion and universal gravitation, proved with diagrams where every point gets a letter.',
    about: 'His Cambridge notebook on colors: a small fast brown hand, square brackets round later thoughts, paragraphs numbered in the margin, thick crossings-out, and ruled diagrams with every point lettered.',
    source: { text: 'Notebook with notes on colors, answering Hooke\'s Micrographia and Boyle (MS Add. 3958, p. 3)', where: 'Cambridge University Library, MS Add. 3958', url: 'https://commons.wikimedia.org/wiki/File:MS_Add._3958_-_3.jpg' },
    pen: 'nib', w: 1.5, ink: '#4a2f1a', accent: '#4a2f1a', font: { f: "'Bilbo', cursive" }, size: 28, leading: 1.15,
    hand: { wob: 0.4, over: 0.2, bend: 0.06 }, hl: 'rgba(160,120,70,0.2)',
    head: 'none',
    marks: {
      circle: function (B) {
        // a compass circle with its center and a radius, both lettered
        var E = B.ellipse(), s = B.s, R = Math.max(E.rx, E.ry);
        E.rx = E.ry = R; B.E = E;
        B.stroke(ellipseP(E.cx, E.cy, R, R, -PI / 2, -TAU, 0), { pen: 'rule', w: 1.6 });
        var pa = -PI / 6, P = [E.cx + Math.cos(pa) * R, E.cy + Math.sin(pa) * R];
        B.stroke(lineP([E.cx, E.cy], P), { pen: 'rule', w: 1.2 });
        newton_point(B, [E.cx, E.cy], 'S', [-9, 13]);
        newton_letter(B, 'P', P[0] + 11 * s, P[1] - 5 * s);
        B.edge = function (T) { return ellEdge(E, 5 * s, T); };
      },
      bracket: function (B) {
        // square brackets round the later text
        var b = B.b, s = B.s, y0 = b.y - 2 * s, y1 = b.y + b.h + 2 * s, d = 5 * s, xl = b.x - 4 * s, xr = b.x + b.w + 4 * s;
        B.stroke(B.hand([[xl + d, y0], [xl, y0], [xl, y1], [xl + d, y1]], 0.1), { w: 1.8 });
        B.stroke(B.hand([[xr - d, y0], [xr, y0], [xr, y1], [xr - d, y1]], 0.1), { w: 1.8 });
        var tip = [xr + 6 * s, (y0 + y1) / 2];
        B.edge = function () { return tip; }; B.forceSide = 'right';
      },
      strike: function (B) {
        // a thick inked bar, gone over twice
        var b = B.b, s = B.s, r = B.r, y = b.y + b.h * 0.55, x0 = b.x - 2 * s, x1 = b.x + b.w + 2 * s;
        B.stroke(B.hand([[x0, y], [x1, y - 1.5 * s], [x0 + 3 * s, y + 2 * s + r() * s], [x1 - 2 * s, y + 1 * s]], 0.2), { w: 3.6 });
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      },
      connect: function (B) {
        // a ruled line between two lettered points
        var a = B.b, b = B.to, s = B.s;
        if (!b) return;
        var A1 = rectEdge(a, 6 * s, [b.x + b.w / 2, b.y + b.h / 2]), B1 = rectEdge(b, 6 * s, [a.x + a.w / 2, a.y + a.h / 2]);
        B.stroke(lineP(A1, B1), { pen: 'rule', w: 1.4 });
        var ang = Math.atan2(B1[1] - A1[1], B1[0] - A1[0]), n = [-Math.sin(ang) * 13, Math.cos(ang) * 13];
        if (n[0] > 4 || (Math.abs(n[0]) <= 4 && n[1] > 0)) n = [-n[0], -n[1]];
        newton_point(B, A1, 'A', n); newton_point(B, B1, 'B', n);
        B.edge = function (T) { return rectEdge(a, 6 * s, T); };
      }
    },
    shaft: function (B, tail, tip) { return lineP(tail, tip); },
    noteDeco: function (B, A) {
      var s = B.s;
      if (A.tail && A.shaft && B.m.mark === 'arrow') {
        var a = A.shaft.ang, b = B.b, C = [b.x + b.w / 2, b.y + b.h / 2], N = A.R ? [A.R.x + A.R.w / 2, A.R.y + A.R.h / 2] : C;
        var pa = newton_beside(A.tail, a, N, 13 * s), pb = newton_beside(A.tip, a, C, 13 * s);
        newton_point(B, A.tail, 'A', [(pa[0] - A.tail[0]) / s, (pa[1] - A.tail[1]) / s]); newton_point(B, A.tip, 'B', [(pb[0] - A.tip[0]) / s, (pb[1] - A.tip[1]) / s]);
      }
      if (A.R && A.lines.length) {
        // the paragraph number he set in the margin
        var num = String(51 + ((B.m.seed | 0) * 7) % 40) + '.';
        tag(B, num, A.R.x - 8 * s, A.R.y + A.lh * 0.5, A.px / s * 0.9, { align: 'right', ph: 'note', at: [0, 0.2] });
      }
    }
  });
  // the inline figure of his Jupiter log: a small circle for the planet, crosses for the moons
  function galileo_star(c, x, y, z) {
    for (var k = 0; k < 3; k++) { var a = k * PI / 3 + 0.3; c.beginPath(); c.moveTo(x - Math.cos(a) * z, y - Math.sin(a) * z); c.lineTo(x + Math.cos(a) * z, y + Math.sin(a) * z); c.stroke(); }
  }
  def('galileo', {
    name: 'Galileo', who: 'Galileo Galilei', field: 'science', year: 1610,
    bio: 'Galileo Galilei (1564-1642) was an Italian astronomer. In January 1610 he turned his telescope on Jupiter and logged its moons night by night, each entry with a tiny star figure. Sidereus Nuncius (1610) made the moons and the Moon\'s mountains famous. The Inquisition later forced him to recant his support for a moving Earth.',
    about: 'His Jupiter log of January 1610: a quick Italian chancery hand in brown ink, entries headed "Adi 7", and the planet and its moons drawn right in the line, with or. and occ. for east and west; sepia wash for his Moon drawings.',
    source: { text: 'Observation log of Jupiter\'s moons, "Adi 7 di Gennaio 1610", autograph', where: 'Biblioteca Nazionale Centrale, Florence, Ms. Gal. 48, f. 30r', url: 'https://commons.wikimedia.org/wiki/File:Galileo_Galilei_(1564_-_1642)_-_A_di_7_di_Gennaio_1610_Giove_-_Manuscript_of_observations_of_Jupiter_and_its_satellites,_January_1610.jpg' },
    pen: 'nib', w: 1.8, ink: '#4a3520', accent: 'rgba(120,84,48,0.22)', font: { f: "'Tangerine', cursive", wt: 700 }, size: 38, leading: 1.0,
    hand: { wob: 0.7, over: 0.35, bend: 0.16 }, hl: 'rgba(120,84,48,0.22)',
    marks: {
      circle: function (B) {
        var E = B.ellipse(), f = wave(B.r);
        B.fill(ellipseP(E.cx, E.cy, E.rx * 0.97, E.ry * 0.97, 0, TAU, 0, 64, function (a) { return 1 + 0.05 * f(a * 2); }), { col: B.K.accent, rev: 'fade', len: E.rx, comp: 'multiply' });
        MARKS.circle(B);
      },
      highlight: function (B) {
        var b = B.b, s = B.s, f = wave(B.r), E = { cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: b.w / 2 + 8 * s, ry: b.h / 2 + 6 * s };
        B.fill(ellipseP(E.cx, E.cy, E.rx, E.ry, 0, TAU, 0, 64, function (a) { return 1 + 0.08 * f(a * 2); }), { col: B.K.hl, rev: 'wipe', dir: 'right', len: b.w, comp: 'multiply' });
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      // a dated heading, then the night's figure: * * O *, labeled or. (east) and occ. (west)
      var s = B.s, R = A.R, y = R.y - 13 * s, F = B.F, marks = ['*', '*', 'O', '*'], hx = R.x, gx;
      var c0 = B.c; c0.save(); c0.font = fontStr(F, 24 * s); gx = hx + c0.measureText('Adi 7').width + 14 * s; c0.restore();
      tag(B, 'Adi 7', hx, y + 2 * s, 24, { align: 'left', ph: 'note', at: [0.5, 0.8] });
      B.fn(function (c, u) {
        c.strokeStyle = B.K.ink; c.lineWidth = 1.1 * s;
        var shown = Math.ceil(u * marks.length);
        for (var i = 0; i < shown; i++) {
          var x = gx + i * 15 * s + (i >= 2 ? 4 * s : 0) + (i === 3 ? 4 * s : 0);
          if (marks[i] === 'O') { c.beginPath(); c.arc(x, y, 4.5 * s, 0, TAU); c.stroke(); }
          else galileo_star(c, x, y, 3.4 * s);
        }
      }, { ph: 'note', at: [0.8, 1.2] });
      tag(B, 'or.', gx - 2 * s, y - 14 * s, 22, { ph: 'note', at: [1.1, 1.3] });
      tag(B, 'occ.', gx + 57 * s, y - 14 * s, 22, { ph: 'note', at: [1.2, 1.4] });
    }
  });
  // the upright Roman capitals he lettered beside structures
  var CAJAL_KEY = { f: "'IM Fell English', Georgia, serif" };
  function cajal_key(B, ch, x, y, px, o) {
    o = o || {};
    B.fn(function (c, u) { c.globalAlpha *= u; c.fillStyle = o.col || B.K.ink; c.font = fontStr(CAJAL_KEY, (px || 19) * B.s); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, x, y); }, o.ph ? { ph: o.ph, at: o.at } : { len: 8 * B.s });
  }
  // fine stippling, the way he shaded tissue
  function cajal_stipple(B) {
    var b = B.b, s = B.s, x = b.x - 5 * s, y = b.y - 4 * s, w = b.w + 10 * s, h = b.h + 8 * s, r = rng(B.m.seed * 29 + 3), pts = [];
    var n = Math.floor(w * h / (60 * s * s));
    for (var i = 0; i < n; i++) pts.push([x + r() * w, y + r() * h, (0.35 + r() * 0.45) * s, r()]);
    B.fn(function (c, u) {
      c.fillStyle = B.K.ink;
      for (var i = 0; i < pts.length; i++) { var q = pts[i]; if (q[3] > u) continue; dot(c, q[0], q[1], q[2]); }
    }, { len: w * 0.8 });
    B.edge = function (T) { return rectEdge(b, 6 * s, T); };
  }
  // the chevrons he drew along a fiber to show which way the signal runs
  function cajal_flow(B, p, col) {
    if (!p || p.length < 4) return;
    var cl = cum(p), L = cl[cl.length - 1], s = B.s;
    [0.33, 0.62].forEach(function (u) {
      var q = at(p, cl, L * u), z = 6 * s, a = q[2];
      B.stroke([[q[0] - Math.cos(a - 0.5) * z, q[1] - Math.sin(a - 0.5) * z], [q[0], q[1]], [q[0] - Math.cos(a + 0.5) * z, q[1] - Math.sin(a + 0.5) * z]], { w: 1.4, col: col });
    });
  }
  // a few tapering fibers branching from the start of the line, like a cell's dendrites
  function cajal_branches(B, o, ang) {
    var s = B.s, r = B.r;
    for (var i = 0; i < 3; i++) {
      var a = ang + (i - 1) * 1.1 + (r() - 0.5) * 0.3, l = (10 + r() * 7) * s, e = [o[0] + Math.cos(a) * l, o[1] + Math.sin(a) * l];
      B.stroke(B.hand(quadP(o, [o[0] + Math.cos(a + 0.3) * l * 0.5, o[1] + Math.sin(a + 0.3) * l * 0.5], e, 8), 0.2), { w: 1.3 });
      var b2 = a + (r() < 0.5 ? -0.55 : 0.55);
      B.stroke(lineP(e, [e[0] + Math.cos(b2) * l * 0.4, e[1] + Math.sin(b2) * l * 0.4]), { w: 0.8, with: true });
    }
  }
  // of the two spots beside P across the line at angle a, the one farther from point C
  function cajal_beside(P, a, C, d) {
    var n = [-Math.sin(a) * d, Math.cos(a) * d], p1 = [P[0] + n[0], P[1] + n[1]], p2 = [P[0] - n[0], P[1] - n[1]];
    return Math.hypot(p1[0] - C[0], p1[1] - C[1]) > Math.hypot(p2[0] - C[0], p2[1] - C[1]) ? p1 : p2;
  }
  def('cajal', {
    name: 'Cajal', who: 'Santiago Ramón y Cajal', field: 'science', year: 1899,
    bio: 'Santiago Ramón y Cajal (1852-1934) was a Spanish neuroscientist. His ink drawings showed that the nervous system is made of separate nerve cells, and in his circuit drawings small arrows show which way the signal runs. He shared the 1906 Nobel Prize with Camillo Golgi.',
    about: 'His 1899 glia drawing and retina schematic: dense India ink on tan paper, fine stippling, upright capital keys beside each structure, numbered braces down the side, red for chosen cells, and a quick pencil note in the corner.',
    source: { text: 'Glial cells of the mouse spinal cord (1899), India ink on paper, with a pencil note in his hand', where: 'Instituto Cajal (CSIC), Madrid', url: 'https://commons.wikimedia.org/wiki/File:Nyt-Cajal_DRAWING_m1673-resized-for-web.jpg' },
    pen: 'ink', w: 2, ink: '#0d0d0d', accent: '#b8322a', third: '#2a3a6a', paper: '#efe2c9', font: { f: "'Cedarville Cursive', cursive" }, fonts: ["'IM Fell English', Georgia, serif"],
    size: 24, leading: 1.3, hand: { wob: 0.5, over: 0.3, bend: 0.22 }, hl: 'rgba(184,50,42,0.18)',
    marks: {
      highlight: cajal_stipple,
      bracket: function (B) {
        MARKS.bracket(B);
        var b = B.b, s = B.s, right = B.forceSide === 'right', x = right ? b.x + b.w + 8 * s + 9 * s * 1.3 + 9 * s : b.x - 8 * s - 9 * s * 1.3 - 9 * s;
        B.fn(function (c, u) { c.globalAlpha *= u; c.fillStyle = B.K.ink; c.font = fontStr(B.F, 22 * s); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('1', x, b.y + b.h / 2); }, { len: 8 * s });
        var tip = [x + (right ? 8 : -8) * s, b.y + b.h / 2];
        B.edge = function () { return tip; };
      },
      connect: function (B) {
        // a red fiber from one structure to the next, signal chevrons on it
        var a = B.b, b = B.to, s = B.s;
        if (!b) return;
        var tail = rectEdge(a, 6 * s, [b.x + b.w / 2, b.y + b.h / 2]), tip = rectEdge(b, 7 * s, [a.x + a.w / 2, a.y + a.h / 2]);
        B.shaftOpt = { col: B.K.accent };
        var n0 = B.items.length, sh = shaft(B, tail, tip, true);
        for (var i = n0; i < B.items.length; i++) B.items[i].col = B.K.accent;
        cajal_flow(B, sh.pts, B.K.accent);
        B.edge = function (T) { return rectEdge(a, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.shaft) return;
      var s = B.s;
      if (B.m.mark === 'arrow') {
        cajal_flow(B, A.shaft.pts);
        if (A.tail) cajal_branches(B, A.tail, A.shaft.ang + PI);
        var t = A.tip, a = A.shaft.ang;
        var b = B.b, pk = cajal_beside([t[0] - Math.cos(a) * 9 * s, t[1] - Math.sin(a) * 9 * s], a, [b.x + b.w / 2, b.y + b.h / 2], 14 * s);
        cajal_key(B, 'A', pk[0], pk[1], 19);
      }
    }
  });
  // a wavy photon line, the exchanged particle in his diagrams
  function feynman_photon(B, tail, tip) {
    var s = B.s, p = resample(lineP(tail, tip), 2 * s), cl = cum(p), L = cl[cl.length - 1], N = normals(p), per = 14 * s, amp = 6 * s;
    return p.map(function (q, i) { var u = cl[i] / L, k = Math.min(1, u / 0.06, (1 - u) / 0.06), o = Math.sin(cl[i] / per * TAU) * amp * k; return [q[0] + N[i][0] * o, q[1] + N[i][1] * o]; });
  }
  def('feynman', {
    name: 'Feynman', who: 'Richard Feynman', field: 'science', year: 1962,
    bio: 'Richard Feynman (1918-1988) was an American physicist. His simple line diagrams of particles meeting and parting made quantum electrodynamics something you could draw. He shared the 1965 Nobel Prize, and his Caltech lectures of 1961-1964 became The Feynman Lectures on Physics.',
    about: 'His lecture notes: a fast slanted cursive in pen, square brackets round asides, a term circled tight, long thin arrows dragged across the page, a long rule between one thought and the next, and wavy photon lines from his diagrams.',
    source: { text: 'Lecture preparation notes, "Induction / Betatron / Angular Momentum paradox", page 2 (1961-1964)', where: 'Caltech Archives, Feynman Papers, folder 40.3', url: 'https://www.feynmanlectures.caltech.edu/RPF_2_4_A_40_3.html' },
    pen: 'ink', w: 1.7, ink: '#1d1d2a', accent: '#1d1d2a', font: { f: "'Nothing You Could Do', cursive" }, size: 24, leading: 1.35,
    hand: { wob: 0.9, over: 0.6, bend: 0.1 }, headSize: 11,
    marks: {
      circle: function (B) {
        // tight and a bit lopsided, like the "1/2" he ringed
        var b = B.b, s = B.s, E = { cx: b.x + b.w / 2 + 1.5 * s, cy: b.y + b.h / 2, rx: b.w / 2 + 6 * s, ry: b.h / 2 + 4 * s };
        B.stroke(B.loop(E)); B.E = E; B.edge = function (T) { return ellEdge(E, 4 * s, T); };
      },
      bracket: function (B) {
        var b = B.b, s = B.s, y0 = b.y - 3 * s, y1 = b.y + b.h + 3 * s, d = 6 * s, xl = b.x - 5 * s, xr = b.x + b.w + 5 * s;
        B.stroke(B.hand([[xl + d, y0 + 1 * s], [xl, y0], [xl - 1 * s, y1], [xl + d, y1 + 1 * s]], 0.2));
        B.stroke(B.hand([[xr - d, y0], [xr, y0 + 1 * s], [xr + 1 * s, y1], [xr - d, y1]], 0.2));
        var tip = [xr + 6 * s, (y0 + y1) / 2];
        B.edge = function () { return tip; }; B.forceSide = 'right';
      },
      connect: function (B) {
        // two points joined by a photon: a vertex dot at each end
        var a = B.b, b = B.to, s = B.s;
        if (!b) return;
        var t0 = rectEdge(a, 6 * s, [b.x + b.w / 2, b.y + b.h / 2]), t1 = rectEdge(b, 6 * s, [a.x + a.w / 2, a.y + a.h / 2]);
        B.stroke(feynman_photon(B, t0, t1), { w: 1.5 });
        [t0, t1].forEach(function (q) { B.fn(function (c, u) { c.fillStyle = B.K.ink; dot(c, q[0], q[1], 2.6 * s * u); }, { len: 5 * s }); });
        B.edge = function (T) { return rectEdge(a, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (B.m.mark !== 'note' || !A.R || !A.lines.length) return;
      // the long rule he drew across the page between one thought and the next
      var s = B.s, R = A.R, y = A.side === 'bottom' ? R.y + R.h + 8 * s : R.y - 7 * s, x0 = Math.max(4 * s, R.x - 30 * s), x1 = Math.min(B.W - 4 * s, R.x + R.w + 40 * s);
      B.stroke(B.hand(lineP([x0, y + 2 * s], [x1, y - 2 * s]), 0.3), { w: 1.1, ph: 'note', at: [0.9, 1.2] });
    }
  });
  // the rose diagram: twelve monthly wedges, all measured from the center as the common vertex.
  // In each month the blue (disease) wedge sits behind the pink (wounds) and the dark (all other causes).
  function nightingale_rose(B) {
    var E = B.ellipse(), s = B.s, r = B.r, n = 12, M = Math.max(Math.min(E.rx * 0.8, 110 * s), E.ry * 1.4), wedges = [];
    for (var i = 0; i < n; i++) {
      var blue = 0.95 + 0.7 * r() * r() + 0.35 * Math.max(0, Math.sin(i * 0.55 + 0.8));
      wedges.push([blue, 0.45 + 0.35 * r(), 0.3 + 0.25 * r()]);
    }
    var pal = [['rgba(169,195,204,0.8)', null], ['rgba(230,184,174,0.75)', null], ['rgba(125,116,112,0.3)', 'rgba(30,26,23,0.45)']];
    B.fn(function (c, u) {
      c.save(); c.globalCompositeOperation = 'multiply';
      for (var i = 0; i < n; i++) {
        var g = outCubic(seg(u, i / n * 0.6, i / n * 0.6 + 0.4)); if (g <= 0) continue;
        var a0 = -PI / 2 + i * TAU / n, a1 = a0 + TAU / n;
        for (var k = 0; k < 3; k++) {
          var R = wedges[i][k] * M * g;
          c.beginPath(); c.moveTo(E.cx, E.cy);
          for (var j = 0; j <= 8; j++) { var a = lerp(a0, a1, j / 8); c.lineTo(E.cx + Math.cos(a) * R, E.cy + Math.sin(a) * R); }
          c.closePath(); c.fillStyle = pal[k][0]; c.fill();
          if (pal[k][1]) { c.strokeStyle = pal[k][1]; c.lineWidth = 0.8 * s; c.stroke(); }
        }
      }
      c.restore();
    }, { len: M * 3 });
    var big = 0;
    wedges.forEach(function (w) { big = Math.max(big, w[0]); });
    var F = { cx: E.cx, cy: E.cy, rx: M * big, ry: M * big };
    B.E = F; B.edge = function (T) { return ellEdge(F, 4 * s, T); };
  }
  def('nightingale', {
    name: 'Nightingale', who: 'Florence Nightingale', field: 'science', year: 1858,
    bio: 'Florence Nightingale (1820-1910) was an English nurse and statistician. She led the nurses at the Barrack Hospital at Scutari in the Crimean War. Her 1858 rose diagram showed that far more soldiers died of preventable disease than of wounds. In 1859 she became the first woman elected to the Royal Statistical Society.',
    about: 'Her Scutari letters and the 1858 rose diagram: a big, fast, hard-pressed slanted hand in black ink, three or four words to a line, and wedges in blue, pink and dark gray that all start at the center, joined by a dotted line.',
    source: { text: 'Letter from the Barrack Hospital, Scutari, 5 July 1856, first page', where: 'Wellcome Collection, M0000369', url: 'https://commons.wikimedia.org/wiki/File:First_page_of_a_letter_written_by_Florence_Nightingale_Wellcome_M0000369.jpg' },
    pen: 'nib', w: 2.4, ink: '#1e1a17', accent: '#a9c3cc', font: { f: "'Kristi', cursive" }, size: 34, leading: 1.15,
    hand: { wob: 0.5, over: 0.45, bend: 0.15 }, hl: 'rgba(230,184,174,0.6)',
    marks: {
      circle: nightingale_rose,
      underline: function (B) { MARKS.underline(B); B.items[B.items.length - 1].w = 3.4 * B.s; },
      connect: function (B) {
        // the dotted line that joins her two roses, with its one bend
        var a = B.b, b = B.to, s = B.s;
        if (!b) return;
        var t0 = rectEdge(a, 6 * s, [b.x + b.w / 2, b.y + b.h / 2]), t1 = rectEdge(b, 6 * s, [a.x + a.w / 2, a.y + a.h / 2]);
        var dx = t1[0] - t0[0], dy = t1[1] - t0[1], d = Math.hypot(dx, dy) || 1, o = Math.max(14 * s, d * 0.12);
        var k = [lerp(t0[0], t1[0], 0.45) - dy / d * o, lerp(t0[1], t1[1], 0.45) + dx / d * o];
        if (k[1] < Math.min(t0[1], t1[1])) k = [lerp(t0[0], t1[0], 0.45) + dy / d * o, lerp(t0[1], t1[1], 0.45) - dx / d * o];
        B.stroke([t0, k, t1], { pen: 'running', w: 1.6 });
        B.edge = function (T) { return rectEdge(a, 6 * s, T); };
      }
    }
  });
  // the big loop that closes his signature, swung under the note from the right and back round on the left
  function edison_loop(B, A) {
    var s = B.s, R = A.R, y = R.y + R.h + 4 * s, x0 = R.x - 4 * s, x1 = R.x + R.w + 18 * s, h = 14 * s;
    var p = [].concat(
      quadP([x1, y - h * 0.6], [lerp(x0, x1, 0.55), y + h * 1.3], [x0 + 6 * s, y + h * 0.4], 18),
      ellipseP(x0 + 10 * s, y - h * 0.5, 11 * s, h * 0.95, PI / 2, PI * 1.6, 0, 18));
    B.stroke(B.hand(p, 0.15), { w: 1.3, ph: 'note', at: [0.85, 1.25] });
  }
  def('edison', {
    name: 'Edison', who: 'Thomas Edison', field: 'science', year: 1877,
    bio: 'Thomas Edison (1847-1931) was an American inventor who held over a thousand US patents, including the phonograph and a practical light bulb. He started as a telegraph operator, and his upright, separate letters came from copying messages fast. At Menlo Park his lab kept dated notebooks, often signed by witnesses.',
    about: 'His phonograph sketch of 1877 and his Kinetoscope preface: small upright letters standing apart on a thin line, plain underlines, a quick loose sketch with a title and a date in the corner, and the big loop of his signature.',
    source: { text: 'Sketch of the phonograph, dated Nov. 20 1877, signed by witnesses Batchelor and Kruesi', where: 'Thomas Edison National Historical Park (US National Park Service)', url: 'https://commons.wikimedia.org/wiki/File:Phonograph_sketch.jpg' },
    pen: 'ink', w: 1.5, ink: '#1f1b18', accent: '#1f1b18', font: { f: "'Annie Use Your Telescope', cursive" }, size: 27, leading: 1.45,
    hand: { wob: 0.45, over: 0.25, bend: 0.12 }, hl: 'rgba(160,150,130,0.25)',
    marks: {
      box: function (B) {
        // a loose sketch box with the date in the corner, as on his lab sketches
        MARKS.box(B);
        var b = B.b, s = B.s;
        tag(B, 'Nov 20 1877', b.x + b.w + 8 * s, b.y - 18 * s, 17, { align: 'right' });
      },
      underline: function (B) {
        var b = B.b, s = B.s, r = B.r, y = b.y + b.h + 4 * s;
        B.stroke(B.hand(quadP([b.x - 2 * s, y], [b.x + b.w / 2, y + (r() - 0.3) * 3 * s], [b.x + b.w + 3 * s, y - 1 * s], 12), 0.25));
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (B.m.mark === 'note' && A.R && A.lines.length) edison_loop(B, A);
    }
  });
  // a point on the ellipse E pushed out by k along angle a
  function leavitt_on(E, a, k) { return [E.cx + Math.cos(a) * (E.rx + k), E.cy + Math.sin(a) * (E.ry + k)]; }
  def('leavitt', {
    name: 'Leavitt', who: 'Henrietta Swan Leavitt', field: 'science', year: 1912,
    bio: 'Henrietta Swan Leavitt (1868-1921) was an American astronomer. Harvard College Observatory hired her as a "computer" to measure stars on glass photographic plates. In 1912 she showed that a Cepheid star\'s period gives its true brightness, the yardstick later used to measure the universe.',
    about: 'Her ink marks on plate I30187: straight ruled spokes out to the comparison stars, a script letter at each end, a later relabel in red ink, and notes signed H.S.L.',
    source: { text: 'Plate I30187 (17 March 1903) and its jacket, with her black and red ink marks and notes initialed H.S.L.', where: 'Harvard College Observatory Plate Stacks; reproduced in Schechner and Sliski, arXiv 1602.03475, Fig. 3', url: 'https://arxiv.org/pdf/1602.03475' },
    pen: 'ink', w: 1.5, ink: '#1c1a17', accent: '#b3243a', font: { f: "'Homemade Apple', cursive" }, size: 20, leading: 1.3,
    hand: { wob: 0.15, over: 0, bend: 0.04 }, hl: 'rgba(179,36,58,0.14)', headSize: 10,
    marks: {
      // the comparison burst: spokes that stop short of the star, each keyed with a letter; two get a red relabel later
      circle: function (B) {
        var m = B.m; m.pad = m.pad == null ? 0.5 : m.pad;
        var E = B.ellipse(), s = B.s, r = B.r, keys = 'abcdefgh', red = [1, 4], far = 0;
        // spokes fan up and down, clear of the words to either side
        var ang = [-145, -105, -70, -35, 40, 85, 130], n = ang.length;
        for (var i = 0; i < n; i++) {
          var a = (ang[i] + (r() - 0.5) * 14) * PI / 180, l = (20 + r() * 14) * s;
          far = Math.max(far, l);
          B.stroke(B.hand(lineP(leavitt_on(E, a, 0), leavitt_on(E, a, l)), 0.12), { w: 1.7 });
          var P = leavitt_on(E, a, l + 10 * s);
          tag(B, keys[i], P[0], P[1], 19);
          if (red.indexOf(i) >= 0) {
            var right = Math.cos(a) >= 0, rk = keys[(i + 3) % n];
            tag(B, right ? '=' + rk : rk + '=', P[0] + (right ? 8 : -8) * s, P[1], 18,
              { col: B.K.accent, align: right ? 'left' : 'right', ph: 'deco', at: [1.1, 1.45] });
          }
        }
        var E2 = { cx: E.cx, cy: E.cy, rx: E.rx + far + 18 * s, ry: E.ry + far + 18 * s };
        B.E = E2;
        B.edge = function (T) { return ellEdge(E2, 3 * s, T); };
      },
      // ruled box whose sides run on past the field, like her guide lines on the glass
      box: function (B) {
        var b = B.b, s = B.s, p = 7 * s, e = 16 * s, x0 = b.x - p, y0 = b.y - p, x1 = b.x + b.w + p, y1 = b.y + b.h + p;
        B.stroke(B.hand(lineP([x0, y0 - e], [x0, y1 + e]), 0.1));
        B.stroke(B.hand(lineP([x0, y0], [x1, y0]), 0.1), { w: 1.2 });
        B.stroke(B.hand(lineP([x1, y0 - e], [x1, y1 + e]), 0.1));
        B.stroke(B.hand(lineP([x1, y1], [x0, y1]), 0.1), { w: 1.2 });
        B.edge = function (T) { return rectEdge(b, p + 5 * s, T); };
      }
    },
    // signs the note, as on the jacket ("confirms the above note H.S.L.")
    noteDeco: function (B, A) {
      if (!A.R || !A.lines.length) return;
      var c = B.c, s = B.s, R = A.R, n = A.lines.length, lw;
      c.save(); c.font = fontStr(B.F, A.px); lw = c.measureText(A.lines[n - 1]).width; c.restore();
      var px = A.px / s * 0.72, x = R.x + lw + 10 * s, y = R.y + A.lh * (n - 0.45);
      if (x + 50 * s > B.W) { x = R.x + R.w - 50 * s; y += A.lh * 0.9; }
      tag(B, 'H.S.L.', x, y, px, { align: 'left', ph: 'note', at: [0.95, 1.1] });
    }
  });
  // a long fast rule that closes a section, as under "Merci" in his 1959 letters: it rises a little and runs well past the word
  function picasso_rule(B, x0, x1, y, o) {
    var r = B.r, rise = (x1 - x0) * (0.025 + r() * 0.03);
    return B.stroke(B.hand(lineP([x0, y + rise * 0.5], [x1, y - rise * 0.5]), 0.25), o);
  }
  def('picasso', {
    name: 'Picasso', who: 'Pablo Picasso', field: 'art', year: 1959,
    bio: 'Pablo Picasso (1881-1973) was a Spanish painter and sculptor who spent most of his life in France and co-founded Cubism with Georges Braque. He bought the Chateau de Vauvenargues in 1958. His letters to friends are written huge and fast, a few words to a line, in ballpoint or colored crayon.',
    about: 'His 1959 letters to Max Pellequer: blue ballpoint, huge loose words, long rules that close each section, and orange-red wax crayon.',
    source: { text: 'Autograph letter to Max Pellequer with a crayon sketch of the chateau, Vauvenargues, 7 August 1959', where: 'PIASA, Paris (auction lot)', url: 'https://www.piasa.fr/en/products/pablo-picasso-1881-1973-chateau-de-vauvenargues-1959_65b7d0cdb100a807026429' },
    pen: 'ink', w: 2.6, ink: '#2a3b8c', accent: '#e2502e', font: { f: "'Zeyada', cursive" }, size: 32,
    hand: { wob: 0.35, over: 0.7, bend: 0.2 }, hl: 'rgba(226,80,46,0.3)',
    marks: {
      underline: function (B) {
        var b = B.b, s = B.s;
        picasso_rule(B, b.x - 0.15 * b.w - 6 * s, b.x + b.w * 1.2 + 12 * s, b.y + b.h + 6 * s);
        B.edge = function (T) { return rectEdge(b, 8 * s, T); };
      },
      // the crayon pages: wax strokes laid across the word
      highlight: function (B) {
        var b = B.b, s = B.s, y = b.y + b.h / 2;
        [-0.18, 0.16].forEach(function (k, i) {
          B.stroke(B.hand(lineP([b.x - 5 * s, y + k * b.h + 1.5 * s], [b.x + b.w + 6 * s, y + k * b.h - 1.5 * s]), 0.3),
            { pen: 'crayon', col: alpha(B.K.accent, 0.75), w: (b.h * 0.55) / s });
        });
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R || A.side === 'top') return;
      var s = B.s, R = A.R;
      picasso_rule(B, R.x - 12 * s, Math.min(B.W - 6 * s, R.x + R.w + 34 * s), R.y + R.h + 8 * s, { ph: 'note', at: [0.75, 1] });
    }
  });
  // ink spatter where the pen came off fast (his later letters are flecked with it)
  function dali_spatter(B, x, y, z, at) {
    var r = rng(B.m.seed * 13 + Math.round(x * 7 + y)), D = [];
    for (var i = 0; i < 8; i++) { var a = r() * TAU, d = (3 + r() * r() * z) * B.s; D.push([x + Math.cos(a) * d, y + Math.sin(a) * d, (0.5 + r() * r() * 2.2) * B.s]); }
    B.fn(function (c, u) { c.fillStyle = B.K.ink; var n = Math.ceil(D.length * u); for (var j = 0; j < n; j++) dot(c, D[j][0], D[j][1], D[j][2]); }, { ph: 'deco', at: at || [1, 1.15] });
  }
  // a small vertical arrow with an open head, tip at (x, y); dir 1 points down, -1 points up
  function dali_arrow(B, x, y, dir, z) {
    B.stroke(B.hand(lineP([x, y - dir * z], [x, y]), 0.2), { w: 2.2 });
    B.stroke(B.hand([[x - z * 0.3, y - dir * z * 0.32], [x, y], [x + z * 0.3, y - dir * z * 0.32]], 0.1), { w: 2.2 });
  }
  // big double ticks for quotation marks
  function dali_ticks(B, x, y, at) {
    var s = B.s;
    [0, 6].forEach(function (dx) { B.stroke(lineP([x + dx * s + 2 * s, y - 7 * s], [x + dx * s, y + 4 * s]), { w: 2.6, ph: 'note', at: at }); });
  }
  def('dali', {
    name: 'Dalí', who: 'Salvador Dalí', field: 'art', year: 1950,
    bio: 'Salvador Dalí (1904-1989) was a Catalan Surrealist painter who lived and worked at Port Lligat on the Costa Brava. The Surrealists expelled him in 1939, partly over his politics. He painted The Madonna of Port Lligat in 1949 and 1950 and promoted it like a show.',
    about: 'His letters about the Madonna paintings: big spaced capitals, a word boxed, twin arrows above and below a word, big double-tick quotes and ink spatter.',
    source: { text: 'Autograph letter in Spanish about his Assumption painting and a notice in TIME, about 1950', where: 'Kotte Autographs, BN54502', url: 'https://www.kotte-autographs.com/en/autograph/dali-salvador/' },
    pen: 'ink', w: 2.4, ink: '#1a1410', accent: '#2340b0', font: { f: "'Amatic SC', cursive", wt: 700 }, size: 34,
    hand: { wob: 0.6, over: 0.9, bend: 0.2 }, hl: 'rgba(35,64,176,0.2)',
    marks: {
      // "BRILLANTE": one arrow above pointing down, one below pointing up
      arrow: function (B) {
        var b = B.b, s = B.s, z = 20 * s, x = b.x + b.w * 0.45;
        dali_arrow(B, x - 4 * s, b.y - 3 * s, 1, z);
        dali_arrow(B, x + 4 * s, b.y + b.h + 3 * s, -1, z);
        B.edge = function (T) { return rectEdge(b, z + 8 * s, T); };
        B.wantLeader = true;
      }
    },
    after: function (B) {
      if (B.m.mark === 'arrow') return;
      for (var i = B.items.length - 1; i >= 0; i--) {
        var it = B.items[i];
        if (it.k === 's' && !it.ph) { var q = it.pts[it.pts.length - 1]; dali_spatter(B, q[0], q[1], 10); return; }
      }
    },
    noteDeco: function (B, A) {
      if (!A.R || A.lines.length > 2) return;
      var s = B.s, R = A.R, n = A.lines.length, c = B.c;
      c.save(); c.font = fontStr(B.F, A.px); var lw = c.measureText(A.lines[n - 1]).width; c.restore();
      dali_ticks(B, R.x - 14 * s, R.y + A.lh * 0.25, [0, 0.12]);
      dali_ticks(B, R.x + lw + 5 * s, R.y + A.lh * (n - 1) + A.lh * 0.25, [0.9, 1]);
    }
  });
  // a heavy looping scribble that blacks a word out, as in his letters to Theo
  function vangogh_blackout(B) {
    var b = B.b, s = B.s, cy = b.y + b.h * 0.55, R = Math.max(4 * s, b.h * 0.26), step = R * 0.55, x0 = b.x - 2 * s, x1 = b.x + b.w + 2 * s;
    [0, 1].forEach(function (pass) {
      var p = [], n = Math.ceil((x1 - x0) / step) * 10;
      for (var i = 0; i <= n; i++) {
        var t = i / 10 * TAU * 0.5, x = x0 + (x1 - x0) * i / n + Math.cos(t + pass) * R * 0.7;
        p.push([pass ? x1 + x0 - x : x, cy + Math.sin(t + pass) * R * (pass ? 0.8 : 1)]);
      }
      B.stroke(B.hand(p, 0.2), { w: 3 });
    });
    B.edge = function (T) { return rectEdge(b, 6 * s, T); };
  }
  // little blocks of short parallel reed-pen dashes, the block direction alternating (the floor in the Arles bedroom sketch)
  function vangogh_hatch(B) {
    var b = B.b, s = B.s, r = rng(B.m.seed * 3 + 5), z = 11 * s, x0 = b.x - 4 * s, x1 = b.x + b.w + 4 * s, y0 = b.y - 3 * s, y1 = b.y + b.h + 3 * s, D = [];
    for (var y = y0, row = 0; y < y1 - 2 * s; y += z, row++) {
      for (var x = x0, col = 0; x < x1 - 2 * s; x += z, col++) {
        var flat = (row + col) % 2 === 0, a = (flat ? 0.12 : 1.35) + (r() - 0.5) * 0.25, cx = x + z / 2, cy = y + z / 2, L = z * (0.7 + r() * 0.2);
        for (var k = -1; k <= 1; k++) {
          var ox = -Math.sin(a) * k * z * 0.3, oy = Math.cos(a) * k * z * 0.3;
          D.push([cx + ox - Math.cos(a) * L / 2, cy + oy - Math.sin(a) * L / 2, cx + ox + Math.cos(a) * L / 2, cy + oy + Math.sin(a) * L / 2]);
        }
      }
    }
    B.fn(function (c, u) {
      c.strokeStyle = alpha(B.K.ink, 0.4); c.lineWidth = 1.3 * s; c.lineCap = 'round';
      var n = Math.floor(D.length * u);
      for (var i = 0; i < n; i++) { c.beginPath(); c.moveTo(D[i][0], D[i][1]); c.lineTo(D[i][2], D[i][3]); c.stroke(); }
    }, { len: (x1 - x0) * 1.5 });
    B.edge = function (T) { return rectEdge(b, 7 * s, T); };
  }
  def('vangogh', {
    name: 'Van Gogh', who: 'Vincent van Gogh', field: 'art', year: 1885,
    bio: 'Vincent van Gogh (1853-1890) was a Dutch painter. More than 800 of his letters survive, most of them to his brother Theo, and many carry small ink sketches of the work he describes. He sold very little in his lifetime and died in 1890 at 37.',
    about: 'His 1885 letter to Theo with the Potato Eaters sketch: brown-black ink, phrases underlined twice, mistakes blacked out, and rows of reed-pen dashes.',
    source: { text: 'Letter to Theo van Gogh with a sketch of The Potato Eaters, 9 April 1885', where: 'Van Gogh Museum, Amsterdam', url: 'https://commons.wikimedia.org/wiki/File:Letter_from_Vincent_Van_Gogh_to_Theo_Van_Gogh_9_April_1885.jpeg' },
    pen: 'ink', w: 2.2, ink: '#3b2a1a', accent: '#3b2a1a', font: { f: "'Cedarville Cursive', cursive" }, size: 28, double: true,
    hand: { wob: 0.35, over: 0.25, bend: 0.15 },
    marks: { strike: vangogh_blackout, highlight: vangogh_hatch }
  });
  // red crayon strokes radiating from a center, like the hatching inside his crayon flower petals
  function matisse_rays(B, cx, cy, rx, ry, n, k0, k1, o) {
    var r = B.r;
    for (var i = 0; i < n; i++) {
      var a = -PI / 2 + i * TAU / n + (r() - 0.5) * 0.2, j = 0.9 + r() * 0.25;
      B.stroke(lineP([cx + Math.cos(a) * rx * k0, cy + Math.sin(a) * ry * k0], [cx + Math.cos(a) * rx * k1 * j, cy + Math.sin(a) * ry * k1 * j]), o);
    }
  }
  // a small crayon flower: five round petals in one blue contour, red strokes inside, a stem
  function matisse_flower(B, x, y, z) {
    var blue = B.st.third, at = [0.55, 1];
    for (var k = 0; k < 5; k++) {
      var a = -PI / 2 + k * TAU / 5, px = x + Math.cos(a) * z * 0.6, py = y + Math.sin(a) * z * 0.6;
      B.stroke(ellipseP(px, py, z * 0.42, z * 0.42, a + PI * 0.75, TAU * 0.8, 0, 24), { pen: 'crayon', col: blue, w: 3.4, ph: 'note', at: at });
      for (var j = -1; j <= 1; j++) {
        var b = a + j * 0.35;
        B.stroke(lineP([x + Math.cos(b) * z * 0.3, y + Math.sin(b) * z * 0.3], [x + Math.cos(b) * z * 0.8, y + Math.sin(b) * z * 0.8]), { pen: 'crayon', col: B.K.accent, w: 3, ph: 'note', at: at });
      }
    }
    B.stroke(quadP([x, y + z], [x + z * 0.3, y + z * 1.6], [x + z * 0.9, y + z * 2.2], 10), { pen: 'crayon', col: blue, w: 3, ph: 'note', at: at });
  }
  def('matisse', {
    name: 'Matisse', who: 'Henri Matisse', field: 'art', year: 1949,
    bio: 'Henri Matisse (1869-1954) was a French painter who led the Fauves around 1905. He lived in Nice from 1917, from 1938 at the Hotel Regina in Cimiez. In his last years, often bedridden, he made large works from cut paper.',
    about: 'His 1949 letters and a crayon sheet for Max Pellequer: fast slanted blue ink, a clean crayon contour, red crayon hatching and a zigzag cross-out.',
    source: { text: 'Correspondence with Max Pellequer, 1949: letter, crayon flower with inscription, postcard and envelope', where: 'PIASA, Paris (auction lot)', url: 'https://www.piasa.fr/en/products/henri-matisse-1869-1954-correspondance-autographe-avec-max-pellequer-1949_65b7d0ce1b17e039668789' },
    pen: 'ink', w: 2, ink: '#2b3fa0', accent: '#e0504a', third: '#4a78c8', font: { f: "'Kristi', cursive" }, size: 32,
    hand: { wob: 0.3, over: 0.05, bend: 0.2 }, hl: 'rgba(224,80,74,0.3)',
    marks: {
      // one clean crayon contour, closed, no overshoot
      circle: function (B) {
        var E = B.ellipse(); B.E = E;
        B.stroke(B.loop(E), { pen: 'crayon', col: B.st.third, w: 5 });
        B.edge = function (T) { return ellEdge(E, 5 * B.s, T); };
      },
      highlight: function (B) {
        var b = B.b, s = B.s, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        matisse_rays(B, cx, cy, b.w / 2 + 10 * s, b.h / 2 + 9 * s, Math.max(14, Math.round(b.w / (6 * s))), 0.72, 1.12, { pen: 'crayon', col: B.K.accent, w: 3.2 });
        B.edge = function (T) { return rectEdge(b, 10 * s, T); };
      },
      // the envelope: an old address crossed out with a heavy zigzag
      strike: function (B) {
        var b = B.b, s = B.s, p = [], n = Math.max(4, Math.round(b.w / (7 * s)));
        for (var i = 0; i <= n; i++) p.push([b.x - 3 * s + (b.w + 6 * s) * i / n, b.y + b.h * (i % 2 ? 0.3 : 0.75)]);
        B.stroke(B.hand(p, 0.2), { w: 2.6, col: '#1a1a1a' });
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R || A.lines.length > 3) return;
      var z = 13 * B.s, P = besideNote(B, A, z * 1.4);
      matisse_flower(B, P[0], P[1] - z * 0.6, z);
    }
  });
  def('mondrian', {
    name: 'Mondrian', who: 'Piet Mondrian', field: 'art', year: 1920,
    bio: 'Piet Mondrian (1872-1944) was a Dutch painter. In 1917 he and Theo van Doesburg started the magazine De Stijl, and he wrote to Van Doesburg often about it. He moved to New York in 1940 and died there in 1944.',
    about: 'His 1920 letter sketching covers for De Stijl: pen-ruled frames whose lines run past the corners, block capitals, hatched letters and plain ruled underlines.',
    source: { text: 'Fragment of a letter to Theo van Doesburg with eight sketches for the NB De Stijl cover, 5 August 1920', where: 'Wikimedia Commons; his letters to Van Doesburg are edited in The Mondrian Papers (RKD, The Hague)', url: 'https://commons.wikimedia.org/wiki/File:Fragment_letter_by_Piet_Mondrian_to_Theo_van_Doesburg,_5_August_1920.jpg' },
    pen: 'nib', w: 3.4, ink: '#231c14', accent: '#231c14', font: { f: "'Jost', 'Futura', sans-serif", wt: 500 }, size: 24, caps: true,
    hand: { wob: 0.15, over: 1.4, bend: 0 }, hl: 'rgba(35,28,20,0.12)',
    marks: {
      circle: function (B) { MARKS.box(B); },
      // hatched like the NB letters in the cover sketches
      highlight: function (B) { hatch(B, [0], 4.5, { col: alpha(B.K.ink, 0.32), w: 1.1 }); }
    }
  });
  def('kandinsky', {
    name: 'Kandinsky', who: 'Wassily Kandinsky', field: 'art', year: 1930,
    bio: 'Wassily Kandinsky (1866-1944) was a Russian painter and one of the first to paint pure abstraction. He taught at the Bauhaus from 1922 to 1933 and set out his ideas about points, lines and planes in a 1926 book. He left Germany for France in 1933, and the Nazis later seized his work as degenerate.',
    about: 'His 1930 letter to Jawlensky: an upright, open hand in black ink with wide spacing, plain underlines, and the point and line of his teaching diagrams.',
    source: { text: 'Autograph letter in Russian to Alexej von Jawlensky, Dessau, 28 March 1930', where: 'Kotte Autographs, BN53775', url: 'https://www.kotte-autographs.com/en/autograph/kandinsky-wassily/' },
    pen: 'ink', w: 2.3, ink: '#141414', accent: '#141414', font: { f: "'Bad Script', cursive" }, size: 30,
    hand: { wob: 0.3, over: 0.15, bend: 0 },
    noteDeco: function (B, A) {
      var s = B.s;
      // the point a line starts from, as in his diagrams
      if (A.tail) { var t = A.tail; B.fn(function (c, u) { c.fillStyle = B.K.ink; dot(c, t[0], t[1], 4 * s * outBack(u)); }, { len: 8 * s }); }
    }
  });
  // a square seal in vermilion line work reading 百 (hundred), as stamped under his 1849 signature
  function hokusai_seal(B, x, y, z, at) {
    B.fn(function (c, u) {
      if (u <= 0) return;
      var k = 1 + 0.3 * (1 - outCubic(u));
      c.save(); c.translate(x, y); c.scale(k, k); c.globalAlpha *= 0.9 * Math.min(1, u * 2);
      c.strokeStyle = B.K.accent; c.lineCap = 'square'; c.lineJoin = 'miter';
      c.lineWidth = z * 0.1; c.strokeRect(-z / 2, -z / 2, z, z);
      c.lineWidth = z * 0.085; c.beginPath();
      c.moveTo(-z * 0.3, -z * 0.28); c.lineTo(z * 0.3, -z * 0.28);
      c.moveTo(z * 0.02, -z * 0.28); c.lineTo(-z * 0.07, -z * 0.17);
      c.rect(-z * 0.2, -z * 0.14, z * 0.4, z * 0.42);
      c.moveTo(-z * 0.2, z * 0.07); c.lineTo(z * 0.2, z * 0.07);
      c.stroke(); c.restore();
    }, { ph: 'deco', at: at });
  }
  def('hokusai', {
    name: 'Hokusai', who: 'Katsushika Hokusai', field: 'art', year: 1849,
    bio: 'Katsushika Hokusai (1760-1849) was a Japanese painter and printmaker. He made The Great Wave off Kanagawa around 1831 and filled many volumes of sketches. He changed his art name dozens of times, and late in life he signed with his age and the name Manji.',
    about: 'His brush design drawings: sumi ink, labels tied to their details by thin curved leader lines, open brush rings, and the square red seal under his signature.',
    source: { text: 'Yorimasa Killing Nue, ink drawing with brush labels (attributed)', where: 'Metropolitan Museum of Art, 57253', url: 'https://www.metmuseum.org/art/collection/search/57253' },
    pen: 'brush', w: 5.5, ink: '#1c1a17', accent: '#c8372d', font: { f: "'Zen Kurenaido', 'Klee One', cursive" }, size: 28,
    hand: { wob: 0.5, over: 0, bend: 0.45 }, headSize: 9, headW: 0.4, hl: 'rgba(28,26,23,0.12)',
    // leader lines are thin and curved
    shaft: function (B, tail, tip, ctl) { B.shaftOpt = { w: 1.7 }; return B.hand(quadP(tail, ctl, tip, 24), 0.3); },
    marks: {
      circle: function (B) {
        var E = B.ellipse(), s = B.s; B.E = E;
        B.stroke(ellipseP(E.cx, E.cy, E.rx, E.ry, PI * 0.62, -TAU * 0.93, -0.05, 0, function (a, u) { return 1 + 0.04 * Math.sin(u * 5); }), { w: 7 });
        B.edge = function (T) { return ellEdge(E, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var z = 24 * B.s, P = besideNote(B, A, z * 0.6);
      hokusai_seal(B, P[0], P[1], z, [1.25, 1.5]);
    }
  });
  // the blotted line: ink pressed from one sheet onto another, so it lands beaded and broken
  PENS.warhol_blot = function (c, S, L, s) {
    var r = rng(S.seed), w = S.w, segs = [], d = 0;
    while (d < S.len) {
      var on = (5 + r() * 22) * s, off = (0.8 + r() * 3.2) * s;
      segs.push([d, Math.min(S.len, d + on), r(), r() < 0.35]); d += on + off;
    }
    c.fillStyle = S.col;
    for (var i = 0; i < segs.length; i++) {
      var g = segs[i]; if (g[0] >= L) break;
      var d1 = Math.min(g[1], L), q = [], f = wave(rng(S.seed + i));
      for (var x = g[0]; x <= d1; x += 1.5 * s) { var p = at(S.pts, S.c, x); q.push([p[0], p[1]]); }
      if (q.length > 1) ribbon(c, q, function (j, dd) { return w * (0.62 + 0.3 * f(dd / (6 * s)) + 0.2 * g[2]); });
      var e = at(S.pts, S.c, d1); dot(c, e[0], e[1], w * (0.42 + 0.3 * g[2]));
      if (g[3] && g[1] < L) { var m = at(S.pts, S.c, g[1] + 1.6 * s); dot(c, m[0], m[1], w * 0.3); }
    }
  };
  // a loose dye wash laid in after the line, drifting off it
  function warhol_wash(B, poly, col, at) {
    B.fill(poly, { col: alpha(col, 0.5), rev: 'wipe', dir: 'right', comp: 'multiply', ph: 'deco', at: at || [1, 1.35] });
  }
  def('warhol', {
    name: 'Warhol', who: 'Andy Warhol', field: 'art', year: 1959,
    bio: 'Andy Warhol (1928-1987) was an American artist from Pittsburgh. In the 1950s he was a commercial illustrator in New York, known for blotted ink drawings, often lettered by his mother, Julia Warhola. In the 1960s he turned to silkscreened Pop paintings of soup cans and Marilyn Monroe, made at a studio he called the Factory.',
    about: 'His 1950s blotted-line books: a beaded, broken ink line, loose orange and yellow dye washes that drift off the outline, and Julia Warhola\'s slanting script.',
    source: { text: 'Fish Under Glass ("When you are in the Caribbean this Winter..."), 1959, blotted line with Julia Warhola\'s lettering', where: 'The Andy Warhol Museum, Pittsburgh, 1998.1.2076', url: 'https://www.warhol.org/exploring-tc-540-julia-warhola' },
    pen: 'warhol_blot', w: 4.2, ink: '#1d1a17', accent: '#e8642c', third: '#f0c53c', textCol: '#2b2724',
    font: { f: "'Waiting for the Sunrise', cursive" }, size: 25, leading: 1.25, hand: { wob: 0.5, over: 0.25, bend: 0.2 },
    hl: 'rgba(240,197,60,0.5)',
    marks: {
      circle: function (B) {
        MARKS.circle(B);
        var E = B.E, s = B.s;
        warhol_wash(B, ellipseP(E.cx + 6 * s, E.cy + 4 * s, E.rx * 0.92, E.ry * 0.86, 0, TAU, 0, 48), B.K.accent);
      },
      highlight: function (B) {
        var b = B.b, s = B.s, r = B.r, ox = 5 * s, oy = 4 * s, P = [], n = 16;
        // a soft, uneven blob of dye, off register from the word
        for (var i = 0; i <= n; i++) {
          var a = i / n * TAU, k = 1 + (r() - 0.5) * 0.12;
          P.push([b.x + b.w / 2 + ox + Math.cos(a) * (b.w / 2 + 7 * s) * k, b.y + b.h / 2 + oy + Math.sin(a) * (b.h / 2 + 4 * s) * k]);
        }
        B.fill(P, { col: B.K.hl, rev: 'wipe', dir: 'right', comp: 'multiply', len: b.w });
        B.edge = function (T) { return rectEdge(b, 8 * s, T); };
      }
    }
  });
  def('haring', {
    name: 'Haring', who: 'Keith Haring', field: 'art', year: 1982,
    bio: 'Keith Haring (1958-1990) was an American artist. From 1980 he drew in white chalk on the black paper covering empty New York subway ad panels, thousands of times. He was an AIDS activist and died of AIDS-related illness at 31.',
    about: 'His marker letters and his own letterhead: wide printed capitals, one thick even outline, and the short radiant dashes he drew around the baby to make it buzz.',
    source: { text: 'Handwritten letter on Keith Haring, Inc. letterhead, black marker, c. 1989', where: '1stdibs dealer listing', url: 'https://www.1stdibs.com/art/mixed-media/keith-haring-keith-haring-handwritten-letter-1989-keith-haring-letter/id-a_13415892' },
    pen: 'marker', w: 6, ink: '#111111', accent: '#e8322b', font: { f: "'Gloria Hallelujah', cursive" }, size: 23, caps: true, leading: 1.3, hand: { wob: 0.4, over: 0.15, bend: 0.25 },
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
  // a reader's pointing hand: small, plain, a few strokes in the text ink, with a cuff
  function scriptorium_hand(B, tip, a, z, flip) {
    manicule(B, tip, a, z, flip);
    var it = B.items[B.items.length - 1]; it.col = B.K.ink; it.w = 1 * B.s;
  }
  // the note's first word (one line) or first line (more) goes red, as a rubric
  function scriptorium_rubric(B, A) {
    var t = null, i, s = B.s;
    for (i = B.items.length - 1; i >= 0; i--) if (B.items[i].k === 't') { t = B.items[i]; break; }
    if (!t || !t.lines.length) return;
    var red = {}, k;
    for (k in t) red[k] = t[k];
    red.col = B.K.accent; red.at = [0, 0.3];
    if (t.lines.length > 1) {
      red.lines = [t.lines[0]];
      t.lines = t.lines.slice(1); t.y += t.lh; t.at = [0.25, 1];
    } else {
      var wd = t.lines[0].split(' '), first = wd.shift();
      if (!wd.length) { t.col = B.K.accent; return; }
      B.c.save(); B.c.font = fontStr(t.F, t.px); var dx = B.c.measureText(first + ' ').width; B.c.restore();
      red.lines = [first]; t.lines = [wd.join(' ')]; t.x += dx; t.w -= dx; t.at = [0.25, 1];
    }
    B.items.splice(B.items.indexOf(t), 0, red);
  }
  def('scriptorium', {
    name: 'Scriptorium', who: 'Medieval scribes', field: 'history', year: 1250,
    bio: 'A scriptorium was the writing room of a medieval monastery or convent, where books were copied by hand. Monks and nuns both did the work: in 2019, lapis lazuli found in a medieval woman\'s teeth showed she had been painting with the costliest blue. By the 1200s many books were also copied by paid scribes in city workshops.',
    about: 'A 13th-century Bible leaf: compact gothic textura, red rubrics, red and blue paraph marks, and small plain manicules drawn in the margin by readers.',
    source: { text: 'Latin Bible leaf with Jerome\'s prologue, 13th century, with a historiated initial, rubrics, paraphs and margin manicules', where: 'New York Public Library, Spencer Collection (NYPL b12455533)', url: 'https://commons.wikimedia.org/wiki/File:Historiated_initial_by_Hand_I_showing_Jerome_as_scribe._Manicules_in_margin_as_pointers_(NYPL_b12455533-420550).tif' },
    pen: 'nib', w: 2.2, ink: '#2a1d16', accent: '#b03024', third: '#2f4f9a', paper: '#efe6d2',
    font: { f: "'Grenze Gotisch', 'Texturina', serif", wt: 500 }, size: 26, leading: 1.1, hand: { wob: 0.3, over: 0.2, bend: 0.08 },
    hl: 'rgba(176,48,36,0.2)', head: 'none',
    shaft: function (B, tail, tip, ctl) {
      var s = B.s, a = Math.atan2(tip[1] - tail[1], tip[0] - tail[0]), L = Math.hypot(tip[0] - tail[0], tip[1] - tail[1]), z = Math.min(50 * s, L * 0.9);
      if (!B.wantHead && B.m.mark !== 'connect') { B.shaftOpt = { w: 1.4 }; return B.hand(quadP(tail, ctl, tip, 16), 0.2); }
      scriptorium_hand(B, tip, a, z, Math.cos(a) < 0 ? -1 : 1);
      var cuff = [tip[0] - Math.cos(a) * z, tip[1] - Math.sin(a) * z];
      B.shaftOpt = { w: 1.2 };
      return L - z > 10 * s ? B.hand(quadP(tail, [(tail[0] + cuff[0]) / 2 + (ctl[0] - (tail[0] + tip[0]) / 2), (tail[1] + cuff[1]) / 2 + (ctl[1] - (tail[1] + tip[1]) / 2)], cuff, 16), 0.2) : null;
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, blue = Math.floor(B.m.seed / 101) % 2 === 1;
      tag(B, '¶', R.x - A.px * 0.42, R.y + A.lh * 0.45, A.px / s, { col: blue ? B.st.third : B.K.accent, ph: 'note', at: [0, 0.15] });
      scriptorium_rubric(B, A);
    }
  });
  // his ringing mark on the dictionary slips: a loose freehand oval, left a little open where the pen lifts
  function champollion_ring(B) {
    var E = B.ellipse(), r = B.r, a0 = -PI * 0.25 + (r() - 0.5) * 0.6;
    E.rx *= 0.96; E.ry *= 1.05;
    B.stroke(B.hand(ellipseP(E.cx, E.cy, E.rx, E.ry, a0, -TAU * (0.9 + r() * 0.05), (r() - 0.5) * 0.12), 0.9), { w: 2.2 });
    B.E = E; B.edge = function (T) { return ellEdge(E, 5 * B.s, T); };
  }
  // a cartouche as he drew them on the Karnak columns: a long rounded ring with the tie bar at its end, in ink only
  function champollion_cartouche(B) {
    var b = B.b, s = B.s, p = 8 * s, x0 = b.x - p, y0 = b.y - p, x1 = b.x + b.w + p, y1 = b.y + b.h + p, R = (y1 - y0) / 2;
    var pts = [].concat(lineP([x0 + R, y0], [x1 - R, y0]), ellipseP(x1 - R, y0 + R, R, R, -PI / 2, PI, 0, 16), lineP([x1 - R, y1], [x0 + R, y1]), ellipseP(x0 + R, y0 + R, R, R, PI / 2, PI, 0, 16));
    B.stroke(B.hand(resample(pts, 3 * s), 0.35));
    B.stroke(B.hand(lineP([x1 + 4 * s, y0 + 1 * s], [x1 + 4 * s, y1 - 1 * s]), 0.2), { w: 3 });
    B.edge = function (T) { return rectEdge(b, p + 6 * s, T); };
  }
  def('champollion', {
    name: 'Champollion', who: 'Jean-François Champollion', field: 'history', year: 1828,
    bio: 'Jean-François Champollion (1790-1832) was a French scholar who deciphered Egyptian hieroglyphs in 1822, starting from royal names on the Rosetta Stone. He kept his hieroglyphic dictionary on numbered paper slips. In 1828 he finally reached Egypt and copied inscriptions at Karnak and other temples.',
    about: 'His dictionary slips and Karnak notes: an upright, half-printed French hand in brown-black ink, loose ovals around a sign group, running underlines, a slip number, and a pencil query.',
    source: { text: 'Cards for the Dictionnaire des hiéroglyphes (slips 145-156), Papiers de Champollion, vol. XIII', where: 'Bibliothèque nationale de France, Gallica ark btv1b10084911s', url: 'https://commons.wikimedia.org/wiki/File:Papiers_de_J.-Fr._Champollion_le_jeune_(1790-1832).XIXe_siècle._1re_série._XIII_Cartes_du_Dictionnaire_des_hiéroglyphes._-_btv1b10084911s_(029_of_226).jpg' },
    pen: 'ink', w: 2.2, ink: '#2b2118', accent: '#7a7670', paper: '#efe8da',
    font: { f: "'Kalam', cursive" }, size: 25, hand: { wob: 0.5, over: 0.25, bend: 0.15 },
    hl: 'rgba(43,33,24,0.14)',
    marks: {
      circle: champollion_ring,
      box: champollion_cartouche,
      cross: function (B) {
        MARKS.cross(B);
        var b = B.b;
        tag(B, '?', b.x + b.w + 14 * B.s, b.y + 2 * B.s, 22, { col: B.K.accent });
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, n = 145 + Math.abs(Math.floor(B.m.seed / 101)) % 12, y = R.y - 12 * s;
      if (y < 10 * s) y = R.y + R.h + 14 * s;
      tag(B, n + '.', R.x, y, 17, { align: 'left', ph: 'note', at: [0, 0.2] });
    }
  });
  // laid-and-couched work: long laid threads across the shape, tied down by rows of short couching stitches
  function bayeux_couched(B) {
    var b = B.b, s = B.s, x0 = b.x - 4 * s, x1 = b.x + b.w + 4 * s, y0 = b.y - 1 * s, y1 = b.y + b.h + 1 * s, fill = B.st.fill;
    B.fill(rectP(x0, y0, x1 - x0, y1 - y0), { col: alpha(fill, 0.35), rev: 'wipe', dir: 'right', len: b.w * 0.5, comp: 'multiply' });
    B.fn(function (c, u) {
      var g = 3.2 * s, cg = 11 * s, xe = x0 + (x1 - x0) * u;
      c.save(); c.globalCompositeOperation = 'multiply'; c.lineCap = 'round';
      c.strokeStyle = alpha(fill, 0.75); c.lineWidth = 1.6 * s;
      for (var y = y0 + g / 2; y < y1; y += g) { c.beginPath(); c.moveTo(x0, y); c.lineTo(xe, y); c.stroke(); }
      c.strokeStyle = alpha(shade(fill, 0.7), 0.8); c.lineWidth = 1.1 * s;
      for (var x = x0 + cg / 2, j = 0; x < xe; x += cg, j++) {
        for (var yy = y0 + (j % 2 ? 2 : 6) * s; yy < y1; yy += 8 * s) { c.beginPath(); c.moveTo(x - 1.2 * s, yy); c.lineTo(x + 1.2 * s, yy + 2.4 * s); c.stroke(); }
      }
      c.restore();
    }, { len: b.w });
    B.stroke(B.hand(rectP(x0, y0, x1 - x0, y1 - y0), 0.3), { w: 3.6, with: true, alpha: 0.85 });
    B.edge = function (T) { return rectEdge(b, 7 * s, T); };
  }
  def('bayeux', {
    name: 'Bayeux', who: 'Bayeux Tapestry embroiderers', field: 'history', year: 1070,
    bio: 'The Bayeux Tapestry is a strip of embroidered linen about 70 meters long telling the Norman conquest of England in 1066. It is stitched, not woven, most likely by English women, whose names were not recorded.',
    about: 'Scene 57, the death of Harold: wool on linen, stem-stitch outlines in terracotta and sage, laid-and-couched fills, and tall uneven stitched capitals in blue-green with dots between the words.',
    source: { text: 'Bayeux Tapestry, scene 57, "HAROLD REX INTERFECTUS EST"', where: 'Bayeux Museum, Bayeux, France', url: 'https://commons.wikimedia.org/wiki/File:Bayeux_Tapestry_scene57_Harold_death_(cropped).jpg' },
    pen: 'stitch', w: 5.5, ink: '#a5502f', accent: '#7d8f5a', fill: '#c8a85a', font: { f: "'Amatic SC', cursive", wt: 700 }, size: 30, caps: true,
    hand: { wob: 0.5, over: 0.3, bend: 0.2 }, paper: '#ece4d2', textCol: '#4f7b82', hl: 'rgba(200,168,90,0.4)',
    marks: { highlight: bayeux_couched },
    after: function (B) {
      var it = B.items; for (var i = 0; i < it.length; i++) if (it[i].k === 's' && i % 2 === 1 && it[i].pen === 'stitch') it[i].col = B.K.accent;
      // the inscription sets stacked dots between words: HAROLD : REX : INTERFECTUS
      if (B.m.note != null && B.m.note !== '' && B.m.dots !== false) {
        var m = {}, k; for (k in B.m) m[k] = B.m[k];
        m.note = String(m.note).trim().replace(/[,;.]/g, '').split(/\s+/).join(' : '); B.m = m;
      }
    }
  });
  // engraved stipple: dots that thin out away from a coast, as round the 1569 map's shores
  function mercator_stipple(B, inside, n, at) {
    var r = rng(B.m.seed * 13 + 5), pts = [], tries = 0;
    while (pts.length < n && tries < n * 30) {
      tries++;
      var q = inside(r(), r()); if (q) pts.push([q[0], q[1], r()]);
    }
    var s = B.s;
    B.fn(function (c, u) {
      c.fillStyle = B.K.ink;
      for (var i = 0; i < pts.length; i++) { if (pts[i][2] > u) continue; c.globalAlpha = 0.75; dot(c, pts[i][0], pts[i][1], 0.75 * s); }
    }, at ? { ph: 'deco', at: at } : { len: 60 * s });
  }
  // the swash a chancery hand throws off the end of a line
  function mercator_swash(B, A) {
    var s = B.s, R = A.R, t = null, i;
    for (i = B.items.length - 1; i >= 0; i--) if (B.items[i].k === 't') { t = B.items[i]; break; }
    if (!t) return;
    var last = t.lines[t.lines.length - 1];
    B.c.save(); B.c.font = fontStr(t.F, t.px); var lw = B.c.measureText(last).width; B.c.restore();
    var x = t.x + lw + 4 * s, y = t.y + t.lh * (t.lines.length - 1) + t.lh * 0.62, h = t.lh * 0.5;
    if (x + 44 * s > B.W) return;
    var ex = x + 30 * s, ey = y - h * 0.9, rx = 11 * s, ry = h * 0.8;
    var p = [].concat(quadP([x, y], [x + 18 * s, y + 3 * s], [ex + rx, ey], 12), ellipseP(ex, ey, rx, ry, 0, -TAU * 0.78, -0.3, 24));
    B.stroke(B.hand(resample(p, 2 * s), 0.1), { pen: 'nib', w: 1.8, ph: 'note', at: [0.85, 1.1] });
  }
  def('mercator', {
    name: 'Mercator', who: 'Gerardus Mercator', field: 'history', year: 1569,
    bio: 'Gerardus Mercator (1512-1594) was a Flemish mapmaker and engraver. In 1540 he published a manual for writing the italic hand, which he used to letter his own maps. His 1569 world map stretched the globe so that a constant compass course shows as a straight line, which is why sailors loved it.',
    about: 'His 1540 italic manual and the 1569 world map: a slanted chancery italic with swashes, straight rhumb lines, engraved stippling, ruled lines with pricked dots, and a compass rose.',
    source: { text: 'Literarum latinarum, quas italicas cursoriasque vocant, scribendarum ratio (Louvain, 1540), page of chancery italic', where: 'Bayerische Staatsbibliothek, Res/4 Graph. 83#Beibd.2', url: 'https://commons.wikimedia.org/wiki/File:Cancellaresca_von_Gerard_Mercator,_1540.PNG' },
    pen: 'ink', w: 1.7, ink: '#1e1b18', accent: '#1e1b18', paper: '#efe3c4', font: { f: "'Felipa', 'IM Fell DW Pica', serif" }, size: 30,
    hand: { wob: 0.25, over: 0.2, bend: 0 }, head: 'barbs', headSize: 10, hl: 'rgba(30,27,24,0.08)',
    shaft: function (B, tail, tip) { B.shaftOpt = { pen: 'rule', w: 1.8 }; return lineP(tail, tip); },
    marks: {
      circle: function (B) {
        MARKS.circle(B);
        var E = B.E, s = B.s;
        mercator_stipple(B, function (a, b) {
          var t = a * TAU, d = 1 + 3 * s / E.rx + b * b * 11 * s / Math.min(E.rx, E.ry);
          return [E.cx + Math.cos(t) * E.rx * d, E.cy + Math.sin(t) * E.ry * (1 + (d - 1) * E.rx / E.ry)];
        }, 180);
      },
      underline: function (B) {
        var b = B.b, s = B.s, y = b.y + b.h + 5 * s, x0 = b.x - 3 * s, x1 = b.x + b.w + 6 * s;
        B.stroke(lineP([x0, y], [x1, y]), { pen: 'rule', w: 2.2 });
        B.fn(function (c, u) { c.fillStyle = B.K.ink; c.globalAlpha *= u; dot(c, x1 + 7 * s, y, 1.8 * s); }, { len: 8 * s });
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      },
      highlight: function (B) {
        var b = B.b, s = B.s;
        mercator_stipple(B, function (u, v) { return [b.x - 3 * s + u * (b.w + 6 * s), b.y + v * b.h]; }, Math.round(b.w * b.h / (26 * s * s)));
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      mercator_swash(B, A);
      var s = B.s, R = A.R, z = 20 * s, x = A.side === 'left' ? R.x - z * 1.6 - 12 * s : R.x + R.w + z + 40 * s, y = R.y + R.h / 2;
      if (x - z < 0 || x + z > B.W) { x = R.x + R.w / 2; y = R.y - z - 10 * s; if (y - z < 0) y = R.y + R.h + z + 10 * s; }
      B.fn(function (c, u, post) {
        var sw = (1 - spring((post || 0) + u * 0.4, 9, 4)) * 0.3;
        c.save(); c.translate(x, y); c.rotate(sw); c.globalAlpha *= u;
        c.strokeStyle = B.K.ink; c.lineWidth = 0.8 * s; c.beginPath(); c.arc(0, 0, z * 0.6, 0, TAU); c.stroke();
        for (var i = 0; i < 16; i++) { var a = i * PI / 8; c.beginPath(); c.moveTo(Math.cos(a) * z * 0.6, Math.sin(a) * z * 0.6); c.lineTo(Math.cos(a) * z * 1.5, Math.sin(a) * z * 1.5); c.globalAlpha *= 0.6; c.stroke(); c.globalAlpha /= 0.6; }
        for (i = 0; i < 8; i++) {
          var a2 = -PI / 2 + i * PI / 4, l = i % 2 ? z * 0.55 : z, wd = z * 0.15;
          for (var h = -1; h <= 1; h += 2) {
            c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a2) * l, Math.sin(a2) * l); c.lineTo(Math.cos(a2 + h * PI / 2) * wd, Math.sin(a2 + h * PI / 2) * wd); c.closePath();
            c.fillStyle = h > 0 ? B.K.ink : '#efe3c4'; c.fill(); c.stroke();
          }
        }
        c.fillStyle = B.K.ink; c.font = fontStr(B.F, 13 * s); c.textAlign = 'center'; c.fillText('N', 0, -z - 3 * s);
        c.restore();
      }, { ph: 'note', at: [0.3, 0.9] });
    }
  });
  // troop counts written small and turned to run along the band, as on the chart (422.000 at the Niemen, 100.000 at Moscow)
  function minard_count(B, p, d, txt, side) {
    var s = B.s, P = at(p, cum(p), d);
    var a = P[2], flip = Math.cos(a) < 0, ang = flip ? a + PI : a, nx = -Math.sin(a) * side, ny = Math.cos(a) * side;
    B.fn(function (cx, u) {
      cx.save(); cx.globalAlpha *= u; cx.translate(P[0] + nx, P[1] + ny); cx.rotate(ang);
      cx.fillStyle = B.K.ink; cx.font = fontStr(B.F, 11 * s); cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(txt, 0, 0);
      cx.restore();
    }, { ph: 'note', at: [0.5, 0.9] });
  }
  def('minard', {
    name: 'Minard', who: 'Charles Joseph Minard', field: 'history', year: 1869,
    bio: 'Charles Joseph Minard (1781-1870) was a French civil engineer who turned to drawing statistical maps after he retired. His 1869 map of Napoleon\'s march on Moscow shows the army as a band that thins from 422,000 men to about 10,000. Its lettering was done on the stone by a lithographer, Regnier, not in Minard\'s own hand.',
    about: "The 1869 Carte figurative: arrows become tan flow bands with a thin black edge that narrow as they go, a black band for the return, troop counts turned along the band, and a small 19th-century italic.",
    source: { text: 'Carte figurative des pertes successives en hommes de l\'Armée Française dans la campagne de Russie 1812-1813 (1869)', where: 'Bibliothèque nationale de France, Gallica btv1b52504201x', url: 'https://commons.wikimedia.org/wiki/File:Minards_chart_Napoleons_Russian_campaign_of_1812_made_in_1869.jpg' },
    pen: 'rule', w: 2.4, ink: '#1a1a1a', accent: '#e5c9a8', paper: '#f3eee4', font: { f: "'Old Standard TT', 'Cormorant Garamond', Georgia, serif", i: true }, size: 22,
    hand: { wob: 0.2, over: 0.1, bend: 0.25 }, head: 'none', hl: 'rgba(229,201,168,0.6)',
    shaft: function (B, tail, tip, ctl) { B.shaftOpt = { col: B.K.accent, pen: 'flow', edge: B.K.ink, w: 18 }; return quadP(tail, ctl, tip, 30); },
    marks: {
      underline: function (B) {
        var b = B.b, s = B.s, y = b.y + b.h + 9 * s;
        B.stroke(lineP([b.x - 4 * s, y], [b.x + b.w + 6 * s, y]), { pen: 'flow', col: B.K.accent, w: 12, edge: B.K.ink });
        B.edge = function (T) { return rectEdge(b, 10 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.shaft || !A.shaft.pts) return;
      var s = B.s, p = A.shaft.pts, rp = p.slice().reverse(), N = normals(rp), off = 13 * s, L = cum(p)[p.length - 1];
      B.stroke(rp.map(function (q, i) { return [q[0] - N[i][0] * off, q[1] - N[i][1] * off]; }), { pen: 'rule', w: 3.2, col: B.K.ink });
      if (L > 90 * s) {
        minard_count(B, p, L * 0.12, '422.000', -(9 * s + 8 * s));
        minard_count(B, p, L * 0.82, '100.000', -(5.4 * s + 8 * s));
      }
    }
  });
  var BLETCHLEY_TYPE = "'Courier Prime', 'Courier New', monospace", BLETCHLEY_PENCIL = '#6b6b6b';
  // a Banbury sheet's punched holes: a row of round holes over the letters, overlapping where letters sit side by side
  function bletchley_holes(B) {
    var b = B.b, s = B.s, d = Math.min(b.h + 4 * s, 34 * s), n = Math.max(1, Math.round(b.w / (d * 0.85))), step = n > 1 ? (b.w - d * 0.4) / (n - 1) : 0, cy = b.y + b.h / 2;
    var x0 = n > 1 ? b.x + d * 0.2 : b.x + b.w / 2;
    B.fn(function (c, u) {
      var shown = Math.ceil(n * u - 1e-6);
      for (var i = 0; i < shown; i++) {
        var x = x0 + i * step;
        c.save(); c.fillStyle = 'rgba(70,86,104,0.32)'; c.beginPath(); c.arc(x, cy, d / 2, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(40,40,40,0.55)'; c.lineWidth = 1.2 * s; c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1 * s; c.beginPath(); c.arc(x, cy, d / 2 - 1.5 * s, 0.2 * PI, 0.8 * PI); c.stroke();
        c.restore();
      }
    }, { len: b.w });
    B.edge = function (T) { return rectEdge(b, d * 0.2 + 5 * s, T); };
  }
  function bletchley_pencil(it, B, w) { it.pen = 'pencil'; it.col = BLETCHLEY_PENCIL; it.w = (w || 2) * B.s; delete it.glyph; return it; }
  def('bletchley', {
    name: 'Bletchley', who: 'Bletchley Park', field: 'history', year: 1942,
    bio: 'Bletchley Park was Britain\'s codebreaking center in the Second World War, where Enigma and other ciphers were broken. By 1945 about three quarters of its roughly 10,000 staff were women. In Hut 8, analysts punched long Banbury sheets by hand to compare naval Enigma messages.',
    about: 'A Banbury sheet from Hut 8: typed columns, holes punched over letters, red crayon block capitals, pencil notes and arrows, and the typist\'s x-outs and underscores.',
    source: { text: 'Part of a Banbury sheet used in Banburismus, with red crayon "TGZ" and pencil reference notes', where: 'Bletchley Park (photographed on display)', url: 'https://commons.wikimedia.org/wiki/File:Part_of_a_Banbury_Sheet_as_used_in_Banburismus.jpg' },
    pen: 'typed', w: 16, ink: '#2a2a2a', accent: '#c8402a', paper: '#e9e2d0', font: { f: BLETCHLEY_TYPE }, fonts: ["'Patrick Hand SC', cursive"], size: 21, reveal: 'type', geo: true,
    hand: { wob: 0.4, over: 0.2, bend: 0.12 }, head: 'barbs', hl: 'rgba(200,64,42,0.3)',
    shaft: function (B, tail, tip, ctl) { B.shaftOpt = { pen: 'pencil', col: BLETCHLEY_PENCIL, w: 2 }; return B.hand(quadP(tail, ctl, tip, 20), 0.4); },
    headFn: function (B, tip, ang, z) {
      var a1 = [tip[0] - Math.cos(ang - 0.45) * z, tip[1] - Math.sin(ang - 0.45) * z], a2 = [tip[0] - Math.cos(ang + 0.45) * z, tip[1] - Math.sin(ang + 0.45) * z];
      B.stroke([a1, [tip[0], tip[1]], a2], { pen: 'pencil', col: BLETCHLEY_PENCIL, w: 2 });
    },
    marks: {
      circle: bletchley_holes,
      box: function (B) {
        var b = B.b, s = B.s, p = 6 * s, x0 = b.x - p, y0 = b.y - p, x1 = b.x + b.w + p, y1 = b.y + b.h + p, o = { font: BLETCHLEY_TYPE, w: 15 };
        B.stroke(lineP([x0, y0], [x1, y0]), Object.assign({ glyph: '-' }, o)); B.stroke(lineP([x1, y0], [x1, y1]), Object.assign({ glyph: '|', step: 8 * s }, o));
        B.stroke(lineP([x1, y1], [x0, y1]), Object.assign({ glyph: '-' }, o)); B.stroke(lineP([x0, y1], [x0, y0]), Object.assign({ glyph: '|', step: 8 * s }, o));
        B.edge = function (T) { return rectEdge(b, p + 5 * s, T); };
      },
      strike: function (B) { var b = B.b, y = b.y + b.h * 0.58; B.stroke(lineP([b.x, y], [b.x + b.w, y]), { glyph: 'x', font: BLETCHLEY_TYPE, w: Math.max(14, b.h * 0.9 / B.s) }); B.edge = function (T) { return rectEdge(b, 6 * B.s, T); }; },
      underline: function (B) { var b = B.b, y = b.y + b.h + 2 * B.s; B.stroke(lineP([b.x, y], [b.x + b.w, y]), { glyph: '_', font: BLETCHLEY_TYPE }); B.edge = function (T) { return rectEdge(b, 6 * B.s, T); }; },
      cross: function (B) { B.h.geo = false; MARKS.cross(B); var n = B.items.length; bletchley_pencil(B.items[n - 1], B); bletchley_pencil(B.items[n - 2], B); },
      bracket: function (B) { B.h.geo = false; MARKS.bracket(B); bletchley_pencil(B.items[B.items.length - 1], B); },
      highlight: function (B) {
        var b = B.b, s = B.s, y = b.y + b.h / 2;
        B.stroke(B.hand(lineP([b.x - 3 * s, y + 1 * s], [b.x + b.w + 3 * s, y - 1 * s]), 0.3), { pen: 'crayon', col: alpha(B.K.accent, 0.55), w: (b.h * 0.9) / s });
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, r = rng(B.m.seed * 29 + 3), L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', code = '';
      for (var i = 0; i < 3; i++) code += L.charAt(Math.floor(r() * 26));
      var y = R.y - 16 * s; if (y < 12 * s) y = R.y + R.h + 18 * s;
      tag(B, code, R.x, y, 22, { align: 'left', col: B.K.accent, F: { f: "'Patrick Hand SC', cursive" }, ph: 'note', at: [0, 0.2] });
    }
  });
  // colored-pencil underlines on the countdown sheet run green, red and orange
  var KRANZ_PENCILS = ['#3f8f4f', '#e5482b', '#f07a2a'];
  function kranz_idx(B) { return Math.abs(Math.floor(B.m.seed / 101)); }
  def('kranz', {
    name: 'Kranz', who: 'Gene Kranz', field: 'history', year: 1972,
    bio: 'Gene Kranz (born 1933) was a NASA flight director who led mission control shifts for Gemini and Apollo, including the Apollo 11 landing and the Apollo 13 rescue. His countdown sheet for Apollo 16 (1972) survives, lettered in his hand on graph paper. Poppy Northcutt, a TRW engineer, worked out return paths for Apollo 8 and Apollo 13. She was the first woman engineer in Mission Control, working from a support room down the hall.',
    about: 'His Apollo 16 terminal countdown sheet: upright engineering capitals in black felt-tip on orange graph paper, a T-minus scale down the side, colored-pencil underlines, purple marker bars at hold points, and curly braces.',
    source: { text: 'Apollo 16 terminal countdown sheet lettered by Flight Director Gene Kranz, 1972', where: 'Flickr photo 52009776162, via Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Apollo_16_Terminal_Countdown_Sheet_from_NASA_Flight_Director_Gene_Kranz_(52009776162).jpg' },
    pen: 'marker', w: 2.2, ink: '#222222', accent: '#5a4fb0', paper: '#f4ead8', font: { f: "'Patrick Hand SC', cursive" }, size: 26,
    hand: { wob: 0.3, over: 0.25, bend: 0.12 }, hl: 'rgba(90,79,176,0.5)',
    marks: {
      underline: function (B) {
        MARKS.underline(B);
        var it = B.items[B.items.length - 1]; it.pen = 'pencil'; it.col = KRANZ_PENCILS[kranz_idx(B) % 3]; it.w = 3.4 * B.s;
      },
      highlight: function (B) {
        var b = B.b, s = B.s, y = b.y + b.h / 2;
        B.stroke(lineP([b.x - 10 * s, y + 1 * s], [b.x + b.w + 10 * s, y]), { pen: 'highlighter', w: (b.h * 0.75) / s, col: B.K.hl });
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, T = ['-3:00', '-:45', '-:11'][kranz_idx(B) % 3], x = R.x - 10 * s, y = R.y + A.lh * 0.5;
      if (x - 46 * s < 0) return;
      tag(B, T, x - 12 * s, y, 18, { align: 'right', ph: 'note', at: [0, 0.2] });
      B.stroke(lineP([x - 9 * s, y], [x, y]), { w: 1.6, ph: 'note', at: [0, 0.15] });
    }
  });
  // the Wolfe cut, as people who watched him described it: one pencil slash from corner to corner of the passage
  function perkins_slash(B) {
    var b = B.b, s = B.s, o = 6 * s;
    B.stroke(B.hand(quadP([b.x - o, b.y + b.h + o * 0.5], [b.x + b.w * 0.55, b.y + b.h * 0.45], [b.x + b.w + o, b.y - o * 0.8], 16), 0.4), { w: 3.2 });
    B.edge = function (T) { return rectEdge(b, 6 * s, T); };
  }
  def('perkins', {
    name: 'Perkins', who: 'Maxwell Perkins', field: 'history', year: 1947,
    bio: 'Maxwell Perkins (1884-1947) was an American book editor at Scribner\'s. He edited F. Scott Fitzgerald, Ernest Hemingway and Thomas Wolfe. People who watched him work on Wolfe\'s huge manuscripts said he cut whole passages with a pencil slash.',
    about: 'A 1947 Scribner\'s letter: a soft graphite note scrawled large and fast at the top, tall loosely joined letters on a rising line, and plain single underlines.',
    source: { text: 'Typed letter signed, 13 January 1947, to Marion Saunders, with his pencil note "Tell Jessie this."', where: 'RR Auction, auction 495 (2017), lot 471', url: 'https://www.rrauction.com/auctions/lot-detail/li/33720620495471/cat/0' },
    pen: 'pencil', w: 3, ink: '#555555', accent: '#555555', paper: '#f6efe6', font: { f: "'Nanum Pen Script', cursive" }, size: 36, leading: 1,
    hand: { wob: 1, over: 0.6, bend: 0.2 }, hl: 'rgba(85,85,85,0.16)',
    marks: { strike: perkins_slash, cross: perkins_slash }
  });
  // her lines climb to the right: draw the note text tilted up (the original item stays for timing, hidden)
  function anning_climb(B, A, ang) {
    var items = B.items, t = null, s = B.s, R = A.R;
    for (var i = items.length - 1; i >= 0; i--) if (items[i].k === 't') { t = items[i]; break; }
    if (!t || !R) return;
    var cp = {}; for (var k in t) cp[k] = t[k];
    t.alpha = 0;
    B.fn(function (c, u) {
      var ox = R.x, oy = R.y + R.h / 2;
      c.translate(ox, oy); c.rotate(ang); c.translate(-ox, -oy);
      renderText(c, cp, u, s);
    }, { ph: 'note', at: t.at });
  }
  def('anning', {
    name: 'Anning', who: 'Mary Anning', field: 'science', year: 1823,
    bio: 'Mary Anning (1799-1847) hunted fossils on the cliffs of Lyme Regis in England. She found the first complete plesiosaur (1823) and Britain\'s first pterosaur. The Geological Society would not admit her, and men often published her finds without naming her.',
    about: 'Her 1823 plesiosaur letter: a fast brown quill hand whose lines climb, a grey-brown wash on the bones, and words scribbled out in place.',
    source: { text: 'Autograph letter to Sir Henry Bunbury with a pen-and-wash sketch of the plesiosaur, 26 December 1823', where: 'Wellcome Collection, MS 8592/2', url: 'https://wellcomecollection.org/works/cezbevj4' },
    pen: 'ink', w: 2, ink: '#7a4e2a', accent: '#9b8f80', paper: '#f1e6d6', font: { f: "'La Belle Aurore', cursive" }, size: 25, leading: 1.45,
    hand: { wob: 0.7, over: 0.25, bend: 0.2 }, hl: 'rgba(155,143,128,0.42)',
    marks: {
      // the bone wash: a flat grey-brown wash with a thin brown outline
      highlight: function (B) {
        var b = B.b, s = B.s, x = b.x - 5 * s, y = b.y - 3 * s, w = b.w + 10 * s, h = b.h + 6 * s;
        var blob = B.hand(resample(rrectP(x, y, w, h, Math.min(10 * s, h / 2)), 3 * s), 0.5);
        B.fill(blob, { col: B.K.hl, rev: 'fade', len: w * 0.3, comp: 'multiply' });
        B.stroke(blob, { w: 0.9, col: alpha(B.K.ink, 0.65) });
        B.edge = function (T) { return rectEdge(b, 8 * s, T); };
      },
      // a word scribbled out with heavy overwritten loops, as she did with "congectures"
      strike: function (B) {
        var b = B.b, s = B.s, r = B.r, y = b.y + b.h * 0.58, amp = Math.max(3 * s, b.h * 0.22), x0 = b.x - 2 * s, x1 = b.x + b.w + 3 * s;
        var turns = Math.max(3, Math.round((x1 - x0) / (9 * s))), p = [], N = turns * 10;
        for (var i = 0; i <= N; i++) {
          var u = i / N, th = u * turns * TAU;
          p.push([x0 + (x1 - x0) * u + Math.cos(th) * 3.5 * s, y + Math.sin(th) * amp + (r() - 0.5) * s]);
        }
        var back = [];
        for (i = 0; i <= N; i += 2) { var q = p[N - i]; back.push([q[0] + 1.5 * s, q[1] + Math.sin(i * 0.7) * amp * 0.5]); }
        B.stroke(p, { w: 2.4 });
        B.stroke(back, { w: 2.2 });
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) { anning_climb(B, A, -0.045); }
  });
  // her long sweeping underline: starts a little early, runs on past the word, ends in a flick
  function lovelace_sweep(x0, x1, y, s) {
    var mid = (x0 + x1) / 2;
    return quadP([x0, y + 1 * s], [mid, y + 5 * s], [x1, y - 1 * s], 18).concat(quadP([x1, y - 1 * s], [x1 + 6 * s, y - 2 * s], [x1 + 9 * s, y - 6 * s], 5).slice(1));
  }
  def('lovelace', {
    name: 'Lovelace', who: 'Ada Lovelace', field: 'science', year: 1843,
    bio: 'Ada Lovelace (1815-1852) was an English mathematician. In 1843 she translated a paper on Charles Babbage\'s Analytical Engine and added Notes A to G, three times its length. Note G sets out steps for the machine to compute Bernoulli numbers, often called the first computer program.',
    about: 'Her 1840 letter to De Morgan on y = x squared: a big airy brown hand with wide gaps, long sweeping underlines, and a dash to close a line.',
    source: { text: 'Sheet sketching y = x squared, with De Morgan\'s reply below, about 1840', where: 'Bodleian Libraries, Dep. Lovelace Byron 170, f.11; reproduced in Hollings, Martin and Rice, Historia Mathematica 2017, Fig. 2', url: 'https://www.claymath.org/wp-content/uploads/2023/04/Lovelace-De-Morgan-correspondence.pdf' },
    pen: 'ink', w: 1.7, ink: '#5b3b25', accent: '#5b3b25', paper: '#f6efe0', font: { f: "'Dawning of a New Day', cursive" }, size: 31, leading: 1.4,
    hand: { wob: 0.45, over: 0.3, bend: 0.15 }, hl: 'rgba(160,120,70,0.22)',
    marks: {
      underline: function (B) {
        var b = B.b, s = B.s, y = b.y + b.h + 5 * s;
        B.stroke(B.hand(lovelace_sweep(b.x - 6 * s, b.x + b.w + 16 * s, y, s), 0.5), { w: 1.9 });
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    // underline the longest word of the first line, and close the last line with a dash
    noteDeco: function (B, A) {
      if (!A.R || !A.lines.length) return;
      var c = B.c, s = B.s, R = A.R, n = A.lines.length, words = A.lines[0].split(' '), best = 0, bx = 0, bw = 0, x = 0, lw;
      c.save(); c.font = fontStr(B.F, A.px);
      var sp = c.measureText(' ').width;
      words.forEach(function (wd) { var w = c.measureText(wd).width; if (w > best) { best = w; bx = x; bw = w; } x += w + sp; });
      lw = c.measureText(A.lines[n - 1]).width;
      c.restore();
      if (bw > 0) {
        var y = R.y + A.lh * 0.78 + 5 * s;
        B.stroke(B.hand(lovelace_sweep(R.x + bx - 2 * s, R.x + bx + bw + 4 * s, y, s * 0.7), 0.3), { w: 1.5, ph: 'note', at: [0.55, 0.85] });
      }
      var dx = R.x + lw + 8 * s, dy = R.y + A.lh * (n - 0.42);
      if (dx + 28 * s < B.W) B.stroke(B.hand(lineP([dx, dy], [dx + 26 * s, dy - 1 * s]), 0.2), { w: 1.4, ph: 'note', at: [0.95, 1.1] });
    }
  });
  def('hopper', {
    name: 'Hopper', who: 'Grace Hopper', field: 'science', year: 1944,
    bio: 'Grace Hopper (1906-1992) was an American computer scientist and a rear admiral in the US Navy. From 1944 she coded problems for the Harvard Mark I, one of the first programmable computers. She built one of the first compilers and helped create COBOL.',
    about: 'Her "Problem L" coding drafts: a fast pencil cursive, a tick beside each checked line, red pencil rules between blocks and red rings, blue pencil checks in the margin.',
    source: { text: '"Problem L Coding", first draft with her corrections, Harvard Mark I era', where: 'Grace Murray Hopper Collection, Archives Center, National Museum of American History, NMAH.AC.0324, Box 1, Folder 10', url: 'https://sova.si.edu/record/nmah.ac.0324/ref81' },
    pen: 'pencil', w: 2.2, ink: '#4b4b4f', accent: '#cf3b32', third: '#3d7cc9', paper: '#f7f6f0', font: { f: "'Cedarville Cursive', cursive" }, size: 25, leading: 1.3,
    hand: { wob: 0.6, over: 0.3, bend: 0.08 }, hl: 'rgba(207,59,50,0.16)', headSize: 10,
    marks: {
      // red pencil ring, like the circled figures at the top of the sheet
      circle: function (B) {
        MARKS.circle(B);
        B.items[B.items.length - 1].col = B.K.accent;
      },
      // a red pencil rule, the kind she ruled between blocks of code
      underline: function (B) {
        var b = B.b, s = B.s, r = B.r, y = b.y + b.h + 5 * s;
        B.stroke(B.hand(lineP([b.x - 8 * s, y + (r() - 0.5) * 2 * s], [b.x + b.w + 26 * s, y + (r() - 0.5) * 2 * s]), 0.15), { col: B.K.accent, w: 2 });
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    // a blue pencil check in the margin beside the note
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, z = 13 * s, x = R.x - 16 * s, y = R.y + A.lh * 0.5;
      if (x - z < 0) x = R.x + R.w + 16 * s;
      check(B, x, y, z, { w: 1.8, col: B.st.third, ph: 'note', at: [0.9, 1.05] });
    }
  });
  def('curie', {
    name: 'Curie', who: 'Marie Curie', field: 'science', year: 1899,
    bio: 'Marie Curie (1867-1934) was a Polish-French physicist and chemist. With Pierre Curie she discovered polonium and radium in 1898. She was the first woman to win a Nobel Prize and the only person to win in two sciences. Her notebooks are still radioactive and kept in lead-lined boxes.',
    about: 'Her 1899-1902 lab notebook: a small quick French hand on squared paper, long rules between runs, a long hairline brace, and a firm bar through a wrong entry.',
    source: { text: 'Notebook of experiments on radioactive substances, 27 May 1899 to 4 December 1902', where: 'Wellcome Collection, MS 1978', url: 'https://wellcomecollection.org/works/s8daats8' },
    pen: 'ink', w: 1.6, ink: '#3a2f27', accent: '#3a2f27', paper: '#efe3c4', font: { f: "'Nothing You Could Do', cursive" }, size: 23, leading: 1.4,
    hand: { wob: 0.5, over: 0.2, bend: 0.12 }, hl: 'rgba(150,120,70,0.24)',
    marks: {
      // a long rule that runs on past the word, like the rules between her runs
      underline: function (B) {
        var b = B.b, s = B.s, r = B.r, y = b.y + b.h + 5 * s, x0 = Math.max(4 * s, b.x - 18 * s), x1 = Math.min(B.W - 4 * s, b.x + b.w + Math.max(50 * s, b.w * 0.5));
        B.stroke(B.hand(quadP([x0, y + 1 * s], [(x0 + x1) / 2, y + (r() - 0.3) * 2 * s], [x1, y - 2 * s], 16), 0.25), { w: 1.2 });
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      },
      // a firm bar through the entry
      strike: function (B) {
        var b = B.b, s = B.s, y = b.y + b.h * 0.55;
        B.stroke(B.hand(lineP([b.x - 3 * s, y + 1 * s], [b.x + b.w + 4 * s, y - 1 * s]), 0.2), { w: 4.6 });
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      },
      // her tall hairline brace: long curving arms, a sharp point at the middle
      bracket: function (B) {
        var b = B.b, s = B.s, right = B.side(0, 0) !== 'left', sx = right ? 1 : -1, x = right ? b.x + b.w + 8 * s : b.x - 8 * s;
        var y0 = b.y - 6 * s, y1 = b.y + b.h + 6 * s, ym = (y0 + y1) / 2, d = 10 * s, h = y1 - y0;
        var p = quadP([x - sx * 4 * s, y0], [x + sx * d * 0.9, y0 + h * 0.04], [x + sx * d * 0.7, ym - h * 0.18], 10)
          .concat(quadP([x + sx * d * 0.7, ym - h * 0.18], [x + sx * d * 0.6, ym], [x + sx * d * 1.8, ym], 8).slice(1))
          .concat(quadP([x + sx * d * 1.8, ym], [x + sx * d * 0.6, ym], [x + sx * d * 0.7, ym + h * 0.18], 8).slice(1))
          .concat(quadP([x + sx * d * 0.7, ym + h * 0.18], [x + sx * d * 0.9, y1 - h * 0.04], [x - sx * 4 * s, y1], 10).slice(1));
        B.stroke(B.hand(resample(p, 3 * s), 0.25), { w: 1 });
        var tipP = [x + sx * d * 1.9, ym];
        B.edge = function () { return tipP; };
        B.forceSide = right ? 'right' : 'left';
      }
    },
    // a long thin rule under the note closes the entry
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, y = R.y + R.h + 5 * s, x0 = Math.max(4 * s, R.x - 10 * s), x1 = Math.min(B.W - 4 * s, R.x + R.w + 20 * s);
      B.stroke(B.hand(lineP([x0, y], [x1, y - 2 * s]), 0.25), { w: 1.1, ph: 'note', at: [0.85, 1.05] });
    }
  });
  // a soft watercolor wash: an uneven blob laid twice so the edge pools a little darker
  function merian_wash(B, pts, col, len) {
    B.fill(pts, { col: col, rev: 'fade', len: len, comp: 'multiply' });
    B.fill(pts.map(function (q, i) { return [q[0] + Math.sin(i * 0.9) * 1.2 * B.s, q[1] + Math.cos(i * 0.7) * 1.2 * B.s]; }), { col: col, rev: 'fade', len: len * 0.5, comp: 'multiply', with: true });
  }
  def('merian', {
    name: 'Merian', who: 'Maria Sibylla Merian', field: 'science', year: 1705,
    bio: 'Maria Sibylla Merian (1647-1717) was a German naturalist and artist. At 52 she sailed to Surinam with her daughter to study insects. Her Metamorphosis (1705) painted each one through its life on its food plant, when many still thought insects grew out of mud.',
    about: 'Her 1704 letter from Amsterdam in a small brown quill hand, with the watercolor washes of her hand-colored plates for rings and highlights.',
    source: { text: 'Autograph letter to Johann Georg Volckamer, Amsterdam, 31 July 1704, signed Maria Sybilla Merian', where: 'Universitatsbibliothek Erlangen-Nurnberg, Trew collection, via bavarikon (UBE-TRE-00000BAV80014108)', url: 'https://www.bavarikon.de/object/bav:UBE-TRE-00000BAV80014108' },
    pen: 'ink', w: 1.5, ink: '#6b4a2e', accent: '#7aa35a', third: '#d98b4a', paper: '#efe9dc', font: { f: "'Meddon', cursive" }, size: 20, leading: 1.45,
    hand: { wob: 0.35, over: 0.15, bend: 0.2 }, hl: 'rgba(122,163,90,0.3)',
    marks: {
      circle: function (B) {
        var E = B.ellipse(), f = wave(B.r);
        merian_wash(B, ellipseP(E.cx, E.cy, E.rx, E.ry, 0, TAU, 0, 64, function (a) { return 1 + 0.06 * f(a * 2); }), 'rgba(122,163,90,0.16)', E.rx);
        MARKS.circle(B);
      },
      highlight: function (B) {
        var b = B.b, s = B.s, x = b.x - 5 * s, y = b.y - 2 * s, w = b.w + 10 * s, h = b.h + 4 * s;
        merian_wash(B, B.hand(resample(rrectP(x, y, w, h, h * 0.45), 3 * s), 0.7), 'rgba(122,163,90,0.17)', w * 0.3);
        B.edge = function (T) { return rectEdge(b, 7 * s, T); };
      }
    }
  });
  def('franklin', {
    name: 'Franklin', who: 'Rosalind Franklin', field: 'science', year: 1953,
    bio: 'Rosalind Franklin (1920-1958) was an English chemist and X-ray crystallographer. Photo 51, made in her lab in 1952, showed DNA\'s helix. It was shown to James Watson without her knowledge. She died at 37, four years before the Nobel for the double helix went to three men.',
    about: 'Her 1953 notes on DNA models: a fast slanted shorthand of a hand, long underlines under headings, square brackets, a line struck through, and N.B. in the margin.',
    source: { text: 'Lab notes on possible DNA structure, 1953', where: 'Rosalind Franklin Papers, NLM Profiles in Science (originals at Churchill Archives Centre)', url: 'https://collections.nlm.nih.gov/catalog/nlm:nlmuid-101584586X124-doc' },
    pen: 'ink', w: 1.6, ink: '#1f1f22', accent: '#1f1f22', paper: '#f4f2ec', font: { f: "'Kristi', cursive" }, size: 31, leading: 1.25,
    hand: { wob: 0.5, over: 0.45, bend: 0.12 }, hl: 'rgba(120,120,110,0.2)',
    marks: {
      // her heading underline: runs past the word and rises a little
      underline: function (B) {
        var b = B.b, s = B.s, r = B.r, y = b.y + b.h + 4 * s, x0 = b.x - 6 * s, x1 = b.x + b.w + Math.max(14 * s, b.w * 0.12);
        B.stroke(B.hand(quadP([x0, y + 2 * s], [(x0 + x1) / 2, y + (1 + r()) * 2 * s], [x1, y - 2 * s], 16), 0.5));
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      },
      // square brackets, as in "[linked to sugar]"
      bracket: function (B) {
        var b = B.b, s = B.s, right = B.side(0, 0) !== 'left', sx = right ? 1 : -1, x = right ? b.x + b.w + 8 * s : b.x - 8 * s, k = 6 * s;
        var y0 = b.y - 3 * s, y1 = b.y + b.h + 3 * s, ym = (y0 + y1) / 2;
        B.stroke(B.hand(resample([[x - sx * k, y0], [x, y0 - 1 * s], [x + sx * 1 * s, y1], [x - sx * k, y1 + 1 * s]], 3 * s), 0.25));
        var tipP = [x + sx * 6 * s, ym];
        B.edge = function () { return tipP; };
        B.forceSide = right ? 'right' : 'left';
      }
    },
    // N.B. in the margin before the note
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, px = A.px / s * 0.85, x = R.x - 8 * s, y = R.y + A.lh * 0.5, al = 'right';
      if (x - 34 * s < 0) { x = R.x; y = R.y - 8 * s; al = 'left'; }
      tag(B, 'N.B.', x, y, px, { align: al, ph: 'note', at: [0, 0.15] });
    }
  });
  def('ramanujan', {
    name: 'Ramanujan', who: 'Srinivasa Ramanujan', field: 'science', year: 1913,
    bio: 'Srinivasa Ramanujan (1887-1920) was an Indian mathematician, largely self-taught. In 1913 he wrote to G. H. Hardy at Cambridge with pages of results and was soon working there. His notebooks hold thousands of formulas, often with no proof, and people are still proving them.',
    about: 'His notebooks: a clear round school hand, an entry number in the left margin, curly braces round a series, and the old corner sign he wrote for factorials.',
    source: { text: 'Notebook 1 facsimile page with the "Master Theorem"', where: 'Original at the University of Madras; facsimile via Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Ramanujan%27s_%22Master_Theorem%22_page.jpg' },
    pen: 'ink', w: 1.6, ink: '#1e2433', accent: '#1e2433', paper: '#f7f5ef', font: { f: "'Playwrite IN', cursive" }, size: 20, leading: 1.6,
    hand: { wob: 0.3, over: 0.1, bend: 0.1 }, hl: 'rgba(110,120,140,0.2)',
    marks: {
      // the factorial corner: a bar at the left and a rule underneath
      box: function (B) {
        var b = B.b, s = B.s, x0 = b.x - 5 * s, y0 = b.y - 4 * s, y1 = b.y + b.h + 4 * s, x1 = b.x + b.w + 6 * s;
        B.stroke(B.hand(resample([[x0, y0], [x0, y1], [x1, y1 - 1 * s]], 3 * s), 0.3));
        B.edge = function (T) { return rectEdge(b, 8 * s, T); };
      }
    },
    // an entry number in the left margin, like "11."
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, num = (1 + ((B.m.seed | 0) * 13 + 10) % 40) + '.', px = A.px / s * 0.85, x = R.x - 10 * s, y = R.y + A.lh * 0.5, al = 'right';
      if (x - 30 * s < 0) { x = R.x; y = R.y - 10 * s; al = 'left'; }
      tag(B, num, x, y, px, { align: al, ph: 'note', at: [0, 0.15] });
    }
  });
  def('banneker', {
    name: 'Banneker', who: 'Benjamin Banneker', field: 'science', year: 1792,
    bio: 'Benjamin Banneker (1731-1806) was a free Black American astronomer and surveyor, largely self-taught. He built a wooden clock, helped survey the boundary of Washington, D.C., and published almanacs from 1792. He wrote to Thomas Jefferson arguing against slavery.',
    about: 'His astronomical journal: a firm upright quill round hand, ledger tables with a rule between every column, a heavy rule on top and a double rule under the header.',
    source: { text: 'Astronomical journal, lunar table for 1806-1820 and a leaf of tally marks', where: 'Maryland Center for History and Culture', url: 'https://www.mdhistory.org/resources/benjamin-banneker-astronomical-journal/' },
    pen: 'nib', w: 1.8, ink: '#3a2a1b', accent: '#3a2a1b', paper: '#f1e8d2', font: { f: "'Petit Formal Script', cursive" }, size: 22, leading: 1.5, double: true,
    hand: { wob: 0.3, over: 0.1, bend: 0.15 }, hl: 'rgba(140,105,50,0.2)',
    marks: {
      // a ruled table cell: column rules that run long, a heavy rule on top, a double rule underneath
      box: function (B) {
        var b = B.b, s = B.s, p = 7 * s, x0 = b.x - p, y0 = b.y - p, x1 = b.x + b.w + p, y1 = b.y + b.h + p;
        B.stroke(B.hand(lineP([x0 - 10 * s, y0], [x1 + 10 * s, y0]), 0.15), { w: 2.6 });
        B.stroke(B.hand(lineP([x0, y0 - 4 * s], [x0, y1 + 16 * s]), 0.15), { w: 1.4 });
        B.stroke(B.hand(lineP([x1, y0 - 4 * s], [x1, y1 + 16 * s]), 0.15), { w: 1.4 });
        B.stroke(B.hand(lineP([x0, y1], [x1, y1]), 0.15), { w: 1.4 });
        B.stroke(B.hand(lineP([x0, y1 + 4 * s], [x1, y1 + 4 * s]), 0.15), { w: 1.4 });
        B.edge = function (T) { return rectEdge(b, p + 6 * s, T); };
      }
    },
    // a heavy rule over the note, like the top rule of his tables
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, y = R.y - 6 * s;
      B.stroke(B.hand(lineP([R.x - 6 * s, y], [R.x + R.w + 6 * s, y]), 0.15), { w: 2.4, ph: 'note', at: [0, 0.2] });
    }
  });
  def('afklint', {
    name: 'af Klint', who: 'Hilma af Klint', field: 'art', year: 1908,
    bio: 'Hilma af Klint (1862-1944) was a Swedish painter. She made large abstract paintings years before Kandinsky, including The Ten Largest (1907), and numbered every work by series and section. She asked that the work stay hidden until long after her death, and it was barely shown until the 1980s.',
    about: 'Her pencil notes on the Pleiade drawings: a steep looped Swedish cursive in gray pencil, a work number tucked beside the note, blue and yellow rings that overlap, and a spiral where an arrow starts.',
    source: { text: 'Pleiade nr 14 (1908), colored pencil and pencil, with her inscription "Blyertslinierna skola vara hvita" and "N:o 14 af 2 afdeln. 2 serien"', where: 'Hilma af Klint Foundation, via Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Hilma_af_Klint_1908_-_Pleiade_nr_14.jpg' },
    pen: 'pencil', w: 2.6, ink: '#3f62a6', accent: '#b3262d', third: '#e2a82b', textCol: '#5d5850', paper: '#f0e6d2',
    font: { f: "'La Belle Aurore', cursive" }, size: 25, leading: 1.3,
    hand: { wob: 0.25, over: 0.1, bend: 0.3 }, hl: 'rgba(226,168,43,0.32)',
    marks: {
      circle: function (B) {
        var E = B.ellipse(), s = B.s, d = Math.min(E.rx * 0.18, 30 * s); B.E = E;
        B.fill(ellipseP(E.cx - d, E.cy, E.rx, E.ry, 0, TAU, 0, 60), { col: 'rgba(79,120,184,0.16)', rev: 'grow', cx: E.cx - d, cy: E.cy, len: E.rx, comp: 'multiply' });
        B.fill(ellipseP(E.cx + d, E.cy, E.rx, E.ry, 0, TAU, 0, 60), { col: 'rgba(226,168,43,0.24)', rev: 'grow', cx: E.cx + d, cy: E.cy, len: E.rx, comp: 'multiply' });
        B.stroke(ellipseP(E.cx - d, E.cy, E.rx, E.ry, -PI / 2, -TAU, 0), { col: B.K.ink });
        B.stroke(ellipseP(E.cx + d, E.cy, E.rx, E.ry, -PI / 2, TAU, 0), { col: '#c9922a' });
        B.edge = function (T) { return ellEdge({ cx: E.cx, cy: E.cy, rx: E.rx + d, ry: E.ry }, 5 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      var s = B.s;
      // the arrow starts in a small spiral that closes in a tight curl, with a red node at its heart
      if (B.wantHead && A.tail) {
        var R = 12 * s, t = A.tail, cx = t[0] - A.D[0] * R, cy = t[1] - A.D[1] * R;
        B.stroke(ellipseP(cx, cy, R, R, -PI / 2, TAU * 2, 0, 60, function (a, u) { return 1 - 0.85 * u; }), { w: 1.8, ph: 'deco', at: [1, 1.3] });
        B.fn(function (c, u) { c.fillStyle = B.K.accent; dot(c, cx, cy, 2.2 * s * u); }, { ph: 'deco', at: [1.3, 1.4] });
      }
      if (!A.R) return;
      // the work number, tucked at the right beside the note, with a single pencil underline
      var Q = A.R, x = Q.x + Q.w, y = Q.y - A.lh * 0.3;
      if (y < 12 * s) y = Q.y + A.lh * A.lines.length + A.lh * 0.38;
      tag(B, 'N:o 1', x, y, 17, { align: 'right', col: B.K.text, ph: 'note', at: [0.9, 1.05] });
      B.stroke(B.hand(lineP([x - 36 * s, y + 9 * s], [x + 2 * s, y + 8 * s]), 0.2), { w: 1.6, col: B.K.text, ph: 'note', at: [1.05, 1.15] });
    }
  });
  // an infinity net: small uneven cells, each drawn as a loose closed loop
  function kusama_net(B, x, y, w, h, g, col, lw) {
    var r = B.r, s = B.s, cells = [];
    for (var yy = y, row = 0; yy < y + h - g * 0.3; yy += g * 0.82, row++) {
      for (var xx = x + (row % 2) * g * 0.45; xx < x + w - g * 0.3; xx += g * (0.85 + r() * 0.3)) {
        var cx = xx + g * 0.45, cy = yy + g * 0.4, n = 5 + Math.floor(r() * 2), P = [], a0 = r() * TAU;
        for (var k = 0; k <= n; k++) { var a = a0 + k / n * TAU, kk = k === n ? P[0] : null; P.push(kk || [cx + Math.cos(a) * g * (0.42 + r() * 0.12), cy + Math.sin(a) * g * (0.36 + r() * 0.12)]); }
        cells.push(P);
      }
    }
    B.fn(function (c, u) {
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
      c.strokeStyle = col; c.lineWidth = lw * s; c.lineJoin = 'round';
      var shown = Math.floor(cells.length * u + 1e-6);
      for (var i = 0; i < shown; i++) { path(c, cells[i]); c.stroke(); }
      c.restore();
    }, { len: w + h });
  }
  def('kusama', {
    name: 'Kusama', who: 'Yayoi Kusama', field: 'art', year: 1965,
    bio: 'Yayoi Kusama (1929-2026) was a Japanese artist. Polka dots and "infinity nets" covered her paintings, rooms and pumpkins from the 1950s on, and her first Infinity Mirror Room opened in 1965. From 1977 she lived by choice in a Tokyo psychiatric hospital and worked in a studio nearby. She died in Tokyo in 2026, aged 97.',
    about: 'Her prints and nets: every line is laid down in dots, a highlight becomes a net of small cells, and more dots keep spreading around whatever she marks. Notes take her signature hand: a quick, joined, right-leaning felt-pen cursive with a tall K, even line, no thick and thin.',
    source: { text: 'Signature "Yayoi Kusama / 1975" in felt pen on the collage Spirit of Glasses (1975); the dots and net from Butterfly (1985), screenprint', where: 'Bonhams, auction 25487 lot 41', url: 'https://www.bonhams.com/auction/25487/lot/41/yayoi-kusama-japanese-born-1929-spirit-of-glasses-1975/' },
    pen: 'polka', w: 6.5, ink: '#141414', accent: '#d7261e', paper: '#f6d31f', font: { f: "'Nothing You Could Do', cursive" }, size: 25, leading: 1.05,
    hand: { wob: 0.6, over: 0.3, bend: 0.25 },
    marks: {
      highlight: function (B) {
        var b = B.b, s = B.s;
        kusama_net(B, b.x - 5 * s, b.y - 4 * s, b.w + 10 * s, b.h + 8 * s, 15 * s, alpha(B.K.accent, 0.75), 1.2);
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
    name: 'Kahlo', who: 'Frida Kahlo', field: 'art', year: 1944,
    bio: 'Frida Kahlo (1907-1954) was a Mexican painter, best known for self-portraits made through years of pain after a bus accident at 18. In her last decade she kept an illustrated diary in colored inks. She often painted words on ribbons and banners inside the picture.',
    about: 'Her diary and letters: a round, upright cursive in violet ink, straight arrows to labels she numbered ("Apoyo número 1."), words underlined once, and the painted ribbon that carries words in her pictures.',
    source: { text: 'Diary page, c. 1944-54, violet ink: labels with arrows, "Apoyo número 1." and "Apoyo número dos. 2"', where: 'Museo Frida Kahlo, Mexico City (Banco de Mexico, trustee); photo SantinoDeMarquishi, CC BY-SA 4.0, Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Diario.jpg' },
    pen: 'ink', w: 2.1, ink: '#4b3f8f', accent: '#c8323f', font: { f: "'Cedarville Cursive', cursive" }, size: 25, leading: 1.3,
    hand: { wob: 0.3, over: 0.2, bend: 0.06 }, headSize: 11, third: '#f2a93b', hl: 'rgba(200,50,63,0.2)',
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, c = B.c;
      // an arrow's label gets a number, the way she numbered the parts of a drawing
      if (B.wantHead) {
        var last = A.lines[A.lines.length - 1];
        c.save(); c.font = fontStr(B.F, A.px); var w = c.measureText(last + ' ').width; c.restore();
        var x = A.R.x + w, y = A.R.y + A.lh * (A.lines.length - 1) + A.lh * 0.78;
        B.fn(function (cc, u) { cc.globalAlpha *= u; cc.fillStyle = B.K.ink; cc.font = fontStr(B.F, A.px); cc.textBaseline = 'alphabetic'; cc.fillText('1.', x, y); }, { ph: 'note', at: [1, 1.1] });
        return;
      }
      // other notes ride on a painted ribbon with forked ends
      var Q = noteBox(B, A, 3 * s), f = 12 * s;
      var poly = [[Q.x, Q.y], [Q.x + Q.w, Q.y], [Q.x + Q.w + f, Q.y - 3 * s], [Q.x + Q.w + f * 0.45, Q.y + Q.h / 2], [Q.x + Q.w + f, Q.y + Q.h + 3 * s],
        [Q.x + Q.w, Q.y + Q.h], [Q.x, Q.y + Q.h], [Q.x - f, Q.y + Q.h + 3 * s], [Q.x - f * 0.45, Q.y + Q.h / 2], [Q.x - f, Q.y - 3 * s], [Q.x, Q.y]];
      underText(B, B.fill(poly, { col: '#f6dccf', rev: 'wipe', dir: 'right', ph: 'note', at: [0, 0.3], stroke: B.K.accent, strokeW: 1.2 * s }));
    }
  });
  def('basquiat', {
    name: 'Basquiat', who: 'Jean-Michel Basquiat', field: 'art', year: 1981,
    bio: 'Jean-Michel Basquiat (1960-1988) was an American painter from Brooklyn who started out writing SAMO graffiti. He filled composition books with words in careful block capitals, and his paintings are full of crowns, copyright marks and crossed-out words. He said crossing words out made you want to read them more.',
    about: 'His notebooks: narrow block capitals in black felt-tip, words caged out with dense hatching instead of a line, a three-point crown over what matters and a copyright mark on the note.',
    source: { text: 'Untitled notebook page, 1980-81, black ink on ruled paper', where: 'Larry Warsh collection, shown in Basquiat: The Unknown Notebooks (Brooklyn Museum, 2015)', url: 'https://apollo-magazine.com/?p=237192' },
    pen: 'marker', w: 3.2, ink: '#141414', accent: '#c8102e', font: { f: "'Covered By Your Grace', cursive" }, size: 27, caps: true, leading: 1.2,
    hand: { wob: 0.5, over: 0.3, bend: 0.2 }, third: '#e8b21a', hl: 'rgba(232,178,26,0.45)',
    marks: {
      // a cage of short vertical strokes over two bars, the way he hatched a word out
      strike: function (B) {
        var b = B.b, s = B.s, r = B.r, x0 = b.x - 3 * s, x1 = b.x + b.w + 3 * s, ya = b.y + b.h * 0.18, yb = b.y + b.h * 0.92, V = [];
        B.stroke(B.hand(lineP([x0, b.y + b.h * 0.42], [x1, b.y + b.h * 0.4]), 0.3), { w: 2.6 });
        for (var x = x0 + 2 * s; x < x1; x += (4.2 + r() * 1.6) * s) V.push([x + (r() - 0.5) * s, ya + (r() - 0.5) * 3 * s, x + (r() - 0.2) * 1.5 * s, yb + (r() - 0.5) * 3 * s]);
        B.fn(function (c, u) {
          c.strokeStyle = B.K.ink; c.lineWidth = 2.2 * s; c.lineCap = 'round';
          var shown = Math.floor(V.length * u + 1e-6);
          for (var i = 0; i < shown; i++) { var v = V[i]; c.beginPath(); c.moveTo(v[0], v[1]); c.lineTo(v[2], v[3]); c.stroke(); }
        }, { len: (x1 - x0) * 1.6 });
        B.stroke(B.hand(lineP([x0, b.y + b.h * 0.72], [x1, b.y + b.h * 0.74]), 0.3), { w: 2.6 });
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
      tag(B, '©', x, y, 22, { col: B.K.accent, F: { f: "'Covered By Your Grace', cursive" }, ph: 'note', at: [0.9, 1.1] });
    }
  });
  // a pieced border: squares and half-square triangles in turn, sewn on as the hand goes round
  function ringgold_quilt(B) {
    var b = B.b, s = B.s, z = Math.max(11 * s, Math.min(15 * s, b.h * 0.4)), p = 4 * s, x0 = b.x - p - z, y0 = b.y - p - z, x1 = b.x + b.w + p, y1 = b.y + b.h + p;
    var nx = Math.max(2, Math.round((x1 - x0) / z)), ny = Math.max(2, Math.round((y1 - y0) / z)), zx = (x1 - x0) / nx, zy = (y1 - y0) / ny, pal = B.st.pal, sq = [], i;
    for (i = 0; i < nx; i++) sq.push([x0 + i * zx, y0, zx, z]);
    for (i = 0; i < ny; i++) sq.push([x1, y0 + i * zy, z, zy]);
    for (i = nx; i > 0; i--) sq.push([x0 + i * zx, y1, zx, z]);
    for (i = ny; i > 0; i--) sq.push([x0, y0 + i * zy, z, zy]);
    var tot = sq.length, g = 0.8 * s;
    B.fn(function (c, u) {
      var shown = Math.floor(tot * u + 1e-6);
      for (var j = 0; j < shown; j++) {
        var q = sq[j], X = q[0] + g, Y = q[1] + g, W = q[2] - 2 * g, H = q[3] - 2 * g;
        c.fillStyle = pal[j % pal.length];
        if (j % 2) { c.fillRect(X, Y, W, H); continue; }
        // half-square triangle: two colors split on the diagonal
        c.beginPath(); c.moveTo(X, Y); c.lineTo(X + W, Y); c.lineTo(X, Y + H); c.closePath(); c.fill();
        c.fillStyle = pal[(j + 2) % pal.length];
        c.beginPath(); c.moveTo(X + W, Y); c.lineTo(X + W, Y + H); c.lineTo(X, Y + H); c.closePath(); c.fill();
      }
    }, { len: (x1 - x0 + y1 - y0) * 1.2 });
    B.stroke(rectP(x0 + z * 0.5, y0 + z * 0.5, x1 - x0, y1 - y0), { w: 1.6, col: B.K.ink, with: true });
    B.edge = function (T) { return rectEdge(b, p + z + 4 * s, T); };
  }
  def('ringgold', {
    name: 'Ringgold', who: 'Faith Ringgold', field: 'art', year: 1988,
    bio: 'Faith Ringgold (1930-2024) was an American artist from Harlem. Her story quilts join painting, quilting and a story handwritten in ink on strips of cloth. Tar Beach (1988), a girl flying over the city from her rooftop, became a picture book.',
    about: 'The Church Picnic Story Quilt: a small, even marker hand on cream cloth strips, each block numbered at the top left, framed by pieced squares and half-square triangles, with a running stitch.',
    source: { text: 'Church Picnic Story Quilt (1988), acrylic on canvas with ink text and pieced fabric border', where: 'High Museum of Art, Atlanta', url: 'https://high.org/collection/church-picnic-story-quilt/' },
    pen: 'running', w: 3, ink: '#2b2420', accent: '#d9643a', font: { f: "'Kalam', cursive" }, size: 22, leading: 1.12, hand: { wob: 0.3, over: 0.2, bend: 0.2 },
    noteBg: '#f3ead6', hl: 'rgba(217,165,32,0.35)', pal: ['#d9643a', '#8e2a4a', '#d9a520', '#2f7f6f', '#3a5a9a', '#b8336a'],
    marks: {
      box: function (B) { ringgold_quilt(B); },
      circle: function (B) { ringgold_quilt(B); }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, Q = noteBox(B, A);
      // each text block on the quilt carries a small number at its top left
      tag(B, '1.', Q.x + 1 * s, Q.y - 8 * s, 16, { align: 'left', ph: 'note', at: [0, 0.1] });
    }
  });
  def('lawrence', {
    name: 'Lawrence', who: 'Jacob Lawrence', field: 'art', year: 1941,
    bio: 'Jacob Lawrence (1917-2000) was an American painter raised in Harlem. His Migration Series (1940-41) told the Great Migration of Black Americans to the North in 60 numbered panels, each with a one-sentence caption.',
    about: 'The Migration Series: flat angular shapes in ochre, black, blue and red tempera, plain painted capitals like the station signs, and every note a numbered caption.',
    source: { text: 'The Migration Series, Panel no. 1 (1940-41), casein tempera on hardboard, with station signs CHICAGO, NEW YORK, ST. LOUIS', where: 'The Phillips Collection, Washington, DC (via Wikimedia Commons)', url: 'https://commons.wikimedia.org/wiki/File:Jacob_Lawrence-During_World_War_I.gif' },
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
      var s = B.s, R = A.R, c = B.c;
      // a short label becomes a station sign: plain capitals on a pale board with a dark frame
      if (A.lines.length === 1 && A.lines[0].split(/\s+/).length <= 3) {
        var up = A.lines[0].toUpperCase(), t = null;
        c.save(); c.font = fontStr(B.F, A.px); var w = c.measureText(up).width; c.restore();
        B.items.forEach(function (it) { if (it.k === 't') { it.lines = [up]; it.w = w; t = it; } });
        var px = 8 * s, x0 = R.x - px, y0 = R.y - 5 * s, bw = w + 2 * px, bh = A.lh + 6 * s, bar = 5 * s;
        underText(B, B.fill(rectP(x0, y0, bw, bh), { col: '#ece6d6', rev: 'wipe', dir: 'down', ph: 'note', at: [0, 0.25], stroke: B.K.ink, strokeW: 2.4 * s }));
        underText(B, B.fill(rectP(x0 - 2 * s, y0 - bar, bw + 4 * s, bar), { col: B.K.ink, rev: 'wipe', dir: 'right', ph: 'note', at: [0, 0.2] }));
        return;
      }
      // anything longer is a numbered caption
      var x = R.x - 10 * s, y = R.y + A.lh * 0.5;
      if (x - 20 * s < 0) { x = R.x; y = R.y - 12 * s; }
      tag(B, '1.', x, y, 22, { align: x === R.x ? 'left' : 'right', F: { f: "'Jost', sans-serif", wt: 700 }, ph: 'note', at: [0, 0.15] });
    }
  });
  // the book keys every part (default sequence starts at the second letter, since a lone alif reads as a stray tick)
  // the book keys every part of a machine with a small Arabic letter, in abjad order, and the text names parts by letter
  var ALJAZARI_ABJAD = ['ا', 'ب', 'ج', 'د', 'ه', 'و', 'ز', 'ح', 'ط', 'ي'];
  function aljazari_letter(B) {
    if (B.m.label != null) return String(B.m.label);
    return ALJAZARI_ABJAD[(Math.abs(Math.floor(B.m.seed / 101)) + 1) % ALJAZARI_ABJAD.length];
  }
  function aljazari_key(B, x, y, o) {
    tag(B, aljazari_letter(B), x, y, 22, o || {});
  }
  // a part painted flat: thin ink outline over a wash of one of the book's colors
  function aljazari_part(B, round) {
    var b = B.b, s = B.s, blue = Math.abs(Math.floor(B.m.seed / 101)) % 2 === 0, col = blue ? B.K.accent : B.st.third, p = 7 * s, pts;
    if (round) { var E = B.ellipse(); B.E = E; pts = ellipseP(E.cx, E.cy, E.rx, E.ry, -PI / 2, -TAU, 0, 48); B.edge = function (T) { return ellEdge(E, 5 * s, T); }; }
    else { pts = rectP(b.x - p, b.y - p, b.w + 2 * p, b.h + 2 * p); B.edge = function (T) { return rectEdge(b, p + 5 * s, T); }; }
    B.fill(pts, { col: alpha(col, 0.3), rev: 'fade', len: b.w * 0.3 });
    B.stroke(B.hand(resample(pts, 3 * s), 0.25), { w: 1.5 });
    var x = round ? B.E.cx - B.E.rx * 0.78 : b.x - p, y = round ? B.E.cy - B.E.ry * 0.9 : b.y - p;
    aljazari_key(B, x - 8 * s, y - 8 * s);
  }
  def('aljazari', {
    name: 'al-Jazari', who: 'Ismail al-Jazari', field: 'history', year: 1206,
    bio: 'Ismail al-Jazari (1136-1206) was an engineer at the Artuqid court in what is now southeast Turkey. His Book of Knowledge of Ingenious Mechanical Devices (1206) described about fifty machines, from water-raising pumps to an elephant clock. Every part in its drawings is keyed with a letter. His own copy is lost, and the surviving ones were made by later scribes and painters.',
    about: 'The elephant clock page of the 1315 copy: thin ink outlines over flat red, blue and gold, a small Arabic letter keyed beside every part, and naskh script.',
    source: { text: '"The Elephant Clock", folio from a 1315 copy of the Book of Knowledge of Ingenious Mechanical Devices', where: 'The Metropolitan Museum of Art, New York, 57.51.23', url: 'https://commons.wikimedia.org/wiki/File:%22The_Elephant_Clock%22,_Folio_from_a_Book_of_the_Knowledge_of_Ingenious_Mechanical_Devices_by_al-Jazari_MET_is57.51.23.R.jpg' },
    pen: 'ink', w: 1.8, ink: '#1d1712', accent: '#3d6fa0', third: '#a8322a', gold: '#c9a227', paper: '#e8d7b0',
    font: { f: "'Amiri', Georgia, serif" }, size: 26, hand: { wob: 0.25, over: 0.1, bend: 0.2 },
    hl: 'rgba(201,162,39,0.32)', head: 'tri',
    marks: {
      circle: function (B) { aljazari_part(B, true); },
      box: function (B) { aljazari_part(B, false); }
    },
    after: function (B) {
      var mk = B.m.mark;
      if (mk === 'circle' || mk === 'box' || mk === 'connect') return;
      var b = B.b, s = B.s;
      aljazari_key(B, Math.max(10 * s, b.x - 10 * s), Math.max(12 * s, b.y - 6 * s));
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R;
      aljazari_key(B, Math.max(10 * s, R.x - 14 * s), R.y + A.lh * 0.5, { ph: 'note', at: [0, 0.2] });
    }
  });
  // a vermilion seal: 'white' = intaglio (pale strokes cut out of a red block), 'red' = relief (red strokes in a red border),
  // 'oval' = a small relief oval. The strokes are abstract, not real seal text.
  function qianlong_seal(B, x, y, w, h, kind, at, rot) {
    var s = B.s, r = rng(B.m.seed * 5 + Math.round(x * 3 + y)), cols = w > h * 0.8 ? 2 : 1, rows = Math.max(1, Math.round(h / (w / cols))), G = [];
    for (var ci = 0; ci < cols; ci++) for (var ri = 0; ri < rows; ri++) {
      var cell = [], k = 3 + Math.floor(r() * 3);
      for (var j = 0; j < k; j++) cell.push([r() < 0.55, r(), r(), 0.3 + r() * 0.6]);
      G.push([ci, ri, cell]);
    }
    var ink = B.K.accent, paper = B.st.paper || '#f2e6cc';
    B.fn(function (c, u) {
      if (u <= 0) return;
      var k = 1 + 0.25 * (1 - outCubic(u));
      c.save(); c.translate(x, y); c.rotate(rot || 0); c.scale(k, k); c.globalAlpha *= 0.9 * Math.min(1, u * 2);
      c.beginPath();
      if (kind === 'oval') c.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU); else c.rect(-w / 2, -h / 2, w, h);
      if (kind === 'white') { c.fillStyle = ink; c.fill(); } else { c.strokeStyle = ink; c.lineWidth = 2 * s; c.stroke(); }
      c.strokeStyle = kind === 'white' ? paper : ink; c.lineWidth = Math.max(1.2 * s, w * 0.06); c.lineCap = 'square';
      var pw = w * (kind === 'oval' ? 0.55 : 0.78), ph = h * (kind === 'oval' ? 0.55 : 0.78), cw = pw / cols, chh = ph / rows;
      G.forEach(function (g) {
        var ox = pw / 2 - (g[0] + 1) * cw, oy = -ph / 2 + g[1] * chh;
        g[2].forEach(function (q) {
          c.beginPath();
          if (q[0]) { var yy = oy + chh * (0.15 + 0.7 * q[1]); c.moveTo(ox + cw * 0.15, yy); c.lineTo(ox + cw * (0.15 + 0.7 * q[3]), yy); }
          else { var xx = ox + cw * (0.15 + 0.7 * q[2]); c.moveTo(xx, oy + chh * 0.15); c.lineTo(xx, oy + chh * (0.15 + 0.7 * q[3])); }
          c.stroke();
        });
      });
      c.restore();
    }, { ph: 'deco', at: at });
  }
  def('qianlong', {
    name: 'Qianlong', who: 'The Qianlong Emperor', field: 'history', year: 1760,
    bio: 'The Qianlong Emperor (1711-1799) ruled China from 1735 to 1796 and gathered one of the largest art collections ever made. He wrote colophons in his own brush hand on the scrolls he owned and stamped them with his seals, sometimes dozens of times. Critics then and now have said he crowded some masterpieces.',
    about: 'His colophon on the Dali kingdom Buddhist scroll: columns of running-regular script in black ink on gold-brown paper, with square vermilion seals, white on red and red on white, stamped at the ends and half over the edges.',
    source: { text: 'The Qianlong Emperor\'s brush colophon on the Long Roll of Buddhist Images by Zhang Shengwen (Dali kingdom, 12th century)', where: 'National Palace Museum, Taipei', url: 'https://commons.wikimedia.org/wiki/File:大理國描工張勝溫畫梵像-0-乾隆御笔题跋.png' },
    pen: 'brush', w: 4, ink: '#2a2420', accent: '#b8322a', paper: '#d8c49a', font: { f: "'Yuji Syuku', 'Caveat Brush', serif" }, size: 24,
    hand: { wob: 0.45, over: 0.3, bend: 0.2 }, hl: 'rgba(184,50,42,0.18)',
    after: function (B) {
      var mk = B.m.mark;
      if (mk !== 'circle' && mk !== 'box') return;
      var b = B.b, s = B.s, z = 26 * s, white = Math.abs(Math.floor(B.m.seed / 101)) % 2 === 0;
      var x = B.E ? B.E.cx + B.E.rx * 0.72 : b.x + b.w + 7 * s, y = B.E ? B.E.cy + B.E.ry * 0.72 : b.y + b.h + 7 * s;
      qianlong_seal(B, Math.min(x, B.W - z), Math.min(y, B.H - z), z, z, white ? 'white' : 'red', [1.05, 1.3], 0.04);
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, z = 22 * s, x = R.x + R.w + z * 0.8, y = R.y + R.h - z * 0.4;
      if (x + z > B.W) { x = R.x + R.w - z * 0.5; y = R.y + R.h + z * 0.8; }
      qianlong_seal(B, x, y, z, z, 'white', [1.3, 1.55], -0.03);
      if (R.x - z * 1.1 > 0) qianlong_seal(B, R.x - z * 0.6, R.y + z * 0.5, z * 0.6, z * 1.1, 'red', [1.2, 1.45], 0);
    }
  });
  // a glyph block: a rounded square in fine black line, with an optional flat wash behind (Maya blue or red)
  function maya_block(B) {
    var b = B.b, s = B.s, p = 8 * s, x = b.x - p, y = b.y - p, w = b.w + 2 * p, h = b.h + 2 * p, r = Math.min(h, w) * 0.3, wash = B.m.wash;
    if (wash !== false) B.fill(rrectP(x, y, w, h, r), { col: alpha(wash === 'red' ? B.K.accent : B.st.third, 0.3), rev: 'fade', len: w * 0.3, comp: 'multiply' });
    B.stroke(B.hand(resample(rrectP(x, y, w, h, r), 3 * s), 0.25));
    B.edge = function (T) { return rectEdge(b, p + 5 * s, T); };
  }
  // bar-and-dot numerals: dots for ones above bars for fives, painted red or black
  function maya_number(B, x, y, n, z, col, at) {
    var bars = Math.floor(n / 5), dots = n % 5;
    B.fn(function (c, u) {
      c.save(); c.globalAlpha *= u; c.fillStyle = col;
      for (var i = 0; i < bars; i++) { var yy = y + z * 0.3 + i * z * 0.42; c.fillRect(x - z * 0.7, yy, z * 1.4, z * 0.26); }
      for (var j = 0; j < dots; j++) dot(c, x + (j - (dots - 1) / 2) * z * 0.42, y, z * 0.15);
      c.restore();
    }, { ph: 'note', at: at });
  }
  def('maya', {
    name: 'Maya', who: 'Maya scribes', field: 'history', year: 1200,
    bio: 'Maya scribes wrote in a script of glyph blocks on folding books of bark paper coated with lime. Only four of those books survive, among them the Dresden Codex. Their bar-and-dot numbers used a sign for zero.',
    about: 'Dresden Codex page 9: glyph blocks in a fine black line, red frame lines between registers, Maya blue and red fields, and bar-and-dot numbers in red and black.',
    source: { text: 'Dresden Codex, page 9', where: 'Saxon State and University Library Dresden (SLUB), Mscr.Dresd.R.310', url: 'https://commons.wikimedia.org/wiki/File:Dresden_Codex_p09.jpg' },
    pen: 'ink', w: 2, ink: '#1f1a17', accent: '#a8473a', third: '#5fa3a0', paper: '#eadbc6', font: { f: "'Patrick Hand', cursive" }, size: 25,
    hand: { wob: 0.35, over: 0.15, bend: 0.2 }, hl: 'rgba(95,163,160,0.35)',
    marks: {
      circle: maya_block,
      box: maya_block,
      underline: function (B) {
        var b = B.b, s = B.s, y = b.y + b.h + 5 * s;
        B.stroke(B.hand(lineP([b.x - 6 * s, y], [b.x + b.w + 6 * s, y]), 0.15), { col: B.K.accent, w: 2.6 });
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, z = 20 * s, P = besideNote(B, A, z), i = Math.abs(Math.floor(B.m.seed / 101)), n = B.m.num != null ? +B.m.num : 1 + i % 19;
      maya_number(B, P[0], P[1] - z * 0.5, Math.max(1, Math.min(19, n | 0)), z, i % 2 ? B.K.ink : B.K.accent, [0.6, 1]);
    }
  });
  // a loaded liner brush: fat where it lands, thinning out to a hairline, edges a little uneven
  function ross_swoosh(B, P, w0, col, o) {
    var s = B.s, C = cum(P), L = C[C.length - 1], f = wave(rng(B.m.seed * 13 + 5)), W = w0 * s;
    o = o || {};
    var it = B.fn(function (c, u) {
      var q = cutTo(P, C, L * (u < 1 ? 0.3 * inOutSine(u) + 0.7 * u : 1)); if (q.length < 2) return;
      c.fillStyle = col || B.K.ink;
      ribbon(c, q, function (i, d) { var k = d / L; return W * Math.max(0.08, (0.55 + 0.45 * Math.min(1, k * 8)) * (1 - 0.92 * k * k)) * (1 + 0.14 * f(d / (14 * s))); });
    }, { len: L, ph: o.ph, at: o.at });
    return it;
  }
  // a fan-brush evergreen: a thin trunk, then rows of short down-angled dabs, wider toward the bottom
  function ross_tree(B, x, y, h) {
    var s = B.s, r = B.r, rows = 9, D = [];
    for (var i = 0; i < rows; i++) {
      var k = (i + 1) / rows, yy = y - h + h * 0.95 * k, half = h * 0.32 * k * (0.85 + r() * 0.3);
      D.push([x, yy, half, 0.55 + r() * 0.25]);
    }
    B.stroke(lineP([x, y - h * 1.02], [x, y]), { pen: 'brush', w: 1.6, col: '#3b2a1e', ph: 'deco', at: [1, 1.12] });
    B.fn(function (c, u) {
      var shown = Math.floor(D.length * u + 1e-6);
      c.strokeStyle = '#2f5a35'; c.lineCap = 'round';
      for (var j = 0; j < shown; j++) {
        var d = D[j];
        for (var sd = -1; sd <= 1; sd += 2) for (var t = 0; t < 3; t++) {
          var l = d[2] * (0.6 + t * 0.2), y0 = d[1] + (t - 1) * 1.6 * s;
          c.lineWidth = (2.4 - t * 0.5) * s; c.beginPath(); c.moveTo(x, y0); c.lineTo(x + sd * l, y0 + l * d[3]); c.stroke();
        }
      }
    }, { ph: 'deco', at: [1.1, 1.6] });
  }
  def('ross', {
    name: 'Ross', who: 'Bob Ross', field: 'art', year: 1983,
    bio: 'Bob Ross (1942-1995) was an American painter who hosted The Joy of Painting on PBS from 1983 to 1994. He finished a landscape in about half an hour, wet-on-wet in oils, with a two-inch brush, a fan brush and a palette knife. He signed each one in red with a liner brush.',
    about: 'His red liner-brush signature, whose R sweeps out into a long tapering line under the name, palette-knife highlights with a broken dry edge, and one little fan-brush evergreen beside the note.',
    source: { text: 'His painted signature "Ross", red liner brush (vector trace)', where: 'Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Signature_of_Bob_Ross.svg' },
    pen: 'brush', w: 4, ink: '#e0102f', accent: '#1f3a5f', third: '#2f5a35', textCol: '#3b2a1e',
    font: { f: "'Caveat Brush', cursive" }, size: 27, leading: 1.15, hand: { wob: 0.35, over: 0.2, bend: 0.22 },
    hl: 'rgba(228,180,40,0.45)', headW: 0.7,
    marks: {
      // the tail of the R in his signature: lands fat at the left, dips, and runs out thin to the right
      underline: function (B) {
        var b = B.b, s = B.s, y = b.y + b.h + 4 * s, x0 = b.x - 6 * s, x1 = b.x + b.w + 22 * s, P = [];
        for (var i = 0; i <= 30; i++) { var u = i / 30; P.push([lerp(x0, x1, u), y + 9 * s * Math.sin(u * PI * 0.9) * (1 - u * 0.3) - u * 3 * s]); }
        ross_swoosh(B, B.hand(P, 0.25), 7);
        B.edge = function (T) { return rectEdge(b, 8 * s, T); };
      },
      // the palette knife pulled across: a flat band of paint whose top edge breaks up where the knife skips
      highlight: function (B) {
        var b = B.b, s = B.s, r = B.r, x0 = b.x - 6 * s, x1 = b.x + b.w + 6 * s, top = b.y - 2 * s, bot = b.y + b.h + 3 * s, P = [], n = 40, i;
        for (i = 0; i <= n; i++) P.push([lerp(x0, x1, i / n), top + (r() < 0.3 ? r() * 6 * s : r() * 1.5 * s) + (i / n) * 2 * s]);
        for (i = n; i >= 0; i--) P.push([lerp(x0 + 3 * s, x1, i / n), bot - r() * 1.2 * s]);
        B.fill(P, { col: B.K.hl, rev: 'wipe', dir: 'right', comp: 'multiply', len: b.w });
        var streaks = [];
        for (i = 0; i < 5; i++) streaks.push([lerp(x0, x1, r() * 0.6), top + (0.2 + r() * 0.6) * (bot - top), (0.2 + r() * 0.4) * (x1 - x0)]);
        B.fn(function (c, u) {
          c.globalCompositeOperation = 'multiply'; c.strokeStyle = 'rgba(200,150,30,0.35)'; c.lineWidth = 1.2 * s;
          streaks.forEach(function (q) { c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(q[0] + q[2] * u, q[1] + 0.5 * s); c.stroke(); });
        }, { with: true });
        B.edge = function (T) { return rectEdge(b, 8 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, h = Math.max(30 * s, Math.min(46 * s, A.lines.length * A.lh + 14 * s)), z = h * 0.4, P = besideNote(B, A, z);
      ross_tree(B, P[0], P[1] + h * 0.5, h);
    }
  });
  // her variant key: a small "+" by a word, and another by the alternative written below
  function dickinson_plus(B, x, y, z, at) {
    B.stroke(lineP([x - z, y], [x + z, y]), { pen: 'marker', w: 1.5, ph: 'note', at: at });
    B.stroke(lineP([x, y - z], [x, y + z]), { pen: 'marker', w: 1.5, ph: 'note', at: at });
  }
  def('dickinson', {
    name: 'Dickinson', who: 'Emily Dickinson', field: 'art', year: 1861,
    bio: 'Emily Dickinson (1830-1886) was an American poet who lived nearly all her life in Amherst, Massachusetts. She wrote almost 1,800 poems, and fewer than a dozen were printed while she lived. She copied many into hand-sewn booklets, marking alternate words with a small cross.',
    about: 'Her Wild Nights manuscript: wide, spidery letters, a long swooping underline, a rule at the end, and the "+" she used to key a variant word.',
    source: { text: 'Autograph manuscript of "Wild nights - Wild nights!", about 1861', where: 'Houghton Library, Harvard University; image via Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Emily_Dickinson_%22Wild_nights%22_manuscript.jpg' },
    pen: 'ink', w: 1.8, ink: '#3b3b3b', accent: '#3b3b3b', font: { f: "'Nothing You Could Do', cursive" }, size: 28,
    hand: { wob: 0.5, over: 0.3, bend: 0.15 }, hl: 'rgba(59,59,59,0.12)',
    marks: {
      // the swoop under "Luxury"
      underline: function (B) {
        var b = B.b, s = B.s, y = b.y + b.h + 4 * s, x0 = b.x + b.w * 0.05, x1 = b.x + b.w + 16 * s;
        B.stroke(B.hand(quadP([x0, y], [x0 + (x1 - x0) * 0.45, y + 16 * s], [x1, y - 3 * s], 24), 0.3), { w: 2 });
        B.edge = function (T) { return rectEdge(b, 10 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R, b = B.b, z = 5.5 * s;
      dickinson_plus(B, Math.min(B.W - 6 * s, b.x + b.w + 7 * s), b.y - 3 * s, z, [0, 0.15]);
      dickinson_plus(B, R.x - 12 * s, R.y + A.lh * 0.5, z, [0, 0.15]);
      var y = R.y + R.h + 10 * s;
      if (y < B.H - 4 * s) B.stroke(B.hand(lineP([R.x + R.w * 0.2, y], [R.x + R.w * 0.85 + 14 * s, y]), 0.2), { w: 1.6, ph: 'note', at: [0.85, 1] });
    }
  });
  // scribble-out: tight back-and-forth hatching in two directions over a passage
  function beethoven_scribble(B) {
    var b = B.b, s = B.s, r = B.r, x0 = b.x - 4 * s, x1 = b.x + b.w + 4 * s, y0 = b.y + b.h * 0.1, y1 = b.y + b.h * 0.95;
    [1, -1].forEach(function (k, pass) {
      var p = [], n = Math.max(6, Math.round((x1 - x0) / (3.6 * s)));
      for (var i = 0; i <= n; i++) {
        var x = x0 + (x1 - x0) * i / n, up = i % 2 === 0;
        p.push([x + (up ? k : -k) * 3 * s + (r() - 0.5) * 2 * s, (up ? y0 : y1) + (r() - 0.5) * 3 * s]);
      }
      B.stroke(B.hand(pass ? p.reverse() : p, 0.3), { w: 1.7 });
    });
    B.edge = function (T) { return rectEdge(b, 6 * s, T); };
  }
  def('beethoven', {
    name: 'Beethoven', who: 'Ludwig van Beethoven', field: 'art', year: 1826,
    bio: 'Ludwig van Beethoven (1770-1827) was a German composer, born in Bonn, who worked in Vienna from 1792. He began losing his hearing in his late twenties and was almost totally deaf by the end. He worked out his music in sketchbooks, crossing out and rewriting as he went.',
    about: 'His 1826 sketches for the String Quartet Op. 131: brown quill, whole bars cancelled with huge X marks, passages scribbled out, and wavy lines.',
    source: { text: 'Sketches for the String Quartet in C sharp minor, Op. 131', where: 'British Library, Add MS 38070, f. 51r', url: 'https://commons.wikimedia.org/wiki/File:Ludwig_van_Beethoven_-_Sketches_for_the_String_Quartet_Op._131._(BL_Add_MS_38070_f._51r).jpg' },
    pen: 'ink', w: 2, ink: '#3a2614', accent: '#8a6a48', font: { f: "'Reenie Beanie', cursive" }, size: 34,
    hand: { wob: 1, over: 1, bend: 0.25 }, hl: 'rgba(138,106,72,0.28)',
    marks: {
      // the cancel X runs far past the bar it kills
      cross: function (B) {
        var b = B.b, s = B.s, o = Math.max(b.w, b.h) * 0.3 + 12 * s, oy = o * 0.7;
        B.stroke(B.hand(lineP([b.x - o, b.y - oy], [b.x + b.w + o, b.y + b.h + oy]), 0.6));
        B.stroke(B.hand(lineP([b.x + b.w + o * 0.8, b.y - oy * 1.1], [b.x - o * 0.9, b.y + b.h + oy]), 0.6));
        B.edge = function (T) { return rectEdge(b, 8 * s, T); };
      },
      strike: beethoven_scribble,
      // a wavy line, as above the staves
      underline: function (B) {
        var b = B.b, s = B.s, y = b.y + b.h + 6 * s, x0 = b.x - 4 * s, x1 = b.x + b.w + 8 * s, p = [];
        for (var x = x0; x <= x1; x += 1.5 * s) p.push([x, y + Math.sin((x - x0) / (5 * s)) * 3 * s]);
        B.stroke(B.hand(p, 0.3));
        B.edge = function (T) { return rectEdge(b, 10 * s, T); };
      }
    }
  });
  // a struck word blacked in: a fat rounded blot, lumpy along the top, with a curling tail off one end
  function tagore_blotP(B, x0, x1, cy, h) {
    var r = B.r, top = [], bot = [], n = Math.max(6, Math.round((x1 - x0) / (9 * B.s)));
    for (var i = 0; i <= n; i++) {
      var t = i / n, x = x0 + (x1 - x0) * t, sw = Math.sin(Math.PI * Math.min(1, t * 1.6 + 0.08)) * Math.sin(Math.PI * Math.min(1, (1 - t) * 1.6 + 0.08));
      top.push([x, cy - h * (0.28 + 0.24 * sw + r() * 0.1)]);
      bot.push([x, cy + h * (0.22 + 0.22 * sw + r() * 0.06)]);
    }
    return top.concat(bot.reverse());
  }
  function tagore_blot(B, b, tail) {
    var s = B.s, r = B.r, x0 = b.x - 4 * s, x1 = b.x + b.w + 4 * s, cy = b.y + b.h * 0.52, h = b.h * 1.1 + 6 * s;
    var P = tagore_blotP(B, x0, x1, cy, h), T = null;
    if (tail) {
      var d = r() < 0.5 ? 1 : -1, tx = x1 - 2 * s, ty = cy - h * 0.15;
      T = [[tx, ty], [tx + 10 * s, ty - d * 6 * s], [tx + 18 * s, ty - d * 2 * s], [tx + 20 * s, ty + d * 6 * s], [tx + 15 * s, ty + d * 9 * s]];
    }
    B.fn(function (c, u) {
      c.save(); c.beginPath(); c.rect(x0 - 2 * s, cy - h * 2, (x1 - x0 + 4 * s) * u, h * 4); c.clip();
      c.fillStyle = B.K.ink; c.beginPath(); path(c, P); c.closePath(); c.fill();
      c.restore();
    }, { len: (x1 - x0) * 1.6 });
    if (T) B.stroke(B.hand(T, 0.2), { w: 2.4 });
    return [x0, x1, cy];
  }
  // the thread that links the blots into one creature
  function tagore_thread(B, a, b) {
    var s = B.s, r = B.r, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    var nx = -dy / L, ny = dx / L, k = (14 + r() * 10) * s, p = [], c1, c2;
    if (Math.abs(dy) < Math.abs(dx) * 0.5) {
      // same line: hang below the words, with a twist at the bottom
      var sag = Math.min(70 * s, L * 0.3 + 18 * s);
      c1 = [a[0] + dx * 0.2, Math.max(a[1], b[1]) + sag + k * 0.3]; c2 = [b[0] - dx * 0.2, Math.max(a[1], b[1]) + sag - k * 0.3];
    } else { c1 = [mx + nx * k - dx * 0.15, my + ny * k - dy * 0.15]; c2 = [mx - nx * k + dx * 0.15, my - ny * k + dy * 0.15]; }
    for (var i = 0; i <= 24; i++) {
      var t = i / 24, u = 1 - t;
      p.push([u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1]]);
    }
    B.stroke(B.hand(p, 0.2), { w: 1.6 });
  }
  def('tagore', {
    name: 'Tagore', who: 'Rabindranath Tagore', field: 'art', year: 1913,
    bio: 'Rabindranath Tagore (1861-1941) was a Bengali poet, composer and painter from Calcutta. In 1913 he became the first non-European to win the Nobel Prize in Literature. He wrote the national anthems of India and Bangladesh. He took up painting in his sixties, and it started with the doodles he made over crossed-out words.',
    about: 'His poem manuscripts: an even, upright black-ink hand, and every struck word filled in as a solid black blot with a curling tail, the blots threaded together by one flowing line into a creature.',
    source: { text: 'Bengali poem manuscript with crossings-out blacked in and linked into a chain', where: 'Wikimedia Commons (File:Tagore_manuscript6_c.jpg)', url: 'https://commons.wikimedia.org/wiki/File:Tagore_manuscript6_c.jpg' },
    pen: 'ink', w: 2, ink: '#1a1a1a', accent: '#1a1a1a', font: { f: "'Atma', cursive" }, size: 27, leading: 1.2,
    hand: { wob: 0.35, over: 0.3, bend: 0.1 },
    marks: {
      strike: function (B) {
        tagore_blot(B, B.b, true);
        B.edge = function (T) { return rectEdge(B.b, 8 * B.s, T); };
      },
      cross: function (B) {
        tagore_blot(B, B.b, false);
        B.edge = function (T) { return rectEdge(B.b, 8 * B.s, T); };
      },
      // two struck passages, blacked in and joined by the thread
      connect: function (B) {
        var a = B.b, b = B.to, s = B.s;
        if (!b) return;
        var A = tagore_blot(B, a, false), Z = tagore_blot(B, b, true);
        var p0 = a.x + a.w / 2 < b.x + b.w / 2 ? [A[1], A[2]] : [A[0], A[2]], p1 = a.x + a.w / 2 < b.x + b.w / 2 ? [Z[0], Z[2]] : [Z[1], Z[2]];
        tagore_thread(B, p0, p1);
        B.edge = function (T) { return rectEdge(a, 8 * s, T); };
      }
    }
  });
  // the afterthought written sideways up the margin, reading from the bottom, ending in a long dash
  function hurston_sideways(B, A) {
    var s = B.s, c = B.c, R = A.R, items = B.items, ti = -1, i;
    if (!R || (A.side !== 'left' && A.side !== 'right')) return;
    for (i = items.length - 1; i >= 0; i--) if (items[i].k === 't') { ti = i; break; }
    if (ti < 0) return;
    var T = items[ti], words = T.lines.join(' ').split(/\s+/), maxH = Math.min(B.H - 16 * s, 300 * s), lines = [], tw = 0, line = '';
    c.save(); c.font = fontStr(T.F, T.px);
    words.forEach(function (wd) { var t = line ? line + ' ' + wd : wd; if (line && c.measureText(t).width > maxH) { lines.push(line); line = wd; } else line = t; });
    if (line) lines.push(line);
    var lw = lines.map(function (l) { return c.measureText(l).width; });
    c.restore();
    lw.forEach(function (w) { tw = Math.max(tw, w); });
    var nh = lines.length * T.lh, left = A.side === 'right' ? R.x : R.x + R.w - nh;
    if (tw + 30 * s > B.H - 16 * s || left < 4 * s || left + nh > B.W - 4 * s) return;
    var cy = clamp(R.y + R.h / 2, 8 * s + tw / 2, B.H - 8 * s - tw / 2), b = B.b, g0 = 8 * s;
    // keep the horizontal note if the sideways one would run over the marked words
    if (left < b.x + b.w + g0 && left + nh > b.x - g0 && cy - tw / 2 < b.y + b.h + g0 && cy + tw / 2 > b.y - g0) return;
    var bot = cy + tw / 2, n = lines.length, dashL = Math.min(26 * s, bot - lw[n - 1] - 15 * s);
    // the text item is gone, so the note clock no longer counts its letters: stretch the window to match
    var chars = lines.join('').length, span = Math.min(1.8, 0.35 + 0.03 * chars) / 0.35;
    items[ti] = {
      k: 'fn', ph: 'note', at: [0, span], draw: function (cc, u) {
        cc.save(); cc.translate(left, bot); cc.rotate(-PI / 2);
        cc.font = fontStr(T.F, T.px); cc.fillStyle = T.col; cc.textBaseline = 'alphabetic';
        for (var j = 0; j < n; j++) {
          var f = clamp(u * (n + 0.4) - j, 0, 1); if (f <= 0) break;
          var y = T.lh * (j + 0.78);
          cc.save(); cc.beginPath(); cc.rect(-2, y - T.lh * 1.1, lw[j] * f + 4 * s, T.lh * 1.4); cc.clip(); cc.fillText(lines[j], 0, y); cc.restore();
        }
        var g = clamp(u * (n + 0.4) - n, 0, 0.4) / 0.4, ly = T.lh * (n - 1 + 0.62), lx = lw[n - 1] + 7 * s;
        if (g > 0 && dashL > 6 * s) { cc.fillStyle = T.col; ribbon(cc, [[lx, ly], [lx + dashL * g, ly - 1 * s]], function (k) { return (k ? 0.8 : 2) * s; }, false); }
        cc.restore();
      }
    };
  }
  def('hurston', {
    name: 'Hurston', who: 'Zora Neale Hurston', field: 'art', year: 1957,
    bio: 'Zora Neale Hurston (1891-1960) was an American writer and folklorist raised in Eatonville, Florida. She collected Black folklore across the South and the Caribbean, in 1935 partly with Alan Lomax, and wrote the novel Their Eyes Were Watching God (1937). She died poor and was buried in an unmarked grave, which Alice Walker found and marked in 1973.',
    about: 'Her 1957 letter to Alan Lomax: a typed page with words underlined on the typewriter, and a quick, slanting blue-ink afterthought written sideways up the margin beside an arrow or bracket.',
    source: { text: 'Typed letter to Alan Lomax, Cocoa, Florida, 4 February 1957, with her handwritten blue-ink postscript up the left margin', where: 'Library of Congress, American Folklife Center, Alan Lomax Collection', url: 'https://www.loc.gov/item/afc2004004.ms230642/' },
    pen: 'ink', w: 2, ink: '#2a46a0', accent: '#2a2a2a', font: { f: "'Dawning of a New Day', cursive" }, size: 29, leading: 1.15,
    fonts: ["'Special Elite', monospace"],
    hand: { wob: 0.6, over: 0.35, bend: 0.2 }, hl: 'rgba(42,70,160,0.16)',
    marks: {
      // underlined on the machine: a row of typed underscores
      underline: function (B) {
        var b = B.b, s = B.s, y = b.y + b.h - 4 * s;
        B.stroke(lineP([b.x - 1 * s, y], [b.x + b.w + 2 * s, y]), { pen: 'typed', w: 20, glyph: '_', font: "'Special Elite', monospace", col: B.K.accent });
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      var mk = B.m.mark;
      if (mk === 'arrow' || mk === 'bracket') hurston_sideways(B, A);
    }
  });
  // rewrap note lines the way the Bliss copy breaks words at a line end ("na- tion", "cre- ated")
  function lincoln_hyphen(B, it) {
    var c = B.c, W = it.w + 0.5, words = it.lines.join(' ').split(/\s+/).filter(Boolean), out = [], line = '';
    c.save(); c.font = fontStr(it.F, it.px);
    var fits = function (t) { return c.measureText(t).width <= W; };
    for (var i = 0; i < words.length; i++) {
      var wd = words[i], t = line ? line + ' ' + wd : wd, done = false;
      if (!line || fits(t)) { line = t; continue; }
      if (wd.length >= 6 && /^[A-Za-z]+[,.;:!?]?$/.test(wd)) {
        for (var k = wd.length - 3; k >= 3; k--) { var head = line + ' ' + wd.slice(0, k) + '-'; if (fits(head)) { out.push(head); line = wd.slice(k); done = true; break; } }
      }
      if (!done) { out.push(line); line = wd; }
    }
    if (line) out.push(line);
    c.restore();
    return out;
  }
  // a level pause dash, swelling a little in the middle
  function lincoln_dash(B, x0, x1, y) {
    return B.stroke(lineP([x0, y], [x1, y]), { w: B.st.w * 1.15 });
  }
  def('lincoln', {
    name: 'Lincoln', who: 'Abraham Lincoln', field: 'history', year: 1863,
    bio: 'Abraham Lincoln (1809-1865) was the 16th president of the United States. He led the Union through the Civil War and issued the Emancipation Proclamation in 1863. He gave the Gettysburg Address that November and wrote out five copies by hand. He was assassinated in 1865.',
    about: 'The Bliss copy of the Gettysburg Address: a calm round hand on blue-ruled paper, level pause dashes and words broken at the line end with a hyphen.',
    source: { text: 'Gettysburg Address, Bliss copy, in Lincoln\'s hand (1864)', where: 'The White House (Lincoln Bedroom); image via Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Gettysburg_Address_Bliss_copy.jpg' },
    pen: 'ink', w: 1.9, ink: '#2b2a2e', accent: '#8fa7c8', font: { f: "'Playwrite US Trad', cursive" }, size: 22, leading: 1.35,
    hand: { wob: 0.3, over: 0.15, bend: 0.06 }, hl: 'rgba(143,167,200,0.28)',
    marks: {
      underline: function (B) {
        var b = B.b, s = B.s;
        lincoln_dash(B, b.x - 2 * s, b.x + b.w + 6 * s, b.y + b.h + 4 * s);
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      },
      strike: function (B) {
        var b = B.b, s = B.s;
        lincoln_dash(B, b.x - 4 * s, b.x + b.w + 4 * s, b.y + b.h * 0.58);
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var it = null, s = B.s, i;
      for (i = B.items.length - 1; i >= 0; i--) if (B.items[i].k === 't') { it = B.items[i]; break; }
      if (!it) return;
      if (String(B.m.note || '').indexOf('\n') < 0) { it.lines = lincoln_hyphen(B, it); A.lines = it.lines; }
      // the faint blue ruling of the writing paper, under the words
      var n = it.lines.length, x0 = it.x - 16 * s, x1 = it.x + it.w + 16 * s;
      var rule = B.fn(function (c, u) {
        c.globalAlpha *= 0.55 * u; c.strokeStyle = B.K.accent; c.lineWidth = 0.9 * s;
        for (var j = 0; j < n; j++) { var y = it.y + it.lh * (j + 0.78) + it.px * 0.14; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); }
      }, { ph: 'note', at: [0, 0.25] });
      underText(B, rule);
    }
  });
  // redraw the note text tilted (a quick reply written up the corner of the minute); the original stays for timing
  function churchill_tilt(B, ang) {
    var it = null, i, k, cp = {};
    for (i = B.items.length - 1; i >= 0; i--) if (B.items[i].k === 't') { it = B.items[i]; break; }
    if (!it) return null;
    for (k in it) cp[k] = it[k];
    it.col = 'rgba(0,0,0,0)';
    var cx = it.x, cy = it.y + it.lines.length * it.lh, s = B.s;
    B.fn(function (c, u) { c.translate(cx, cy); c.rotate(ang); c.translate(-cx, -cy); renderText(c, cp, u, s); }, { ph: 'note', at: [0, 1] });
    return cp;
  }
  // the printed red ACTION THIS DAY label, pasted on
  function churchill_label(B, x, y) {
    var s = B.s, F = { f: "Arial, Helvetica, sans-serif", wt: 700 }, px = 12 * s, txt = 'ACTION THIS DAY', c = B.c;
    c.save(); c.font = fontStr(F, px); var tw = c.measureText(txt).width; c.restore();
    var w = tw + 14 * s, h = px * 1.9;
    B.fn(function (c, u) {
      if (u <= 0) return;
      var k = 1 + 0.18 * (1 - outCubic(u));
      c.save(); c.translate(x + w / 2, y + h / 2); c.rotate(-0.035); c.scale(k, k); c.globalAlpha *= Math.min(1, u * 2.5);
      c.fillStyle = B.K.accent; c.fillRect(-w / 2, -h / 2, w, h);
      c.fillStyle = '#1a1414'; c.font = fontStr(F, px); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, 0, 0.5 * s);
      c.restore();
    }, { ph: 'note', at: [1.0, 1.25] });
    return { w: w, h: h };
  }
  // a loose looped flower, like the one he doodled over his secretary's initials
  function churchill_flower(B, cx, cy, R) {
    var p = [], q = [], n = 220, i, t;
    for (i = 0; i <= n; i++) { t = i / n * TAU; p.push([cx + R * 0.66 * Math.cos(t) + R * 0.34 * Math.cos(9 * t), cy + R * 0.66 * Math.sin(t) + R * 0.34 * Math.sin(9 * t)]); }
    for (i = 0; i <= 120; i++) { t = i / 120 * TAU; q.push([cx + R * 0.24 * Math.cos(t) + R * 0.12 * Math.cos(6 * t), cy + R * 0.24 * Math.sin(t) + R * 0.12 * Math.sin(6 * t)]); }
    B.stroke(B.hand(p, 0.15), { w: 1.5, ph: 'note', at: [0.7, 1.3] });
    B.stroke(B.hand(q, 0.1), { w: 1.4, ph: 'note', at: [1.3, 1.5] });
  }
  def('churchill', {
    name: 'Churchill', who: 'Winston Churchill', field: 'history', year: 1941,
    bio: 'Winston Churchill (1874-1965) was British prime minister from 1940 to 1945 and from 1951 to 1955. He ran the war on paper with short minutes and terse replies in red ink. From 1941 he pinned red ACTION THIS DAY labels to the urgent ones. His record on empire, including the Bengal famine of 1943, is still argued over.',
    about: 'His red-ink replies on wartime minutes: a short order tilted up the top corner, quick crossings-through, a loose flower doodle and the red ACTION THIS DAY label.',
    source: { text: 'Minute from John Colville to the P.M. with Churchill\'s red reply "Await full list." and a flower doodle (1940s)', where: 'Chartwell Booksellers, New York (dealer listing)', url: 'https://www.chartwellbooksellers.com/product/original-world-war-ii-autograph-memorandum-from-john-colville-with-handwritten-reply-and-a-doodle-drawing-by-winston-churchill/' },
    pen: 'ink', w: 2.1, ink: '#d4246a', accent: '#d42a2a', font: { f: "'Zeyada', cursive" }, size: 32, leading: 1.0,
    hand: { wob: 0.6, over: 0.45, bend: 0.15 }, hl: 'rgba(212,36,106,0.2)',
    marks: {
      // "WSC has crossed through": one quick line, a little uphill
      strike: function (B) {
        var b = B.b, s = B.s, y = b.y + b.h * 0.58;
        B.stroke(B.hand(lineP([b.x - 7 * s, y + 4 * s], [b.x + b.w + 9 * s, y - 5 * s]), 0.35));
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R;
      churchill_tilt(B, -0.12);
      if (B.m.mark === 'note') {
        var c = B.c, lw;
        c.save(); c.font = fontStr({ f: "Arial, Helvetica, sans-serif", wt: 700 }, 12 * s); lw = c.measureText('ACTION THIS DAY').width + 14 * s; c.restore();
        var y = R.y - 12 * s - 23 * s, x = clamp(R.x - 4 * s, 4 * s, Math.max(4 * s, B.W - lw - 4 * s));
        if (y < 4 * s) y = R.y + R.h + 12 * s;
        churchill_label(B, x, y);
      } else if (B.m.mark === 'arrow') {
        var P = besideNote(B, A, 16 * s);
        churchill_flower(B, P[0], P[1], 16 * s);
      }
    }
  });
  // the thick, blotted bar he struck words out with (and closed a letter with), ink pooling at both ends
  function napoleon_bar(B, x0, y, x1, th, o) {
    o = o || {};
    var s = B.s, r = rng((B.m.seed | 0) * 13 + Math.round(x0)), f = wave(r), g = wave(r), sl = (r() - 0.5) * 0.05 * (x1 - x0), pts = [], n = 40;
    for (var i = 0; i <= n; i++) { var v = i / n; pts.push([x0 + (x1 - x0) * v, y + sl * (v - 0.5) * 2 + th * 0.14 * f(v * 7)]); }
    var cl = cum(pts), L = cl[n];
    var wf = function (k, d) { var v = d / L; return th * (0.72 + 0.22 * g(v * 9) + 0.5 * Math.exp(-v * 16) + 0.55 * Math.exp(-(1 - v) * 12)); };
    B.fn(function (c, u) {
      if (u <= 0) return;
      var q = cutTo(pts, cl, L * u), A = c.globalAlpha;
      c.fillStyle = B.K.ink; c.globalAlpha = A * 0.9; ribbon(c, q, wf);
      c.fillStyle = B.K.accent; c.globalAlpha = A * 0.35;
      ribbon(c, q.map(function (p) { return [p[0], p[1] + th * 0.3]; }), function (k, d) { return wf(k, d) * 0.55; });
      if (u >= 1) { c.globalAlpha = A * 0.85; c.fillStyle = B.K.accent; dot(c, pts[n][0] + th * 0.2, pts[n][1] + th * 0.1, th * 0.55); }
    }, o.ph ? { ph: o.ph, at: o.at } : { len: L });
  }
  function napoleon_tilt(B, ang) {
    var it = null, i, k, cp = {};
    for (i = B.items.length - 1; i >= 0; i--) if (B.items[i].k === 't') { it = B.items[i]; break; }
    if (!it) return;
    for (k in it) cp[k] = it[k];
    it.col = 'rgba(0,0,0,0)';
    var cx = it.x, cy = it.y + it.lines.length * it.lh / 2, s = B.s;
    B.fn(function (c, u) { c.translate(cx, cy); c.rotate(ang); c.translate(-cx, -cy); renderText(c, cp, u, s); }, { ph: 'note', at: [0, 1] });
  }
  def('napoleon', {
    name: 'Napoleon', who: 'Napoleon Bonaparte', field: 'history', year: 1816,
    bio: 'Napoleon Bonaparte (1769-1821) was a French general who crowned himself emperor in 1804. His civil code still shapes law in much of Europe. He restored slavery in the French colonies in 1802. Exiled to St Helena, he took English lessons there and wrote his tutor letters in a fast, steep scrawl.',
    about: 'His 1816 English letter from St Helena: a steep, rushed quill hand in brown ink, words struck out with a thick blotted bar, and the long swash that runs back under his name.',
    source: { text: 'Autograph letter in English to the comte de Las Cases, Longwood, St Helena, 6 March 1816', where: 'Bonhams, sale 29882, lot 33', url: 'https://www.bonhams.com/auction/29882/lot/33/napoleon-bonaparte-autograph-letter-unsigned-to-emmanuel-comte-de-las-cases-longwood-6-march-1816' },
    pen: 'ink', w: 2.3, ink: '#6b4a2b', accent: '#4a2f18', font: { f: "'Dawning of a New Day', cursive" }, size: 32, leading: 1.05,
    hand: { wob: 0.9, over: 0.6, bend: 0.22 }, hl: 'rgba(150,110,60,0.25)',
    marks: {
      strike: function (B) {
        var b = B.b, s = B.s, th = clamp(b.h * 0.3, 6 * s, 15 * s);
        napoleon_bar(B, b.x - 3 * s, b.y + b.h * 0.55, b.x + b.w + 4 * s, th);
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      },
      // the signature swash: a hook off the end of the word that runs back under it, then out again
      underline: function (B) {
        var b = B.b, s = B.s, x0 = b.x - 4 * s, x1 = b.x + b.w + 6 * s, y = b.y + b.h + 7 * s, mid = (x0 + x1) / 2, p = [];
        p = p.concat(quadP([x1 - 4 * s, b.y + b.h * 0.85], [x1 + 12 * s, b.y + b.h + 1 * s], [x1 + 6 * s, y + 2 * s], 10));
        p = p.concat(quadP([x1 + 8 * s, y + 2 * s], [mid, y + 7 * s], [x0 - 10 * s, y + 5 * s], 20).slice(1));
        p = p.concat(quadP([x0 - 10 * s, y + 5 * s], [x0 - 16 * s, y + 2 * s], [x0 - 4 * s, y + 1 * s], 8).slice(1));
        p = p.concat(quadP([x0 - 4 * s, y + 1 * s], [mid, y + 3 * s], [x1 + 30 * s, y + 3 * s], 20).slice(1));
        B.stroke(B.hand(p, 0.35));
        B.edge = function (T) { return rectEdge(b, 8 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, R = A.R;
      napoleon_tilt(B, -0.05);
      // the heavy bar he drew under the last line of the letter
      if (B.m.mark === 'note') {
        var c = B.c, last = A.lines[A.lines.length - 1], lw;
        c.save(); c.font = fontStr(B.F, A.px); lw = c.measureText(last).width; c.restore();
        var x0 = R.x + lw + 10 * s, y = R.y + A.lh * (A.lines.length - 0.45) - (x0 - R.x) * 0.05, w = Math.min(90 * s, Math.max(30 * s, B.W - x0 - 10 * s));
        napoleon_bar(B, x0, y, x0 + w, 4.5 * s, { ph: 'note', at: [1.0, 1.3] });
      }
    }
  });
  // a caret at the insertion point, the opening for the words written in above the line
  function jefferson_caret(B, x, y) {
    var s = B.s, z = 8 * s;
    B.stroke(B.hand([[x - z * 0.75, y + z * 0.7], [x, y - z * 0.9], [x + z * 0.75, y + z * 0.7]], 0.1), { w: 1.6 });
  }
  def('jefferson', {
    name: 'Jefferson', who: 'Thomas Jefferson', field: 'history', year: 1776,
    bio: 'Thomas Jefferson (1743-1826) drafted the Declaration of Independence in June 1776 and was the third president of the United States. He enslaved more than 600 people over his life. His rough draft survives with his own brackets and carets and the edits of Adams, Franklin and Congress.',
    about: 'The rough draft of the Declaration: a small, neat quill hand, square brackets around passages, words inked out, insertions written above a caret and pencil notes in the margin.',
    source: { text: 'Rough draft of the Declaration of Independence, June 1776, page 1', where: 'Library of Congress, Thomas Jefferson Papers (mtjbib000156)', url: 'https://www.loc.gov/item/mtjbib000156/' },
    pen: 'ink', w: 1.8, ink: '#3a2c22', accent: '#8b8784', font: { f: "'Cedarville Cursive', cursive" }, size: 26,
    hand: { wob: 0.35, over: 0.2, bend: 0.1 }, hl: 'rgba(120,112,104,0.2)',
    marks: {
      // true square brackets on both sides
      bracket: function (B) {
        var b = B.b, s = B.s, p = 6 * s, t = 7 * s, x0 = b.x - p, x1 = b.x + b.w + p, y0 = b.y - 3 * s, y1 = b.y + b.h + 3 * s;
        B.stroke(B.hand([[x0 + t, y0], [x0, y0], [x0, y1], [x0 + t, y1]], 0.12));
        B.stroke(B.hand([[x1 - t, y0], [x1, y0], [x1, y1], [x1 - t, y1]], 0.12));
        B.edge = function (T) { return rectEdge(b, p + 5 * s, T); };
      },
      // words inked over with tight back-and-forth strokes
      strike: function (B) {
        var b = B.b, s = B.s, y = b.y + b.h * 0.56, amp = clamp(b.h * 0.15, 2.2 * s, 6 * s), per = 4.2 * s, x0 = b.x - 2 * s, x1 = b.x + b.w + 2 * s, p = [], q = [];
        for (var x = x0; x <= x1; x += per / 4) { p.push([x, y + amp * Math.sin((x - x0) / per * TAU)]); q.push([x1 - (x - x0), y + amp * 0.8 * Math.sin((x - x0) / per * TAU + 1.7)]); }
        B.stroke(B.hand(p, 0.15), { w: 2.8 });
        B.stroke(B.hand(q, 0.15), { w: 2.5 });
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      },
      // an interlined insertion: smaller words above, a caret below at the end of the word
      note: function (B) {
        var b = B.b, s = B.s, x = b.x + b.w + 3 * s;
        B.forceSide = 'top'; jefferson_caret(B, x, b.y + b.h + 2 * s);
        if (B.m.noteSize == null) B.m.noteSize = B.st.size * 0.76;
        if (B.m.noteWidth == null) B.m.noteWidth = 560;
        if (!B.m.from) B.m.from = [x, b.y - 1 * s];
        B.edge = function (T) { return T; };
      },
      // a pencil note in the margin, like the ones naming who proposed a change
      arrow: function (B) { MARKS.arrow(B); B.jeffPencil = true; B.K.text = B.K.accent; }
    },
    noteDeco: function (B, A) {
      if (B.jeffPencil) B.items.forEach(function (it) { if (it.k === 's' && it.pen !== 'highlighter') { it.pen = 'pencil'; it.col = B.K.accent; } });
    }
  });
  // the barbed hook that ends the ornamental curl over his signature
  function douglass_barb(B, tip, ang, z) {
    var a1 = [tip[0] - Math.cos(ang - 0.5) * z, tip[1] - Math.sin(ang - 0.5) * z], nk = [tip[0] - Math.cos(ang) * z * 0.55, tip[1] - Math.sin(ang) * z * 0.55];
    var a2 = [tip[0] - Math.cos(ang + 0.12) * z * 0.9, tip[1] - Math.sin(ang + 0.12) * z * 0.9];
    B.fill([[tip[0], tip[1]], a1, nk, a2, [tip[0], tip[1]]], { col: B.K.ink, rev: 'grow', cx: tip[0], cy: tip[1], len: z });
  }
  def('douglass', {
    name: 'Douglass', who: 'Frederick Douglass', field: 'history', year: 1859,
    bio: 'Frederick Douglass (1818-1895) escaped slavery in Maryland in 1838 and became the leading abolitionist voice in America. He published his Narrative in 1845 and founded The North Star in Rochester in 1847. He later served as US marshal and as minister to Haiti.',
    about: 'His 1859 autograph sentiment: a forward-leaning steel-pen hand with thick and thin strokes, dashes between clauses, a curl over the name that ends in a barb and an S swash under the date.',
    source: { text: 'Autograph note, 1859: "There can be no virtue without freedom, and no peace without justice."', where: 'Randolph Linsly Simpson African-American Collection, Yale University Library; image via Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Frederick_Douglass_-_no_peace_without_justice_(cropped).jpg' },
    pen: 'nib', w: 2.5, ink: '#2a1f1a', accent: '#2a1f1a', font: { f: "'La Belle Aurore', cursive" }, size: 28,
    hand: { wob: 0.45, over: 0.35, bend: 0.18 }, hl: 'rgba(196,170,120,0.35)',
    // arrows sweep up and over like the curl above the F
    shaft: function (B, tail, tip, ctl) {
      if (B.m.mark !== 'arrow') return B.hand(quadP(tail, ctl, tip, 24), 0.45);
      var dx = tip[0] - tail[0], dy = tip[1] - tail[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      if (ny > 0) { nx = -nx; ny = -ny; }
      var k = [(tail[0] + tip[0]) / 2 + nx * len * 0.42, (tail[1] + tip[1]) / 2 + ny * len * 0.42];
      return B.hand(quadP(tail, k, tip, 30), 0.3);
    },
    headFn: function (B, tip, ang, z) {
      if (!B.wantHead && B.m.mark !== 'connect') { B.fn(function (c, u) { c.fillStyle = B.K.ink; dot(c, tip[0], tip[1], 2.8 * B.s * outBack(u)); }, { len: z * 0.6 }); return; }
      douglass_barb(B, tip, ang, z * 1.1);
    },
    marks: {
      // the S swash under the date: opens like a bracket, runs under, hooks down and back
      underline: function (B) {
        var b = B.b, s = B.s, x0 = b.x - 2 * s, x1 = b.x + b.w + 4 * s, y = b.y + b.h + 6 * s, p = [];
        p = p.concat(quadP([x0 + 4 * s, b.y + b.h * 0.15], [x0 - 14 * s, y - 2 * s], [x0 + 12 * s, y], 12));
        p = p.concat(quadP([x0 + 12 * s, y], [(x0 + x1) / 2, y + 1 * s], [x1 - 6 * s, y + 3 * s], 20).slice(1));
        p = p.concat(quadP([x1 - 6 * s, y + 3 * s], [x1 + 16 * s, y + 6 * s], [x1 + 8 * s, y + 20 * s], 10).slice(1));
        p = p.concat(quadP([x1 + 8 * s, y + 20 * s], [x1 + 4 * s, y + 24 * s], [x1 - 6 * s, y + 19 * s], 6).slice(1));
        B.stroke(B.hand(p, 0.25));
        B.edge = function (T) { return rectEdge(b, 8 * s, T); };
      }
    },
    // the dash he ends a line with ("freedom - and", "Douglass -")
    noteDeco: function (B, A) {
      if (!A.R || !A.lines.length) return;
      var s = B.s, c = B.c, last = A.lines[A.lines.length - 1];
      c.save(); c.font = fontStr(B.F, A.px); var lw = c.measureText(last).width; c.restore();
      var x = A.R.x + lw + 6 * s, y = A.R.y + A.lh * (A.lines.length - 1 + 0.6);
      B.stroke(B.hand(lineP([x, y], [x + 14 * s, y - 1 * s]), 0.1), { w: 2.6, ph: 'note', at: [0.95, 1.1] });
    }
  });
  // He wrote with both hands: an upright, printed left hand and a fast, sprawling right. Marks take turns
  // (mark order, offset by seed), or pass hand: 'left' or 'right' on a mark.
  var gandhi_HANDS = {
    left: { f: "'Gochi Hand', cursive", size: 26, w: 1.2, wob: 0.5 },
    right: { f: "'Reenie Beanie', cursive", size: 31, w: 0.75, wob: 0.9 }
  };
  function gandhi_pick(B, mk) {
    var keys = Object.keys(MARKS), hand = B.m.hand === 'left' || B.m.hand === 'right' ? B.m.hand : (((B.m.seed | 0) + keys.indexOf(mk)) % 2 ? 'right' : 'left');
    var H = gandhi_HANDS[hand], rough = B.m.rough == null ? 1 : +B.m.rough, st0 = B.stroke;
    B.gandhiHand = hand;
    if (!B.m.font) B.F = { f: H.f };
    if (B.m.noteSize == null) B.m.noteSize = H.size;
    B.h.wob = H.wob * rough;
    B.stroke = function (p, o) { var it = st0.call(B, p, o); if (!(o && o.w)) it.w *= H.w; return it; };
  }
  def('gandhi', {
    name: 'Gandhi', who: 'Mahatma Gandhi', field: 'history', year: 1925,
    bio: 'Mohandas Karamchand Gandhi (1869-1948) led India\'s campaign for independence from British rule through mass nonviolent resistance. He wrote with either hand and switched when one grew tired. His letters to Jawaharlal Nehru survive in both hands, signed Bapu. He was assassinated in 1948.',
    about: 'His letters to Nehru in two hands: marks take turns between the upright, printed left hand and the fast, joined right, and a struck word gets its correction written above.',
    source: { text: 'Letters to Jawaharlal Nehru, 30 September 1925 (left hand) and 19 September 1924 (right hand), as reproduced in print', where: 'Courtesy of Jawaharlal Nehru; images via Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Gandhi_handwriting.jpg' },
    pen: 'ink', w: 2.2, ink: '#222222', accent: '#222222', font: { f: "'Gochi Hand', cursive" }, fonts: ["'Reenie Beanie', cursive"], size: 26,
    hand: { wob: 0.6, over: 0.35, bend: 0.12 },
    marks: (function () {
      var own = {
        // "must" struck through with one line and "may" written above it
        strike: function (B) {
          MARKS.strike(B);
          var txt = B.m.note;
          if (txt != null && txt !== '') {
            var b = B.b, s = B.s, px = (B.m.noteSize || 26) * 0.8;
            B.m.note = '';
            tag(B, String(txt), b.x + b.w / 2, b.y - px * 0.45 * s, px, { F: B.F, ph: 'note', at: [0, 1] });
          }
        }
      }, out = {};
      Object.keys(MARKS).forEach(function (k) { out[k] = function (B) { gandhi_pick(B, k); (own[k] || MARKS[k])(B); }; });
      return out;
    })()
  });
  // the knotted paraph under her signature: long flat loops drawn left to right, then a return stroke woven through them
  function elizabeth_knot(B, x0, x1, y, amp, o) {
    o = o || {};
    var s = B.s, L = x1 - x0, n = Math.max(2, Math.round(L / (70 * s))), N = 34 * n, p = [], q = [], i, t, th;
    for (i = 0; i <= N; i++) { t = i / N; th = TAU * n * t; p.push([x0 + L * t + (L / n) * 0.5 * Math.sin(th), y - amp * Math.cos(th)]); }
    for (i = 0; i <= N; i++) { t = i / N; q.push([x1 + 10 * s - (L + 26 * s) * t, y + amp * 0.5 + amp * 1.1 * Math.sin(TAU * (n - 0.5) * t)]); }
    var a = { w: B.st.w * 0.85 }, b2 = { w: B.st.w * 0.7 };
    if (o.ph) { a.ph = b2.ph = o.ph; a.at = [o.at[0], (o.at[0] + o.at[1]) / 2]; b2.at = [(o.at[0] + o.at[1]) / 2, o.at[1]]; }
    B.stroke(B.hand(p, 0.12), a);
    B.stroke(B.hand(q, 0.12), b2);
  }
  def('elizabeth', {
    name: 'Elizabeth I', who: 'Elizabeth I', field: 'history', year: 1570,
    bio: 'Elizabeth I (1533-1603) was queen of England and Ireland from 1558 until her death. Roger Ascham taught her the new Italic hand as a girl. She signed Elizabeth R under a knot of looping flourishes. Her reign saw the defeat of the Spanish Armada in 1588.',
    about: 'Her signature, Elizabeth R: a swelling quill Italic, rings that close with an extra loop and the knotted paraph of interlaced loops woven under the name.',
    source: { text: 'Signature "Elizabeth R", traced from an original document', where: 'Wikimedia Commons (vector trace)', url: 'https://commons.wikimedia.org/wiki/File:Autograph_of_Elizabeth_I_of_England.svg' },
    pen: 'nib', w: 2.3, ink: '#2a1d14', accent: '#7a5a3a', font: { f: "'Fondamento', serif", i: true }, size: 26,
    hand: { wob: 0.3, over: 0.3, bend: 0.2 }, hl: 'rgba(170,130,80,0.25)',
    marks: {
      underline: function (B) {
        var b = B.b, s = B.s;
        elizabeth_knot(B, b.x - 6 * s, b.x + b.w + 6 * s, b.y + b.h + 9 * s, clamp(b.h * 0.18, 4 * s, 7 * s));
        B.edge = function (T) { return rectEdge(b, 16 * s, T); };
      },
      // a ring that closes with one more small loop
      circle: function (B) {
        MARKS.circle(B);
        var it = B.items[B.items.length - 1], p = it.pts, n = p.length, e = p[n - 1], h = Math.atan2(e[1] - p[n - 3][1], e[0] - p[n - 3][0]), r = 5 * B.s;
        it.pts = p.concat(xform(ellipseP(0, r * 0.7, r * 2.2, r * 0.7, -PI / 2, TAU * 1.1, 0, 26), e[0], e[1], h, 1).slice(1));
      }
    },
    // a small knot under the note, as under her name
    noteDeco: function (B, A) {
      if (!A.R || B.m.mark !== 'note') return;
      var s = B.s, R = A.R, y = R.y + R.h + 10 * s;
      if (y + 10 * s < B.H) elizabeth_knot(B, R.x + R.w * 0.1, R.x + R.w * 0.1 + Math.min(R.w * 0.8, 150 * s), y, 4 * s, { ph: 'note', at: [0.9, 1.4] });
    }
  });
  def('mandela', {
    name: 'Mandela', who: 'Nelson Mandela', field: 'history', year: 1989,
    bio: 'Nelson Mandela (1918-2013) led the struggle against apartheid in South Africa and spent 27 years in prison, from 1962 to 1990. In prison he kept desk calendars in blue ballpoint, logging his blood pressure, his visitors and his money. He shared the Nobel Peace Prize in 1993 and became South Africa\'s first Black president in 1994.',
    about: 'His 1989 prison desk calendar: tidy upright print in blue ballpoint, a quick box drawn round a figure with the corner overshot, and small running counters in the margin.',
    source: { text: '1989 prison desk calendar, week 37, with his ballpoint entries', where: 'Nelson Mandela Foundation, Mandela Papers (NMPP PC 2009/5/1/4/43)', url: 'https://www.nelsonmandela.org/news/entry/madibas-prison-diaries' },
    pen: 'marker', w: 1.5, ink: '#2b3f9e', accent: '#2b3f9e', font: { f: "'Patrick Hand', cursive" }, size: 26,
    hand: { wob: 0.35, over: 0.4, bend: 0.1 }, hl: 'rgba(43,63,158,0.16)',
    marks: {
      // one ballpoint stroke round the figure, running past the corner where it started (R2980)
      box: function (B) {
        var b = B.b, s = B.s, p = 5 * s, x0 = b.x - p, y0 = b.y - p, x1 = b.x + b.w + p, y1 = b.y + b.h + p, o = 10 * s, r = B.r;
        var pts = [[x0 + 2 * s, y0 + (r() - 0.5) * 2 * s], [x1, y0 + (r() - 0.5) * 2 * s], [x1 + 1 * s, y1], [x0, y1 + 1 * s], [x0 - 1 * s, y0 - 0.4 * o], [x0 + o * 1.2, y0 - 0.25 * o]];
        B.stroke(B.hand(resample(pts, 3 * s), 0.35));
        B.edge = function (T) { return rectEdge(b, p + 5 * s, T); };
      },
      // the bar of his blood-pressure fractions: short, straight, firm
      underline: function (B) {
        var b = B.b, s = B.s, y = b.y + b.h + 4 * s;
        B.stroke(B.hand(lineP([b.x - 1 * s, y + 1 * s], [b.x + b.w + 3 * s, y]), 0.2));
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    // the small running counter he wrote in the calendar margin, like 2(4) and 3(5)
    noteDeco: function (B, A) {
      if (!A.R || B.m.mark !== 'note') return;
      var s = B.s, R = A.R, k = ((B.m.seed | 0) % 5 + 5) % 5 + 2, txt = k + '(' + (k + 2) + ')', px = B.st.size * 0.7;
      var left = R.x > 52 * s, x = left ? R.x - 8 * s : R.x + R.w + 8 * s, y = R.y + A.lh * 0.55;
      tag(B, txt, x, y, px, { align: left ? 'right' : 'left', ph: 'note', at: [0.85, 1.05] });
    }
  });
  // compass points in spaced capitals, the way her diaries give bearings ("to the N E")
  function bell_compass(dx, dy) {
    var a = Math.atan2(-dy, dx), i = ((Math.round(a / (PI / 4)) % 8) + 8) % 8;
    return ['E', 'N E', 'N', 'N W', 'W', 'S W', 'S', 'S E'][i];
  }
  def('bell', {
    name: 'Bell', who: 'Gertrude Bell', field: 'history', year: 1923,
    bio: 'Gertrude Bell (1868-1926) was an English archaeologist, traveler and writer who mapped and photographed ancient sites across the Middle East. After the First World War she was a British official in Baghdad and helped draw the borders of Iraq. She founded the Iraq Museum there in 1926.',
    about: 'Her diaries and letters home: a fast, cramped English cursive in brown-black ink, one line struck through a passage, an underlined date in the margin and compass bearings in capitals.',
    source: { text: 'Travel diary page with the margin date "Thurs 23." and compass bearings; letter to her family about the museum', where: 'Gertrude Bell Archive, Newcastle University (p21051coll46:8 and :10299)', url: 'https://gertrudebell.ncl.ac.uk/' },
    pen: 'ink', w: 1.8, ink: '#2b2622', accent: '#2b2622', paper: '#efe9dc', font: { f: "'Nothing You Could Do', cursive" }, size: 24,
    hand: { wob: 0.55, over: 0.4, bend: 0.15 }, hl: 'rgba(160,140,100,0.3)',
    marks: {
      // she cancels a passage with one long diagonal line
      cross: function (B) {
        var b = B.b, s = B.s, o = 8 * s;
        B.stroke(B.hand(lineP([b.x - o, b.y + b.h + o * 0.4], [b.x + b.w + o, b.y - o * 0.5]), 0.4));
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      var s = B.s, R = A.R;
      // an arrow gets its bearing written beside it
      if (B.m.mark === 'arrow' && A.tail && A.tip) {
        var dx = A.tip[0] - A.tail[0], dy = A.tip[1] - A.tail[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
        if (ny > 0) { nx = -nx; ny = -ny; }
        var x = A.tail[0] + dx * 0.5 + nx * 15 * s, y = A.tail[1] + dy * 0.5 + ny * 15 * s;
        tag(B, bell_compass(dx, dy), x, y, B.st.size * 0.85, { ph: 'note', at: [0.9, 1.1] });
      }
      // a note gets the diary's underlined margin date
      if (R && B.m.mark === 'note') {
        var c = B.c, px = B.st.size * 0.85, txt = 'Thurs 23.', tw;
        c.save(); c.font = fontStr(B.F, px * s); tw = c.measureText(txt).width; c.restore();
        var left = R.x - tw - 14 * s > 4 * s, tx = left ? R.x - tw - 14 * s : R.x, ty = left ? R.y + A.lh * 0.5 : R.y - 16 * s;
        tag(B, txt, tx, ty, px, { align: 'left', ph: 'note', at: [0, 0.2] });
        B.stroke(B.hand(lineP([tx - 1 * s, ty + px * s * 0.42], [tx + tw + 2 * s, ty + px * s * 0.4]), 0.15), { w: 1.4, ph: 'note', at: [0.2, 0.3] });
      }
    }
  });
  // a small ivy leaf from the page borders: three points on a short stalk
  function pizan_leaf(c, x, y, z, a, col) {
    c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = col; c.beginPath(); c.moveTo(0, 0);
    c.lineTo(z * 0.35, -z * 0.18); c.lineTo(z * 0.55, -z * 0.5); c.lineTo(z * 0.7, -z * 0.12); c.lineTo(z * 1.1, 0);
    c.lineTo(z * 0.7, z * 0.12); c.lineTo(z * 0.55, z * 0.5); c.lineTo(z * 0.35, z * 0.18); c.closePath(); c.fill(); c.restore();
  }
  // a sprig: a curling pen stalk with leaves in blue, red and gold
  function pizan_sprig(B, x, y, z) {
    var s = B.s, st = B.st, pts = ellipseP(x, y, z * 0.6, z * 0.6, PI * 0.9, -PI * 1.3, 0, 20), cl = cum(pts), L = cl[cl.length - 1];
    var cols = [st.third, B.K.accent, st.gold, st.third];
    B.fn(function (c, u) {
      c.strokeStyle = B.K.ink; c.lineWidth = 1 * s; c.lineCap = 'round'; path(c, cutTo(pts, cl, L * u)); c.stroke();
      for (var i = 0; i < 4; i++) {
        var v = (i + 0.6) / 4.2; if (v > u) break;
        var q = at(pts, cl, L * v), side = i % 2 ? 1 : -1;
        pizan_leaf(c, q[0], q[1], z * 0.42, q[2] + side * 1.0, cols[i]);
      }
    }, { ph: 'note', at: [0.6, 1.1] });
  }
  def('pizan', {
    name: 'Pizan', who: 'Christine de Pizan', field: 'history', year: 1410,
    bio: 'Christine de Pizan (1364-c.1430) was born in Venice and grew up at the French court. Widowed at 25, she wrote for a living and became the first professional woman writer in France. She wrote The Book of the City of Ladies in 1405 and planned and corrected the copies of her works, perhaps writing some herself.',
    about: 'Her Book of the Queen: a French bastarda in brown-black ink, capitals set apart at each line start, red rubric, a twisted blue and red bar from the column border and small ivy sprigs.',
    source: { text: 'The Book of the Queen, f. 4r, with the rubric "Cy commencent Cent Balades" (c. 1410-1414)', where: 'British Library, Harley MS 4431', url: 'https://commons.wikimedia.org/wiki/File:Christine_de_Pisan_-_The_Book_of_the_Queen.jpg' },
    pen: 'nib', w: 2.2, ink: '#2a1d14', accent: '#b8322a', third: '#2d4fa0', gold: '#c9a227', font: { f: "'Almendra', serif" }, size: 25,
    hand: { wob: 0.3, over: 0.2, bend: 0.1 }, hl: 'rgba(184,50,42,0.18)',
    marks: {
      // underlined in red, as a rubricator would
      underline: function (B) { MARKS.underline(B); B.items[B.items.length - 1].col = B.K.accent; },
      // the twisted blue and red bar that runs between the columns, gold between the twists
      bracket: function (B) {
        var b = B.b, s = B.s, st = B.st, right = B.side(0, 0) !== 'left', w = 9 * s, x = right ? b.x + b.w + 10 * s : b.x - 10 * s - w;
        var y0 = b.y - 8 * s, y1 = b.y + b.h + 8 * s, H = y1 - y0;
        B.fn(function (c, u) {
          var yy = H * u;
          c.save(); c.beginPath(); c.rect(x, y0, w, yy); c.clip();
          c.fillStyle = st.gold; c.fillRect(x, y0, w, H);
          for (var k = -1, j = 0; k * w < H + w; k++, j++) {
            c.fillStyle = j % 2 ? B.K.accent : st.third; c.beginPath();
            c.moveTo(x, y0 + k * w * 1.4); c.lineTo(x + w, y0 + k * w * 1.4 - w * 0.9); c.lineTo(x + w, y0 + k * w * 1.4 - w * 0.3); c.lineTo(x, y0 + k * w * 1.4 + w * 0.6); c.closePath(); c.fill();
          }
          c.strokeStyle = B.K.ink; c.lineWidth = 0.9 * s; c.strokeRect(x, y0, w, H);
          c.restore();
          if (u >= 1) { pizan_leaf(c, x + w / 2, y0, 9 * s, -PI / 2, st.third); pizan_leaf(c, x + w / 2, y1, 9 * s, PI / 2, B.K.accent); }
        }, { len: H * 1.5 });
        var tipP = [right ? x + w + 6 * s : x - 6 * s, (y0 + y1) / 2];
        B.edge = function () { return tipP; };
        B.forceSide = right ? 'right' : 'left';
      }
    },
    noteDeco: function (B, A) {
      if (!A.R) return;
      var s = B.s, it = null, i;
      for (i = B.items.length - 1; i >= 0; i--) if (B.items[i].k === 't') { it = B.items[i]; break; }
      if (!it) return;
      // set the opening capital of each line apart, touched with a stroke of red
      var caps = [], x = it.x, cw = 0;
      it.lines = it.lines.map(function (l) { caps.push(l.charAt(0).toUpperCase()); return l.slice(1); });
      B.c.save(); B.c.font = fontStr(it.F, it.px); caps.forEach(function (ch) { cw = Math.max(cw, B.c.measureText(ch).width); }); B.c.restore();
      cw += it.px * 0.18;
      it.x += cw;
      var n = caps.length;
      B.fn(function (c, u) {
        c.font = fontStr(it.F, it.px); c.textBaseline = 'alphabetic'; c.textAlign = 'left';
        for (var j = 0; j < n; j++) {
          var f = clamp(u * n - j, 0, 1); if (f <= 0) break;
          var y = it.y + it.lh * (j + 0.78);
          c.save(); c.globalAlpha *= f; c.fillStyle = B.K.ink; c.fillText(caps[j], x, y);
          c.strokeStyle = B.K.accent; c.lineWidth = 1.3 * s; c.beginPath(); c.moveTo(x + cw * 0.28, y - it.px * 0.55); c.lineTo(x + cw * 0.36, y + it.px * 0.05); c.stroke();
          c.restore();
        }
      }, { ph: 'note', at: [0, 1] });
      var P = besideNote(B, A, 14 * s);
      if (A.side !== 'left') P[0] += cw;
      pizan_sprig(B, P[0], P[1], 22 * s);
    }
  });
  // where the note's last line ends (x, baseline y)
  function carver_end(B, A) {
    var c = B.c, n = A.lines.length, last = A.lines[n - 1] || '';
    c.save(); c.font = fontStr(B.F, A.px); var lw = c.measureText(last).width; c.restore();
    return [A.R.x + A.iw + lw, A.R.y + A.lh * (n - 1) + A.lh * 0.78, last];
  }
  def('carver', {
    name: 'Carver', who: 'George Washington Carver', field: 'science', year: 1932,
    bio: 'George Washington Carver (about 1864-1943) was an American agricultural scientist, born into slavery in Missouri. He earned degrees at Iowa State and taught at Tuskegee Institute from 1896 until his death. He pushed crop rotation, peanuts and sweet potatoes for worn-out Southern soils. He also collected plant fungi and sent specimens to the USDA.',
    about: 'His 1932 letters to a USDA plant pathologist: a big loose cursive in sepia ink, long hooked descenders and a firm period at the end of every line.',
    source: { text: 'Letter to Paul R. Miller, Dec. 7, 1932, on Tuskegee Research and Experiment Station letterhead', where: 'USDA National Agricultural Library, Special Collections, G.W. Carver letters to P.R. Miller (item 12358)', url: 'https://www.nal.usda.gov/exhibits/speccoll/items/show/12358' },
    pen: 'ink', w: 2.1, ink: '#7a5a30', accent: '#7a5a30', paper: '#fbf9f3', font: { f: "'Homemade Apple', cursive" }, size: 21, leading: 1.55,
    hand: { wob: 0.85, over: 0.5, bend: 0.2 }, hl: 'rgba(160,120,60,0.22)', headSize: 12,
    noteDeco: function (B, A) {
      if (!A.R || !A.lines.length) return;
      // he closes every line, date and signature with a firm period
      var s = B.s, e = carver_end(B, A);
      if (/[.!?:,;]$/.test(e[2])) return;
      var x = e[0] + 4 * s, y = e[1] - 1.5 * s;
      B.fn(function (c, u) { c.fillStyle = B.K.ink; dot(c, x, y, 2.1 * s * outBack(u)); }, { ph: 'note', at: [0.95, 1] });
    }
  });
  def('raman', {
    name: 'Raman', who: 'C. V. Raman', field: 'science', year: 1959,
    bio: 'C. V. Raman (1888-1970) was an Indian physicist. In 1928 he found that light scattered by a substance comes out partly shifted in color, now called the Raman effect. He won the 1930 Nobel Prize in Physics, the first Asian to win a Nobel in science. He founded the Raman Research Institute in Bangalore in 1948 and lectured there into old age.',
    about: 'His blackboard lectures on diffraction: neat chalk cursive, capital headings with a long rule under them, ring patterns, and straight ruled rays.',
    source: { text: 'Photograph of Raman lecturing on diffraction at the blackboard (date unknown); signature dated 9 April 1962', where: 'Board photo: widely reposted, original archive not traced. Signature: Lion Heart Autographs (via Invaluable)', url: 'https://www.invaluable.com/auction-lot/bold-signature-of-indias-great-nobel-prize-winnin-146-c-83e4cfba47' },
    pen: 'chalk', w: 2.8, ink: '#ecebe4', accent: '#ecebe4', ground: 'dark', paper: '#2a3942', font: { f: "'Cedarville Cursive', cursive" }, size: 26, leading: 1.4,
    hand: { wob: 0.35, over: 0.25, bend: 0.03 }, hl: 'rgba(236,235,228,0.2)', headSize: 12,
    marks: {
      // a ring with a fainter ring inside, like the diffraction rings on his board
      circle: function (B) {
        var E = B.ellipse(), s = B.s;
        B.stroke(B.loop(E));
        B.stroke(B.hand(ellipseP(E.cx, E.cy, E.rx - 5 * s, E.ry - 4 * s, -PI / 2, -TAU, 0), 0.3), { w: 1.6, with: true });
        B.E = E; B.edge = function (T) { return ellEdge(E, 5 * s, T); };
      },
      // a long level rule that runs well past the words
      underline: function (B) {
        var b = B.b, s = B.s, y = b.y + b.h + 5 * s;
        B.stroke(B.hand(lineP([b.x - 8 * s, y], [b.x + b.w + 22 * s, y - 1 * s]), 0.2));
        B.edge = function (T) { return rectEdge(b, 6 * s, T); };
      }
    },
    // straight ruled rays, no bow
    shaft: function (B, tail, tip) { return B.hand(resample(lineP(tail, tip), 4 * B.s), 0.15); },
    noteDeco: function (B, A) {
      if (!A.R || !A.lines.length) return;
      // the rule under each heading and statement
      var s = B.s, R = A.R, y = R.y + A.lh * 0.95;
      B.stroke(B.hand(lineP([R.x - 4 * s, y], [R.x + R.w + 14 * s, y]), 0.2), { w: 1.8, ph: 'note', at: [0.6, 1] });
    }
  });
  def('seacole', {
    name: 'Seacole', who: 'Mary Seacole', field: 'science', year: 1869,
    bio: 'Mary Seacole (1805-1881) was a Jamaican-born British nurse and healer who learned Creole medicine from her mother. In the Crimean War she ran the British Hotel near Balaclava and treated soldiers, sometimes on the battlefield. Her memoir, Wonderful Adventures of Mrs. Seacole in Many Lands, came out in 1857.',
    about: 'Her 1869 letter about her portrait: a big sloped hand in brown ink, word ends drawn out into long tails, and a double swash under the date.',
    source: { text: 'Autograph letter signed to Miss Challen, 40 Upper Berkeley St, March 31, 1869, three pages', where: 'Kotte Autographs (dealer listing)', url: 'https://www.kotte-autographs.com/en/autograph/seacole-mary/' },
    pen: 'nib', w: 2.3, ink: '#5a3a1e', accent: '#5a3a1e', paper: '#fbf9f4', font: { f: "'Meddon', cursive" }, size: 20, leading: 1.6,
    hand: { wob: 0.55, over: 0.8, bend: 0.2 }, hl: 'rgba(150,105,60,0.2)',
    marks: {
      // the date underline: a long stroke with a shorter swash beneath it
      underline: function (B) {
        var b = B.b, s = B.s, r = B.r, y = b.y + b.h + 5 * s, x0 = b.x - 4 * s, x1 = b.x + b.w + 10 * s;
        B.stroke(B.hand(quadP([x0, y + 1 * s], [(x0 + x1) / 2, y - 2 * s], [x1, y - 3 * s - r() * 2 * s], 16), 0.3));
        B.stroke(B.hand(quadP([x0 + b.w * 0.15, y + 9 * s], [(x0 + x1) / 2, y + 4 * s], [x1 - b.w * 0.05, y + 2 * s], 14), 0.3), { w: 1.7 });
        B.edge = function (T) { return rectEdge(b, 8 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R || !A.lines.length) return;
      // her last letters run out into a long level tail
      var c = B.c, s = B.s, n = A.lines.length, last = A.lines[n - 1];
      c.save(); c.font = fontStr(B.F, A.px); var lw = c.measureText(last).width; c.restore();
      var x = A.R.x + A.iw + lw - 1 * s, y = A.R.y + A.lh * (n - 1) + A.lh * 0.74;
      B.stroke(B.hand(quadP([x, y], [x + 12 * s, y + 1 * s], [x + 30 * s, y - 1 * s], 10), 0.2), { w: 1.5, ph: 'note', at: [0.92, 1] });
    }
  });
  // her long wavy dash, used where others put a period
  function okeeffe_wave(a, b, s, amp) {
    var p = resample(lineP(a, b), 2 * s), cl = cum(p), L = cl[cl.length - 1] || 1, N = normals(p), per = Math.max(16 * s, L / Math.max(2, Math.round(L / (26 * s))));
    return p.map(function (q, i) { var u = cl[i] / L, k = Math.min(1, u / 0.12, (1 - u) / 0.12), o = Math.sin(cl[i] / per * TAU) * amp * k; return [q[0] + N[i][0] * o, q[1] + N[i][1] * o]; });
  }
  def('okeeffe', {
    name: "O'Keeffe", who: "Georgia O'Keeffe", field: 'art', year: 1935,
    bio: "Georgia O'Keeffe (1887-1986) was an American painter. She is known for huge close-up flowers, New York skyscrapers and the bones and hills of New Mexico. She married the photographer Alfred Stieglitz in 1924 and moved to New Mexico for good in 1949. In 1955 a young Yayoi Kusama wrote to her for advice.",
    about: 'Her letters of the 1930s: a big round upright hand with a broad pen, words huddled with wide gaps, and a long wavy dash where a period would go.',
    source: { text: 'Letters to Henwar Rodakiewicz, about 1935, in black and in green ink', where: "Library of Congress, Georgia O'Keeffe and Alfred Stieglitz Correspondence and Related Material (mss86262)", url: 'https://www.loc.gov/item/mss86262004/' },
    pen: 'ink', w: 2.6, ink: '#1c1c22', accent: '#1f8a7a', paper: '#f4f3ee', font: { f: "'Damion', cursive" }, size: 25, leading: 1.45,
    hand: { wob: 0.6, over: 0.35, bend: 0.12 }, hl: 'rgba(31,138,122,0.22)', headSize: 13,
    marks: {
      connect: function (B) {
        var a = B.b, b = B.to, s = B.s;
        if (!b) return;
        var t0 = rectEdge(a, 7 * s, [b.x + b.w / 2, b.y + b.h / 2]), t1 = rectEdge(b, 7 * s, [a.x + a.w / 2, a.y + a.h / 2]);
        B.stroke(B.hand(okeeffe_wave(t0, t1, s, 3.2 * s), 0.2));
        B.edge = function (T) { return rectEdge(a, 7 * s, T); };
      }
    },
    noteDeco: function (B, A) {
      if (!A.R || !A.lines.length) return;
      // a wavy dash after the last word, the way she ends a thought
      var c = B.c, s = B.s, n = A.lines.length, last = A.lines[n - 1];
      c.save(); c.font = fontStr(B.F, A.px); var lw = c.measureText(last).width; c.restore();
      var x = A.R.x + A.iw + lw + 8 * s, y = A.R.y + A.lh * (n - 1) + A.lh * 0.5;
      if (x + 34 * s > B.W) { x = A.R.x + 10 * s; y = A.R.y + A.lh * n + 6 * s; }
      B.stroke(okeeffe_wave([x, y], [x + 30 * s, y], s, 2.6 * s), { w: 2.2, ph: 'note', at: [0.9, 1] });
    }
  });
  def('klee', {
    name: 'Klee', who: 'Paul Klee', field: 'art', year: 1922,
    bio: 'Paul Klee (1879-1940) was a Swiss-born German painter. He taught at the Bauhaus from 1921 to 1931, where he wrote and drew his lessons on form and color into notebooks. About 3,900 pages of those notebooks survive at the Zentrum Paul Klee. He lost his teaching post under the Nazis in 1933 and moved to Bern.',
    about: 'His Bauhaus teaching notebooks: an upright pen hand, fans of fine arrows, angle brackets around a table, a red pencil double underline, vertical hatching and a block struck out with cross-hatching.',
    source: { text: 'Notebook page 146, lecture of May 15, 1922, Beiträge zur bildnerischen Formlehre (ZPK BF/149)', where: 'Zentrum Paul Klee, Bern (public domain)', url: 'https://commons.wikimedia.org/wiki/File:Paul_Klee_Notebook_BF_149.jpg' },
    pen: 'ink', w: 1.5, ink: '#2b2b2e', accent: '#c8372d', paper: '#f6f2e4', font: { f: "'Shadows Into Light Two', cursive" }, size: 24, leading: 1.3,
    hand: { wob: 0.5, over: 0.4, bend: 0.06 }, hl: 'rgba(43,43,46,0.2)', headSize: 10, headW: 0.7,
    marks: {
      // red pencil, twice, like "Rang bezeichnen"
      underline: function (B) {
        var b = B.b, s = B.s, y = b.y + b.h + 4 * s, o = { pen: 'pencil', col: B.K.accent, w: 2.4 };
        B.stroke(B.hand(lineP([b.x - 3 * s, y], [b.x + b.w + 6 * s, y - 1.5 * s]), 0.4), o);
        B.stroke(B.hand(lineP([b.x, y + 4.5 * s], [b.x + b.w + 3 * s, y + 3 * s]), 0.4), o);
        B.edge = function (T) { return rectEdge(b, 7 * s, T); };
      },
      // a tall angle bracket, as around his table of verb forms
      bracket: function (B) {
        var b = B.b, s = B.s, right = B.side(0, 0) !== 'left', sx = right ? 1 : -1, x = right ? b.x + b.w + 10 * s : b.x - 10 * s;
        var y0 = b.y - 8 * s, y1 = b.y + b.h + 8 * s, ym = (y0 + y1) / 2, d = Math.min(24 * s, 8 * s + (y1 - y0) * 0.22);
        B.stroke(B.hand([[x, y0], [x + sx * d, ym], [x, y1]], 0.25));
        var tip = [x + sx * (d + 4 * s), ym];
        B.edge = function () { return tip; }; B.forceSide = right ? 'right' : 'left';
      },
      // the struck-out block: dense cross-hatching over the words
      cross: function (B) { hatch(B, [1, -1], 4.2, { col: alpha(B.K.ink, 0.85), w: 1.1 }); },
      // shading by vertical strokes, as in his F field
      highlight: function (B) { hatch(B, [0], 3.6, { col: alpha(B.K.ink, 0.55), w: 1.2 }); }
    },
    noteDeco: function (B, A) {
      // a fan of fine arrows, like his "Flächen passiv" bundle
      if (B.m.mark !== 'arrow' || !A.shaft || !A.tail) return;
      var s = B.s, t = A.tail, p = A.tip, dx = p[0] - t[0], dy = p[1] - t[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      [-1, 1].forEach(function (k) {
        // the bundle fans out from one start, each head landing a little apart
        var off = k * 11 * s, a = [t[0] + dx * 0.05, t[1] + dy * 0.05], b = [p[0] + nx * off - dx * 0.06, p[1] + ny * off - dy * 0.06];
        var ang = Math.atan2(b[1] - a[1], b[0] - a[0]), z = 8 * s;
        B.stroke(B.hand(lineP(a, b), 0.3), { w: 1.1 });
        B.stroke([[b[0] - Math.cos(ang - 0.45) * z, b[1] - Math.sin(ang - 0.45) * z], [b[0], b[1]], [b[0] - Math.cos(ang + 0.45) * z, b[1] - Math.sin(ang + 0.45) * z]], { w: 1 });
      });
    }
  });

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

  // Google Fonts for some or all styles: one <link> per family (axes tried widest first), then wait for the faces.
  var GENERIC = /^(serif|sans-serif|cursive|monospace|fantasy|system-ui|georgia|arial|helvetica|times|times new roman|courier|courier new)$/i, asked = {};
  function families(ids) {
    var out = [];
    Object.keys(STYLES).forEach(function (k) {
      if (ids && ids.indexOf(k) < 0) return;
      var o = STYLES[k];
      [o.font.f].concat(o.fonts || []).forEach(function (f) {
        f.split(',').forEach(function (n) { n = n.trim().replace(/^['"]|['"]$/g, ''); if (n && !GENERIC.test(n) && out.indexOf(n) < 0) out.push(n); });
      });
    });
    return out;
  }
  function loadFonts(ids) {
    if (!hasDOM) return Promise.resolve([]);
    if (typeof ids === 'string') ids = [ids];
    var fams = families(ids);
    function link(n, axes) {
      return new Promise(function (res) {
        var l = document.createElement('link'); l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=' + n.replace(/ /g, '+') + axes + '&display=swap';
        l.onload = function () { res(true); }; l.onerror = function () { l.remove(); res(false); };
        document.head.appendChild(l);
      });
    }
    return Promise.all(fams.map(function (n) {
      if (!asked[n]) asked[n] = link(n, ':ital,wght@0,400;0,500;0,700;1,400').then(function (ok) { return ok || link(n, ':wght@400;700'); }).then(function (ok) { return ok || link(n, ''); });
      return asked[n].then(function () {
        return Promise.all(['400', '700', 'italic 400'].map(function (w) { return document.fonts.load(w + " 30px '" + n + "'").catch(function () {}); }));
      });
    })).then(function () { return fams; });
  }

  var FIELDS = { science: 'Science', art: 'Art', history: 'History' };
  return {
    version: VERSION,
    play: play, stop: stop, replay: replay, draw: draw, length: length, auto: auto, fire: fire, loadFonts: loadFonts,
    speeds: SPEEDS,
    styles: Object.keys(STYLES).map(function (k) { var o = STYLES[k]; return { id: k, name: o.name, who: o.who, field: o.field, year: o.year, about: o.about, bio: o.bio || '', source: o.source || null, fonts: o.fonts || [], ground: o.ground || 'light', paper: o.paper || null, font: o.font.f }; }),
    marks: Object.keys(MARKS), fields: FIELDS, pens: Object.keys(PENS),
    _internal: { STYLES: STYLES, MARKS: MARKS, PENS: PENS, build: build, resolveList: resolveList }
  };
}));
