(() => {
'use strict';
const C = window.CONFIG;
const COLS = C.grid.cols, ROWS = C.grid.rows, SURFACE = C.grid.surfaceRows, SURF_ROW = SURFACE - 1;
const SOIL = 0, TUNNEL = 1, QUEEN = 2, PIT = 3, ROCK = 4, STORE = 5, EGG = 6, SURF = 7, SKY = 8;
const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
let S, nextId = 1;

// ---------- world ----------
function newGame() {
  nextId = 1;
  const grid = new Uint8Array(COLS * ROWS);
  S = { grid, ants: [], eggs: [], corpses: [], marks: new Map(), food: C.food.startStock,
        disposed: 0, deathsAge: 0, deathsStarve: 0, lost: 0, born: 0, laid: 0, foodIn: 0,
        layT: C.queen.layInterval - C.queen.firstLayDelay, time: 0, speed: C.speeds[0], tool: 'ants',
        queen: { c: 10, r: 11 }, queenStatus: '' };
  const set = (c, r, v) => { if (c >= 0 && c < COLS && r >= 0 && r < ROWS) grid[r * COLS + c] = v; };
  for (let r = 0; r < SURFACE; r++) for (let c = 0; c < COLS; c++) set(c, r, r === SURF_ROW ? SURF : SKY);
  for (let r = SURFACE; r <= 10; r++) set(10, r, TUNNEL);                 // entrance shaft
  for (let c = 5; c <= 13; c++) set(c, 11, TUNNEL);                       // gallery
  for (let r = 10; r <= 12; r++) for (let c = 9; c <= 11; c++) set(c, r, QUEEN);   // queen chamber
  for (let r = 10; r <= 11; r++) for (let c = 2; c <= 4; c++) set(c, r, STORE);    // food store
  for (let r = 10; r <= 12; r++) for (let c = 14; c <= 15; c++) set(c, r, EGG);    // starter egg chamber (6 cells)
  for (let r = 12; r <= 16; r++) set(6, r, TUNNEL);                       // shaft to the pit
  for (let c = 5; c <= 7; c++) set(c, 17, PIT);
  [[14,6],[15,6],[3,20],[4,20],[12,22],[13,22],[13,23],[17,19],[1,15],[9,27],[10,27],[16,29]].forEach(([c, r]) => set(c, r, ROCK));
  for (let i = 0; i < (C.start && C.start.ants || 0); i++) S.ants.push(makeAnt(8, 11));
  fx.length = 0; selBox = null;
}
function makeAnt(c, r) {
  return { id: nextId++, x: c + 0.5, y: r + 0.5, path: [], target: null, age: 0, life: rand(C.ant.lifespanMin, C.ant.lifespanMax),
           selected: false, hold: false, wanderT: rand(0.5, 2), decideT: 0, task: null, carry: null, food: 0,
           eatT: rand(0.3, 1) * C.hunger.eatInterval, hungry: 0, heading: 0, step: Math.random() * 6, away: false };
}
const inB = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
const cell = (c, r) => inB(c, r) ? S.grid[r * COLS + c] : ROCK;
const isWalkType = v => v === TUNNEL || v === QUEEN || v === PIT || v === STORE || v === EGG || v === SURF;
const walk = (c, r) => inB(c, r) && isWalkType(cell(c, r));
const under = (c, r) => walk(c, r) && r >= SURFACE;          // walkable and underground
const cOf = e => Math.floor(e.x), rOf = e => Math.floor(e.y);
const key = (c, r) => r * COLS + c;

function bfs(sc, sr, goal, avoidPit = true) {
  if (!walk(sc, sr)) return null;
  if (goal(sc, sr)) return [];
  const prev = new Int32Array(COLS * ROWS).fill(-2), s = key(sc, sr), q = [s]; prev[s] = -1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], c = i % COLS, r = (i / COLS) | 0;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr, ni = key(nc, nr);
      if (!walk(nc, nr) || prev[ni] !== -2) continue;
      prev[ni] = i;
      if (goal(nc, nr)) { const out = []; let k = ni; while (k !== s) { out.push([k % COLS, (k / COLS) | 0]); k = prev[k]; } return out.reverse(); }
      if (avoidPit && cell(nc, nr) === PIT) continue;
      q.push(ni);
    }
  }
  return null;
}
const nextCell = a => a.path.length ? a.path[0] : [cOf(a), rOf(a)];
const pathFrom = (a, goal) => { const [c, r] = nextCell(a); return bfs(c, r, goal); };
function setPath(a, p) { a.path = (a.path.length ? [a.path[0]] : []).concat(p); }

// ---------- tasks ----------
function clearTask(a) {
  const t = a.task;
  if (t && t.type === 'fetch') { const k = S.corpses.find(k => k.id === t.corpse); if (k && k.claimedBy === a.id) k.claimedBy = null; }
  if (t && t.type === 'dig') { const m = S.marks.get(t.key); if (m && m.by === a.id) m.by = null; }
  a.task = null;
}
function orderMove(ants, c, r) {
  if (!walk(c, r)) { toast(r < SURFACE ? 'Tap the grass line to send ants outside' : S.marks.has(key(c, r)) ? 'Marked for digging' : 'Solid soil – mark it with ⛏️ Dig first'); return 0; }
  let ok = 0;
  for (const a of ants) { const p = pathFrom(a, (x, y) => x === c && y === r); if (p) { clearTask(a); setPath(a, p); a.target = [c, r]; a.hold = true; ok++; } }
  if (!ok) toast('No tunnel route to that spot'); else if (ok < ants.length) toast(`${ants.length - ok} ant(s) can't reach that spot`);
  return ok;
}
// --- hauling corpses
function assignHaul(a, k) {
  if (a.carry || a.food) return false;
  const p = pathFrom(a, (x, y) => x === cOf(k) && y === rOf(k));
  if (!p) return false;
  clearTask(a);
  if (k.claimedBy) { const o = S.ants.find(o => o.id === k.claimedBy); if (o && o.task && o.task.type === 'fetch') o.task = null; }
  k.claimedBy = a.id; a.task = { type: 'fetch', corpse: k.id }; setPath(a, p); a.target = [cOf(k), rOf(k)];
  return true;
}
function deliverToPit(a) {
  const p = pathFrom(a, (x, y) => cell(x, y) === PIT);
  if (p) { setPath(a, p); a.task = { type: 'deliver' }; a.target = p.length ? p[p.length - 1] : nextCell(a); return true; }
  toast('No tunnel route to the pit!'); a.task = null; return false;
}
function haulCorpse(k, pool) {
  let best = null, bl = 1e9;
  for (const a of pool) { if (a.carry || a.food || a.away) continue; const p = pathFrom(a, (x, y) => x === cOf(k) && y === rOf(k)); if (p && p.length < bl) { bl = p.length; best = a; } }
  return best && assignHaul(best, k) ? best : null;
}
function haulAll() {
  const sel = S.ants.filter(a => a.selected), pool = sel.length ? sel : S.ants; let n = 0;
  for (const k of S.corpses) {
    if (k.carriedBy || k.claimedBy) continue;
    const free = pool.filter(a => !a.carry && !a.food && !a.away && !(a.task && a.task.type === 'fetch'));
    if (!free.length) break;
    if (haulCorpse(k, free)) n++;
  }
  toast(n ? `${n} ant(s) hauling bodies to the pit` : (S.corpses.length ? 'No free ant can reach a body' : 'No bodies to haul'));
  return n;
}
// --- digging marked cells
function markDiggable(m) { return !m.by && DIRS.some(([dc, dr]) => under(m.c + dc, m.r + dr)); }
function assignDig(a, onlyKey) {
  if (a.carry || a.food) return false;
  let found = null;
  const p = pathFrom(a, (x, y) => {
    if (y < SURFACE) return false;
    for (const [dc, dr] of DIRS) { const m = S.marks.get(key(x + dc, y + dr)); if (m && !m.by && (onlyKey == null || key(m.c, m.r) === onlyKey)) { found = m; return true; } }
    return false;
  });
  if (!p || !found) return false;
  clearTask(a); found.by = a.id;
  a.task = { type: 'dig', key: key(found.c, found.r), phase: 'walk' }; setPath(a, p); a.target = nextCellAfter(a);
  return true;
}
const nextCellAfter = a => a.path.length ? a.path[a.path.length - 1] : [cOf(a), rOf(a)];
// --- foraging outside
function assignForage(a) {
  if (a.carry || a.food) return false;
  const edge = Math.random() < 0.5 ? 0 : COLS - 1;
  const p = pathFrom(a, (x, y) => x === edge && y === SURF_ROW);
  if (!p) return false;
  clearTask(a); a.task = { type: 'forage', phase: 'out', edge }; setPath(a, p.concat([[edge === 0 ? -1 : COLS, SURF_ROW]])); a.target = null;
  return true;
}
function returnHome(a) {
  const edge = a.task.edge, sc = edge, p = bfs(sc, SURF_ROW, (x, y) => cell(x, y) === STORE);
  a.away = false; a.x = (edge === 0 ? -1 : COLS) + 0.5; a.y = SURF_ROW + 0.5; a.food = C.food.yieldPerTrip;
  a.task = { type: 'forage', phase: 'back', edge };
  a.path = [[sc, SURF_ROW]].concat(p || []);
  if (!p) toast('Forager came back but can’t reach the food store!');
}

// ---------- simulation ----------
function step(dt) {
  S.time += dt;
  // queen lays eggs
  const pop = S.ants.length + S.eggs.length;
  const freeEgg = freeEggCell();
  if (pop >= C.ant.maxPopulation) S.queenStatus = 'colony full';
  else if (!freeEgg) S.queenStatus = 'no egg room';
  else if (S.food < C.queen.eggFoodCost) S.queenStatus = `needs ${C.queen.eggFoodCost} food`;
  else {
    S.queenStatus = '';
    S.layT += dt;
    if (S.layT >= C.queen.layInterval) { S.layT = 0; S.food -= C.queen.eggFoodCost; S.eggs.push({ id: nextId++, c: freeEgg[0], r: freeEgg[1], t: 0 }); S.laid++; }
  }
  // eggs hatch
  for (let i = S.eggs.length - 1; i >= 0; i--) {
    const e = S.eggs[i]; e.t += dt;
    if (e.t >= C.egg.hatchTime) { S.eggs.splice(i, 1); S.ants.push(makeAnt(e.c, e.r)); S.born++; }
  }
  for (let i = S.ants.length - 1; i >= 0; i--) {
    const a = S.ants[i];
    a.age += dt;
    // hunger
    a.eatT -= dt;
    if (a.eatT <= 0) {
      if (S.food >= C.hunger.eatAmount) { S.food -= C.hunger.eatAmount; a.hungry = 0; a.eatT += C.hunger.eatInterval; }
      else { a.hungry += dt; a.eatT = 0; }
    }
    if (a.hungry >= C.hunger.starveTime) { die(a, i, 'starved'); continue; }
    if (a.age >= a.life) { die(a, i, 'age'); continue; }
    if (a.away) { a.task.t -= dt; if (a.task.t <= 0) returnHome(a); continue; }
    moveAnt(a, dt);
    if (S.ants[i] !== a) continue;            // lost outside during this step
    if (C.ai.autoJobs) think(a, dt);
  }
}
function freeEggCell() {
  const used = new Set(S.eggs.map(e => key(e.c, e.r)));
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (cell(c, r) === EGG && !used.has(key(c, r))) return [c, r];
  return null;
}
function die(a, i, cause) {
  clearTask(a);
  if (a.carry) { const k = S.corpses.find(k => k.id === a.carry); if (k) { k.carriedBy = k.claimedBy = null; k.x = cOf(a) + 0.5; k.y = rOf(a) + 0.5; } }
  S.ants.splice(i, 1);
  if (cause === 'starved') S.deathsStarve++; else S.deathsAge++;
  if (a.away || !inB(cOf(a), rOf(a))) { S.lost++; return; }   // died outside: body never comes back
  S.corpses.push({ id: nextId++, x: cOf(a) + 0.5, y: rOf(a) + 0.5, claimedBy: null, carriedBy: null, heading: a.heading, cause });
}
function moveAnt(a, dt) {
  let budget = C.ant.walkSpeed * dt;
  if (a.task && a.task.type === 'dig' && a.task.phase === 'dig') { digTick(a, dt); return; }
  while (budget > 0) {
    if (!a.path.length) { arrived(a); if (!a.path.length || a.away) break; }
    const [nc, nr] = a.path[0];
    const offGrid = nc < 0 || nc >= COLS;
    if (!offGrid && !walk(nc, nr)) { // tunnel filled in front of us
      a.path = []; const t = a.target;
      if (t) { const p = bfs(cOf(a), rOf(a), (x, y) => x === t[0] && y === t[1]); if (p) { a.path = p; continue; } }
      a.target = null; clearTask(a); break;
    }
    const tx = nc + 0.5, ty = nr + 0.5, dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    if (d > 1e-6) a.heading = Math.atan2(dy, dx);
    if (d <= budget) { a.x = tx; a.y = ty; budget -= d; a.path.shift(); onEnter(a, nc, nr); }
    else { a.x += dx / d * budget; a.y += dy / d * budget; budget = 0; }
    a.step += dt * 14;
  }
  if (!a.path.length && !a.task && !a.away) {
    a.wanderT -= dt;
    if (a.wanderT <= 0 && !a.hold) {
      a.wanderT = rand(C.ai.wanderMin, C.ai.wanderMax);
      const reach = [];
      bfs(cOf(a), rOf(a), (x, y) => { if (y >= SURFACE && cell(x, y) !== PIT && Math.abs(x - cOf(a)) + Math.abs(y - rOf(a)) <= C.ai.wanderRadius) reach.push([x, y]); return false; });
      if (reach.length) { const [x, y] = reach[(Math.random() * reach.length) | 0]; const p = bfs(cOf(a), rOf(a), (u, v) => u === x && v === y); if (p) a.path = p; }
    }
  }
  if (a.carry) { const k = S.corpses.find(k => k.id === a.carry); if (k) { k.x = a.x; k.y = a.y - 0.25; } }
}
function onEnter(a, c, r) {
  if (a.carry && cell(c, r) === PIT) {           // instant disposal
    const idx = S.corpses.findIndex(k => k.id === a.carry);
    if (idx >= 0) { S.corpses.splice(idx, 1); S.disposed++; fx.push({ c, r, t: 0, col: '255,170,90' }); }
    a.carry = null; a.task = null; a.target = null; a.path = [];
    const out = DIRS.map(([dc, dr]) => [c + dc, r + dr]).find(([x, y]) => walk(x, y) && cell(x, y) !== PIT);
    if (out) a.path = [out];
  }
  if (a.food && cell(c, r) === STORE) {           // deposit food
    S.food += a.food; S.foodIn += a.food; a.food = 0; fx.push({ c, r, t: 0, col: '120,220,90' });
    if (a.task && a.task.type === 'forage') { a.task = null; a.hold = false; a.path = []; }
  }
  if (c < 0 || c >= COLS) {                       // walked off-screen
    if (a.task && a.task.type === 'forage' && a.task.phase === 'out') {
      if (Math.random() < C.food.forageLossChance) { const i = S.ants.indexOf(a); clearTask(a); S.ants.splice(i, 1); S.lost++; toast('🐜 A forager never came back…'); return; }
      a.away = true; a.selected = false; a.task.phase = 'away'; a.task.t = C.food.tripTimeOutside; a.path = [];
    }
  }
}
function arrived(a) {
  const t = a.task;
  if (t && t.type === 'fetch') {
    const k = S.corpses.find(k => k.id === t.corpse);
    if (k && !k.carriedBy && cOf(k) === cOf(a) && rOf(k) === rOf(a)) { k.carriedBy = k.claimedBy = a.id; a.carry = k.id; deliverToPit(a); }
    else if (k && !k.carriedBy) { assignHaul(a, k) || (a.task = null); }
    else a.task = null;
    return;
  }
  if (t && t.type === 'deliver') { if (a.carry) deliverToPit(a); else a.task = null; return; }
  if (t && t.type === 'dig') {
    const m = S.marks.get(t.key);
    if (!m || m.by !== a.id) { a.task = null; return; }
    if (Math.abs(m.c - cOf(a)) + Math.abs(m.r - rOf(a)) === 1) { t.phase = 'dig'; a.heading = Math.atan2(m.r - rOf(a), m.c - cOf(a)); }
    else { m.by = null; a.task = null; assignDig(a, t.key); }
    return;
  }
  if (t && t.type === 'forage' && t.phase === 'back') { // reached path end without store (store unreachable)
    const p = pathFrom(a, (x, y) => cell(x, y) === STORE); if (p && p.length) a.path = p; else a.task = null; return;
  }
  a.target = null;
}
function digTick(a, dt) {
  const m = S.marks.get(a.task.key);
  if (!m || m.by !== a.id) { a.task = null; return; }
  m.progress = (m.progress || 0) + dt; a.step += dt * 25;
  if (m.progress >= C.dig.digTime) {
    S.grid[key(m.c, m.r)] = m.egg ? EGG : TUNNEL; S.marks.delete(a.task.key);
    fx.push({ c: m.c, r: m.r, t: 0, col: '230,190,120' });
    a.task = null; a.hold = false;
  }
}
// automatic job choice for idle, non-held ants
function think(a, dt) {
  if (a.hold || a.task || a.carry || a.food || a.away) return;
  a.decideT -= dt; if (a.decideT > 0) return;
  a.decideT = C.ai.decisionInterval * rand(0.7, 1.3);
  const n = S.ants.length;
  const foragers = S.ants.filter(o => o.task && o.task.type === 'forage').length;
  const wantForage = S.food < C.food.targetStock ? Math.max(1, Math.floor(n * C.food.forageShare)) : 0;
  if (foragers < wantForage && assignForage(a)) return;
  if (C.ai.autoHaul && !S.ants.some(o => o.task && (o.task.type === 'fetch' || o.task.type === 'deliver'))) {
    const k = S.corpses.find(k => !k.claimedBy && !k.carriedBy); if (k && assignHaul(a, k)) return;
  }
  if (S.marks.size && assignDig(a)) return;
}

// ---------- effects ----------
const fx = [];
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800); }

// ---------- view ----------
let CS = 20, OX = 0, OY = 0, DPR = 1;
function resize() {
  const w = cv.clientWidth, h = cv.clientHeight; DPR = Math.min(window.devicePixelRatio || 1, 3);
  cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
  CS = Math.min(w / COLS, h / ROWS); OX = (w - CS * COLS) / 2; OY = (h - CS * ROWS) / 2;
}
const toScreen = (x, y) => [OX + x * CS, OY + y * CS];
const toGrid = (px, py) => [(px - OX) / CS, (py - OY) / CS];
const noise = new Float32Array(COLS * ROWS).map(() => Math.random());
function lifeCol(f) { return f > 0.5 ? '#7bd36b' : f > 0.2 ? '#e7c14a' : '#e05a4a'; }

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const w = cv.clientWidth, h = cv.clientHeight;
  ctx.fillStyle = '#1a110a'; ctx.fillRect(0, 0, w, h);
  const [sx, sy] = toScreen(0, 0);
  const g = ctx.createLinearGradient(0, sy, 0, sy + CS * SURFACE);
  g.addColorStop(0, '#7ec8f0'); g.addColorStop(1, '#cdeefa');
  ctx.fillStyle = g; ctx.fillRect(sx, sy, CS * COLS, CS * SURFACE);
  // grass tufts + sun
  ctx.fillStyle = '#ffe58a'; ctx.beginPath(); ctx.arc(sx + CS * 2, sy + CS * 0.9, CS * 0.6, 0, 7); ctx.fill();
  ctx.fillStyle = '#4f9a3a'; ctx.fillRect(sx, sy + CS * (SURFACE - 0.28), CS * COLS, CS * 0.28);
  ctx.strokeStyle = '#3f8a2c'; ctx.lineWidth = 1.5;
  for (let c = 0; c < COLS; c += 1) { if (cell(c, SURFACE) !== SOIL && c === 10) continue; const x = sx + (c + noise[c] * .8) * CS, y = sy + CS * (SURFACE - 0.28);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y - CS * 0.35); ctx.moveTo(x + 3, y); ctx.lineTo(x + 5, y - CS * 0.3); ctx.stroke(); }
  for (let r = SURFACE; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const v = cell(c, r), [x, y] = toScreen(c, r), n = noise[key(c, r)], depth = (r - SURFACE) / (ROWS - SURFACE);
    if (v === SOIL) ctx.fillStyle = `hsl(28,${42 - depth * 10}%,${36 - depth * 12 + n * 5}%)`;
    else if (v === ROCK) ctx.fillStyle = `hsl(30,6%,${40 + n * 8}%)`;
    else if (v === QUEEN) ctx.fillStyle = `hsl(300,18%,${18 + n * 3}%)`;
    else if (v === STORE) ctx.fillStyle = `hsl(95,22%,${17 + n * 3}%)`;
    else if (v === EGG) ctx.fillStyle = `hsl(210,22%,${20 + n * 3}%)`;
    else if (v === PIT) ctx.fillStyle = '#050302';
    else ctx.fillStyle = `hsl(30,30%,${15 + n * 3}%)`;
    ctx.fillRect(x, y, CS + 0.6, CS + 0.6);
    if (v === SOIL && n > 0.82) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x + CS * .3, y + CS * .4, CS * .18, CS * .18); }
    if (v === ROCK) { ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.strokeRect(x + 1, y + 1, CS - 2, CS - 2); }
  }
  // dig marks
  for (const m of S.marks.values()) {
    const [x, y] = toScreen(m.c, m.r);
    ctx.fillStyle = m.egg ? 'rgba(120,170,255,.28)' : 'rgba(255,220,120,.22)'; ctx.fillRect(x + 1, y + 1, CS - 2, CS - 2);
    ctx.strokeStyle = m.egg ? 'rgba(150,190,255,.9)' : 'rgba(255,220,120,.85)'; ctx.lineWidth = 1; ctx.setLineDash([3, 2]); ctx.strokeRect(x + 1.5, y + 1.5, CS - 3, CS - 3); ctx.setLineDash([]);
    if (m.progress) { ctx.fillStyle = 'rgba(255,230,150,.9)'; ctx.fillRect(x + 2, y + CS - 5, (CS - 4) * Math.min(1, m.progress / C.dig.digTime), 3); }
  }
  // labels
  const label = (t, c, r, col) => { const [x, y] = toScreen(c, r); ctx.fillStyle = col; ctx.font = `bold ${Math.max(9, CS * 0.48)}px system-ui`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(t, x, y + 2); };
  label(`PIT · ${S.disposed}`, 5, 18, '#ffb36b');
  label(`FOOD ${Math.floor(S.food)}`, 2, 12, '#a6e07a');
  // food piles in the store
  { let n = Math.min(Math.floor(S.food), 36), i = 0;
    for (let r = 10; r <= 11 && n > 0; r++) for (let c = 2; c <= 4 && n > 0; c++) { if (cell(c, r) !== STORE) continue;
      for (let j = 0; j < 6 && n > 0; j++, n--, i++) { const [x, y] = toScreen(c + 0.2 + (j % 3) * 0.3, r + 0.35 + ((j / 3) | 0) * 0.35); ctx.fillStyle = i % 2 ? '#8fd16a' : '#e6c35c'; ctx.beginPath(); ctx.arc(x, y, CS * 0.11, 0, 7); ctx.fill(); } } }
  for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; const [x, y] = toScreen(f.c + 0.5, f.r + 0.5);
    ctx.strokeStyle = `rgba(${f.col},${1 - f.t})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, CS * (0.3 + f.t * 1.2), 0, 7); ctx.stroke(); }
  // eggs
  for (const e of S.eggs) { const [x, y] = toScreen(e.c + 0.5, e.r + 0.5);
    ctx.fillStyle = '#f6f1e3'; ctx.beginPath(); ctx.ellipse(x, y, CS * 0.2, CS * 0.28, 0.3, 0, 7); ctx.fill();
    ctx.strokeStyle = '#8be0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, CS * 0.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * e.t / C.egg.hatchTime); ctx.stroke(); }
  // queen
  { const [x, y] = toScreen(S.queen.c + 0.5, S.queen.r + 0.5); drawAnt(x, y, Math.PI, CS * 1.9, '#5a1f4f', '#8b3a7a', false, S.time * 2);
    ctx.font = `${CS * 0.8}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('👑', x, y - CS * 0.45);
    ctx.strokeStyle = S.queenStatus ? '#e05a4a' : '#ff8be0'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.arc(x, y, CS * 1.25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (S.queenStatus ? 1 : S.layT / C.queen.layInterval)); ctx.stroke(); }
  for (const k of S.corpses) { const [x, y] = toScreen(k.x, k.y);
    drawAnt(x, y, k.heading || 0, CS * 1.1, '#6f6a64', '#8d8780', true, 0);
    if (!k.carriedBy) { ctx.font = `${CS * 0.5}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('💀', x, y - CS * 0.2); }
    if (k.claimedBy && !k.carriedBy) { ctx.strokeStyle = '#ffb36b'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(x, y, CS * 0.55, 0, 7); ctx.stroke(); ctx.setLineDash([]); } }
  for (const a of S.ants) {
    if (a.away) continue;
    const [x, y] = toScreen(a.x, a.y);
    if (a.selected) { ctx.fillStyle = 'rgba(255,215,90,.25)'; ctx.strokeStyle = '#ffd75a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, CS * 0.62, 0, 7); ctx.fill(); ctx.stroke(); }
    const digging = a.task && a.task.type === 'dig' && a.task.phase === 'dig';
    drawAnt(x + (digging ? Math.sin(a.step) * 1.2 : 0), y, a.heading, CS * 1.15, a.hungry ? '#4a1410' : '#1b0f08', '#3a2112', false, a.step);
    if (a.food) { ctx.fillStyle = '#8fd16a'; ctx.beginPath(); ctx.arc(x + Math.cos(a.heading) * CS * 0.5, y + Math.sin(a.heading) * CS * 0.5, CS * 0.16, 0, 7); ctx.fill(); }
    const f = 1 - a.age / a.life, bw = CS * 0.8;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x - bw / 2, y - CS * 0.62, bw, 3);
    ctx.fillStyle = lifeCol(f); ctx.fillRect(x - bw / 2, y - CS * 0.62, bw * f, 3);
    if (a.hungry) { ctx.font = `${CS * 0.45}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('🍽️', x, y - CS * 0.65); }
  }
  for (const a of S.ants) if (a.selected && a.target && a.path.length) {
    const [x, y] = toScreen(a.target[0] + 0.5, a.target[1] + 0.5);
    ctx.strokeStyle = 'rgba(255,215,90,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke();
  }
  if (selBox) { ctx.fillStyle = 'rgba(255,215,90,.15)'; ctx.strokeStyle = '#ffd75a'; ctx.lineWidth = 1.5;
    const x = Math.min(selBox.x0, selBox.x1), y = Math.min(selBox.y0, selBox.y1), bw = Math.abs(selBox.x1 - selBox.x0), bh = Math.abs(selBox.y1 - selBox.y0);
    ctx.fillRect(x, y, bw, bh); ctx.strokeRect(x, y, bw, bh); }
}
function drawAnt(x, y, ang, size, c1, c2, dead, phase) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); if (dead) ctx.scale(1, -1);
  const s = size / 2; ctx.strokeStyle = c1; ctx.lineWidth = Math.max(1, s * 0.09);
  for (let i = -1; i <= 1; i++) { const sw = dead ? 0.4 : Math.sin(phase + i * 2) * 0.35;
    ctx.beginPath(); ctx.moveTo(i * s * 0.25, 0); ctx.lineTo(i * s * 0.25 + sw * s * 0.4, -s * 0.55); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i * s * 0.25, 0); ctx.lineTo(i * s * 0.25 - sw * s * 0.4, s * 0.55); ctx.stroke(); }
  ctx.fillStyle = c1; ctx.beginPath(); ctx.ellipse(-s * 0.55, 0, s * 0.38, s * 0.28, 0, 0, 7); ctx.fill();
  ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.22, s * 0.16, 0, 0, 7); ctx.fill();
  ctx.fillStyle = c1; ctx.beginPath(); ctx.arc(s * 0.42, 0, s * 0.2, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s * 0.55, -s * 0.08); ctx.lineTo(s * 0.85, -s * 0.3); ctx.moveTo(s * 0.55, s * 0.08); ctx.lineTo(s * 0.85, s * 0.3); ctx.stroke();
  ctx.restore();
}

// ---------- HUD ----------
function taskName(a) {
  const t = a.task; if (a.away) return 'foraging outside';
  if (!t) return a.hold ? 'holding (player order)' : 'idle';
  return t.type === 'dig' ? (t.phase === 'dig' ? 'digging' : 'going to dig') : t.type === 'forage' ? (t.phase === 'back' ? 'bringing food' : 'heading outside') :
         t.type === 'fetch' ? 'fetching a body' : 'carrying body to pit';
}
function hud() {
  const away = S.ants.filter(a => a.away).length;
  $('sAnts').textContent = S.ants.length; $('sEggs').textContent = S.eggs.length; $('sFood').textContent = Math.floor(S.food);
  $('sOut').textContent = away; $('sCorpses').textContent = S.corpses.length; $('sDisposed').textContent = S.disposed;
  $('sLost').textContent = S.lost; $('sStarved').textContent = S.deathsStarve;
  const t = S.time | 0; $('sTime').textContent = `${(t / 60) | 0}:${String(t % 60).padStart(2, '0')}`;
  const p = S.queenStatus ? 0 : S.layT / C.queen.layInterval;
  $('queenFill').style.width = (p * 100).toFixed(1) + '%'; $('queenPct').textContent = S.queenStatus || Math.floor(p * 100) + '%';
  $('queenPct').style.color = S.queenStatus ? '#ff8b7a' : '';
  const sel = S.ants.filter(a => a.selected), lb = $('lifeBar');
  if (sel.length === 1) {
    const a = sel[0], f = 1 - a.age / a.life;
    $('infoText').textContent = `Ant #${a.id} · ${taskName(a)} · life ${a.age | 0}/${a.life | 0}s${a.hungry ? ' · STARVING' : ''}`;
    lb.style.display = 'block'; $('lifeFill').style.width = (f * 100) + '%'; $('lifeFill').style.background = lifeCol(f);
  } else {
    lb.style.display = 'none';
    $('infoText').textContent = sel.length ? `${sel.length} selected – tap tunnel=move, ⛏️cell=dig, grass=forage, 💀=haul` :
      S.tool === 'ants' ? (S.ants.length ? 'Tap an ant or drag a box to select. Idle ants work on their own.' : 'The queen is laying the first egg…') :
      S.tool === 'dig' ? 'Dig: drag over soil to mark it – ants will dig it out.' : S.tool === 'fill' ? 'Fill: drag over tunnels to fill them (or unmark digs).' :
      'Egg room: drag over tunnels/soil to make egg chamber space (drag again to remove).';
  }
}

// ---------- input ----------
let ptr = null, selBox = null;
function setTool(t) { S.tool = t; ['Ants', 'Dig', 'Fill', 'Egg'].forEach(n => $('b' + n).classList.toggle('on', t === n.toLowerCase())); }
function occupied(c, r) {
  return S.ants.some(a => !a.away && ((cOf(a) === c && rOf(a) === r) || (a.path[0] && a.path[0][0] === c && a.path[0][1] === r))) ||
         S.corpses.some(k => cOf(k) === c && rOf(k) === r) || S.eggs.some(e => e.c === c && e.r === r);
}
function paint(px, py) {
  const [gx, gy] = toGrid(px, py), c = Math.floor(gx), r = Math.floor(gy);
  if (!inB(c, r) || r < SURFACE) return;
  const v = cell(c, r), k = key(c, r), m = S.marks.get(k), warn = msg => { if (!ptr.warned) { toast(msg); ptr.warned = 1; } };
  if (S.tool === 'dig') {
    if (v === SOIL && !m) S.marks.set(k, { c, r, egg: false, by: null, progress: 0 });
    else if (v === ROCK) warn('Rock is too hard to dig');
  } else if (S.tool === 'fill') {
    if (m) { const a = S.ants.find(a => a.id === m.by); if (a) a.task = null; S.marks.delete(k); }
    else if (v === TUNNEL || v === EGG) { if (occupied(c, r)) return warn("Can't fill on top of an ant, egg or body"); S.grid[k] = SOIL; }
  } else if (S.tool === 'egg') {
    if (ptr.mode == null) ptr.mode = (v === EGG || (m && m.egg)) ? 'remove' : 'add';
    if (ptr.mode === 'add') { if (v === TUNNEL) S.grid[k] = EGG; else if (v === SOIL) { if (m) m.egg = true; else S.marks.set(k, { c, r, egg: true, by: null, progress: 0 }); } }
    else { if (v === EGG && !S.eggs.some(e => e.c === c && e.r === r)) S.grid[k] = TUNNEL; else if (m) m.egg = false; }
  }
}
function paintLine(x0, y0, x1, y1) { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (CS / 3))); for (let i = 1; i <= n; i++) paint(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); }
function pos(e) { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
cv.addEventListener('pointerdown', e => {
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  const [x, y] = pos(e); selBox = null;
  ptr = { id: e.pointerId, x0: x, y0: y, x, y, moved: false };
  if (S.tool !== 'ants') paint(x, y);
  e.preventDefault();
});
cv.addEventListener('pointermove', e => {
  if (!ptr || e.pointerId !== ptr.id) return; const [x, y] = pos(e);
  if (S.tool !== 'ants') paintLine(ptr.x, ptr.y, x, y);
  else if (ptr.moved || Math.hypot(x - ptr.x0, y - ptr.y0) > Math.max(12, CS * 0.7)) { ptr.moved = true; selBox = { x0: ptr.x0, y0: ptr.y0, x1: x, y1: y }; }
  ptr.x = x; ptr.y = y; e.preventDefault();
});
const endPtr = e => {
  if (!ptr || e.pointerId !== ptr.id) return;
  if (S.tool === 'ants' && e.type === 'pointerup') { if (ptr.moved && selBox) boxSelect(); else tap(ptr.x0, ptr.y0); }
  else if (S.tool === 'dig' && e.type === 'pointerup' && S.marks.size && !S.ants.length) toast('Marked – ants will dig once the colony has workers');
  ptr = null; selBox = null;
};
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('lostpointercapture', e => { if (ptr && e.pointerId === ptr.id) { ptr = null; selBox = null; } });
cv.addEventListener('contextmenu', e => e.preventDefault());

function boxSelect() {
  const [ax, ay] = toGrid(Math.min(selBox.x0, selBox.x1), Math.min(selBox.y0, selBox.y1));
  const [bx, by] = toGrid(Math.max(selBox.x0, selBox.x1), Math.max(selBox.y0, selBox.y1));
  let n = 0; S.ants.forEach(a => { a.selected = !a.away && a.x >= ax && a.x <= bx && a.y >= ay && a.y <= by; if (a.selected) n++; });
  toast(n ? `${n} ant(s) selected` : 'No ants in that box');
}
function nearest(list, gx, gy, rad) { let best = null, bd = rad; for (const o of list) { const d = Math.hypot(o.x - gx, o.y - gy); if (d < bd) { bd = d; best = o; } } return best; }
function tap(px, py) {
  const [gx, gy] = toGrid(px, py), sel = S.ants.filter(a => a.selected && !a.away);
  const ant = nearest(S.ants.filter(a => !a.away), gx, gy, 0.9);
  const corpse = nearest(S.corpses.filter(k => !k.carriedBy), gx, gy, 0.9);
  if (corpse && sel.length && (!ant || Math.hypot(corpse.x - gx, corpse.y - gy) <= Math.hypot(ant.x - gx, ant.y - gy) || ant.selected)) {
    const a = haulCorpse(corpse, sel); if (a) a.hold = false;
    toast(a ? `Ant #${a.id} will haul the body to the pit` : 'No selected free ant can reach that body'); return;
  }
  if (ant) { ant.selected = !ant.selected; return; }
  if (corpse) { toast('Select an ant first, then tap the body'); return; }
  const c = Math.floor(gx), r = Math.floor(gy);
  if (!inB(c, r)) { sel.forEach(a => a.selected = false); return; }
  const egg = S.eggs.find(e => e.c === c && e.r === r);
  if (!sel.length) {
    if (Math.hypot(gx - S.queen.c - .5, gy - S.queen.r - .5) < 1.3) toast(S.queenStatus ? `Queen: ${S.queenStatus}` : `Queen: next egg in ${Math.ceil(C.queen.layInterval - S.layT)}s`);
    else if (egg) toast(`Egg hatches in ${Math.ceil(C.egg.hatchTime - egg.t)}s`);
    else toast('Select ants first (tap one or drag a box)');
    return;
  }
  const m = S.marks.get(key(c, r));
  if (m) { // player override: dig this cell
    const free = sel.filter(a => !a.carry && !a.food).sort((p, q) => Math.hypot(p.x - gx, p.y - gy) - Math.hypot(q.x - gx, q.y - gy));
    if (m.by) { const o = S.ants.find(o => o.id === m.by); if (o) o.task = null; m.by = null; }
    const a = free.find(a => assignDig(a, key(c, r)));
    if (a) { a.hold = true; toast(`Ant #${a.id} will dig there`); } else toast('No selected ant can reach that spot – dig next to a tunnel');
    return;
  }
  if (r < SURFACE) { // forage order
    let n = 0; for (const a of sel) if (assignForage(a)) { a.hold = true; n++; }
    toast(n ? `${n} ant(s) sent out to forage` : 'Those ants can’t reach the surface'); return;
  }
  orderMove(sel, c, r);
}

function btn(id, fn) { const el = $(id); el.addEventListener('pointerdown', e => { e.preventDefault(); fn(); }); el.addEventListener('click', e => { if (e.detail === 0) fn(); }); }
btn('bAnts', () => setTool('ants'));
btn('bDig', () => setTool('dig'));
btn('bFill', () => setTool('fill'));
btn('bEgg', () => setTool('egg'));
btn('bSpeed', () => { const i = C.speeds.indexOf(S.speed); S.speed = C.speeds[(i + 1) % C.speeds.length]; $('bSpeed').textContent = `▶ ${S.speed}x`; $('bSpeed').classList.toggle('on', S.speed > 1); });
btn('bAll', () => { S.ants.forEach(a => a.selected = !a.away); setTool('ants'); toast(`${S.ants.filter(a => a.selected).length} ants selected`); });
btn('bNone', () => S.ants.forEach(a => a.selected = false));
btn('bAuto', () => { const sel = S.ants.filter(a => a.selected), list = sel.length ? sel : S.ants; list.forEach(a => { a.hold = false; if (a.task && a.task.type !== 'forage') clearTask(a); }); toast(`${list.length} ant(s) back on auto jobs`); });
btn('bHaul', () => { setTool('ants'); haulAll(); });
btn('bNew', () => { if (confirm('Start a new colony?')) { const sp = S.speed; newGame(); S.speed = sp; } });

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  let sim = dt * S.speed * (window.__timeScale ?? 1);
  while (sim > 0) { const d = Math.min(sim, 0.05); step(d); sim -= d; }
  for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt * 1.5; if (fx[i].t >= 1) fx.splice(i, 1); }
  draw(); hud(); requestAnimationFrame(frame);
}
window.addEventListener('resize', resize);
newGame(); resize(); requestAnimationFrame(frame);

window.game = { get S() { return S; }, get ptr() { return ptr; }, CONFIG: C, step, cell, walk, newGame, makeAnt, key,
  T: { SOIL, TUNNEL, QUEEN, PIT, ROCK, STORE, EGG, SURF, SKY }, COLS, ROWS, SURFACE,
  cellToClient(c, r) { const b = cv.getBoundingClientRect(); const [x, y] = toScreen(c + 0.5, r + 0.5); return [b.left + x, b.top + y]; },
  posToClient(x, y) { const b = cv.getBoundingClientRect(); const [sx, sy] = toScreen(x, y); return [b.left + sx, b.top + sy]; } };
})();
