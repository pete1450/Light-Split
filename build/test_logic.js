/* PRISM — headless logic tests (continuous-angle physics). Run: node test_logic.js */
const fs = require('fs'), path = require('path');
const ldir = path.join(__dirname, 'levels');
global.PRISM_LEVELS_JSON = fs.readdirSync(ldir).filter(f => f.endsWith('.json')).sort()
  .map(f => JSON.parse(fs.readFileSync(path.join(ldir, f), 'utf8')));
const P = require('./logic.js');
let PASS = 0, FAIL = 0;
function ok(cond, name) {
  if (cond) { PASS++; }
  else { FAIL++; console.error('FAIL:', name); }
}
const near = (a, b, eps) => Math.abs(P.wrapAngle(a - b)) < (eps || 1e-6);
function cells() { return P.emptyCells(); }
function place(g, x, y, id, a) {
  const p = P.PIECES[id].mk();
  if (a !== undefined) p.a = a;
  g[P.key(x, y)] = p;
}
function loadLevel(lv) {
  const g = cells();
  for (const f of lv.fixed) g[P.key(f.x, f.y)] = P.mkPiece(f.t, f);
  return g;
}

/* 1. mirror reflection law: a' = 2θ - a */
ok(near(P.reflectAngle(0, Math.PI / 4), Math.PI / 2), 'mirror 45°: E->S');
ok(near(P.reflectAngle(0, -Math.PI / 4), -Math.PI / 2), 'mirror -45°: E->N');
ok(near(P.reflectAngle(Math.PI / 2, Math.PI / 4), 0), 'mirror 45°: S->E');
ok(near(P.reflectAngle(0.7, 0.2), 2 * 0.2 - 0.7), 'mirror arbitrary angle');

/* 2. straight beam */
{
  const g = cells();
  place(g, 0, 5, 'emitW', 0);
  place(g, 9, 5, 'recvW');
  const sim = P.simulate(g);
  ok(sim.segments.length === 1, 'straight beam is one segment, got ' + sim.segments.length);
  ok(P.checkWin(g, sim).done, 'straight white beam satisfies white receptor');
}

/* 3. mirror bounce at 45° */
{
  const g = cells();
  place(g, 0, 5, 'emitW', 0);
  place(g, 3, 5, 'mirror', Math.PI / 4);
  place(g, 3, 8, 'recvW');
  ok(P.checkWin(g, P.simulate(g)).done, 'mirror 45° turns E->S into receptor');
}
{
  const g = cells();
  place(g, 0, 5, 'emitW', 0);
  place(g, 3, 5, 'mirror', -Math.PI / 4);
  place(g, 3, 2, 'recvW');
  ok(P.checkWin(g, P.simulate(g)).done, 'mirror -45° turns E->N into receptor');
}

/* 4. splitter 5-way fan, aimed north */
{
  const g = cells();
  place(g, 4, 9, 'emitW', -Math.PI / 2); // facing north
  place(g, 4, 5, 'split', -Math.PI / 2); // aimed north
  const sim = P.simulate(g);
  const outs = sim.segments.filter(s => Math.abs(s.x1 - 4.5) < 0.05 && Math.abs(s.y1 - 5.5) < 0.05);
  ok(outs.length === 5, 'splitter emits 5 beams, got ' + outs.length);
  const exp = [[-5 * Math.PI / 6, 1], [-2 * Math.PI / 3, 2], [-Math.PI / 2, 4], [-Math.PI / 3, 8], [-Math.PI / 6, 16]];
  let match = outs.length === 5;
  for (const [ea, ec] of exp) {
    const found = outs.some(s => near(Math.atan2(s.y2 - s.y1, s.x2 - s.x1), ea, 0.01) && s.c === ec);
    if (!found) { match = false; console.error('   missing fan beam angle=' + ea.toFixed(3) + ' color=' + ec); }
  }
  ok(match, 'fan = R(-60°) Y(-30°) G(0°) C(+30°) B(+60°) spectral bands');
}
{
  // splitter aim is absolute: white from the south, prism aimed east -> eastward fan
  const g = cells();
  place(g, 4, 9, 'emitW', -Math.PI / 2);
  place(g, 4, 5, 'split', 0);
  const sim = P.simulate(g);
  const outs = sim.segments.filter(s => Math.abs(s.x1 - 4.5) < 0.05 && Math.abs(s.y1 - 5.5) < 0.05);
  const exp = [[-Math.PI / 3, 1], [-Math.PI / 6, 2], [0, 4], [Math.PI / 6, 8], [Math.PI / 3, 16]];
  ok(outs.length === 5 && exp.every(([ea, ec]) =>
    outs.some(s => near(segAngle(s), ea, 0.02) && s.c === ec)),
    'rotated splitter: fan follows the prism aim, not the entry beam');
}
{
  // a primary color is duplicated into a pair at ±30° around the aim
  const g = cells();
  place(g, 0, 5, 'emitR', 0);
  place(g, 2, 5, 'split'); // aimed east (default)
  const sim = P.simulate(g);
  const outs = sim.segments.filter(s => Math.abs(s.x1 - 2.5) < 0.05 && Math.abs(s.y1 - 5.5) < 0.05);
  ok(outs.length === 2 && outs.every(s => s.c === P.R), 'primary red -> pair of reds, got ' + outs.length);
  ok(outs.some(s => near(segAngle(s), Math.PI / 6, 0.02)) &&
     outs.some(s => near(segAngle(s), -Math.PI / 6, 0.02)),
     'pair exits at aim ±30°');
}
function fanOuts(sim, fx, fy) {
  return sim.segments.filter(s => Math.abs(s.x1 - fx) < 0.01 && Math.abs(s.y1 - fy) < 0.01);
}
function segAngle(s) { return Math.atan2(s.y2 - s.y1, s.x2 - s.x1); }
{
  // single band from the south, splitter aimed north: pair at north ±30°
  const g = cells();
  g[P.key(4, 9)] = P.mkPiece('emit', { a: -Math.PI / 2, col: P.Y });
  place(g, 4, 5, 'split', -Math.PI / 2);
  const outs = fanOuts(P.simulate(g), 4.5, 5.5);
  ok(outs.length === 2 && outs.every(s => s.c === P.Y), 'spectral yellow -> pair of yellows');
  ok(outs.some(s => near(segAngle(s), -Math.PI / 2 - Math.PI / 6, 0.02)) &&
     outs.some(s => near(segAngle(s), -Math.PI / 2 + Math.PI / 6, 0.02)),
     'pair at aim ±30° regardless of entry direction');
}
{
  // orange (R|Y) splits back into red + yellow — the user's example
  const g = cells();
  g[P.key(4, 9)] = P.mkPiece('emit', { a: -Math.PI / 2, col: P.O });
  place(g, 4, 5, 'split', -Math.PI / 2);
  const outs = fanOuts(P.simulate(g), 4.5, 5.5);
  ok(outs.length === 2, 'orange separates into 2 bands, got ' + outs.length);
  ok(outs.some(s => near(segAngle(s), -Math.PI / 2 - Math.PI / 3, 0.01) && s.c === P.R) &&
     outs.some(s => near(segAngle(s), -Math.PI / 2 - Math.PI / 6, 0.01) && s.c === P.Y),
     'orange -> red(-60°) + yellow(-30°)');
}
{
  // lime (Y|G) -> yellow + green
  const g = cells();
  g[P.key(4, 9)] = P.mkPiece('emit', { a: -Math.PI / 2, col: P.L });
  place(g, 4, 5, 'split', -Math.PI / 2);
  const outs = fanOuts(P.simulate(g), 4.5, 5.5);
  ok(outs.length === 2 && outs.some(s => s.c === P.Y) && outs.some(s => s.c === P.G),
     'lime -> yellow + green');
}
{
  // non-adjacent bands still decompose (R|B is no longer a named color)
  const g = cells();
  g[P.key(4, 9)] = P.mkPiece('emit', { a: -Math.PI / 2, col: P.R | P.B });
  place(g, 4, 5, 'split');
  const outs = fanOuts(P.simulate(g), 4.5, 5.5);
  ok(outs.length === 2 && outs.some(s => s.c === P.R) && outs.some(s => s.c === P.B),
     'R|B bands decompose to red + blue');
}
{
  // mixing: red + yellow -> orange in the combiner
  const g = cells();
  g[P.key(4, 9)] = P.mkPiece('emit', { a: -Math.PI / 2, col: P.R });
  g[P.key(0, 9)] = P.mkPiece('emit', { a: Math.atan2(-5, 4), col: P.Y });
  place(g, 4, 4, 'comb', 0);
  g[P.key(9, 4)] = P.mkPiece('recv', { col: P.O });
  const sim = P.simulate(g);
  ok((sim.charges[P.key(4, 4)] || 0) === P.O, 'combiner charge is R|Y = orange');
  ok(P.checkWin(g, sim).done, 'combiner mixes red + yellow into orange');
}
{
  // mixing: all five bands -> white
  const g = cells();
  g[P.key(4, 9)] = P.mkPiece('emit', { a: -Math.PI / 2, col: P.R });
  g[P.key(0, 9)] = P.mkPiece('emit', { a: Math.atan2(-5, 4), col: P.Y });
  g[P.key(4, 0)] = P.mkPiece('emit', { a: Math.PI / 2, col: P.G });
  g[P.key(0, 0)] = P.mkPiece('emit', { a: Math.PI / 4, col: P.C });
  g[P.key(9, 0)] = P.mkPiece('emit', { a: Math.atan2(4, -5), col: P.B });
  place(g, 4, 4, 'comb', 0);
  const sim = P.simulate(g);
  ok((sim.charges[P.key(4, 4)] || 0) === P.WHITE, 'all five bands combine into white');
}

/* 5. a 45° mirror bends light 90°, same as the old prisms */
{
  const g = cells();
  place(g, 0, 5, 'emitB', 0);
  place(g, 4, 5, 'mirror', Math.PI / 4);
  place(g, 4, 9, 'recvB');
  ok(P.checkWin(g, P.simulate(g)).done, 'mirror 45° turns E->S like the old bend prism');
}

/* 6. combiner normalizes bands to one token; pass-through near arrow */
{
  const g = cells();
  place(g, 4, 9, 'emitR', -Math.PI / 2);
  place(g, 4, 0, 'emitG', Math.PI / 2);
  place(g, 4, 4, 'comb', 0);
  place(g, 9, 4, 'recvY');
  const sim = P.simulate(g);
  ok(P.checkWin(g, sim).done, 'combiner: red + green bands normalize to spectral yellow (one yellow!)');
}
{
  // normalizeBands unit tests: midpoint of the band span
  ok(P.normalizeBands(P.R | P.G) === P.Y, 'norm: R|G -> Y');
  ok(P.normalizeBands(P.R | P.Y) === P.O, 'norm: R|Y -> O');
  ok(P.normalizeBands(P.Y | P.G) === P.L, 'norm: Y|G -> L');
  ok(P.normalizeBands(P.G | P.C) === P.T, 'norm: G|C -> T');
  ok(P.normalizeBands(P.C | P.B) === P.A, 'norm: C|B -> A');
  ok(P.normalizeBands(P.R | P.B) === 0, 'norm: R|B wide mix -> no output');
  ok(P.normalizeBands(P.R) === P.R, 'norm: single band unchanged');
  ok(P.normalizeBands(P.Y | P.B) === 0, 'norm: azure+yellow -> no output (not white)');
  ok(P.normalizeBands(P.R | P.G | P.B) === P.WHITE, 'norm: R|G|B trio -> white');
  ok(P.normalizeBands(P.WHITE) === P.WHITE, 'norm: all five bands -> white');
}
{
  const g = cells();
  place(g, 0, 4, 'emitB', 0);
  place(g, 4, 4, 'comb', 0);
  place(g, 9, 4, 'recvB');
  ok(P.checkWin(g, P.simulate(g)).done, 'combiner pass-through near arrow');
}

/* 7. wall blocks; emitter opaque */
{
  const g = cells();
  place(g, 0, 5, 'emitW', 0);
  place(g, 4, 5, 'wall');
  place(g, 9, 5, 'recvW');
  ok(!P.checkWin(g, P.simulate(g)).done, 'wall blocks beam');
}
{
  const g = cells();
  place(g, 9, 5, 'emitW', Math.PI);
  place(g, 5, 5, 'emitR', 0);
  place(g, 0, 5, 'recvW');
  ok(!P.simulate(g).arrivals[P.key(0, 5)], 'emitter absorbs incoming beam');
}

/* 8. receptor exact match */
{
  const g = cells();
  place(g, 0, 5, 'emitW', 0);
  place(g, 9, 5, 'recvR');
  ok(!P.checkWin(g, P.simulate(g)).done, 'white into red receptor fails (exact match)');
}

/* 9. mirror loop does not hang */
{
  const g = cells();
  place(g, 4, 4, 'emitW', 0);
  place(g, 6, 4, 'mirror', Math.PI / 4);   // E->S
  place(g, 6, 6, 'mirror', -Math.PI / 4);  // S->E? (incoming S: 2(-45°)-90° = -180° = W)
  place(g, 4, 6, 'mirror', Math.PI / 4);
  place(g, 4, 4 - 0, 'mirror', 0); // (overwrites emitter; instead just loop mirrors)
  const t0 = Date.now();
  P.simulate(g);
  ok(Date.now() - t0 < 2000, 'mirror maze terminates, took ' + (Date.now() - t0) + 'ms');
}

/* 10. level solutions */
function solve(lv, placements) {
  const g = loadLevel(lv);
  for (const [x, y, id, a] of placements) place(g, x, y, id, a);
  return P.checkWin(g, P.simulate(g));
}
{
  const r = solve(P.LEVELS[0], [[4, 4, 'mirror', Math.PI / 4], [4, 6, 'mirror', Math.PI / 4]]);
  ok(r.done, 'L1 solvable with two 45° mirrors');
  ok(!solve(P.LEVELS[0], []).done, 'L1 unsolved initially');
}
{
  const r = solve(P.LEVELS[2], [[3, 7, 'split'], [4, 3, 'mirror', 15 * Math.PI / 180], [5, 6, 'mirror', -60 * Math.PI / 180]]);
  ok(r.done, 'L3 solvable: red + fan yellow combine into orange, got ' + r.ok + '/' + r.total);
}
{
  const r = solve(P.LEVELS[3], [[5, 2, 'mirror', Math.PI / 4], [5, 7, 'mirror', Math.PI / 4]]);
  ok(r.done, 'L4 solvable: two 45° mirrors thread the wall gap');
}
{
  const r = solve(P.LEVELS[4], [
    [2, 5, 'split'],
    [5, 6, 'comb', 0],
    [5, 5, 'mirror', 45 * Math.PI / 180],
    [5, 7, 'mirror', -30 * Math.PI / 180]
  ]);
  ok(r.done, 'L5 solvable: split, steer G+C into combiner -> teal, got ' + r.ok + '/' + r.total);
}

console.log(`\n${PASS} passed, ${FAIL} failed`);
process.exit(FAIL ? 1 : 0);
