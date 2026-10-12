/* PRISM — light-routing puzzle logic. Pure JS: runs in node and the browser.
   Board: 10x10, one piece per square. Light is traced as continuous 2D rays.
   Angles in radians: 0 = east (+x), positive = clockwise (board y points down).
   Color is a bitmask: R=1 G=2 B=4, WHITE=7. Yellow=R|G, Cyan=G|B, Magenta=R|B. */
(function () {
'use strict';

var W = 10, H = 10;
var TAU = Math.PI * 2;
/* Colors: five independent spectral bands (one bit each). White = all bands.
   Between-colors are just adjacent bands joined: orange=R|Y, lime=Y|G,
   teal=G|C, azure=C|B, magenta=R|B. 31 possible colors max — always finite. */
var R = 1, Y = 2, G = 4, C = 8, B = 16;
var WHITE = R | Y | G | C | B;
var O = R | Y, L = Y | G, T = G | C, A = C | B, M = R | B;

function wrapAngle(a) {
  a = a % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}
function angDiff(a, b) { return Math.abs(wrapAngle(a - b)); }
function reflectAngle(a, mirrorLine) { return wrapAngle(2 * mirrorLine - a); }
function key(x, y) { return y * W + x; }
function emptyCells() { return new Array(W * H).fill(null); }

function mkPiece(t, opts) {
  var p = { t: t };
  if (opts) for (var k in opts) p[k] = opts[k];
  return p;
}

/* Piece catalog. rot=true means the piece aims with a free angle (drag to rotate).
   mk() builds a fresh piece with default angle. */
var PIECES = {
  emitW:  { label: 'Emitter · White', emoji: '🔆', rot: true,  mk: function () { return mkPiece('emit', { a: 0, col: WHITE }); } },
  emitR:  { label: 'Emitter · Red',   emoji: '🔴', rot: true,  mk: function () { return mkPiece('emit', { a: 0, col: R }); } },
  emitG:  { label: 'Emitter · Green', emoji: '🟢', rot: true,  mk: function () { return mkPiece('emit', { a: 0, col: G }); } },
  emitB:  { label: 'Emitter · Blue',  emoji: '🔵', rot: true,  mk: function () { return mkPiece('emit', { a: 0, col: B }); } },
  mirror: { label: 'Mirror',          emoji: '🪞', rot: true,  mk: function () { return mkPiece('mirror', { a: Math.PI / 4 }); },
            desc: 'Reflects light across its line.' },
  split:  { label: 'Splitter prism',  emoji: '🔺', rot: true, mk: function () { return mkPiece('split', { a: 0 }); },
            desc: 'Fans light around its aim: red −60°, yellow −30°, green straight, cyan +30°, blue +60°. White paints the whole fan; a primary color is duplicated into a pair at ±30°.' },
  comb:   { label: 'Combiner prism',  emoji: '🔻', rot: true,  mk: function () { return mkPiece('comb', { a: 0 }); },
            desc: 'Merges beams arriving off its arrow into one mixed-color beam exiting along the arrow. Beams near the arrow pass through.' },
  recvW:  { label: 'Receptor · White',  emoji: '⚪', dot: '#ffffff', rot: false, mk: function () { return mkPiece('recv', { col: WHITE }); } },
  recvR:  { label: 'Receptor · Red',    emoji: '🔴', dot: '#ff2020', rot: false, mk: function () { return mkPiece('recv', { col: R }); } },
  recvO:  { label: 'Receptor · Orange', emoji: '🟠', dot: '#ff901e', rot: false, mk: function () { return mkPiece('recv', { col: O }); } },
  recvY:  { label: 'Receptor · Yellow', emoji: '🟡', dot: '#ffe920', rot: false, mk: function () { return mkPiece('recv', { col: Y }); } },
  recvL:  { label: 'Receptor · Lime',   emoji: '🟢', dot: '#a6ff1a', rot: false, mk: function () { return mkPiece('recv', { col: L }); } },
  recvG:  { label: 'Receptor · Green',  emoji: '🟢', dot: '#20ff20', rot: false, mk: function () { return mkPiece('recv', { col: G }); } },
  recvT:  { label: 'Receptor · Teal',   emoji: '🩵', dot: '#1affaa', rot: false, mk: function () { return mkPiece('recv', { col: T }); } },
  recvC:  { label: 'Receptor · Cyan',   emoji: '🩵', dot: '#20ffe9', rot: false, mk: function () { return mkPiece('recv', { col: C }); } },
  recvA:  { label: 'Receptor · Azure',  emoji: '🔵', dot: '#1aa8ff', rot: false, mk: function () { return mkPiece('recv', { col: A }); } },
  recvB:  { label: 'Receptor · Blue',   emoji: '🔵', dot: '#2a7fff', rot: false, mk: function () { return mkPiece('recv', { col: B }); } },
  wall:   { label: 'Wall', emoji: '🧱', rot: false, mk: function () { return mkPiece('wall', {}); },
            desc: 'Blocks light.' }
};
var PALETTE = ['emitW', 'emitR', 'emitG', 'emitB', 'mirror', 'split', 'comb',
               'recvW', 'recvR', 'recvO', 'recvY', 'recvL', 'recvG',
               'recvT', 'recvC', 'recvA', 'recvB', 'wall'];

/* Ray vs axis-aligned box. Returns entry distance t (>0) or null. */
function rayAABB(sx, sy, dx, dy, x0, y0, x1, y1) {
  var tmin = 0, tmax = Infinity, t1, t2, tt;
  if (Math.abs(dx) < 1e-12) { if (sx < x0 || sx > x1) return null; }
  else {
    t1 = (x0 - sx) / dx; t2 = (x1 - sx) / dx;
    if (t1 > t2) { tt = t1; t1 = t2; t2 = tt; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
  }
  if (Math.abs(dy) < 1e-12) { if (sy < y0 || sy > y1) return null; }
  else {
    t1 = (y0 - sy) / dy; t2 = (y1 - sy) / dy;
    if (t1 > t2) { tt = t1; t1 = t2; t2 = tt; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
  }
  if (tmax < tmin || tmax <= 1e-9) return null;
  return tmin > 1e-9 ? tmin : 0;
}

/* Nearest occupied cell hit by the ray, skipping ignore {ix,iy}. */
function rayHit(sx, sy, dx, dy, cells, ignore) {
  var best = null;
  for (var iy = 0; iy < H; iy++) for (var ix = 0; ix < W; ix++) {
    if (ignore && ix === ignore.ix && iy === ignore.iy) continue;
    var p = cells[key(ix, iy)];
    if (!p) continue;
    var t = rayAABB(sx, sy, dx, dy, ix, iy, ix + 1, iy + 1);
    if (t === null) continue;
    if (!best || t < best.t) best = { t: t, ix: ix, iy: iy, p: p };
  }
  return best;
}

/* Distance to the board edge along the ray (origin is inside). */
function rayExit(sx, sy, dx, dy) {
  var t = Infinity, tc;
  if (dx > 1e-12) { tc = (W - sx) / dx; if (tc > 0 && tc < t) t = tc; }
  else if (dx < -1e-12) { tc = (0 - sx) / dx; if (tc > 0 && tc < t) t = tc; }
  if (dy > 1e-12) { tc = (H - sy) / dy; if (tc > 0 && tc < t) t = tc; }
  else if (dy < -1e-12) { tc = (0 - sy) / dy; if (tc > 0 && tc < t) t = tc; }
  return t === Infinity ? 0 : t;
}

/* Splitter fan: [angle offset, color]. */
var FAN = [
  [-Math.PI / 3, R], [-Math.PI / 6, Y], [0, G], [Math.PI / 6, C], [Math.PI / 3, B]
];
function fanSlot(band) {
  for (var i = 0; i < FAN.length; i++) if (FAN[i][1] === band) return FAN[i][0];
  return 0;
}
/* The splitter inverts the combiner: every color the combiner can produce
   splits back into its recipe bands. */
var SPLIT_RECIPES = {};
SPLIT_RECIPES[Y] = [R, G];
SPLIT_RECIPES[O] = [R, Y];
SPLIT_RECIPES[L] = [Y, G];
SPLIT_RECIPES[T] = [G, C];
SPLIT_RECIPES[A] = [C, B];
var PASS_CONE = Math.PI / 7; // ~25.7°: combiner pass-through tolerance

/* Spectral token positions: R=0 O=1 Y=2 L=3 G=4 T=5 C=6 A=7 B=8. */
var POS_COLOR = [R, O, Y, L, G, T, C, A, B];
var RGB_WHITE = R | G | B; // the classic trio also makes white
/* Normalize a set of charged bands to one color token: the token at the
   midpoint of the band span. Bands sit at even positions, so the midpoint
   is always an integer. White comes ONLY from all five bands or from the
   red+green+blue trio; any other wide mix yields nothing (0 = no output).
   This makes red+green=yellow (span r..g -> y) while red+yellow=orange
   (span r..y -> o) — one yellow, no duplicates. */
function normalizeBands(bands) {
  if (bands === WHITE || bands === RGB_WHITE) return WHITE;
  var lo = 8, hi = 0;
  for (var i = 0; i < 5; i++) {
    if (bands & (1 << i)) {
      var pos = i * 2;
      if (pos < lo) lo = pos;
      if (pos > hi) hi = pos;
    }
  }
  if (hi - lo > 4) return 0;
  return POS_COLOR[(lo + hi) / 2];
}

/* Beam simulation.
   Returns { segments:[{x1,y1,x2,y2,c}] (grid coords, floats),
             arrivals:{cellKey:colorOR}, charges:{cellKey:colorOR} } */
function simulate(cells) {
  var segments = [], arrivals = {}, charges = {};
  var visited = {}, visitCount = 0;
  var rays = [];
  function pushRay(sx, sy, a, c) {
    if (!c) return;
    var k = Math.round(sx * 4) + ',' + Math.round(sy * 4) + ',' +
            Math.round(wrapAngle(a) * 114.59) + ',' + c; // ~0.5° quantization
    if (visited[k]) return;
    visited[k] = 1; visitCount++;
    rays.push({ sx: sx, sy: sy, a: a, c: c });
  }
  var i;
  for (i = 0; i < W * H; i++) {
    var ep = cells[i];
    if (ep && ep.t === 'emit') pushRay((i % W) + 0.5, Math.floor(i / W) + 0.5, ep.a, ep.col);
  }

  /* Start a new leg just past a boundary hit point. The origin is nudged a hair
     toward the interacted cell's interior so axis-aligned legs never graze the
     grid line they started on (which would falsely clip neighboring cells). */
  function stepFrom(ex, ey, na, cell) {
    var ndx = Math.cos(na), ndy = Math.sin(na);
    var px = -ndy, py = ndx; // perpendicular
    var dot = ((cell.ix + 0.5) - ex) * px + ((cell.iy + 0.5) - ey) * py;
    var s = dot >= 0 ? 1e-7 : -1e-7;
    return { x: ex + ndx * 1e-4 + px * s, y: ey + ndy * 1e-4 + py * s, a: na };
  }

  function trace(sx, sy, a, c) {
    var guard = 0;
    var ignore = { ix: Math.floor(sx), iy: Math.floor(sy) };
    while (guard++ < 80) {
      var dx = Math.cos(a), dy = Math.sin(a);
      var hit = rayHit(sx, sy, dx, dy, cells, ignore);
      var ex, ey;
      if (!hit) {
        var te = rayExit(sx, sy, dx, dy);
        ex = sx + dx * te; ey = sy + dy * te;
        segments.push({ x1: sx, y1: sy, x2: ex, y2: ey, c: c });
        return;
      }
      ex = sx + dx * hit.t; ey = sy + dy * hit.t;
      var p = hit.p, na = null, oi;
      if (p.t === 'mirror' || p.t === 'split' || p.t === 'comb') {
        // rotating pieces pivot about the cell center, so the light
        // interacts there — not at the cell edge where the ray enters
        ex = hit.ix + 0.5; ey = hit.iy + 0.5;
      }
      segments.push({ x1: sx, y1: sy, x2: ex, y2: ey, c: c });
      if (p.t === 'wall' || p.t === 'emit') return; // opaque
      if (p.t === 'recv') {
        var kk = key(hit.ix, hit.iy);
        arrivals[kk] = (arrivals[kk] || 0) | c;
        return;
      }
      if (p.t === 'mirror') na = reflectAngle(a, p.a);
      else if (p.t === 'split') {
        // fan around the prism's own aim. Anything the combiner can make
        // (Y/O/L/T/A) splits back into its recipe bands at their fan slots.
        // Other multi-band light fans one beam per band; a single atomic
        // band (R/G/C/B) is duplicated into a pair at ±30° around the aim.
        var sa = p.a || 0;
        var recipe = SPLIT_RECIPES[c];
        if (recipe) {
          for (oi = 0; oi < recipe.length; oi++) {
            var rbo = sa + fanSlot(recipe[oi]);
            var rst = stepFrom(ex, ey, rbo, hit);
            pushRay(rst.x, rst.y, rst.a, recipe[oi]);
          }
          return;
        }
        var nbands = 0;
        for (oi = 0; oi < FAN.length; oi++) if (c & FAN[oi][1]) nbands++;
        if (nbands <= 1) {
          var stp1 = stepFrom(ex, ey, sa - Math.PI / 6, hit);
          var stp2 = stepFrom(ex, ey, sa + Math.PI / 6, hit);
          pushRay(stp1.x, stp1.y, stp1.a, c);
          pushRay(stp2.x, stp2.y, stp2.a, c);
          return;
        }
        for (oi = 0; oi < FAN.length; oi++) {
          if (c & FAN[oi][1]) {
            var oa2 = sa + FAN[oi][0];
            var st2 = stepFrom(ex, ey, oa2, hit);
            pushRay(st2.x, st2.y, st2.a, FAN[oi][1]);
          }
        }
        return;
      }
      else if (p.t === 'comb') {
        if (angDiff(a, p.a) < PASS_CONE) na = a;
        else {
          var kc = key(hit.ix, hit.iy);
          charges[kc] = (charges[kc] || 0) | c;
          return;
        }
      }
      var st2 = stepFrom(ex, ey, na, hit);
      sx = st2.x; sy = st2.y; a = st2.a;
      ignore = { ix: hit.ix, iy: hit.iy };
    }
  }

  var prevSig = null;
  for (var iter = 0; iter < 300; iter++) {
    if (!rays.length && iter > 0) break;
    var cur = rays; rays = [];
    for (var ri = 0; ri < cur.length; ri++) trace(cur[ri].sx, cur[ri].sy, cur[ri].a, cur[ri].c);
    for (var ck in charges) {
      var cx = (+ck) % W, cy = Math.floor((+ck) / W);
      var cp = cells[+ck];
      if (!cp || cp.t !== 'comb') continue;
      // normalize the charged bands to one color token (charges accumulate;
      // emission re-runs until fixed point)
      pushRay(cx + 0.5, cy + 0.5, cp.a, normalizeBands(charges[ck]));
    }
    var sig = Object.keys(charges).sort().map(function (k) { return k + ':' + charges[k]; }).join(';');
    if (rays.length === 0 && sig === prevSig) break;
    prevSig = sig;
    if (visitCount > 20000) break;
  }
  return { segments: segments, arrivals: arrivals, charges: charges };
}

function checkWin(cells, sim) {
  var total = 0, ok = 0;
  for (var i = 0; i < W * H; i++) {
    var p = cells[i];
    if (p && p.t === 'recv') { total++; if ((sim.arrivals[i] || 0) === p.col) ok++; }
  }
  return { total: total, ok: ok, done: total > 0 && ok === total };
}

/* Display colors: explicit hex for the 11 named colors; unnamed band mixes
   fall back to the average of their bands. */
var BAND_RGB = { 1: [255, 32, 32], 2: [255, 233, 32], 4: [32, 255, 32], 8: [32, 255, 233], 16: [42, 127, 255] };
var NAMED_HEX = {
  1: '#ff2020', 2: '#ffe920', 4: '#20ff20', 8: '#20ffe9', 16: '#2a7fff',
  3: '#ff901e', 6: '#a6ff1a', 12: '#1affaa', 24: '#1aa8ff', 17: '#ff20e9',
  31: '#ffffff'
};
function beamColor(c) {
  if (NAMED_HEX[c]) return NAMED_HEX[c];
  var r = 0, g = 0, b = 0, n = 0, bit;
  for (bit in BAND_RGB) {
    if (c & bit) { r += BAND_RGB[bit][0]; g += BAND_RGB[bit][1]; b += BAND_RGB[bit][2]; n++; }
  }
  if (!n) return '#aaaaaa';
  function hx(v) { v = Math.round(v).toString(16); return v.length < 2 ? '0' + v : v; }
  return '#' + hx(r / n) + hx(g / n) + hx(b / n);
}

/* ---------- levels (JSON-driven: build/levels/*.json, inlined by build.py) ---------- */
var COLOR_NAMES = {};
COLOR_NAMES[R] = 'R'; COLOR_NAMES[O] = 'O'; COLOR_NAMES[Y] = 'Y';
COLOR_NAMES[L] = 'L'; COLOR_NAMES[G] = 'G'; COLOR_NAMES[T] = 'T';
COLOR_NAMES[C] = 'C'; COLOR_NAMES[A] = 'A'; COLOR_NAMES[B] = 'B';
COLOR_NAMES[WHITE] = 'W';
function colorName(c) { return COLOR_NAMES[c] || null; }
function colorByName(n) {
  for (var k in COLOR_NAMES) if (COLOR_NAMES[k] === n) return +k;
  return null;
}
/* Normalize one raw level object (from JSON): color names -> bitmasks,
   defaults for missing fields. Accepts numeric colors too. */
function normalizeLevel(lv) {
  var out = { id: lv.id, name: lv.name, hint: lv.hint || '', fixed: [], inv: lv.inv || {} };
  if (lv.sandbox) out.sandbox = true;
  var fx = lv.fixed || [];
  for (var i = 0; i < fx.length; i++) {
    var f = fx[i], p = { x: f.x, y: f.y, t: f.t };
    if (f.a !== undefined) p.a = f.a;
    if (f.col !== undefined) p.col = (typeof f.col === 'string') ? colorByName(f.col) : f.col;
    if (f.fixed !== undefined) p.fixed = !!f.fixed;
    out.fixed.push(p);
  }
  return out;
}
var LEVELS = (typeof PRISM_LEVELS_JSON !== 'undefined' ? PRISM_LEVELS_JSON : []).map(normalizeLevel);

var PRISM = {
  W: W, H: H, TAU: TAU, R: R, Y: Y, G: G, C: C, B: B, WHITE: WHITE,
  O: O, L: L, T: T, A: A, M: M,
  wrapAngle: wrapAngle, angDiff: angDiff, reflectAngle: reflectAngle,
  key: key, emptyCells: emptyCells, mkPiece: mkPiece,
  colorName: colorName, colorByName: colorByName, normalizeLevel: normalizeLevel,
  PIECES: PIECES, PALETTE: PALETTE, FAN: FAN,
  simulate: simulate, checkWin: checkWin, beamColor: beamColor,
  normalizeBands: normalizeBands,
  LEVELS: LEVELS
};

if (typeof module !== 'undefined' && module.exports) module.exports = PRISM;
else window.PRISM = PRISM;
})();
