/* PRISM — three.js scene, voxel pieces, editor, beam visualization (browser only). */
(function () {
'use strict';
var P = window.PRISM;
if (!P) { document.body.innerHTML = '<p style="color:#fff">logic failed to load</p>'; return; }

var W = P.W, H = P.H;
var cv = document.getElementById('cv');
var renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
var scene = new THREE.Scene();
var SKY = new THREE.Color(0xe8edf5);
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 38, 95);

var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
/* Board orbit: drag the background to spin the camera around the board. */
var orbitA = Math.PI / 4, ORBIT_R = 11 * Math.SQRT2, ORBIT_H = 13;
function updateOrbit() {
  camera.position.set(ORBIT_R * Math.cos(orbitA), ORBIT_H, ORBIT_R * Math.sin(orbitA));
  camera.lookAt(0, 0, 0.3);
}
updateOrbit();
function fitCamera() {
  var w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  var aspect = w / h;
  var viewH = Math.max(8.4, 8.8 / aspect);
  camera.left = -viewH * aspect; camera.right = viewH * aspect;
  camera.top = viewH; camera.bottom = -viewH;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', fitCamera);
fitCamera();

scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8a70, 0.55));
var sun = new THREE.DirectionalLight(0xfff1dd, 1.25);
sun.position.set(9, 17, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -11; sun.shadow.camera.right = 11;
sun.shadow.camera.top = 11; sun.shadow.camera.bottom = -11;
sun.shadow.camera.near = 2; sun.shadow.camera.far = 45;
sun.shadow.bias = -0.0004;
scene.add(sun);
var fill = new THREE.DirectionalLight(0xd8e4ff, 0.32);
fill.position.set(-9, 7, -9);
scene.add(fill);

/* ---------- board ---------- */
var board = new THREE.Group();
scene.add(board);
function cellWX(x) { return x - (W - 1) / 2; }
function cellWZ(y) { return y - (H - 1) / 2; }
(function buildBoard() {
  var slab = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.7, 0.5, H + 0.7),
    new THREE.MeshLambertMaterial({ color: 0x11162e }));
  slab.position.y = -0.28;
  slab.castShadow = true; slab.receiveShadow = true;
  board.add(slab);
  var cA = 0x27315c, cB = 0x1f2749;
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var t = new THREE.Mesh(
      new THREE.BoxGeometry(0.96, 0.1, 0.96),
      new THREE.MeshLambertMaterial({ color: ((x + y) & 1) ? cA : cB }));
    t.position.set(cellWX(x), 0.0, cellWZ(y));
    t.userData.cell = { x: x, y: y };
    t.receiveShadow = true;
    board.add(t);
  }
})();
/* The board sits on a wooden side table with legs, fading into the bright fog. */
(function buildTable() {
  var wood = new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.7, metalness: 0 });
  var top = new THREE.Mesh(new THREE.BoxGeometry(24, 1.2, 24), wood);
  top.position.y = -1.15; // top surface at y=-0.55, just under the board slab
  top.castShadow = true; top.receiveShadow = true;
  scene.add(top);
  for (var lx = -1; lx <= 1; lx += 2) for (var lz = -1; lz <= 1; lz += 2) {
    var leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7, 1.2), wood);
    leg.position.set(lx * 10, -5.2, lz * 10);
    leg.castShadow = true;
    scene.add(leg);
  }
})();
// selection ring
var selRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.42, 0.05, 8, 24),
  new THREE.MeshBasicMaterial({ color: 0xffee66 }));
selRing.rotation.x = -Math.PI / 2;
selRing.position.y = 0.12;
selRing.visible = false;
scene.add(selRing);

/* ---------- voxel piece models ---------- */
function lam(color, emissive, ei) {
  return new THREE.MeshLambertMaterial({ color: color, emissive: emissive || 0x000000, emissiveIntensity: ei || 1 });
}
function basePlate(fixed) {
  var m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.8),
    lam(fixed ? 0x8a6f2f : 0x2a3355)); // fixed pieces get a gold base
  m.position.y = 0.1;
  return m;
}
var ROTATABLE = { emit: 1, mirror: 1, comb: 1, split: 1 };

function buildPiece(p) {
  var g = new THREE.Group();
  g.add(basePlate(p.fixed));
  var colHex = new THREE.Color(P.beamColor(p.col));
  // All aimable models are built facing +x (board angle 0 = east);
  // group.rotation.y = -angle maps board angle to world.
  if (p.t === 'emit') {
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.46), lam(0x39406b));
    body.position.y = 0.32; g.add(body);
    var noz = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.2), lam(0x55608f));
    noz.position.set(0.28, 0.32, 0); g.add(noz);
    var tip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.16),
      new THREE.MeshBasicMaterial({ color: colHex, toneMapped: false }));
    tip.position.set(0.46, 0.32, 0); g.add(tip);
    g.rotation.y = -p.a;
  } else if (p.t === 'mirror') {
    for (var s = -1; s <= 1; s += 2) {
      var post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), lam(0x39406b));
      post.position.set(s * 0.42, 0.35, 0);
      g.add(post);
    }
    var panel = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.68, 0.1),
      new THREE.MeshPhongMaterial({ color: 0xbcd2ff, shininess: 90, specular: 0x99bbff }));
    panel.position.y = 0.48;
    g.add(panel);
    g.rotation.y = -p.a;
  } else if (p.t === 'split' || p.t === 'comb') {
    var tint = p.t === 'comb' ? 0xffd9a0 : 0xcfe8ff;
    var prism = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.42, 3),
      new THREE.MeshPhongMaterial({ color: tint, transparent: true, opacity: 0.55, shininess: 80, flatShading: true }));
    prism.position.y = 0.36; prism.rotation.y = Math.PI / 6;
    g.add(prism);
    if (p.t === 'comb') {
      var shaft = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.12), lam(0xffd27a));
      shaft.position.set(0.02, 0.17, 0); g.add(shaft);
      var head = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 4), lam(0xffd27a));
      head.rotation.z = -Math.PI / 2;
      head.position.set(0.3, 0.17, 0); g.add(head);
      g.rotation.y = -p.a;
    } else if (p.t === 'split') {
      // small aim tick on top showing the fan's center direction
      var tick = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.07), lam(0xffffff));
      tick.position.set(0.2, 0.62, 0); g.add(tick);
      var thead = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 4), lam(0xffffff));
      thead.rotation.z = -Math.PI / 2;
      thead.position.set(0.4, 0.62, 0); g.add(thead);
      g.rotation.y = -p.a;
    }
  } else if (p.t === 'recv') {
    var ped = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.3, 8), lam(0x39406b));
    ped.position.y = 0.3; g.add(ped);
    var dish = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.2, 0.14, 12), lam(0x232a4d));
    dish.position.y = 0.5; g.add(dish);
    var orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10),
      new THREE.MeshBasicMaterial({ color: colHex, transparent: true, opacity: 0.9, toneMapped: false }));
    orb.position.y = 0.72; g.add(orb);
    g.userData.orb = orb;
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x66ff88 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.52; ring.visible = false;
    g.add(ring);
    g.userData.ring = ring;
  } else if (p.t === 'wall') {
    var blk = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.66, 0.92), lam(0x5a4a6e));
    blk.position.y = 0.43; g.add(blk);
    var cap = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.1, 0.98), lam(0x6e5a86));
    cap.position.y = 0.78; g.add(cap);
  }
  g.traverse(function (o) {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  return g;
}

/* ---------- game state ---------- */
var pieceLayer = new THREE.Group(); scene.add(pieceLayer);
var beamLayer = new THREE.Group(); scene.add(beamLayer);
var pieceMeshes = {};   // key -> Group
var beamMats = [];
var orbMeshes = {};     // recv key -> {orb, ring, target}

var state = {
  levelIdx: 0, cells: P.emptyCells(), inv: {},
  paletteSel: null, selectedCell: -1, winShown: false, lastSim: null, zoom: 1,
  drawer: null
};

function loadStored() {
  try {
    var li = parseInt(localStorage.getItem('prism.level') || '0', 10);
    if (li >= 0 && li < P.LEVELS.length) state.levelIdx = li;
  } catch (e) {}
}
function doneSet() {
  try { return JSON.parse(localStorage.getItem('prism.done') || '[]'); }
  catch (e) { return []; }
}
function markDone(id) {
  var d = doneSet();
  if (d.indexOf(id) < 0) { d.push(id); try { localStorage.setItem('prism.done', JSON.stringify(d)); } catch (e) {} }
}

function loadLevel(idx) {
  state.levelIdx = idx;
  try { localStorage.setItem('prism.level', String(idx)); } catch (e) {}
  var lv = P.LEVELS[idx];
  state.cells = P.emptyCells();
  state.fixed = {};
  for (var i = 0; i < lv.fixed.length; i++) {
    var f = lv.fixed[i];
    var p = P.mkPiece(f.t, f);
    p.fixed = (f.fixed !== false);
    state.cells[P.key(f.x, f.y)] = p;
    if (p.fixed) state.fixed[P.key(f.x, f.y)] = true;
  }
  state.inv = {};
  for (var pi = 0; pi < P.PALETTE.length; pi++) state.inv[P.PALETTE[pi]] = Infinity; // unlimited for now
  state.paletteSel = null;
  state.selectedCell = -1;
  state.winShown = false;
  state.drawer = null;
  document.getElementById('lvlname').textContent = lv.name;
  document.getElementById('panel').style.display = 'none';
  selRing.visible = false;
  buildPalette();
  refreshPieces();
  resim();
  toast(lv.hint, 4200);
}

/* ---------- editor UI ---------- */
function toast(msg, ms) {
  var box = document.getElementById('toast');
  var d = document.createElement('div');
  d.className = 'tmsg'; d.textContent = msg;
  box.appendChild(d);
  setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, ms || 2600);
  while (box.children.length > 3) box.removeChild(box.firstChild);
}

function invCount(id) { return state.inv[id] === undefined ? 0 : state.inv[id]; }

function pieceIcon(meta) {
  if (meta.dot) return '<span class="cdot" style="background:' + meta.dot + '"></span>';
  return '<span class="em">' + meta.emoji + '</span>';
}
/* Palette groups: strings are single buttons, objects are tap-to-expand
   vertical drawers. */
var GROUPS = [
  { gid: 'emit', label: 'Emitters', emoji: '🔆',
    items: ['emitW', 'emitR', 'emitG', 'emitB'] },
  'mirror',
  'split',
  'comb',
  { gid: 'recv', label: 'Receptors', emoji: '🎯',
    items: ['recvW', 'recvR', 'recvO', 'recvY', 'recvL', 'recvG',
            'recvT', 'recvC', 'recvA', 'recvB'] },
  'wall'
];

function variantButton(id) {
  var meta = P.PIECES[id];
  var b = document.createElement('button');
  b.className = 'pbtn';
  b.id = 'pal_' + id;
  var cnt = invCount(id);
  b.innerHTML = '<span class="cnt">' + (cnt === Infinity ? '∞' : cnt) + '</span>' +
    pieceIcon(meta) + '<small>' + meta.label.replace(' · ', '<br>') + '</small>';
  if (cnt <= 0) b.classList.add('depleted');
  if (state.paletteSel === id) b.classList.add('on');
  b.addEventListener('pointerdown', function (ev) {
    ev.stopPropagation();
    if (invCount(id) <= 0) { toast('None left of ' + meta.label); return; }
    state.paletteSel = (state.paletteSel === id) ? null : id;
    closePanel();
    buildPalette();
  });
  return b;
}

function buildPalette() {
  var pal = document.getElementById('palette');
  pal.innerHTML = '';
  for (var i = 0; i < GROUPS.length; i++) {
    (function (entry) {
      if (typeof entry === 'string') { pal.appendChild(variantButton(entry)); return; }
      var b = document.createElement('button');
      b.className = 'pbtn' + (state.drawer === entry.gid ? ' on' : '');
      b.id = 'palgrp_' + entry.gid;
      b.innerHTML = '<span class="em">' + entry.emoji + '</span><small>' + entry.label + '</small>';
      b.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation();
        toggleDrawer(entry.gid);
      });
      pal.appendChild(b);
    })(GROUPS[i]);
  }
  renderDrawer();
}

function toggleDrawer(gid) {
  state.drawer = (state.drawer === gid) ? null : gid;
  if (state.drawer) closePanel();
  buildPalette();
}
function closeDrawer() {
  if (!state.drawer) return;
  state.drawer = null;
  buildPalette();
}
function renderDrawer() {
  var dv = document.getElementById('vdrawer');
  dv.innerHTML = '';
  var grp = null;
  for (var i = 0; i < GROUPS.length; i++) {
    if (typeof GROUPS[i] !== 'string' && GROUPS[i].gid === state.drawer) grp = GROUPS[i];
  }
  if (!grp) { dv.classList.remove('open'); return; }
  dv.classList.add('open');
  for (var j = 0; j < grp.items.length; j++) {
    (function (id) {
      var meta = P.PIECES[id];
      var b = document.createElement('button');
      b.className = 'pbtn' + (state.paletteSel === id ? ' on' : '');
      b.id = 'vd_' + id;
      var cnt = invCount(id);
      if (cnt <= 0) b.classList.add('depleted');
      b.innerHTML = '<span class="cnt">' + (cnt === Infinity ? '∞' : cnt) + '</span>' +
        pieceIcon(meta) + '<small>' + meta.label + '</small>';
      b.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation();
        if (invCount(id) <= 0) { toast('None left of ' + meta.label); return; }
        state.paletteSel = (state.paletteSel === id) ? null : id;
        closePanel();
        buildPalette();
      });
      dv.appendChild(b);
    })(grp.items[j]);
  }
}

function pieceLabel(p) {
  for (var id in P.PIECES) {
    var meta = P.PIECES[id];
    if (id.indexOf('emit') === 0 && p.t === 'emit' && meta.mk().col === p.col) return meta;
    if (id.indexOf('recv') === 0 && p.t === 'recv' && meta.mk().col === p.col) return meta;
    if (id === p.t) return meta;
  }
  return { label: p.t, emoji: '❓', rot: false };
}
function pieceIdOf(p) {
  for (var id in P.PIECES) {
    var meta = P.PIECES[id];
    if (id.indexOf('emit') === 0 && p.t === 'emit' && meta.mk().col === p.col) return id;
    if (id.indexOf('recv') === 0 && p.t === 'recv' && meta.mk().col === p.col) return id;
    if (id === p.t) return id;
  }
  return null;
}

function openPanel(k) {
  var p = state.cells[k];
  if (!p) return;
  state.selectedCell = k;
  var meta = pieceLabel(p);
  var panel = document.getElementById('panel');
  var html = '<div class="row"><span class="pname">' + pieceIcon(meta) + ' ' + meta.label + '</span>';
  if (!p.fixed) html += '<button class="abtn warn" id="btnDel">🗑 Remove</button>';
  else html += '<span class="chip">fixed</span>';
  html += '<button class="abtn" id="btnFix">' + (p.fixed ? '📍 Unfix' : '📌 Fix') + '</button>';
  html += '</div>';
  if (meta.rot && !p.fixed) html += '<div class="pdesc">✥ Drag on the board to rotate it freely</div>';
  if (meta.desc) html += '<div class="pdesc">' + meta.desc + '</div>';
  panel.innerHTML = html;
  panel.style.display = 'block';
  var x = k % W, y = Math.floor(k / W);
  selRing.position.set(cellWX(x), 0.12, cellWZ(y));
  selRing.visible = true;
  var bd = document.getElementById('btnDel');
  if (bd) bd.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); removePiece(k); });
  var bf = document.getElementById('btnFix');
  if (bf) bf.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); toggleFix(k); });
}
function toggleFix(k) {
  var p = state.cells[k];
  if (!p) return;
  p.fixed = !p.fixed;
  if (p.fixed) state.fixed[k] = true; else delete state.fixed[k];
  refreshPieces(); resim();
  openPanel(k);
}
function closePanel() {
  document.getElementById('panel').style.display = 'none';
  selRing.visible = false;
  state.selectedCell = -1;
}
function removePiece(k) {
  var p = state.cells[k];
  if (!p || p.fixed) return;
  var id = pieceIdOf(p);
  if (id && state.inv[id] !== Infinity && state.inv[id] !== undefined) state.inv[id]++;
  state.cells[k] = null;
  closePanel(); buildPalette(); refreshPieces(); resim();
}

/* ---------- pieces & beams ---------- */
function refreshPieces() {
  for (var k in pieceMeshes) pieceLayer.remove(pieceMeshes[k]);
  pieceMeshes = {}; orbMeshes = {};
  for (var i = 0; i < W * H; i++) {
    var p = state.cells[i];
    if (!p) continue;
    var x = i % W, y = Math.floor(i / W);
    var g = buildPiece(p);
    g.position.set(cellWX(x), 0.05, cellWZ(y));
    pieceLayer.add(g);
    pieceMeshes[i] = g;
    if (p.t === 'recv') orbMeshes[i] = { orb: g.userData.orb, ring: g.userData.ring };
  }
}

function resim() {
  var sim = P.simulate(state.cells);
  state.lastSim = sim;
  // clear beams
  for (var i = beamLayer.children.length - 1; i >= 0; i--) {
    var c = beamLayer.children[i];
    beamLayer.remove(c);
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
  }
  beamMats = [];
  var seen = {};
  for (var s = 0; s < sim.segments.length; s++) {
    var sg = sim.segments[s];
    var gk = sg.x1.toFixed(3) + ',' + sg.y1.toFixed(3) + ',' + sg.x2.toFixed(3) + ',' + sg.y2.toFixed(3);
    seen[gk] = (seen[gk] || 0) | sg.c;
  }
  for (var gk2 in seen) {
    var parts = gk2.split(',');
    var x1 = +parts[0], y1 = +parts[1], x2 = +parts[2], y2 = +parts[3];
    var c = seen[gk2];
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-4) continue;
    var mx = (x1 + x2) / 2 - W / 2, mz = (y1 + y2) / 2 - H / 2;
    var yaw = -Math.atan2(dy, dx);
    var col = new THREE.Color(P.beamColor(c));
    // soft additive halo
    var gmat = new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    var glow = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.36), gmat);
    glow.position.set(mx, 0.60, mz);
    glow.rotation.y = yaw;
    beamLayer.add(glow);
    beamMats.push(gmat);
    // fully saturated core — the color always reads clearly
    var core = new THREE.Mesh(
      new THREE.BoxGeometry(len * 0.995, 0.1, 0.15),
      new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
    core.position.set(mx, 0.63, mz);
    core.rotation.y = yaw;
    beamLayer.add(core);
  }
  // receptor state
  var win = P.checkWin(state.cells, sim);
  document.getElementById('recvtxt').textContent = win.ok + '/' + win.total;
  for (var rk in orbMeshes) {
    var p = state.cells[rk];
    var sat = p && (sim.arrivals[rk] || 0) === p.col;
    orbMeshes[rk].ring.visible = !!sat;
    orbMeshes[rk].orb.material.opacity = sat ? 1 : 0.55;
    orbMeshes[rk].sat = !!sat;
  }
  if (win.done && !state.winShown) {
    state.winShown = true;
    var lv = P.LEVELS[state.levelIdx];
    markDone(lv.id);
    document.getElementById('bp').textContent = lv.name + ' — all receptors lit with exactly the right color.';
    document.getElementById('banner').style.display = 'flex';
    document.getElementById('btnNext').style.display =
      (state.levelIdx + 1 < P.LEVELS.length) ? '' : 'none';
  }
  return sim;
}

/* ---------- input: tap to place/select, drag to rotate, pinch/wheel to zoom ---------- */
var ray = new THREE.Raycaster();
var ptr = new THREE.Vector2();
var groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.05);
var pointers = new Map();
var gesture = null;
var pinchD0 = 0, zoom0 = 1;
var needResim = false;

function boardPoint(ev) {
  var r = cv.getBoundingClientRect();
  ptr.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  ptr.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(ptr, camera);
  var pt = new THREE.Vector3();
  if (!ray.ray.intersectPlane(groundPlane, pt)) return null;
  return { bx: pt.x + W / 2, by: pt.z + H / 2 };
}
function pickCell(ev) {
  var bp = boardPoint(ev);
  if (!bp) return null;
  var x = Math.floor(bp.bx), y = Math.floor(bp.by);
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  return { x: x, y: y, k: P.key(x, y) };
}
function setZoom(z) {
  state.zoom = Math.min(3.2, Math.max(0.55, z));
  camera.zoom = state.zoom;
  camera.updateProjectionMatrix();
}

cv.addEventListener('pointerdown', function (ev) {
  try { cv.setPointerCapture(ev.pointerId); } catch (e) {}
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pointers.size === 2) {
    var pp = Array.from(pointers.values());
    pinchD0 = Math.hypot(pp[0].x - pp[1].x, pp[0].y - pp[1].y);
    zoom0 = state.zoom;
    gesture = { kind: 'pinch' };
    return;
  }
  if (pointers.size > 2) return;
  var cell = pickCell(ev);
  if (!cell) {
    // background: drag to orbit the board
    closePanel(); closeDrawer();
    gesture = { kind: 'orbit', sx: ev.clientX };
    return;
  }
  var p = state.cells[cell.k];
  if (state.paletteSel) {
    if (p) { toast('Square occupied — tap a piece with no palette selected to edit it'); gesture = { kind: 'tap' }; return; }
    var id = state.paletteSel;
    if (invCount(id) <= 0) { toast('None left'); gesture = { kind: 'tap' }; return; }
    state.cells[cell.k] = P.PIECES[id].mk();
    if (state.inv[id] !== Infinity) state.inv[id]--;
    state.winShown = false;
    document.getElementById('banner').style.display = 'none';
    state.paletteSel = null; // one placement per pick: deselect the picker
    buildPalette(); refreshPieces(); resim();
    gesture = { kind: 'tap' };
    return;
  }
  if (p) {
    selRing.position.set(cellWX(cell.x), 0.12, cellWZ(cell.y));
    selRing.visible = true;
    state.selectedCell = cell.k;
    closeDrawer();
    gesture = { kind: 'maybe-rotate', key: cell.k, sx: ev.clientX, sy: ev.clientY,
                cx: cell.x + 0.5, cy: cell.y + 0.5 };
  } else {
    closePanel();
    closeDrawer();
    gesture = { kind: 'tap' };
  }
});
cv.addEventListener('pointermove', function (ev) {
  if (!pointers.has(ev.pointerId)) return;
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (gesture && gesture.kind === 'pinch') {
    if (pointers.size >= 2) {
      var pp = Array.from(pointers.values());
      var d = Math.hypot(pp[0].x - pp[1].x, pp[0].y - pp[1].y);
      if (pinchD0 > 0) setZoom(zoom0 * d / pinchD0);
    }
    return;
  }
  if (gesture && gesture.kind === 'orbit') {
    var odx = ev.clientX - gesture.sx;
    gesture.sx = ev.clientX;
    orbitA += odx * 0.008; // drag right: world follows the finger
    updateOrbit();
    return;
  }
  if (gesture && gesture.kind === 'maybe-rotate') {
    var moved = Math.hypot(ev.clientX - gesture.sx, ev.clientY - gesture.sy);
    if (moved <= 12) return;
    var pc0 = state.cells[gesture.key];
    gesture.kind = (pc0 && ROTATABLE[pc0.t] && !pc0.fixed) ? 'rotating' : 'tap';
    if (gesture.kind === 'tap') return;
  }
  if (gesture && gesture.kind === 'rotating') {
    var bp = boardPoint(ev);
    if (!bp) return;
    var pc = state.cells[gesture.key];
    if (!pc) return;
    var a = Math.atan2(bp.by - gesture.cy, bp.bx - gesture.cx);
    pc.a = a;
    var mesh = pieceMeshes[gesture.key];
    if (mesh) mesh.rotation.y = -a;
    needResim = true;
  }
});
function endPointer(ev) {
  pointers.delete(ev.pointerId);
  if (gesture && gesture.kind === 'pinch') {
    if (pointers.size < 2) gesture = null;
    return;
  }
  if (gesture && (gesture.kind === 'maybe-rotate' || gesture.kind === 'rotating')) {
    openPanel(gesture.key);
  }
  gesture = null;
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('wheel', function (ev) {
  ev.preventDefault();
  setZoom(state.zoom * Math.exp(-ev.deltaY * 0.0012));
}, { passive: false });
cv.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });

/* ---------- board -> level JSON ---------- */
var JSON_ROT = { emit: 1, mirror: 1, split: 1, comb: 1 };
function stateToJSON(includeAll) {
  var fixed = [];
  for (var k = 0; k < state.cells.length; k++) {
    var p = state.cells[k];
    if (!p) continue;
    if (!includeAll && !p.fixed) continue; // fixed-only unless saving work-in-progress
    var e = { x: k % P.W, y: Math.floor(k / P.W), t: p.t };
    if (JSON_ROT[p.t] && typeof p.a === 'number') e.a = Math.round(p.a * 1e4) / 1e4;
    if ((p.t === 'emit' || p.t === 'recv') && p.col !== undefined) {
      var nm = P.colorName(p.col);
      e.col = nm || p.col;
    }
    if (includeAll && !p.fixed) e.fixed = false; // comes back unlocked
    fixed.push(e);
  }
  return { id: 'mylevel', name: 'My Level', hint: '', fixed: fixed, inv: {} };
}
function refreshJSON() {
  var all = document.getElementById('jsonAll').checked;
  document.getElementById('jsonTxt').value = JSON.stringify(stateToJSON(all), null, 2);
}
/* ---------- apply pasted JSON to the board ---------- */
var JSON_TYPES = { emit: 1, mirror: 1, split: 1, comb: 1, recv: 1, wall: 1 };
var JSON_COLS = { R: 1, O: 1, Y: 1, L: 1, G: 1, T: 1, C: 1, A: 1, B: 1, W: 1 };
function validatePiece(f) {
  if (!f || typeof f !== 'object') return 'not an object';
  if (!JSON_TYPES[f.t]) return 'bad type "' + f.t + '"';
  if (!Number.isInteger(f.x) || !Number.isInteger(f.y) || f.x < 0 || f.x > 9 || f.y < 0 || f.y > 9)
    return 'bad coords';
  if (f.a !== undefined && typeof f.a !== 'number') return 'bad angle';
  if (f.col !== undefined && !JSON_COLS[f.col] && typeof f.col !== 'number') return 'bad color';
  if (f.fixed !== undefined && typeof f.fixed !== 'boolean') return '"fixed" must be true/false';
  return null;
}
function applyJSON() {
  var lv;
  try { lv = JSON.parse(document.getElementById('jsonTxt').value); }
  catch (e) { toast('Invalid JSON: ' + e.message); return; }
  var arr = Array.isArray(lv) ? lv : lv.fixed;
  if (!Array.isArray(arr)) { toast('JSON needs a "fixed" array of pieces (or a bare array)'); return; }
  var norm = P.normalizeLevel({ id: 'x', name: 'x', fixed: arr });
  var cells = P.emptyCells(), fmap = {};
  for (var i = 0; i < norm.fixed.length; i++) {
    var f = arr[i], err = validatePiece(f);
    if (err) { toast('Piece ' + (i + 1) + ': ' + err); return; }
    var n = norm.fixed[i];
    var k = P.key(n.x, n.y);
    if (cells[k]) { toast('Two pieces on (' + n.x + ',' + n.y + ')'); return; }
    var p = P.mkPiece(n.t, n);
    p.fixed = (n.fixed !== false);
    cells[k] = p;
    if (p.fixed) fmap[k] = true;
  }
  state.cells = cells;
  state.fixed = fmap;
  state.selectedCell = -1;
  closePanel();
  if (!Array.isArray(lv) && lv.name) document.getElementById('lvlname').textContent = lv.name;
  refreshPieces(); resim();
  document.getElementById('jsonOv').style.display = 'none';
  toast('Board loaded: ' + norm.fixed.length + ' pieces');
}

/* ---------- chrome ---------- */
document.getElementById('btnRestart').addEventListener('pointerdown', function (ev) {
  ev.stopPropagation();
  document.getElementById('banner').style.display = 'none';
  loadLevel(state.levelIdx);
});
document.getElementById('btnHelp').addEventListener('pointerdown', function (ev) {
  ev.stopPropagation();
  document.getElementById('helpOv').style.display = 'flex';
});
document.getElementById('btnJSON').addEventListener('pointerdown', function (ev) {
  ev.stopPropagation();
  refreshJSON();
  document.getElementById('jsonOv').style.display = 'flex';
});
document.getElementById('jsonAll').addEventListener('change', refreshJSON);
document.getElementById('btnCloseJSON').addEventListener('pointerdown', function (ev) {
  ev.stopPropagation();
  document.getElementById('jsonOv').style.display = 'none';
});
document.getElementById('btnApplyJSON').addEventListener('pointerdown', function (ev) {
  ev.stopPropagation();
  applyJSON();
});
document.getElementById('btnCopyJSON').addEventListener('pointerdown', function (ev) {
  ev.stopPropagation();
  var txt = document.getElementById('jsonTxt');
  function done() { toast('Level JSON copied'); }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt.value).then(done, function () { fallback(); });
  } else fallback();
  function fallback() {
    txt.removeAttribute('readonly');
    txt.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed — select the text manually'); }
    txt.setAttribute('readonly', '');
  }
});
document.getElementById('btnCloseHelp').addEventListener('pointerdown', function (ev) {
  ev.stopPropagation();
  document.getElementById('helpOv').style.display = 'none';
});
document.getElementById('btnLevels').addEventListener('pointerdown', function (ev) {
  ev.stopPropagation();
  var list = document.getElementById('levellist');
  list.innerHTML = '';
  var done = doneSet();
  for (var i = 0; i < P.LEVELS.length; i++) {
    (function (idx) {
      var lv = P.LEVELS[idx];
      var row = document.createElement('div');
      row.className = 'lvlrow' + (done.indexOf(lv.id) >= 0 ? ' done' : '');
      row.innerHTML = '<div><div class="nm">' + (done.indexOf(lv.id) >= 0 ? '✓ ' : '') + lv.name + '</div>' +
        '<div class="hn">' + lv.hint + '</div></div>';
      row.addEventListener('pointerdown', function (e2) {
        e2.stopPropagation();
        document.getElementById('levelsOv').style.display = 'none';
        document.getElementById('banner').style.display = 'none';
        loadLevel(idx);
      });
      list.appendChild(row);
    })(i);
  }
  document.getElementById('levelsOv').style.display = 'flex';
});
document.getElementById('btnCloseLevels').addEventListener('pointerdown', function (ev) {
  ev.stopPropagation();
  document.getElementById('levelsOv').style.display = 'none';
});
document.getElementById('btnNext').addEventListener('pointerdown', function (ev) {
  ev.stopPropagation();
  document.getElementById('banner').style.display = 'none';
  if (state.levelIdx + 1 < P.LEVELS.length) loadLevel(state.levelIdx + 1);
});
document.getElementById('btnAgain').addEventListener('pointerdown', function (ev) {
  ev.stopPropagation();
  document.getElementById('banner').style.display = 'none';
});

/* ---------- main loop ---------- */
var clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  var t = clock.getElapsedTime();
  if (needResim) { needResim = false; resim(); }
  for (var i = 0; i < beamMats.length; i++) {
    beamMats[i].opacity = 0.26 + 0.14 * Math.sin(t * 5 + i * 0.7);
  }
  for (var rk in orbMeshes) {
    var o = orbMeshes[rk];
    var s = o.sat ? 1 + 0.18 * Math.sin(t * 6) : 1;
    o.orb.scale.set(s, s, s);
  }
  renderer.render(scene, camera);
}

/* ---------- boot ---------- */
loadStored();
loadLevel(state.levelIdx);
tick();

window.__prism = {
  P: P, state: state,
  sim: function () { return state.lastSim; },
  loadLevel: loadLevel,
  resim: resim,
  refreshPieces: refreshPieces,
  buildPalette: buildPalette,
  renderDrawer: renderDrawer, toggleDrawer: toggleDrawer, GROUPS: GROUPS,
  getOrbit: function () { return orbitA; }, setOrbit: function (a) { orbitA = a; updateOrbit(); },
  stateToJSON: stateToJSON, applyJSON: applyJSON,
  cellAt: function (x, y) { return state.cells[P.key(x, y)]; },
  screenXY: function (x, y) {
    var v = new THREE.Vector3(cellWX(x), 0.6, cellWZ(y)).project(camera);
    var r = cv.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }
};
})();
