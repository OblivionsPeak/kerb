// world.js — the terrarium. Draws the world state it is given and animates the
// events it is told about. All state lives in the Python backend.
//
//   createWorld(container, { token, name, onPickItem, onPickChest, onTapCrab, onPickPet }) -> { update(payload), dispose() }
//   (onPickPet(pet) is called with payload.pet when the shrimp in the tide pool is clicked)

import * as THREE from 'three';
import { OrbitControls } from '/vendor/OrbitControls.js';

/* ───────────────────────────── helpers ───────────────────────────── */

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
const angDiff = (to, from) => { let d = (to - from) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const easeOutBack = (k) => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

function hashStr(s) {
  let h = 2166136261;
  s = String(s);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────────────────────────── layout ───────────────────────────── */

const HALF_X = 6.5, HALF_Z = 4.5, BASE_H = 0.46;
const SAND = 0xd8c49a, CORAL = 0xe9764c;
const POOL = { x: -3.8, z: 0.8, r: 1.6, level: -0.06 };
const DUNE = { x: -0.8, z: -2.6 };
const HOLLOW = { x: 5.2, z: -1.7 };
const LEDGE = { x: 3.8, z: 1.9, w: 3.6, d: 2.2, top: 0.34 };
// a hook under the limb that reaches over the hollow; one thing hangs from it on a thread
const HOOK = { x: 5.55, y: 1.1, z: -1.39 };
// the tool chest stands at the back of the ledge; things put away go into its top drawer
const CHEST = { x: LEDGE.x, z: LEDGE.z - 0.72, w: 1.5, h: 0.62, d: 0.6, y: LEDGE.top + 0.04 };
const LOG_A = new THREE.Vector3(1.2, 0.1, -1.2);
const LOG_B = new THREE.Vector3(4.6, 1.6, -3.0);
const LOG_DX = LOG_B.x - LOG_A.x, LOG_DZ = LOG_B.z - LOG_A.z;
const LOG_LEN2 = LOG_DX * LOG_DX + LOG_DZ * LOG_DZ;
const LOG_HLEN = Math.sqrt(LOG_LEN2);
const LOG_COS = LOG_HLEN / LOG_A.distanceTo(LOG_B);
const LOG_TOP_T = 0.74;
const LOG_R0 = 0.42, LOG_R1 = 0.34;
const TIDE_IDLE = -0.102, TIDE_SURGE = -0.028;

// the second tank, to the right of the first and joined to it by a glass tube
const G2 = { x0: 8.1, x1: 18.1, cx: 13.1 };
const TUBE = { z: 0.45, r: 0.85, floor: 0.12 };
const MOSS = { x: 9.9, z: -2.7 };
const SPRING = { x: 16.3, z: -2.5, r: 0.95, level: -0.03 };
const BED = { x: 13.2, z: -2.55, w: 3.0, d: 1.5, top: 0.17 };
const CAVE = { x: 16.9, z: 0.2 };          // its mouth faces the front glass
const TRACK = { x: 12.4, z: 2.35, L: 1.5, r: 1.05 };
const BOOK = { x: 11.2, z: -0.7 };

// a point on the oval track, u from 0 to 1, starting mid front straight and heading right
function trackPt(u, R = TRACK.r) {
  const L = TRACK.L, per = 4 * L + TAU * R;
  let d = (((u % 1) + 1) % 1) * per;
  if (d < L) return { x: TRACK.x + d, z: TRACK.z + R };
  d -= L;
  if (d < Math.PI * R) { const a = d / R; return { x: TRACK.x + L + Math.sin(a) * R, z: TRACK.z + Math.cos(a) * R }; }
  d -= Math.PI * R;
  if (d < 2 * L) return { x: TRACK.x + L - d, z: TRACK.z - R };
  d -= 2 * L;
  if (d < Math.PI * R) { const a = d / R; return { x: TRACK.x - L - Math.sin(a) * R, z: TRACK.z - Math.cos(a) * R }; }
  d -= Math.PI * R;
  return { x: TRACK.x - L + d, z: TRACK.z + R };
}
function laneAt(x, z) {       // 1 on the racing lane, 0 off it
  const dx = Math.max(0, Math.abs(x - TRACK.x) - TRACK.L);
  return 1 - sstep(0.3, 0.46, Math.abs(Math.hypot(dx, z - TRACK.z) - TRACK.r));
}
const mossAt = (x, z) => Math.exp(-((x - MOSS.x) ** 2 / (2 * 0.95 * 0.95) + (z - MOSS.z) ** 2 / (2 * 0.9 * 0.9)));

function sandH1(x, z) {
  const edge = sstep(0, 0.7, Math.min(HALF_X - Math.abs(x), HALF_Z - Math.abs(z)));
  const dp = Math.hypot(x - POOL.x, z - POOL.z);
  const dry = 1 - sstep(2.3, 1.5, dp);
  let up = 0;
  const dx = x - DUNE.x, dz = z - DUNE.z;
  up += 0.72 * Math.exp(-(dx * dx / (2 * 1.3 * 1.3) + dz * dz / (2 * 0.95 * 0.95)));
  up += dry * (0.024 * Math.sin(x * 3.1 + z * 1.3 + Math.sin(z * 0.9) * 1.2) + 0.013 * Math.sin(z * 4.3 - x * 0.8));
  up += 0.035 * Math.exp(-Math.pow((dp - 2.05) / 0.28, 2));           // soft lip round the pool
  let down = 0;
  down += 0.4 * sstep(1.9, 0.6, dp);
  const dh = Math.hypot(x - HOLLOW.x, z - HOLLOW.z);
  down += 0.16 * Math.exp(-(dh * dh) / (2 * 0.75 * 0.75));
  const dc = Math.hypot(x + HALF_X, z + HALF_Z);
  down += 0.13 * sstep(3.3, 0.6, dc);
  return up * edge - down;
}
function gardenH(x, z) {
  const edge = sstep(0, 0.7, Math.min(x - G2.x0, G2.x1 - x, HALF_Z - Math.abs(z)));
  let up = 0.03 + 0.02 * Math.sin(x * 2.3 + z * 1.1) + 0.012 * Math.sin(z * 3.7 - x * 0.6);
  up += 0.4 * mossAt(x, z);
  const lane = laneAt(x, z);
  up = up * (1 - 0.85 * lane) - 0.015 * lane;
  const down = 0.32 * sstep(SPRING.r + 0.25, 0.3, Math.hypot(x - SPRING.x, z - SPRING.z));
  return up * edge - down;
}
// the ground anywhere: first tank, the floor of the tube, second tank
function sandH(x, z) {
  let h = x <= HALF_X ? sandH1(x, z) : x < G2.x0 ? TUBE.floor : gardenH(x, z);
  const side = 1 - sstep(0.4, 0.8, Math.abs(z - TUBE.z));       // a low ramp up to each end of the tube
  if (side > 0) {
    const k = x <= HALF_X ? sstep(HALF_X - 0.9, HALF_X - 0.1, x) : sstep(G2.x0 + 0.9, G2.x0 + 0.1, x);
    h = lerp(h, TUBE.floor, k * side);
  }
  return h;
}
const logT = (x, z) => ((x - LOG_A.x) * LOG_DX + (z - LOG_A.z) * LOG_DZ) / LOG_LEN2;
const logTopY = (t) => lerp(LOG_A.y, LOG_B.y, t) + lerp(LOG_R0, LOG_R1, clamp(t, 0, 1)) / LOG_COS;
const logPt = (t) => ({ x: LOG_A.x + LOG_DX * t, z: LOG_A.z + LOG_DZ * t, log: true });
const support = (x, z, onLog) => (onLog ? logTopY(logT(x, z)) - 0.04 : sandH(x, z));
const ptY = (p) => support(p.x, p.z, !!p.log);

const LOG_TOP = logPt(LOG_TOP_T);
const LOG_FOOT = { x: LOG_A.x - (LOG_DX / LOG_HLEN) * 0.75, z: LOG_A.z - (LOG_DZ / LOG_HLEN) * 0.75 };

// where the crab stands at each place, and which way it ends up facing (yaw; 0 = toward the viewer)
const ANCHOR = {
  glass: { x: 0, z: 3.3, face: 0 },
  pool: { x: -2.7, z: 1.42, face: Math.atan2(POOL.x + 2.7, POOL.z - 1.42) },
  tideline: { x: -4.35, z: -2.55, face: -1.9 },
  dune: { x: DUNE.x, z: DUNE.z, face: 0.3 },
  driftwood: { x: LOG_TOP.x, z: LOG_TOP.z, face: 0.25, log: true },
  hollow: { x: HOLLOW.x, z: HOLLOW.z, face: -0.75 },
  ledge: { x: 1.35, z: 2.3, face: Math.atan2(LEDGE.x - 1.35, LEDGE.z - 2.3) },
  workshop: { x: -0.7, z: 0.35, face: 0.9 },
  patch: { x: 2.3, z: -0.3, face: 1.45 },
  moss: { x: 10.0, z: -2.1, face: 0.5 },
  spring: { x: 15.3, z: -1.6, face: Math.atan2(SPRING.x - 15.3, SPRING.z + 1.6) },
  garden: { x: BED.x, z: -1.25, face: Math.PI },
  cave: { x: CAVE.x, z: 1.55, face: Math.PI },
  track: { x: TRACK.x, z: TRACK.z + TRACK.r, face: Math.PI / 2 },
  library: { x: BOOK.x, z: BOOK.z + 0.95, face: Math.PI },
};
const anchorOf = (place) => ANCHOR[place] || ANCHOR.glass;

// things the crab walks around
const ROCKS = [
  { x: 4.95, z: -3.4, r: 0.95 }, { x: 5.75, z: -3.55, r: 0.6 }, { x: 6.05, z: -0.55, r: 0.7 },
  { x: -2.25, z: 2.75, r: 0.45 }, { x: -5.65, z: 2.2, r: 0.5 },
];
function distToLog(x, z) {
  const t = clamp(logT(x, z), -0.1, 1.08);
  return Math.hypot(x - (LOG_A.x + LOG_DX * t), z - (LOG_A.z + LOG_DZ * t));
}
const ROCKS2 = [
  { x: 17.2, z: -3.5, r: 0.9 }, { x: 17.55, z: -2.2, r: 0.55 }, { x: 15.6, z: -3.75, r: 0.5 },
  { x: 16.05, z: 0.2, r: 0.7 }, { x: 17.75, z: 0.2, r: 0.7 }, { x: 16.9, z: -0.6, r: 0.6 },
  { x: BOOK.x, z: BOOK.z, r: 0.5 },
];
function blockedAt(x, z, m, walking) {
  if (x > HALF_X - 0.25) {
    if (x < G2.x0 + 0.25) return Math.abs(z - TUBE.z) > 0.34 ? 40 : 0;   // the walls between the tanks
    if (Math.hypot(x - SPRING.x, z - SPRING.z) < SPRING.r + (walking ? 0.15 : 0.3)) return 41;
    if (Math.abs(x - BED.x) < BED.w / 2 + m && Math.abs(z - BED.z) < BED.d / 2 + m) return 42;
    for (let i = 0; i < ROCKS2.length; i++) {
      if (Math.hypot(x - ROCKS2[i].x, z - ROCKS2[i].z) < ROCKS2[i].r + m * 0.6) return 43 + i;
    }
    return 0;
  }
  if (walking && Math.hypot(x - POOL.x, z - POOL.z) < 1.5) return 99;   // walk round the water, don't wade through it
  if (Math.abs(x - LEDGE.x) < LEDGE.w / 2 + m && Math.abs(z - LEDGE.z) < LEDGE.d / 2 + m) return 1;
  if (distToLog(x, z) < 0.42 + m) return 2;
  for (let i = 0; i < ROCKS.length; i++) {
    if (Math.hypot(x - ROCKS[i].x, z - ROCKS[i].z) < ROCKS[i].r + m * 0.6) return 3 + i;
  }
  return 0;
}
function segBlocked(a, b) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(2, Math.ceil(len / 0.15));
  const ignore = new Set([blockedAt(a.x, a.z, 0.45, true), blockedAt(b.x, b.z, 0.45, true)]);
  for (let i = 1; i < n; i++) {
    const k = i / n;
    const hit = blockedAt(lerp(a.x, b.x, k), lerp(a.z, b.z, k), 0.45, true);
    // an obstacle an endpoint already sits beside only counts once we are well clear of that endpoint
    if (hit && !(ignore.has(hit) && (k * len < 0.9 || (1 - k) * len < 0.9))) return true;
  }
  return false;
}
const VIAS = [
  { x: 0.4, z: 0.6 }, { x: -1.6, z: 0.5 }, { x: 0.9, z: 3.2 }, { x: -2.4, z: -1.7 },
  { x: 1.3, z: 0.1 }, { x: 5.9, z: 0.3 }, { x: 0.2, z: -1.3 },
  { x: 6.15, z: TUBE.z }, { x: 8.55, z: TUBE.z },                      // the two mouths of the tube
  { x: 10.4, z: 0.3 }, { x: 13.0, z: 0.2 }, { x: 14.7, z: 0.4 }, { x: 12.3, z: -1.15 },
  { x: 14.9, z: -1.0 }, { x: 15.9, z: 2.7 }, { x: 9.2, z: 2.4 },
];
function routeSand(from, to) {
  const nodes = [from, to, ...VIAS];
  const n = nodes.length;
  const dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) break;
    if (u === 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      if (segBlocked(nodes[u], nodes[v])) continue;
      const d = dist[u] + Math.hypot(nodes[u].x - nodes[v].x, nodes[u].z - nodes[v].z);
      if (d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  if (dist[1] === Infinity) return [from, to];
  const out = [];
  for (let i = 1; i >= 0; i = prev[i]) out.unshift(nodes[i]);
  return out;
}

/* ───────────────────────────── item slots ───────────────────────────── */

function scatterOk(place, x, z) {
  const second = x > HALF_X;
  if (second !== (anchorOf(place).x > HALF_X)) return false;          // stay in the place's own tank
  if (second ? (x < G2.x0 + 0.5 || x > G2.x1 - 0.5 || laneAt(x, z) > 0.05) : Math.abs(x) > 6.0) return false;
  if (Math.abs(z) > 4.0) return false;
  if (blockedAt(x, z, 0.28)) return false;
  const h = sandH(x, z);
  if (place !== 'pool' && Math.hypot(x - POOL.x, z - POOL.z) < 1.75 && h < POOL.level + 0.03) return false;
  if (place === 'pool' && h < POOL.level - 0.2) return false;
  if (Math.hypot(x - LOG_FOOT.x, z - LOG_FOOT.z) < 0.6) return false;
  if (h < TIDE_IDLE + 0.03 && Math.hypot(x + HALF_X, z + HALF_Z) < 3) return false;
  for (const k in ANCHOR) {
    if (k === place || ANCHOR[k].log) continue;
    if (Math.hypot(x - ANCHOR[k].x, z - ANCHOR[k].z) < 0.7) return false;
  }
  return true;
}
const scatterCache = {};
function scatterSlots(place, count) {
  const c = scatterCache[place] || (scatterCache[place] = { k: 0, list: [] });
  const a = anchorOf(place);
  const phase = (hashStr(place) % 628) / 100;
  while (c.list.length < count && c.k < 4000) {
    const k = c.k++;
    const r = 1.2 + 0.3 * Math.sqrt(k * 0.8);
    const ang = phase + k * 2.39996;
    const x = a.x + Math.sin(ang) * r, z = a.z + Math.cos(ang) * r;
    if (scatterOk(place, x, z)) c.list.push({ x, z });
  }
  return c.list;
}
function slotFor(place, index) {
  if (place === 'hook') return new THREE.Vector3(HOOK.x, HOOK.y - 0.52, HOOK.z);
  if (place === 'chest') return new THREE.Vector3(CHEST.x, CHEST.y + CHEST.h * 0.72, CHEST.z + CHEST.d / 2 + 0.1);
  if (place === 'ledge') {
    if (index < 8) {    // eight favourites, two rows of four with room to breathe
      const col = index % 4, row = Math.floor(index / 4);
      return new THREE.Vector3(LEDGE.x - 1.2 + col * 0.8 + (row ? 0.0 : 0.0), LEDGE.top, LEDGE.z + 0.8 - row * 0.56);
    }
    if (index < 24) {   // more than eight: squeezed in between and beside, until some are put away
      const i = index - 8, col = i % 8, row = Math.floor(i / 8);
      return new THREE.Vector3(LEDGE.x - 1.6 + col * (3.2 / 7), LEDGE.top, LEDGE.z + 0.52 - row * 0.56);
    }
    index -= 24;        // and beyond that, on the sand around the crab's spot
  }
  if (place === 'driftwood' && index < 8) {
    const step = Math.floor(index / 2) + 1;
    const t = index % 2 === 0 ? LOG_TOP_T + 0.045 + step * 0.05 : LOG_TOP_T - 0.09 - step * 0.075;
    if (t > 0.12 && t < 0.99) {
      const p = logPt(t);
      return new THREE.Vector3(p.x, logTopY(t) - 0.03, p.z);
    }
  }
  const key = ANCHOR[place] ? place : 'glass';
  const list = scatterSlots(key, index + 1);
  const s = list[index] || anchorOf(key);
  return new THREE.Vector3(s.x, sandH(s.x, s.z) - 0.012, s.z);
}

/* ───────────────────────────── small builders ───────────────────────────── */

function limb(a, b, r1, r2, mat, radial = 8) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, radial, 1), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  m.castShadow = true;
  return m;
}
function jitterGeo(geo, amount, seed) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = rng(hashStr(`${seed}|${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`));
    const k = 1 + (r() - 0.5) * 2 * amount;
    p.setXYZ(i, x * k, y * (1 + (r() - 0.5) * 2 * amount), z * (1 + (r() - 0.5) * 2 * amount));
  }
  geo.computeVertexNormals();
  return geo;
}
function canvasTex(size, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
    }
  });
}

/* ───────────────────────────── item meshes ───────────────────────────── */

const NAMED = [
  ['green', 0x4f9a6a], ['blue', 0x4a86c8], ['amber', 0xd99a2b], ['red', 0xc8443a], ['brass', 0xc9a24a],
  ['steel', 0x9aa4ad], ['black', 0x2a2c30], ['white', 0xece8df], ['copper', 0xb87342], ['silver', 0xc3c8cc],
  ['gold', 0xd4af37], ['grey', 0x8a8f94], ['gray', 0x8a8f94], ['pink', 0xe08fa3], ['purple', 0x8662b8],
  ['violet', 0x8662b8], ['yellow', 0xe2c544], ['orange', 0xe0812f], ['brown', 0x8a5a3a], ['cream', 0xeadfc3],
  ['teal', 0x3f9c98], ['rust', 0xa5502e], ['bronze', 0xa97142], ['pearl', 0xeee6da],
];
const PALETTE = {
  shell: [0xe9d9b8, 0xd9b98c, 0xc79f74, 0xf0e2cc, 0xd4a98a],
  pebble: [0x8a8f94, 0x6f757b, 0xa37a6a, 0x9c5a4a, 0xb0aaa0],
  seaglass: [0x7fc7a5, 0x7fb5d6, 0xcfe6dc, 0xd9a441],
  cap: [0xc8443a, 0x4a86c8, 0xd4af37, 0x2f7d4f, 0xece8df],
  nut: [0x9aa4ad, 0xc9a24a, 0x7a8087],
  washer: [0x9aa4ad, 0xc9a24a, 0x7a8087],
  feather: [0xece8df, 0xb9c0c6, 0x7d8fa6, 0x9a7b5c],
  coin: [0xb87342, 0xc3c8cc, 0xd4af37],
  button: [0xc8443a, 0x4a86c8, 0xece8df, 0x2a2c30, 0xd99a2b, 0x4f9a6a],
  marble: [0x4a86c8, 0x4f9a6a, 0xd99a2b, 0xc8443a, 0x8662b8, 0x3f9c98],
  key: [0xc9a24a, 0x9aa4ad, 0x8a6a3a],
  trinket: [0xe0507a, 0x4ac0d0, 0x9a6ae0, 0xf0b040, 0x50c878],
  scrap: [0xefe6cf, 0xe8dcc0, 0xf2ead8],
  seed: [0x8a6a3a, 0x5a4630, 0xb99a62, 0x6f7a48],
  treat: [0xc8443a, 0xd9502f, 0x8e2f5a, 0xe0812f, 0x6a3fa0],      // [plans] berry colours
};
function itemColor(item) {
  const name = String(item.name || '').toLowerCase();
  const fixed = shapeColor(item, name); if (fixed) return fixed;      // [shapes]
  for (const [w, c] of NAMED) if (new RegExp(`\\b${w}`).test(name)) return new THREE.Color(c);
  const pal = PALETTE[item.kind] || PALETTE.pebble;
  const h = hashStr(name || String(item.id));
  const col = new THREE.Color(pal[h % pal.length]);
  col.offsetHSL((((h >>> 8) % 100) / 100 - 0.5) * 0.04, 0, (((h >>> 16) % 100) / 100 - 0.5) * 0.08);
  return col;
}

const PIXEL = { K: 0x16181c, W: 0xf2efe6, G: 0x8d939b, R: 0xc8443a, O: 0xe08a2e, Y: 0xe8c547,
  L: 0x4f9a6a, T: 0x3f9c98, B: 0x4a86c8, P: 0x8662b8, N: 0x8a6a3a, S: 0xe6c9a0 };

function buildItemMesh(item) {
  const g = new THREE.Group();
  const col = itemColor(item);
  const r = rng(hashStr(`${item.id}|${item.name}`));
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ color: col, roughness: 0.6, metalness: 0 }, o));
  const metal = (o) => std(Object.assign({ metalness: 0.6, roughness: 0.4, envMapIntensity: 1.5 }, o));
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };

  const kind = shapeFor(item, { g, col, std, metal, add });      // [shapes] draws a find's own shape, or says which kind's to use
  if (kind) switch (kind) {      // [shapes]
    case 'shell': {
      const m1 = std({ roughness: 0.5 }), m2 = std({ color: col.clone().multiplyScalar(0.74), roughness: 0.5 });
      let x = 0, rad = 0.105;
      for (let i = 0; i < 6; i++) {
        const s = add(new THREE.SphereGeometry(rad, 16, 12), i % 2 ? m2 : m1, x, 0, 0);
        s.scale.set(0.72, 1, 1);
        x += rad * 0.62; rad *= 0.74;
      }
      const tip = add(new THREE.ConeGeometry(rad * 1.1, 0.07, 10), m1, x + 0.01, 0, 0);
      tip.rotation.z = -Math.PI / 2;
      const mouth = add(new THREE.SphereGeometry(0.07, 12, 10), std({ color: 0xf3d9c8, roughness: 0.35 }), -0.045, -0.03, 0.055);
      mouth.scale.set(0.7, 0.8, 0.6);
      g.rotation.z = 0.2;
      break;
    }
    case 'seaglass': {
      const geo = jitterGeo(new THREE.CylinderGeometry(0.13, 0.15, 0.05, 7, 1), 0.1, item.id);
      const m = add(geo, new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.5, transparent: true, opacity: 0.74, envMapIntensity: 1.1 }));
      m.scale.set(1.25, 1, 0.85);
      g.rotation.z = 0.08;
      break;
    }
    case 'cap': {
      const skirtGeo = new THREE.CylinderGeometry(0.125, 0.135, 0.055, 42, 1, true);
      const p = skirtGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) < 0) { const k = i % 2 ? 1.1 : 0.97; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
      }
      skirtGeo.computeVertexNormals();
      add(skirtGeo, metal({ side: THREE.DoubleSide, roughness: 0.45 }));
      add(new THREE.CylinderGeometry(0.125, 0.125, 0.012, 32), metal({ roughness: 0.42 }), 0, 0.027, 0);
      add(new THREE.CylinderGeometry(0.07, 0.07, 0.004, 24), std({ color: 0xf2ead8, roughness: 0.5 }), 0, 0.034, 0);
      break;
    }
    case 'nut': {
      const s = new THREE.Shape();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        if (i === 0) s.moveTo(Math.cos(a) * 0.125, Math.sin(a) * 0.125); else s.lineTo(Math.cos(a) * 0.125, Math.sin(a) * 0.125);
      }
      s.closePath();
      const hole = new THREE.Path();
      hole.absarc(0, 0, 0.06, 0, TAU, true);
      s.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.085, bevelEnabled: false, curveSegments: 20 });
      geo.rotateX(-Math.PI / 2);
      add(geo, metal({ roughness: 0.42 }));
      break;
    }
    case 'washer': {
      const geo = new THREE.TorusGeometry(0.095, 0.034, 10, 30);
      geo.rotateX(Math.PI / 2);
      add(geo, metal({ roughness: 0.4 })).scale.y = 0.5;
      break;
    }
    case 'feather': {
      const s = new THREE.Shape();
      s.moveTo(0, -0.19);
      s.bezierCurveTo(0.075, -0.12, 0.07, 0.1, 0, 0.2);
      s.bezierCurveTo(-0.06, 0.1, -0.065, -0.1, 0, -0.19);
      const vane = add(new THREE.ShapeGeometry(s, 10), std({ side: THREE.DoubleSide, roughness: 0.9 }));
      vane.rotation.x = -Math.PI / 2;
      g.add(limb(new THREE.Vector3(0, 0.004, 0.26), new THREE.Vector3(0, 0.004, -0.19), 0.007, 0.003, std({ color: 0xf4eedf, roughness: 0.7 }), 6));
      g.rotation.z = 0.28;
      g.rotation.x = 0.1;
      break;
    }
    case 'coin': {
      const m = metal({ roughness: 0.34, envMapIntensity: 1.6 });
      add(new THREE.CylinderGeometry(0.105, 0.105, 0.018, 32), m);
      const rim = new THREE.TorusGeometry(0.097, 0.007, 6, 32);
      rim.rotateX(Math.PI / 2);
      add(rim, m, 0, 0.009, 0);
      add(new THREE.CylinderGeometry(0.05, 0.055, 0.008, 20), m, 0, 0.012, 0);
      g.rotation.z = 0.06;
      break;
    }
    case 'button': {
      const m = std({ roughness: 0.35 });
      add(new THREE.CylinderGeometry(0.105, 0.105, 0.03, 30), m);
      const rim = new THREE.TorusGeometry(0.09, 0.014, 8, 30);
      rim.rotateX(Math.PI / 2);
      add(rim, m, 0, 0.015, 0);
      const hm = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 });
      for (const [hx, hz] of [[-0.03, -0.03], [0.03, -0.03], [-0.03, 0.03], [0.03, 0.03]]) {
        add(new THREE.CylinderGeometry(0.014, 0.014, 0.034, 10), hm, hx, 0, hz);
      }
      break;
    }
    case 'marble': {
      add(new THREE.SphereGeometry(0.1, 28, 20), new THREE.MeshPhysicalMaterial({
        color: col, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.8,
        emissive: col, emissiveIntensity: 0.12,
      }));
      break;
    }
    case 'key': {
      const m = metal({ roughness: 0.36 });
      const bow = new THREE.TorusGeometry(0.058, 0.017, 8, 24);
      bow.rotateX(Math.PI / 2);
      add(bow, m, -0.12, 0, 0);
      add(new THREE.BoxGeometry(0.22, 0.022, 0.032), m, 0.045, 0, 0);
      add(new THREE.BoxGeometry(0.03, 0.022, 0.05), m, 0.135, 0, 0.035);
      add(new THREE.BoxGeometry(0.025, 0.022, 0.035), m, 0.085, 0, 0.03);
      break;
    }
    case 'trinket': {
      const geo = new THREE.OctahedronGeometry(0.11, 0);
      const m = add(geo, new THREE.MeshPhysicalMaterial({
        color: col, roughness: 0.1, metalness: 0.1, flatShading: true, clearcoat: 1, envMapIntensity: 2,
        emissive: col, emissiveIntensity: 0.22,
      }));
      m.scale.set(0.95, 1.3, 0.95);
      g.rotation.set(0.5, 0, 0.45);
      break;
    }
    case 'made': {
      // something the crab made itself: its own pixel picture, stood up as little blocks
      const cells = [];
      (Array.isArray(item.px) ? item.px : []).forEach((row, y) => {
        for (let x = 0; x < row.length; x++) if (PIXEL[row[x]] !== undefined) cells.push([x, y, PIXEL[row[x]]]);
      });
      const s = 0.04;
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(s, s, 0.07),
        new THREE.MeshStandardMaterial({ roughness: 0.7 }), Math.max(1, cells.length));
      const m4 = new THREE.Matrix4(), cc = new THREE.Color();
      cells.forEach(([x, y, c], i) => { m4.makeTranslation((x - 5.5) * s, (11 - y) * s, 0); im.setMatrixAt(i, m4); im.setColorAt(i, cc.set(c)); });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingBox();
      g.add(im);
      break;
    }
    case 'seed': {
      const m = add(new THREE.SphereGeometry(0.07, 12, 10), std({ roughness: 0.6 }));
      m.scale.set(1.5, 0.75, 0.9);
      add(new THREE.ConeGeometry(0.03, 0.07, 8), std({ color: col.clone().multiplyScalar(0.7) }), 0.11, 0, 0).rotation.z = -Math.PI / 2;
      g.rotation.z = 0.15;
      break;
    }
    case 'treat': {     // [plans] something to eat: a berry with a stalk and a leaf
      const berry = add(new THREE.SphereGeometry(0.095, 18, 14), std({ roughness: 0.35 }));
      berry.scale.set(1, 0.9, 1);
      const green = std({ color: 0x4f8a3a, roughness: 0.7 });
      add(new THREE.CylinderGeometry(0.006, 0.008, 0.07, 6), green, 0.01, 0.11, 0).rotation.z = -0.3;
      const leaf = add(new THREE.SphereGeometry(0.045, 10, 8), green, -0.035, 0.088, 0);
      leaf.scale.set(1.2, 0.18, 0.6);
      leaf.rotation.z = 0.35;
      break;
    }
    case 'scrap': {
      // a torn scrap of newsprint: a cream sheet with a few lines of print
      const paper = new THREE.MeshStandardMaterial({ color: 0xefe6cf, roughness: 0.95 });
      const ink = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1 });
      add(new THREE.BoxGeometry(0.34, 0.012, 0.25), paper);
      add(new THREE.BoxGeometry(0.24, 0.004, 0.035), ink, -0.02, 0.008, -0.075);
      for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.27 - i * 0.04, 0.004, 0.014), ink, -0.01 - i * 0.02, 0.008, -0.02 + i * 0.04);
      g.rotation.set(0.06, 0, -0.05);
      break;
    }
    case 'pebble':
    default: {
      const geo = jitterGeo(new THREE.IcosahedronGeometry(0.135, 2), 0.07, item.id);
      const m = add(geo, std({ roughness: 0.85, color: col }));
      m.scale.set(1.25, 0.62, 1);
      break;
    }
  }

  // wrap: sit the bottom on y = 0, centre it, give it a stable yaw and a generous hit target
  const outer = new THREE.Group();
  outer.add(g);
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g, true);
  const c = box.getCenter(new THREE.Vector3());
  g.position.set(-c.x, -box.min.y, -c.z);
  const yaw = new THREE.Group();
  yaw.add(outer);
  yaw.rotation.y = item.kind === 'made' ? (r() - 0.5) * 0.7 : r() * TAU;   // made things face the front
  const root = new THREE.Group();
  root.add(yaw);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const height = box.max.y - box.min.y;
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = height / 2;
  root.add(hit);
  return { root, hit, height };
}

/* ───────────────────────────── finds drawn as what they are  [shapes] ───────────────────────────── */
// buildItemMesh asks shapeFor() first. A find with an entry in SHAPES is drawn from its exact
// name; a thing the person gives is matched by a word in its name (GIFT_WORDS); everything else
// keeps the shape of its kind. Each shape is built resting the way the thing would lie, any
// distance off the ground: buildItemMesh sits its lowest point on y = 0 afterwards.

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const sg = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, seg = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open),
  sph: (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h),
  dome: (r, w = 12, h = 4) => new THREE.SphereGeometry(r, w, h, 0, TAU, 0, Math.PI / 2),
  bowl: (r, w = 12, h = 4) => new THREE.SphereGeometry(r, w, h, 0, TAU, Math.PI / 2, Math.PI / 2),
  cone: (r, h, seg = 10) => new THREE.ConeGeometry(r, h, seg),
  // a ring lying flat on the ground
  ring: (R, t, arc = TAU, around = 20, across = 6) => new THREE.TorusGeometry(R, t, across, around, arc).rotateX(-Math.PI / 2),
  // a profile of [radius, height] points, bottom to top, spun round the upright axis
  lathe: (pts, seg = 12) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg),
  // a flat outline given thickness, lying on the ground (the outline's +y points away, along -z)
  slab: (shape, depth, bevel = 0) => new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 8,
  }).rotateX(-Math.PI / 2),
  poly: (pts) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; },
  disc: (r, hole = 0, hx = 0, hy = 0) => {
    const s = new THREE.Shape();
    s.absarc(0, 0, r, 0, TAU, false);
    if (hole) { const h = new THREE.Path(); h.absarc(hx, hy, hole, 0, TAU, true); s.holes.push(h); }
    return s;
  },
  rrect: (w, h, r) => {
    const s = new THREE.Shape(), x = w / 2 - r, y = h / 2 - r;
    s.absarc(x, y, r, 0, Math.PI / 2, false); s.absarc(-x, y, r, Math.PI / 2, Math.PI, false);
    s.absarc(-x, -y, r, Math.PI, 1.5 * Math.PI, false); s.absarc(x, -y, r, 1.5 * Math.PI, TAU, false);
    s.closePath();
    return s;
  },
  thread: (r, len, n, y0 = 0) => Array.from({ length: n + 1 }, (_, i) => [i % 2 ? r * 0.8 : r, y0 + len * i / n]),
};
// a picture for the flat face of a slab w wide and h deep, centred on the outline's middle
function faceTex(w, h, draw, size = 64) {
  const t = canvasTex(size, draw, 1 / w, 1 / h);
  t.offset.set(0.5, 0.5);
  return t;
}
// many copies of one small shape in a single draw call: [x, y, z, size, turn, colour]
function dots(k, geo, mat, list) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m4 = new THREE.Matrix4(), s3 = new THREE.Vector3(), c = new THREE.Color();
  list.forEach(([x, y, z, s = 1, ry = 0, col], i) => {
    m4.makeRotationY(ry).scale(s3.set(s, s, s)).setPosition(x, y, z);
    im.setMatrixAt(i, m4);
    if (col !== undefined) im.setColorAt(i, c.set(col));
  });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.computeBoundingBox();
  k.g.add(im);
  return im;
}
// a low dome with ribs running down it from the top: a cockle, a scallop, a limpet
function ribDome(r, h, ws, arc = TAU, start = 0, lean = 0) {
  const geo = new THREE.SphereGeometry(r, ws, 4, start, arc, 0, Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const kk = (i % (ws + 1)) % 2 ? 0.88 : 1.04, y = p.getY(i);
    p.setXYZ(i, p.getX(i) * kk + lean * y, y * (h / r), p.getZ(i) * kk);
  }
  geo.computeVertexNormals();
  return geo;
}
function taperX(geo, amount) {
  geo.computeBoundingBox();
  const b = geo.boundingBox, p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * (1 - amount * (p.getX(i) - b.min.x) / (b.max.x - b.min.x)));
  geo.computeVertexNormals();
  return geo;
}
// the rounded pebble of the kind shape, or with detail 0 or 1 an angular lump
function stone(k, o = {}) {
  const geo = jitterGeo(new THREE.IcosahedronGeometry(o.r || 0.135, o.detail === undefined ? 2 : o.detail), o.jit === undefined ? 0.07 : o.jit, k.seed);
  const m = k.add(geo, o.mat || k.std({ roughness: 0.85 }));
  const s = o.scale || [1.25, 0.62, 1];
  m.scale.set(s[0], s[1], s[2]);
  return m;
}
// specks scattered over the top of a stone of radius r and scale s
function flecks(k, n, r, s, size, color) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const a = k.r() * TAU, y = 0.15 + k.r() * 0.8, h = Math.sqrt(1 - y * y);
    list.push([Math.cos(a) * h * r * s[0], y * r * s[1], Math.sin(a) * h * r * s[2], 0.7 + k.r() * 0.8]);
  }
  return dots(k, sg.sph(size, 5, 4), k.std({ color, roughness: 0.9 }), list);
}
// balls shrinking along a spiral: flat for an ammonite, climbing to a point for a snail shell
function coil(k, n, r0, c, lift, squash, colA, colB) {
  const f = Math.pow((c - 1) / (c + 1), (1.1 / c) / TAU), list = [];
  let a = 0, rad = 1;
  for (let i = 0; i < n; i++) {
    list.push([Math.cos(a) * c * r0 * rad, (1 - rad) * lift, Math.sin(a) * c * r0 * rad, rad, 0, i % 2 ? colB : colA]);
    a += 1.1 / c; rad *= f;
  }
  return dots(k, sg.sph(r0, 8, 6).scale(1, squash, 1), k.std({ color: 0xffffff, roughness: 0.6 }), list);
}
// a pointed crystal with flat sides, lying along +x
function crystalGeo(len, rad, sides) {
  return sg.lathe([[0, 0], [rad * 1.1, 0], [rad, len * 0.72], [0, len]], sides).rotateZ(-Math.PI / 2);
}
function gearShape(teeth, ro, rr, hole, spokes = 0, bent = -1) {
  const s = new THREE.Shape(), step = TAU / teeth;
  for (let i = 0; i < teeth; i++) {
    const skew = i === bent ? 0.3 : 0;
    [[0, rr], [0.26, rr], [0.36 + skew, ro], [0.64 + skew, ro], [0.74, rr]].forEach(([t, r], j) => {
      const a = (i + t) * step, x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0 && j === 0) s.moveTo(x, y); else s.lineTo(x, y);
    });
  }
  s.closePath();
  const cut = (x, y, r) => { const h = new THREE.Path(); h.absarc(x, y, r, 0, TAU, true); s.holes.push(h); };
  cut(0, 0, hole);
  for (let i = 0; i < spokes; i++) cut(Math.cos(i / spokes * TAU) * rr * 0.56, Math.sin(i / spokes * TAU) * rr * 0.56, rr * 0.26);
  return s;
}
function featherVane(sx = 1, sy = 1) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.19 * sy);
  s.bezierCurveTo(0.075 * sx, -0.12 * sy, 0.07 * sx, 0.1 * sy, 0, 0.2 * sy);
  s.bezierCurveTo(-0.06 * sx, 0.1 * sy, -0.065 * sx, -0.1 * sy, 0, -0.19 * sy);
  return new THREE.ShapeGeometry(s, 10).rotateX(-Math.PI / 2);
}
// a domed metal button with a badge on its crown
function domedButton(k, badge) {
  const m = k.metal({ roughness: 0.38 });
  k.add(sg.dome(0.1, 16, 4).scale(1, 0.45, 1), m);
  k.add(sg.ring(0.1, 0.011, TAU, 20, 5), m);
  const hex = '#' + k.col.getHexString(), ink = '#' + k.col.clone().multiplyScalar(0.3).getHexString();
  const tex = canvasTex(64, (c, n) => {
    c.fillStyle = hex; c.fillRect(0, 0, n, n);
    c.strokeStyle = c.fillStyle = ink; c.lineWidth = n * 0.07; c.lineCap = 'round';
    badge(c, n);
  });
  k.add(new THREE.CircleGeometry(0.05, 14).rotateX(-Math.PI / 2), k.metal({ color: 0xffffff, map: tex, roughness: 0.45 }), 0, 0.0455, 0);
}
// a glass marble with something caught inside it
function glassMarble(k, inside) {
  k.g.add(inside);
  k.add(sg.sph(0.1, 20, 14), new THREE.MeshPhysicalMaterial({
    color: 0xeef6f4, roughness: 0.03, transparent: true, opacity: 0.36, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 2,
  }));
  k.g.rotation.set(0.4, 0, 0.5);
}
const DIE_PIPS = [[], [[0.5, 0.5]], [[0.27, 0.27], [0.73, 0.73]], [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]], [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]]];

const SHAPES = {    // exact name -> [how to draw it (null: the shape of its kind is right), its colour if the name does not give it]
  /* shells */
  'a spiral shell': [null],
  'a periwinkle shell': [null, 0x2b2a33],
  'a whelk shell': [null, 0xe6dcc8],
  'a fossil shell': [null, 0x8c8478],
  'a broken scallop shell': [(k) => {         // half a fan, lying pink side up
    const geo = ribDome(0.15, 0.045, 8, Math.PI * 0.62);
    k.add(geo, k.std({ roughness: 0.6 }));
    k.add(geo, k.std({ color: 0xe9a0a6, roughness: 0.4, side: THREE.BackSide }));
    k.g.rotation.set(0.25, 0, Math.PI);
  }, 0xe6cdb4],
  'a limpet shell': [(k) => {
    k.add(ribDome(0.11, 0.085, 18), k.std({ roughness: 0.75, side: THREE.DoubleSide }));
    k.add(sg.sph(0.032, 8, 5).scale(1, 0.4, 1), k.std({ color: 0xcfcbc2, roughness: 0.5 }), 0, 0.078, 0);
  }, 0x8f9296],
  'a cowrie shell': [(k) => {                 // lying slit up, the toothed lips paler than the back
    k.add(sg.sph(0.1, 14, 10).scale(1.35, 0.72, 0.95), k.std({ roughness: 0.25 }));
    k.add(sg.sph(0.1, 12, 8).scale(1.25, 0.8, 0.5), k.std({ color: 0xf6eee0, roughness: 0.3 }));
    k.add(sg.sph(0.1, 12, 8).scale(1.15, 0.83, 0.12), k.std({ color: 0x3d2a1e, roughness: 0.8 }));
    flecks(k, 14, 0.1, [1.35, 0.72, 0.95], 0.008, 0x7a5232);
  }, 0xd9b98c],
  'a mussel shell': [(k) => {                 // one half, lying hollow up
    const geo = taperX(sg.bowl(1, 12, 4).scale(0.17, 0.055, 0.085), 0.6);
    k.add(geo, k.std({ roughness: 0.4, side: THREE.DoubleSide }));
    k.add(geo.clone().scale(0.84, 0.9, 0.8), new THREE.MeshPhysicalMaterial({ color: 0xdcd8e8, roughness: 0.22, clearcoat: 1, iridescence: 0.8, side: THREE.BackSide }), 0, 0.002, 0);
    k.g.rotation.x = 0.3;
  }, 0x26304a],
  'a cockle shell': [(k) => {
    k.add(ribDome(0.11, 0.075, 20, TAU, 0, 0.45), k.std({ roughness: 0.65, side: THREE.DoubleSide }));
    k.add(sg.sph(0.022, 8, 6), k.std({ roughness: 0.65 }), 0.085, 0.02, 0);
  }, 0xc99a66],
  "a shark's tooth": [(k) => {
    const blade = new THREE.Shape();
    blade.moveTo(0, 0.17);
    blade.quadraticCurveTo(0.05, 0.06, 0.08, -0.02);
    blade.lineTo(-0.08, -0.02);
    blade.quadraticCurveTo(-0.05, 0.06, 0, 0.17);
    k.add(sg.slab(blade, 0.012, 0.012), k.std({ roughness: 0.18, flatShading: true }));
    const root = sg.poly([[-0.09, -0.01], [0.09, -0.01], [0.085, -0.06], [0.045, -0.072], [0, -0.04], [-0.045, -0.072], [-0.085, -0.06]]);
    k.add(sg.slab(root, 0.018, 0.012), k.std({ color: 0x8a7c68, roughness: 0.85 }), 0, -0.003, 0);
    k.g.rotation.x = -0.22;
  }, 0xaeb6bd],
  'a sand dollar': [(k) => {
    k.add(sg.sph(0.125, 18, 6).scale(1, 0.1, 1), k.std({ roughness: 0.9 }));
    const petals = [];
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; petals.push([Math.cos(a) * 0.055, 0.011, -Math.sin(a) * 0.055, 1, a]); }
    dots(k, sg.sph(0.034, 8, 4).scale(1.5, 0.12, 0.55), k.std({ color: 0xb9ae98, roughness: 0.9 }), petals);
    k.g.rotation.x = 0.3;
  }, 0xf1ece0],
  'a razor clam shell': [(k) => {             // two long halves, still joined down one edge
    const geo = new THREE.CylinderGeometry(0.03, 0.03, 0.36, 6, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.6, 1);
    const m = k.std({ roughness: 0.4, side: THREE.DoubleSide });
    k.add(geo, m, 0, 0, 0.03).rotation.x = 0.28;
    k.add(geo, m, 0, 0, -0.03).rotation.x = -0.28;
  }, 0xb49a62],
  'an ammonite': [(k) => {
    coil(k, 22, 0.046, 2, 0, 0.55, 0x968c7a, 0x6f675a);
    k.add(sg.sph(0.03, 8, 5).scale(1, 0.5, 1), k.std({ color: 0x6f675a, roughness: 0.6 }));
    k.g.rotation.x = 0.3;
  }],
  'a snail shell': [(k) => {
    // a round whorl leaning back, the spiral raised on its upper side and the mouth dark at the front
    k.add(sg.sph(0.1, 14, 10).scale(1, 1, 0.62), k.std({ roughness: 0.5 }));
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, a = t * 2.3 * TAU, rr = 0.088 * (1 - t * 0.86);
      pts.push(V3(Math.cos(a) * rr, Math.sin(a) * rr, 0.062 * Math.sqrt(1 - (rr / 0.1) ** 2) + 0.003));
    }
    k.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.007, 4), k.std({ color: 0xb9b09c, roughness: 0.7 }));
    k.add(sg.sph(0.045, 8, 6).scale(1, 0.9, 0.7), k.std({ color: 0x4a4038, roughness: 0.9 }), 0.078, -0.055, 0.012);
    k.g.rotation.x = -0.95;
  }, 0xf4f1e8],
  'a tiny cone shell': [(k) => {              // a plain cone on its side, pink at the tip
    k.add(sg.cone(0.06, 0.2, 12), k.std({ roughness: 0.4 }));
    k.add(sg.cone(0.023, 0.076, 12), k.std({ color: 0xe08fa3, roughness: 0.4 }), 0, 0.064, 0);
    k.add(sg.cone(0.06, 0.025, 12).rotateX(Math.PI), k.std({ color: 0xd4bf9c, roughness: 0.5 }), 0, -0.1125, 0);
    k.g.rotation.z = Math.PI / 2 - 0.29;
  }, 0xeadfc3],
  'a fish scale': [(k) => {
    k.add(sg.cyl(0.085, 0.085, 0.005, 12).scale(1, 1, 0.82), new THREE.MeshPhysicalMaterial({
      color: k.col, roughness: 0.1, transparent: true, opacity: 0.6, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.7, envMapIntensity: 2 }));
    k.g.rotation.x = 0.35;
  }, 0xdfe8ea],
  'a barnacle plate': [(k) => {               // a ridged wedge, lying on its back
    k.add(ribDome(0.1, 0.13, 4, 1.2, Math.PI / 2 - 0.6), k.std({ roughness: 0.8, side: THREE.DoubleSide, flatShading: true }));
    k.g.rotation.x = -1.05;
  }, 0xeae6da],

  /* pebbles and stones */
  'a striped pebble': [(k) => {
    stone(k);
    k.add(new THREE.TorusGeometry(0.132, 0.016, 5, 18).rotateY(Math.PI / 2), k.std({ color: 0xf0ede6, roughness: 0.8 })).scale.y = 0.62;
  }, 0x8a8f94],
  'a flat black pebble': [null],
  'a red pebble': [null, 0x9c4a38],
  'a speckled pebble': [(k) => { stone(k); flecks(k, 16, 0.137, [1.25, 0.62, 1], 0.012, 0x1c1c1e); }, 0xe9e5da],
  'a green pebble': [null, 0x4f8a6a],
  'a pearl-white pebble': [(k) => { k.add(sg.sph(0.06, 12, 8).scale(1, 0.8, 1), k.std({ roughness: 0.3 })); }, 0xf1ede4],
  'a pebble shaped like a heart': [(k) => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.11);
    s.bezierCurveTo(-0.17, 0.0, -0.11, 0.15, 0, 0.055);
    s.bezierCurveTo(0.09, 0.125, 0.14, 0.0, 0, -0.11);
    k.add(sg.slab(s, 0.04, 0.022), k.std({ roughness: 0.75 }));
    k.g.rotation.x = -0.3;
  }, 0xd98f98],
  'a piece of quartz': [(k) => {
    stone(k, { detail: 1, jit: 0.12, r: 0.12, scale: [1.2, 0.8, 1], mat: k.std({ roughness: 0.35 }) });
    k.add(new THREE.TorusGeometry(0.118, 0.012, 4, 14).rotateY(1.1), k.glass({ color: 0xffffff, opacity: 0.85 })).scale.y = 0.8;
  }, 0xd6d2ca],
  'a piece of flint': [(k) => {               // grey rind, glassy black where it has chipped
    stone(k, { detail: 1, jit: 0.14, r: 0.12, scale: [1.25, 0.7, 1] });
    const chip = k.add(jitterGeo(new THREE.IcosahedronGeometry(0.085, 0), 0.15, k.seed), k.std({ color: 0x101114, roughness: 0.08, flatShading: true }), 0.085, 0.022, 0.03);
    chip.scale.set(1, 0.7, 1);
  }, 0x9a9c98],
  'a hag stone': [(k) => {
    k.add(jitterGeo(new THREE.TorusGeometry(0.076, 0.057, 7, 14), 0.1, k.seed).rotateX(-Math.PI / 2).scale(1.3, 0.62, 0.95), k.std({ roughness: 0.9 }));
    k.g.rotation.x = 0.4;
  }, 0x8a8f94],
  'a lump of amber': [(k) => {                // see-through, with the gnat a dark speck in the middle
    dots(k, sg.sph(0.012, 6, 4).scale(1.8, 0.8, 0.8), k.std({ color: 0x18120c }), [[0, 0, 0, 1, 0.5], [0.012, 0.008, 0.01, 0.7, 2.1], [0.012, 0.008, -0.01, 0.7, -1.0]]);
    stone(k, { r: 0.11, jit: 0.06, scale: [1.2, 0.8, 1], mat: k.glass({ opacity: 0.7, roughness: 0.15, emissive: 0x6a3a08, emissiveIntensity: 0.25 }) });
  }, 0xe09a2a],
  'a pumice stone': [(k) => {
    stone(k, { jit: 0.11, r: 0.125, scale: [1.15, 0.8, 0.95], mat: k.std({ roughness: 1 }) });
    flecks(k, 22, 0.119, [1.15, 0.8, 0.95], 0.011, 0x5d5952);
  }, 0xbdb8ae],
  'a fossil fern': [(k) => {                  // a slate chip with the leaf pressed into the top
    const tex = faceTex(0.3, 0.22, (c, n) => {
      c.fillStyle = '#4a4f55'; c.fillRect(0, 0, n, n);
      c.strokeStyle = '#c9b592'; c.lineCap = 'round'; c.lineWidth = n * 0.035;
      c.beginPath(); c.moveTo(n * 0.14, n * 0.5); c.lineTo(n * 0.86, n * 0.5); c.stroke();
      c.lineWidth = n * 0.05;
      for (let i = 0; i < 6; i++) {
        const x = n * (0.24 + i * 0.1), len = n * (0.3 - i * 0.035);
        c.beginPath(); c.moveTo(x, n * 0.5); c.lineTo(x + n * 0.07, n * 0.5 - len); c.moveTo(x, n * 0.5); c.lineTo(x + n * 0.07, n * 0.5 + len); c.stroke();
      }
    });
    const chip = sg.poly([[-0.14, -0.06], [-0.04, -0.1], [0.12, -0.075], [0.145, 0.03], [0.05, 0.1], [-0.11, 0.08]]);
    k.add(sg.slab(chip, 0.022), [k.std({ color: 0xffffff, map: tex, roughness: 0.8 }), k.std({ color: 0x3c4046, roughness: 0.9 })]);
    k.g.rotation.x = 0.25;
  }],
  'a shard of amethyst': [(k) => {            // two purple crystals grown side by side
    const m = k.glass({ opacity: 0.86, roughness: 0.08, flatShading: true, emissive: k.col, emissiveIntensity: 0.1 });
    k.add(crystalGeo(0.24, 0.05, 5), m);
    k.add(crystalGeo(0.15, 0.034, 5), m, 0.01, -0.012, 0.06).rotation.y = -0.45;
  }, 0x8a5cc4],
  "a lump of fool's gold": [(k) => {          // brassy cubes grown into each other
    const m = k.metal({ roughness: 0.3, metalness: 0.9, envMapIntensity: 1.8 });
    k.add(sg.box(0.12, 0.12, 0.12), m).rotation.set(0.2, 0.3, 0.1);
    k.add(sg.box(0.09, 0.09, 0.09), m, 0.075, 0.01, 0.03).rotation.set(0.5, 0.9, 0.2);
    k.add(sg.box(0.07, 0.07, 0.07), m, -0.05, 0.03, -0.06).rotation.set(0.1, 0.5, 0.7);
    k.add(sg.box(0.055, 0.055, 0.055), m, 0.02, 0.07, -0.02).rotation.set(0.8, 0.2, 0.4);
  }, 0xc9a94a],
  'a piece of obsidian': [(k) => {
    stone(k, { detail: 0, jit: 0.25, r: 0.14, scale: [1.3, 0.42, 0.8], mat: k.std({ roughness: 0.06, metalness: 0.25, flatShading: true, envMapIntensity: 2.2 }) });
  }, 0x0d0e12],
  'a geode half': [(k) => {                   // lying cut face up: a dull rind, a pale rim, sparkle in the hollow
    k.add(sg.bowl(0.13, 10, 4).scale(1, 0.8, 1), k.std({ roughness: 1 }));
    k.add(sg.bowl(0.118, 8, 3).scale(1, 0.75, 1), k.std({ color: 0x9a78d6, roughness: 0.12, metalness: 0.3, flatShading: true,
      emissive: 0x6a48b0, emissiveIntensity: 0.35, side: THREE.BackSide, envMapIntensity: 2 }));
    k.add(sg.ring(0.124, 0.008, TAU, 18, 4), k.std({ color: 0xe9e3ee, roughness: 0.4 }));
    const pts = [];
    for (let i = 0; i < 7; i++) { const a = k.r() * TAU, d = k.r() * 0.07; pts.push([Math.cos(a) * d, -0.075 + d * 0.5, Math.sin(a) * d, 0.7 + k.r() * 0.7, a]); }
    dots(k, new THREE.OctahedronGeometry(0.02, 0), k.std({ color: 0xe6dcf8, roughness: 0.05, flatShading: true, emissive: 0x9a78d6, emissiveIntensity: 0.4 }), pts);
    k.g.rotation.x = 0.4;
  }, 0x6e5a48],
  'a stalactite tip': [(k) => {               // a stone icicle on its side
    const geo = sg.lathe([[0, 0], [0.012, 0.012], [0.026, 0.08], [0.023, 0.1], [0.04, 0.17], [0.037, 0.2], [0.058, 0.27], [0.064, 0.3], [0, 0.3]], 8);
    k.add(geo, k.std({ roughness: 0.4 }));
    k.g.rotation.z = Math.PI / 2 - 0.2;
  }, 0xcbbf9f],
  'a lump of rose quartz': [(k) => {
    stone(k, { detail: 1, jit: 0.13, r: 0.12, scale: [1.15, 0.8, 1], mat: k.glass({ opacity: 0.88, roughness: 0.3 }) });
  }, 0xe8a7b8],
  'a grain of garnet': [(k) => {
    k.add(new THREE.DodecahedronGeometry(0.05, 0), new THREE.MeshPhysicalMaterial({ color: k.col, roughness: 0.08, clearcoat: 1, flatShading: true,
      emissive: k.col, emissiveIntensity: 0.25, envMapIntensity: 2 }));
  }, 0x8a1626],
  'a chip of mother-of-pearl': [(k) => {
    const chip = sg.poly([[-0.09, -0.03], [-0.01, -0.07], [0.09, -0.035], [0.07, 0.05], [-0.03, 0.065]]);
    k.add(sg.slab(chip, 0.008), new THREE.MeshPhysicalMaterial({ color: k.col, roughness: 0.2, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.8, envMapIntensity: 2 }));
    k.g.rotation.x = 0.3;
  }, 0xece6f0],

  /* glass */
  'a piece of green sea glass': [null],
  'a piece of blue sea glass': [null, 0x2f5fb0],
  'a piece of amber sea glass': [null],
  'a piece of pink sea glass': [null],
  'a sliver of clear sea glass': [null, 0xdfeee8],
  'a bottle neck': [(k) => {                  // the lip whole, the other end snapped off jagged
    const geo = sg.cyl(0.045, 0.06, 0.16, 12, true), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, p.getY(i) + (((i % 13) % 12 * 7) % 5 - 2) * 0.014);
    geo.computeVertexNormals();
    const m = k.glass({ opacity: 0.7, side: THREE.DoubleSide });
    k.add(geo, m);
    k.add(sg.ring(0.049, 0.016, TAU, 14, 6), m, 0, 0.08, 0);
    k.g.rotation.z = Math.PI / 2 - 0.12;
  }, 0x4f9a6a],
  'a red glass bead': [(k) => {
    k.add(sg.ring(0.042, 0.038, TAU, 14, 8), k.glass({ opacity: 0.85, emissive: k.col, emissiveIntensity: 0.15 }));
    k.g.rotation.x = 0.55;
  }, 0xc8443a],
  'a bead of green glass': [(k) => {          // a drop, lying on its side
    k.add(sg.lathe([[0, 0], [0.036, 0.012], [0.056, 0.05], [0.05, 0.09], [0.024, 0.14], [0, 0.19]], 12), k.glass({ opacity: 0.8, emissive: k.col, emissiveIntensity: 0.12 }));
    k.g.rotation.z = Math.PI / 2 - 0.3;
  }, 0x4f9a6a],
  'a marble stopper': [(k) => {
    k.add(sg.sph(0.085, 18, 12), k.glass({ opacity: 0.5, roughness: 0.04, clearcoat: 1, envMapIntensity: 2 }));
  }, 0xbfe3d6],
  'a shard of willow-pattern china': [(k) => {
    const tex = faceTex(0.28, 0.22, (c, n) => {
      c.fillStyle = '#f3f1ea'; c.fillRect(0, 0, n, n);
      c.strokeStyle = c.fillStyle = '#2f55a8'; c.lineWidth = n * 0.045;
      c.beginPath(); c.moveTo(n * 0.1, n * 0.52); c.quadraticCurveTo(n * 0.45, n * 0.3, n * 0.8, n * 0.52); c.stroke();      // the bridge
      for (const x of [0.3, 0.48, 0.66]) { c.beginPath(); c.arc(n * x, n * 0.6, n * 0.07, Math.PI, TAU); c.stroke(); }
      c.fillRect(n * 0.1, n * 0.6, n * 0.75, n * 0.04);
      c.fillRect(0, n * 0.8, n, n * 0.05); c.fillRect(0, n * 0.89, n, n * 0.025);                                            // the border
      for (const [x, y] of [[0.2, 0.2], [0.3, 0.14], [0.72, 0.2]]) { c.beginPath(); c.arc(n * x, n * y, n * 0.05, 0, TAU); c.fill(); }
    });
    const chip = sg.poly([[-0.12, -0.08], [0.1, -0.1], [0.135, 0.04], [0.01, 0.105], [-0.1, 0.05]]);
    k.add(sg.slab(chip, 0.014), [k.std({ color: 0xffffff, map: tex, roughness: 0.2 }), k.std({ color: 0xe9e6dc, roughness: 0.6 })]);
    k.g.rotation.x = 0.3;
  }],
  'a lens': [(k) => {
    k.add(sg.sph(0.1, 18, 8).scale(1, 0.24, 1), k.glass({ opacity: 0.42, roughness: 0.02, clearcoat: 1, envMapIntensity: 2.6 }));
    k.add(sg.ring(0.099, 0.006, TAU, 20, 4), k.glass({ opacity: 0.8, color: 0x9fc0c8 }));
    k.g.rotation.x = 0.4;
  }, 0xe6f2f4],
  'a clear crystal point': [(k) => {
    k.add(crystalGeo(0.28, 0.043, 6), k.glass({ opacity: 0.62, roughness: 0.04, flatShading: true, emissive: 0x8fb8c8, emissiveIntensity: 0.18, envMapIntensity: 2.2 }));
  }, 0xe9f4f8],
  'a sliver of mica': [(k) => {               // thin flakes, one on another
    const m = k.glass({ opacity: 0.5, roughness: 0.08, metalness: 0.4, envMapIntensity: 2.2 });
    k.add(sg.cyl(0.1, 0.1, 0.004, 6).scale(1.1, 1, 0.7), m);
    k.add(sg.cyl(0.085, 0.085, 0.004, 5).scale(1.1, 1, 0.75), m, 0.02, 0.006, 0.01).rotation.y = 0.5;
    k.add(sg.cyl(0.06, 0.06, 0.004, 5), m, -0.02, 0.012, -0.01).rotation.y = 1.2;
    k.g.rotation.x = 0.2;
  }, 0xdcd4bd],

  /* caps */
  'a red bottle cap': [null], 'a green bottle cap': [null], 'a yellow bottle cap': [null],
  'a tyre valve cap': [(k) => {
    const m = k.std({ roughness: 0.5, flatShading: true });
    k.add(sg.cyl(0.05, 0.058, 0.11, 9), m);
    k.add(sg.dome(0.05, 9, 3).scale(1, 0.5, 1), m, 0, 0.055, 0);
  }, 0x1e1f22],
  'an oil filler cap': [(k) => {              // ribbed round the rim, the little oil can on top
    const m = k.std({ roughness: 0.6 });
    k.add(sg.cyl(0.115, 0.122, 0.05, 18), m);
    const lugs = [];
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; lugs.push([Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12, 1, a]); }
    dots(k, sg.box(0.03, 0.044, 0.04), m, lugs);
    const tex = canvasTex(64, (c, n) => {
      c.fillStyle = '#1b1c1f'; c.fillRect(0, 0, n, n);
      c.fillStyle = c.strokeStyle = '#e2c544'; c.lineWidth = n * 0.06; c.lineCap = 'round';
      c.fillRect(n * 0.26, n * 0.46, n * 0.3, n * 0.2);
      c.beginPath(); c.moveTo(n * 0.56, n * 0.56); c.lineTo(n * 0.78, n * 0.38); c.stroke();
      c.beginPath(); c.arc(n * 0.36, n * 0.44, n * 0.08, Math.PI, TAU); c.stroke();
      c.beginPath(); c.arc(n * 0.82, n * 0.56, n * 0.035, 0, TAU); c.fill();
    });
    k.add(new THREE.CircleGeometry(0.095, 18).rotateX(-Math.PI / 2), k.std({ color: 0xffffff, map: tex, roughness: 0.6 }), 0, 0.0258, 0);
  }, 0x1b1c1f],

  /* nuts and bolts */
  'a wheel nut': [null, 0x6b5f58],
  'a small brass nut': [null],
  'a lug nut': [(k) => {                      // closed at the top, with a tapered seat
    const m = k.metal({ roughness: 0.5, flatShading: true });
    k.add(sg.cyl(0.058, 0.08, 0.03, 12), k.metal({ roughness: 0.5 }), 0, 0.015, 0);
    k.add(sg.cyl(0.08, 0.08, 0.085, 6), m, 0, 0.0725, 0);
    k.add(sg.dome(0.066, 12, 4).scale(1, 0.7, 1), k.metal({ roughness: 0.4 }), 0, 0.115, 0);
  }, 0xb4b9be],
  'a spark plug cap': [(k) => {               // a ribbed ceramic sleeve with a metal collar
    k.add(sg.lathe([[0, 0], [0.044, 0], [0.05, 0.02], [0.05, 0.06], [0.041, 0.07], [0.05, 0.08], [0.05, 0.1], [0.041, 0.11], [0.05, 0.12],
      [0.044, 0.16], [0.03, 0.18], [0, 0.18]], 12), k.std({ roughness: 0.35 }));
    k.add(sg.cyl(0.056, 0.056, 0.036, 12), k.metal({ color: 0x9aa4ad }), 0, 0.03, 0);
    k.add(sg.cyl(0.024, 0.024, 0.004, 10), k.std({ color: 0x1a1a1c }), 0, -0.001, 0);
    k.g.rotation.z = Math.PI / 2;
  }, 0xe9e2d0],
  'a wheel stud': [(k) => {                   // a threaded bolt with a flanged head, lying down
    k.add(sg.lathe([[0, 0], [0.03, 0]].concat(sg.thread(0.036, 0.18, 14, 0.005), [[0.03, 0.19], [0.056, 0.19], [0.056, 0.215], [0, 0.215]]), 10), k.metal({ roughness: 0.45 }));
    k.g.rotation.z = Math.PI / 2;
  }, 0x7e848a],
  'a brass rivet': [(k) => {
    const m = k.metal({ roughness: 0.4 });
    k.add(sg.dome(0.07, 12, 4).scale(1, 0.65, 1), m);
    k.add(sg.cyl(0.03, 0.03, 0.11, 10), m, 0, -0.055, 0);
    k.add(sg.ring(0.068, 0.008, TAU, 16, 4), k.std({ color: 0x5f9a7a, roughness: 0.9 }));
    k.g.rotation.z = 1.05;
  }],
  'a rusted wing nut': [(k) => {
    const m = k.std({ roughness: 0.95, metalness: 0.25 });
    k.add(sg.cyl(0.042, 0.055, 0.065, 10), m, 0, 0.0325, 0);
    k.add(sg.cyl(0.02, 0.02, 0.004, 8), k.std({ color: 0x2a1a12 }), 0, 0.066, 0);
    for (const s of [-1, 1]) {
      const w = k.add(sg.sph(0.05, 8, 6).scale(1, 1.15, 0.26), m, s * 0.075, 0.085, 0);
      w.rotation.z = -s * 0.55;
    }
  }],

  /* rings and wire */
  'a steel washer': [null],
  'a rubber o-ring': [(k) => { k.add(sg.ring(0.1, 0.02, TAU, 24, 8), k.std({ roughness: 0.75 })); k.g.rotation.x = 0.12; }, 0x18191b],
  'a split pin': [(k) => {                    // an eye and two legs bent apart
    const m = k.metal({ roughness: 0.4 });
    k.add(sg.ring(0.028, 0.01, TAU, 12, 5), m, -0.105, 0, 0);
    k.g.add(limb(V3(-0.08, 0, 0.008), V3(0.14, 0, 0.055), 0.009, 0.007, m, 6));
    k.g.add(limb(V3(-0.08, 0, -0.008), V3(0.12, 0, -0.04), 0.009, 0.007, m, 6));
  }, 0x9aa4ad],
  'a bent paper clip': [(k) => {              // one loop left, the rest pulled out nearly straight
    const pts = [[-0.19, 0.0, 0.1], [-0.12, 0.0, 0.05], [-0.02, 0, 0.036], [0.07, 0, 0.035], [0.1, 0, 0], [0.07, 0, -0.035], [-0.07, 0, -0.035],
      [-0.1, 0, -0.012], [-0.07, 0, 0.01], [0.03, 0, 0.012]].map((p) => V3(p[0], p[1], p[2]));
    k.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 44, 0.007, 5), k.metal({ roughness: 0.35 }));
  }, 0xaab2b8],
  'a piston ring': [(k) => { k.add(sg.ring(0.11, 0.01, TAU - 0.32, 26, 4).scale(1, 1.7, 1), k.metal({ roughness: 0.35 })); k.g.rotation.x = 0.12; }, 0x7f868c],
  'a curtain ring': [(k) => {
    const m = k.metal({ roughness: 0.35 });
    k.add(sg.ring(0.105, 0.013, TAU, 26, 6), m);
    k.add(sg.ring(0.022, 0.007, TAU, 10, 5), m, 0.138, 0, 0);
  }, 0xc9a24a],
  'ring': [(k) => { k.add(sg.ring(0.085, 0.014, TAU, 24, 6).scale(1, 1.5, 1), k.metal({ roughness: 0.25, envMapIntensity: 1.8 })); k.g.rotation.x = 0.15; }, 0xd4af37],

  /* feathers */
  'a grey feather': [null], 'a white feather': [null], 'a blue feather': [null],
  'a striped feather': [(k) => {
    const tex = faceTex(0.16, 0.42, (c, n) => {
      c.fillStyle = '#eadfc3'; c.fillRect(0, 0, n, n);
      c.fillStyle = '#7a5232';
      for (let i = 0; i < 6; i++) c.fillRect(0, n * (0.06 + i * 0.16), n, n * 0.075);
    });
    k.add(featherVane(), k.std({ color: 0xffffff, map: tex, side: THREE.DoubleSide, roughness: 0.9 }));
    k.g.add(limb(V3(0, 0.004, 0.26), V3(0, 0.004, -0.19), 0.007, 0.003, k.std({ color: 0xf4eedf, roughness: 0.7 }), 6));
    k.g.rotation.set(0.1, 0, 0.28);
  }],
  'a quill': [(k) => {                        // a long bare shaft cut to a point, dark with ink
    k.add(featherVane(0.85, 1.05), k.std({ side: THREE.DoubleSide, roughness: 0.9 }), 0, 0, -0.1);
    k.g.add(limb(V3(0, 0.004, 0.33), V3(0, 0.004, -0.3), 0.009, 0.003, k.std({ color: 0xf4eedf, roughness: 0.6 }), 6));
    k.g.add(limb(V3(0, 0.004, 0.33), V3(0, 0.004, 0.41), 0.009, 0.001, k.std({ color: 0x1b2440, roughness: 0.5 }), 6));
    k.g.rotation.set(0.1, 0, 0.28);
  }, 0xe9e6dc],

  /* coins and discs */
  'a small copper coin': [null],
  'an arcade token': [null, 0xc9a24a],
  'an old silver coin': [null, 0x55555a],
  'a brass token': [null],
  'a foreign coin': [(k) => { k.add(sg.slab(sg.disc(0.1, 0.024), 0.016), k.metal({ roughness: 0.34, envMapIntensity: 1.6 })); k.g.rotation.x = 0.18; }, 0xc3c8cc],
  'a very old token': [(k) => { k.add(sg.slab(sg.disc(0.095, 0.017, 0.04, 0.012), 0.016), k.std({ roughness: 0.75, metalness: 0.35 })); k.g.rotation.x = 0.18; }, 0x5f9a7a],
  'a sequin': [(k) => { k.add(sg.slab(sg.disc(0.062, 0.013), 0.004), k.metal({ roughness: 0.3, metalness: 0.7, envMapIntensity: 2.4 })); k.g.rotation.x = 0.32; }, 0xe6eaee],
  'a hammered coin': [(k) => {                // not quite round, a cross cut into it
    k.add(jitterGeo(sg.cyl(0.1, 0.1, 0.014, 9), 0.09, k.seed), k.metal({ roughness: 0.5 }));
    const dark = k.std({ color: 0x3a3832, roughness: 0.9 });
    k.add(sg.box(0.13, 0.004, 0.014), dark, 0, 0.008, 0);
    k.add(sg.box(0.014, 0.004, 0.13), dark, 0, 0.008, 0);
    k.g.rotation.x = 0.2;
  }, 0xa9a69c],
  'a bent sixpence': [(k) => {                // folded nearly double
    const half = new THREE.CylinderGeometry(0.095, 0.095, 0.012, 16, 1, false, 0, Math.PI);
    const m = k.metal({ roughness: 0.3, envMapIntensity: 1.6 });
    k.add(half, m);
    k.add(half.clone().rotateY(Math.PI).rotateZ(-(Math.PI - 0.4)), m);
  }, 0xc3c8cc],
  'a medal with no ribbon': [(k) => {
    const m = k.metal({ roughness: 0.4 });
    k.add(sg.cyl(0.11, 0.11, 0.02, 24), m);
    k.add(sg.ring(0.102, 0.008, TAU, 24, 4), m, 0, 0.01, 0);
    k.add(sg.ring(0.02, 0.007, TAU, 10, 5), m, 0, 0, -0.128);
    const hex = '#' + k.col.getHexString(), ink = '#' + k.col.clone().multiplyScalar(0.35).getHexString();
    const tex = canvasTex(64, (c, n) => {
      c.fillStyle = hex; c.fillRect(0, 0, n, n);
      c.fillStyle = ink; c.font = `bold ${n * 0.72}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('3', n / 2, n * 0.54);
    });
    k.add(new THREE.CircleGeometry(0.088, 20).rotateX(-Math.PI / 2), k.metal({ color: 0xffffff, map: tex, roughness: 0.45 }), 0, 0.0105, 0);
    k.g.rotation.x = 0.3;
  }, 0xa97142],

  /* buttons */
  'a blue button': [null], 'a mother-of-pearl button': [null],
  'a bone button': [null, 0xdccfa6],
  'a brass button': [(k) => domedButton(k, (c, n) => {       // the anchor
    c.beginPath(); c.moveTo(n * 0.5, n * 0.26); c.lineTo(n * 0.5, n * 0.76); c.moveTo(n * 0.34, n * 0.4); c.lineTo(n * 0.66, n * 0.4); c.stroke();
    c.beginPath(); c.arc(n * 0.5, n * 0.52, n * 0.26, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    c.beginPath(); c.arc(n * 0.5, n * 0.2, n * 0.06, 0, TAU); c.stroke();
  })],
  'a military button': [(k) => domedButton(k, (c, n) => {    // the crown
    c.fillRect(n * 0.26, n * 0.6, n * 0.48, n * 0.12);
    c.beginPath(); c.moveTo(n * 0.26, n * 0.58); c.lineTo(n * 0.22, n * 0.3); c.lineTo(n * 0.38, n * 0.46); c.lineTo(n * 0.5, n * 0.24);
    c.lineTo(n * 0.62, n * 0.46); c.lineTo(n * 0.78, n * 0.3); c.lineTo(n * 0.74, n * 0.58); c.closePath(); c.fill();
  }), 0x7a7352],
  'a red toggle': [(k) => {                   // a wooden peg with a waist for the cord
    k.add(sg.lathe([[0, -0.11], [0.022, -0.105], [0.035, -0.05], [0.024, -0.008], [0.024, 0.008], [0.035, 0.05], [0.022, 0.105], [0, 0.11]], 10), k.std({ roughness: 0.6 }));
    k.add(sg.cyl(0.0255, 0.0255, 0.012, 10), k.std({ color: 0x8a6a4a, roughness: 0.9 }));
    k.g.rotation.z = Math.PI / 2;
  }, 0xb5382e],

  /* balls and beads */
  'a glass marble': [(k) => {                 // clear, with a green twist inside
    const geo = new THREE.PlaneGeometry(0.07, 0.16, 1, 10), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const a = p.getY(i) * 18, x = p.getX(i); p.setX(i, x * Math.cos(a)); p.setZ(i, x * Math.sin(a)); }
    geo.computeVertexNormals();
    glassMarble(k, new THREE.Mesh(geo, k.std({ side: THREE.DoubleSide, roughness: 0.4, emissive: k.col, emissiveIntensity: 0.3 })));
  }, 0x3f9c5a],
  "a cat's-eye marble": [(k) => {             // clear, with a yellow blade inside
    glassMarble(k, new THREE.Mesh(sg.sph(0.03, 8, 8).scale(0.22, 2.6, 1.1), k.std({ roughness: 0.4, emissive: k.col, emissiveIntensity: 0.3 })));
  }, 0xe2c544],
  'a ball bearing': [(k) => { k.add(sg.sph(0.085, 20, 14), k.metal({ metalness: 1, roughness: 0.04, envMapIntensity: 2.4 })); }, 0xdfe3e6],
  'a wooden bead': [(k) => {                  // bare wood with a band of the old paint, and the hole through it
    k.add(sg.sph(0.085, 14, 10), k.std({ color: 0x9a7350, roughness: 0.85 }));
    k.add(new THREE.SphereGeometry(0.0865, 14, 4, 0.4, TAU * 0.62, 0.85, 1.0), k.std({ roughness: 0.6 }));
    k.add(sg.cyl(0.022, 0.022, 0.172, 8), k.std({ color: 0x241a12, roughness: 1 }));
    k.g.rotation.set(0.6, 0, 0.3);
  }, 0x4f9a6a],
  'a clay marble': [(k) => { k.add(jitterGeo(sg.sph(0.09, 12, 8), 0.025, k.seed), k.std({ roughness: 0.95 })); }, 0x8a5f44],
  'a lead shot': [(k) => { k.add(sg.sph(0.07, 12, 8), k.std({ roughness: 0.6, metalness: 0.5 })); }, 0x6b6e73],
  'a cave pearl': [(k) => { k.add(sg.sph(0.085, 16, 12), new THREE.MeshPhysicalMaterial({ color: k.col, roughness: 0.25, clearcoat: 0.6 })); }, 0xf2efe8],
  'a moonstone bead': [(k) => {
    k.add(sg.sph(0.08, 16, 12), new THREE.MeshPhysicalMaterial({ color: k.col, roughness: 0.18, clearcoat: 1, emissive: 0x4a7fd6, emissiveIntensity: 0.4 }));
  }, 0xe8ecf2],
  'a seed pearl': [(k) => {                   // lopsided
    const m = new THREE.MeshPhysicalMaterial({ color: k.col, roughness: 0.22, clearcoat: 1, iridescence: 0.6 });
    k.add(sg.sph(0.055, 12, 8).scale(1.15, 0.9, 1), m);
    k.add(sg.sph(0.036, 10, 6), m, 0.04, 0.012, 0.012);
  }, 0xb9b9be],

  /* keys */
  'a tiny key': [null], 'a rusty key': [null],
  'a hex key': [(k) => {                      // a steel L
    const m = k.metal({ roughness: 0.4, flatShading: true });
    k.g.add(limb(V3(-0.14, 0, 0), V3(0.12, 0, 0), 0.014, 0.014, m, 6));
    k.g.add(limb(V3(0.12, 0, -0.012), V3(0.12, 0, 0.085), 0.014, 0.014, m, 6));
  }, 0x6f757b],
  'a clock key': [(k) => {                    // a square shank with a butterfly handle
    const m = k.metal({ roughness: 0.36 }), sq = k.metal({ roughness: 0.36, flatShading: true });
    k.add(sg.cyl(0.02, 0.02, 0.17, 4).rotateZ(Math.PI / 2), sq, 0.04, 0, 0);
    k.add(sg.cyl(0.028, 0.028, 0.05, 4).rotateZ(Math.PI / 2), sq, 0.11, 0, 0);
    k.add(sg.cyl(0.014, 0.014, 0.004, 4).rotateZ(Math.PI / 2), k.std({ color: 0x1c1610 }), 0.136, 0, 0);
    for (const s of [-1, 1]) k.add(sg.ring(0.036, 0.012, TAU, 12, 5).scale(0.85, 1, 1.15), m, -0.07, 0, s * 0.048);
  }, 0xc9a24a],
  'an ignition key': [(k) => {                // a flat blade cut on both edges; the bare metal head
    const m = k.metal({ roughness: 0.35 });
    k.add(sg.box(0.17, 0.012, 0.034), m, 0.03, 0.006, 0);
    const cuts = [];
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) cuts.push([0.0 + i * 0.024, 0.006, s * (0.019 + ((i * 3 + (s > 0 ? 1 : 0)) % 3) * 0.004), 0.7 + ((i + (s > 0 ? 2 : 0)) % 3) * 0.3]);
    dots(k, sg.box(0.014, 0.012, 0.016), m, cuts);
    const head = sg.rrect(0.09, 0.075, 0.022), hole = new THREE.Path();
    hole.absarc(-0.018, 0, 0.013, 0, TAU, true);
    head.holes.push(hole);
    k.add(sg.slab(head, 0.012), m, -0.095, 0, 0);
  }, 0xb4b9be],
  'a skeleton key': [(k) => {                 // black iron: a round bow, a long shank, what is left of the teeth
    const m = k.std({ roughness: 0.7, metalness: 0.6 }), rust = k.std({ color: 0x6b3a22, roughness: 1 });
    k.add(sg.ring(0.05, 0.012, TAU, 16, 5).scale(0.82, 1, 1), m, -0.135, 0, 0);
    k.add(sg.cyl(0.012, 0.012, 0.23, 8).rotateZ(Math.PI / 2), m, 0.02, 0, 0);
    k.add(sg.cyl(0.02, 0.02, 0.016, 8).rotateZ(Math.PI / 2), m, -0.075, 0, 0);
    k.add(sg.box(0.028, 0.014, 0.05), rust, 0.115, 0, 0.03);
    k.add(sg.box(0.016, 0.014, 0.03), rust, 0.085, 0, 0.022);
  }, 0x2a2725],

  /* odds and ends */
  'a scrap of visor tear-off': [(k) => {      // a clear curl of film with its tab
    k.add(new THREE.CylinderGeometry(0.06, 0.06, 0.15, 14, 1, true, 0, 4.4), k.glass({ opacity: 0.34, roughness: 0.04, side: THREE.DoubleSide, envMapIntensity: 2.4 }));
    k.add(sg.box(0.045, 0.04, 0.004), k.std({ color: 0xe2c544, roughness: 0.5 }), -0.02, -0.05, 0.06);
    k.g.rotation.z = Math.PI / 2;
  }, 0xe9f3f5],
  'a zip tie': [(k) => {                      // a pulled loop, the square head, the cut stub
    const m = k.std({ roughness: 0.5 });
    k.add(sg.ring(0.075, 0.006, TAU, 22, 4).scale(1, 3, 1), m);
    k.add(sg.box(0.03, 0.036, 0.04), m, 0.08, 0, 0);
    k.add(sg.box(0.01, 0.03, 0.045), m, 0.088, 0, 0.04);
  }, 0x1a1b1e],
  'a chequered flag pin': [(k) => {
    const tex = faceTex(0.2, 0.13, (c, n) => {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) { c.fillStyle = (x + y) % 2 ? '#f2efe6' : '#17181b'; c.fillRect(x * n / 6, y * n / 4, n / 6 + 1, n / 4 + 1); }
    });
    const gold = k.metal({ color: 0xc9a24a, roughness: 0.3 });
    k.add(sg.slab(sg.rrect(0.2, 0.13, 0.008), 0.008), [k.std({ color: 0xffffff, map: tex, roughness: 0.2 }), gold]);
    k.add(sg.cyl(0.007, 0.007, 0.24, 6).rotateX(Math.PI / 2), gold, -0.103, 0.004, 0.05);
    k.g.add(limb(V3(0, -0.002, 0), V3(0.16, -0.002, 0.05), 0.004, 0.002, k.metal({ color: 0x9aa4ad }), 5));
    k.g.rotation.x = 0.3;
  }],
  'a toy brick': [(k) => {                    // two studs by two
    const m = k.std({ roughness: 0.3 });
    k.add(sg.box(0.16, 0.096, 0.16), m, 0, 0.048, 0);
    dots(k, sg.cyl(0.025, 0.025, 0.02, 10), m, [[-0.04, 0.106, -0.04], [0.04, 0.106, -0.04], [-0.04, 0.106, 0.04], [0.04, 0.106, 0.04]]);
  }, 0xe2c544],
  'a guitar pick': [(k) => {
    const rr = rng(hashStr(k.seed));
    const tex = faceTex(0.2, 0.22, (c, n) => {
      c.fillStyle = '#8a4f22'; c.fillRect(0, 0, n, n);
      for (let i = 0; i < 16; i++) {
        c.fillStyle = i % 3 ? '#2e170b' : '#c98a3a';
        c.beginPath(); c.ellipse(rr() * n, rr() * n, n * (0.05 + rr() * 0.09), n * (0.04 + rr() * 0.06), rr() * 3, 0, TAU); c.fill();
      }
    });
    const s = new THREE.Shape();
    s.moveTo(0, -0.115);
    s.quadraticCurveTo(0.075, -0.03, 0.09, 0.05);
    s.quadraticCurveTo(0.085, 0.095, 0, 0.095);
    s.quadraticCurveTo(-0.085, 0.095, -0.09, 0.05);
    s.quadraticCurveTo(-0.075, -0.03, 0, -0.115);
    k.add(sg.slab(s, 0.006), [k.std({ color: 0xffffff, map: tex, roughness: 0.25 }), k.std({ color: 0x5a3216, roughness: 0.4 })]);
    k.g.rotation.x = 0.3;
  }],
  'a die': [(k) => {                          // pips on every face, one corner knocked in
    const geo = sg.box(0.15, 0.15, 0.15), uv = geo.attributes.uv, p = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const f = Math.floor(i / 4);
      uv.setXY(i, (f % 3 + uv.getX(i)) / 3, (Math.floor(f / 3) + uv.getY(i)) / 2);
      if (p.getX(i) > 0 && p.getY(i) > 0 && p.getZ(i) > 0) p.setXYZ(i, 0.055, 0.055, 0.055);
    }
    const hex = '#' + k.col.getHexString();
    const tex = canvasTex(192, (c, n) => {
      c.fillStyle = hex; c.fillRect(0, 0, n, n);
      c.fillStyle = '#17181b';
      [3, 4, 5, 2, 1, 6].forEach((num, f) => {
        const x0 = (f % 3) * n / 3, y0 = n - (Math.floor(f / 3) + 1) * n / 2;
        for (const [px, py] of DIE_PIPS[num]) { c.beginPath(); c.ellipse(x0 + px * n / 3, y0 + py * n / 2, n / 3 * 0.1, n / 2 * 0.1, 0, 0, TAU); c.fill(); }
      });
    });
    k.add(geo, k.std({ color: 0xffffff, map: tex, roughness: 0.35 }));
  }, 0xf2efe6],
  'a cork': [(k) => {                         // on its side, the brand burnt into it
    const hex = '#' + k.col.getHexString(), rr = rng(hashStr(k.seed));
    const tex = canvasTex(64, (c, n) => {
      c.fillStyle = hex; c.fillRect(0, 0, n, n);
      c.fillStyle = 'rgba(90,60,30,0.5)';
      for (let i = 0; i < 40; i++) c.fillRect(rr() * n, rr() * n, 2 + rr() * 3, 1 + rr() * 2);
      c.strokeStyle = '#3a2412'; c.lineWidth = 2.5;
      c.strokeRect(n * 0.2, n * 0.32, n * 0.14, n * 0.36);
      c.beginPath(); c.moveTo(n * 0.27, n * 0.38); c.lineTo(n * 0.27, n * 0.62); c.stroke();
    });
    k.add(sg.cyl(0.056, 0.066, 0.15, 12), k.std({ color: 0xffffff, map: tex, roughness: 0.95 }));
    k.g.rotation.z = Math.PI / 2 - 0.07;
  }, 0xc49a6c],
  'a pencil stub': [(k) => {                  // six-sided, sharpened one end, an empty brass ferrule on the other
    k.add(sg.cyl(0.03, 0.03, 0.14, 6), k.std({ roughness: 0.45, flatShading: true }));
    k.add(sg.cyl(0.008, 0.03, 0.05, 6), k.std({ color: 0xd9b98c, roughness: 0.8 }), 0, 0.095, 0);
    k.add(sg.cone(0.009, 0.02, 6), k.std({ color: 0x26262a, roughness: 0.4 }), 0, 0.128, 0);
    k.add(sg.cyl(0.032, 0.032, 0.04, 10, true), k.metal({ color: 0xc9a24a, roughness: 0.35, side: THREE.DoubleSide }), 0, -0.088, 0);
    k.g.rotation.z = Math.PI / 2;
  }, 0xe2b23a],
  'a jigsaw piece': [(k) => {                 // two tabs, two sockets, the picture side up
    const a = 0.075, s = new THREE.Shape();
    s.moveTo(-a, -a);
    s.absarc(0, -a + 0.02, 0.028, 3.96, -0.82, true); s.lineTo(a, -a);
    s.absarc(a + 0.02, 0, 0.028, -2.39, 2.39, false); s.lineTo(a, a);
    s.absarc(0, a + 0.02, 0.028, -0.82, 3.96, false); s.lineTo(-a, a);
    s.absarc(-a + 0.02, 0, 0.028, 2.39, -2.39, true); s.lineTo(-a, -a);
    k.add(sg.slab(s, 0.016), [k.std({ roughness: 0.5 }), k.std({ color: 0xb9a888, roughness: 0.9 })]);
    k.g.rotation.x = 0.2;
  }, 0x8fc4ea],
  'a plastic dinosaur': [(k) => {             // plates down its back, and a stump where the tail was
    const m = k.std({ roughness: 0.4 });
    k.add(sg.sph(0.07, 10, 8).scale(1.5, 0.9, 0.8), m, 0, 0.09, 0);
    k.add(sg.sph(0.03, 8, 6).scale(1.5, 0.9, 0.9), m, 0.125, 0.062, 0);
    k.add(sg.cyl(0.03, 0.036, 0.045, 8).rotateZ(Math.PI / 2), m, -0.11, 0.085, 0);
    dots(k, sg.cyl(0.017, 0.021, 0.075, 6), m, [[-0.055, 0.0375, -0.032], [-0.055, 0.0375, 0.032], [0.055, 0.0375, -0.032], [0.055, 0.0375, 0.032]]);
    dots(k, sg.cone(0.026, 0.055, 4).scale(1, 1, 0.3), k.std({ color: k.shade(0.72), roughness: 0.4 }),
      [[-0.06, 0.165, 0, 0.8], [-0.02, 0.175, 0, 1], [0.022, 0.174, 0, 1], [0.062, 0.162, 0, 0.75]]);
  }, 0x4f9a6a],
  'a cable clip': [(k) => {                   // a saddle, and the nail still in its lug
    const m = k.std({ roughness: 0.45 });
    k.add(new THREE.TorusGeometry(0.045, 0.018, 6, 10, Math.PI).scale(1, 1, 1.5), m);
    k.add(sg.box(0.05, 0.036, 0.05), m, 0.086, 0.018, 0);
    const steel = k.metal({ color: 0x9aa4ad });
    k.add(sg.cyl(0.006, 0.006, 0.12, 6), steel, 0.086, 0.05, 0);
    k.add(sg.cyl(0.015, 0.015, 0.006, 8), steel, 0.086, 0.112, 0);
  }, 0xeeeeea],
  'a paddock pass lanyard clip': [(k) => {    // a sprung hook, a swivel, the eye the lanyard went through
    const m = k.metal({ roughness: 0.3 });
    k.add(sg.ring(0.042, 0.011, TAU * 0.84, 16, 6).scale(1.55, 1, 1), m, 0.05, 0, 0);
    k.add(sg.cyl(0.02, 0.02, 0.045, 8).rotateZ(Math.PI / 2), m, -0.04, 0, 0);
    k.add(sg.ring(0.03, 0.008, TAU, 12, 5), m, -0.095, 0, 0);
  }, 0xaab2b8],
  'a thimble': [(k) => {
    k.add(sg.lathe([[0.064, 0], [0.068, 0.005], [0.062, 0.014], [0.058, 0.04], [0.055, 0.065], [0.052, 0.09], [0.048, 0.112], [0.036, 0.132], [0.018, 0.14], [0, 0.141]], 10),
      k.metal({ roughness: 0.4, flatShading: true, side: THREE.DoubleSide }));
  }, 0xb8bcc0],
  'a tin soldier': [(k) => {                  // lying on his back: one leg, a red tunic, a tall black hat, his rifle
    const worn = (hex, o) => k.std(Object.assign({ color: new THREE.Color(hex).lerp(new THREE.Color(0x8d939b), 0.3), roughness: 0.5, metalness: 0.3 }, o));
    k.add(sg.cyl(0.015, 0.017, 0.09, 6), worn(0x34507a), -0.018, 0.045, 0);
    k.add(sg.cyl(0.015, 0.015, 0.02, 6), worn(0x8d939b), 0.018, 0.08, 0);
    k.add(sg.box(0.072, 0.085, 0.042), worn(k.col), 0, 0.133, 0);
    dots(k, sg.box(0.017, 0.07, 0.022), worn(k.col), [[-0.045, 0.138, 0], [0.045, 0.138, 0]]);
    k.add(sg.sph(0.025, 8, 6), worn(0xd9b08c), 0, 0.2, 0);
    k.add(sg.cyl(0.023, 0.027, 0.055, 8), worn(0x1c1c1e), 0, 0.245, 0);
    k.add(sg.cyl(0.005, 0.005, 0.17, 5), worn(0x3a2a1c), 0.06, 0.15, 0.012);
    k.g.rotation.x = -Math.PI / 2 + 0.06;
  }, 0xb5382e],
  'a pocket watch cog': [(k) => {             // a thin wheel with the spokes cut out
    k.add(sg.slab(gearShape(18, 0.105, 0.088, 0.012, 4), 0.006), k.metal({ roughness: 0.3, envMapIntensity: 1.8 }));
    k.g.rotation.x = 0.3;
  }, 0xc9a24a],
  'a tiny brass gear': [(k) => {              // eleven teeth, one bent
    k.add(sg.slab(gearShape(11, 0.08, 0.057, 0.018, 0, 3), 0.03), k.metal({ roughness: 0.35 }));
    k.g.rotation.x = 0.25;
  }, 0xc9a24a],
  'a spark plug': [(k) => {                   // thread, hex, ribbed porcelain, terminal; lying down
    const steel = k.metal({ color: 0x8d949b, roughness: 0.4 });
    k.add(sg.lathe([[0, 0], [0.028, 0]].concat(sg.thread(0.035, 0.07, 10, 0.004), [[0.046, 0.076], [0.046, 0.088], [0, 0.088]]), 10), steel);
    k.add(sg.cyl(0.052, 0.052, 0.034, 6), k.metal({ color: 0x8d949b, roughness: 0.4, flatShading: true }), 0, 0.105, 0);
    k.add(sg.lathe([[0, 0.12], [0.033, 0.12], [0.033, 0.15], [0.027, 0.156], [0.033, 0.162], [0.027, 0.168], [0.033, 0.174], [0.027, 0.18], [0.021, 0.225], [0, 0.225]], 12),
      k.std({ roughness: 0.3 }));
    k.add(sg.cyl(0.011, 0.013, 0.032, 8), steel, 0, 0.24, 0);
    k.add(sg.box(0.034, 0.007, 0.01), steel, 0.012, -0.018, 0);
    k.add(sg.box(0.007, 0.022, 0.01), steel, 0.0255, -0.008, 0);
    k.g.rotation.z = Math.PI / 2;
  }, 0xf0ede6],
  'a domino': [(k) => {                       // the double four
    k.add(sg.box(0.12, 0.03, 0.24), k.std({ roughness: 0.45 }));
    const hex = '#' + k.col.getHexString();
    const tex = canvasTex(64, (c, n) => {
      c.fillStyle = hex; c.fillRect(0, 0, n, n);
      c.fillStyle = '#17181b'; c.fillRect(n * 0.1, n * 0.488, n * 0.8, n * 0.024);
      for (const half of [0, 0.5]) for (const [px, py] of DIE_PIPS[4]) { c.beginPath(); c.ellipse(px * n, (half + py * 0.5) * n, n * 0.085, n * 0.0425, 0, 0, TAU); c.fill(); }
    });
    k.add(new THREE.PlaneGeometry(0.12, 0.24).rotateX(-Math.PI / 2), k.std({ color: 0xffffff, map: tex, roughness: 0.45 }), 0, 0.0155, 0);
    k.g.rotation.x = 0.1;
  }, 0xe8dfc0],
  'a fishing lure': [(k) => {                 // a silver spoon with a rusty eye at each end
    k.add(taperX(sg.sph(0.1, 12, 8).scale(1.5, 0.12, 0.55), 0.55), k.metal({ roughness: 0.12, metalness: 0.9, envMapIntensity: 2.2 }));
    const rust = k.std({ color: 0x8a4a2a, roughness: 0.9 });
    k.add(sg.ring(0.016, 0.005, TAU, 10, 4), rust, 0.162, 0, 0);
    k.add(sg.ring(0.016, 0.005, TAU, 10, 4), rust, -0.162, 0, 0);
    k.g.rotation.x = 0.22;
  }, 0xd3d8dc],
  'a chess pawn': [(k) => {
    k.add(sg.lathe([[0, 0], [0.06, 0], [0.062, 0.012], [0.05, 0.026], [0.03, 0.04], [0.022, 0.09], [0.037, 0.104], [0.022, 0.116], [0.034, 0.134], [0.039, 0.155],
      [0.03, 0.178], [0, 0.19]], 12), k.std({ roughness: 0.4 }));
  }, 0x24201e],
  'a toy car wheel': [(k) => {                // a fat tyre on a bright hub
    k.add(sg.ring(0.072, 0.04, TAU, 18, 8), k.std({ roughness: 0.9 }));
    k.add(sg.cyl(0.05, 0.05, 0.052, 14), k.metal({ color: 0xd0d4d8, roughness: 0.12, envMapIntensity: 2 }));
    k.add(sg.cyl(0.018, 0.018, 0.062, 8), k.metal({ color: 0x6f757b }));
    k.g.rotation.x = 0.3;
  }, 0x1c1c1e],
  'a dog tag': [(k) => {                      // a blank plate on a ball chain
    const m = k.metal({ roughness: 0.45 });
    const plate = sg.rrect(0.2, 0.11, 0.04), hole = new THREE.Path();
    hole.absarc(-0.07, 0, 0.012, 0, TAU, true);
    plate.holes.push(hole);
    k.add(sg.slab(plate, 0.007), m);
    const chain = [];
    for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; chain.push([-0.145 + Math.cos(a) * 0.075, 0.005, Math.sin(a) * 0.06]); }
    dots(k, sg.sph(0.008, 6, 4), m, chain);
    k.g.rotation.x = 0.12;
  }, 0xaab0b6],
  "a bat's tooth": [(k) => {                  // a curved white needle
    const m = k.std({ roughness: 0.25 });
    const pts = [V3(-0.075, 0, 0), V3(-0.025, 0, 0.012), V3(0.025, 0, 0.034), V3(0.07, 0, 0.068)], rad = [0.015, 0.011, 0.007, 0.001];
    for (let i = 0; i < 3; i++) k.g.add(limb(pts[i], pts[i + 1], rad[i], rad[i + 1], m, 6));
    k.add(sg.sph(0.015, 6, 5), m, -0.075, 0, 0);
  }, 0xf3f0e6],
  'an arrowhead': [(k) => {
    const s = sg.poly([[0, 0.15], [0.058, -0.02], [0.07, -0.062], [0.026, -0.046], [0.02, -0.09], [-0.02, -0.09], [-0.026, -0.046], [-0.07, -0.062], [-0.058, -0.02]]);
    k.add(sg.slab(s, 0.008, 0.014), k.std({ roughness: 0.45, flatShading: true }));
    k.g.rotation.x = -0.25;
  }, 0x6f6a66],
  "a miner's tag": [(k) => {                  // a brass disc stamped 22, with a hole to hang it by
    const hex = '#' + k.col.getHexString(), ink = '#' + k.col.clone().multiplyScalar(0.3).getHexString();
    const tex = faceTex(0.2, 0.2, (c, n) => {
      c.fillStyle = hex; c.fillRect(0, 0, n, n);
      c.fillStyle = ink; c.font = `bold ${n * 0.5}px Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('22', n / 2, n * 0.58);
    });
    k.add(sg.slab(sg.disc(0.1, 0.012, 0, 0.076), 0.008), [k.metal({ color: 0xffffff, map: tex, roughness: 0.4 }), k.metal({ roughness: 0.4 })]);
    k.g.rotation.x = 0.3;
  }, 0xc9a24a],
  'a fish hook with no barb': [(k) => {       // rusted thin and bent almost into a ring
    const m = k.std({ roughness: 0.85, metalness: 0.4 });
    k.add(sg.ring(0.06, 0.006, TAU * 0.8, 18, 5), m);
    k.add(sg.ring(0.013, 0.004, TAU, 8, 4), m, 0.073, 0, 0);
    k.g.add(limb(V3(0.0185, 0, 0.057), V3(0.05, 0, 0.04), 0.006, 0.001, m, 5));
    k.g.rotation.x = 0.15;
  }, 0x8a4a2a],

  /* shapes only a gift can have */
  'star': [(k) => {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + Math.PI / 2, r = i % 2 ? 0.05 : 0.12; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    k.add(sg.slab(sg.poly(pts), 0.02, 0.01), k.std({ roughness: 0.4 }));
    k.g.rotation.x = -0.3;
  }, 0xe2c544],
  'bell': [(k) => {
    const m = k.metal({ roughness: 0.3, side: THREE.DoubleSide });
    k.add(sg.lathe([[0.08, 0], [0.07, 0.014], [0.048, 0.06], [0.038, 0.105], [0.022, 0.126], [0, 0.13]], 12), m);
    k.add(sg.sph(0.017, 8, 6), m, 0, 0.012, 0);
    k.add(new THREE.TorusGeometry(0.014, 0.005, 5, 10), m, 0, 0.14, 0);
  }, 0xc9a24a],
  'toy car': [(k) => {
    const m = k.std({ roughness: 0.3 });
    k.add(sg.box(0.24, 0.05, 0.11), m, 0, 0.05, 0);
    k.add(sg.box(0.11, 0.042, 0.092), k.std({ color: k.shade(0.6), roughness: 0.2 }), -0.01, 0.094, 0);
    dots(k, sg.cyl(0.03, 0.03, 0.026, 10).rotateX(Math.PI / 2), k.std({ color: 0x1c1c1e, roughness: 0.9 }),
      [[-0.075, 0.03, 0.05], [0.075, 0.03, 0.05], [-0.075, 0.03, -0.05], [0.075, 0.03, -0.05]]);
  }, 0xc8443a],
  // what an unknown "something else" is drawn as: a small parcel done up with twine
  'parcel': [(k) => {
    const paper = k.col.clone().lerp(new THREE.Color(0xb89b72), 0.6);
    k.add(sg.box(0.17, 0.11, 0.13), k.std({ color: paper, roughness: 0.85 }));
    const twine = k.std({ color: 0xe6dcc0, roughness: 0.9 });
    k.add(sg.box(0.175, 0.115, 0.014), twine);
    k.add(sg.box(0.014, 0.115, 0.135), twine);
    k.add(sg.sph(0.014, 6, 5), twine, 0, 0.06, 0);
  }],
};

// a word in the name of something the person gives -> the shape it borrows ('=kind' for the shape of a kind)
const GIFT_WORDS = [
  [['dinosaur', 'dino'], 'a plastic dinosaur'], [['die', 'dice'], 'a die'], [['brick'], 'a toy brick'], [['pawn'], 'a chess pawn'],
  [['key'], '=key'], [['ring'], 'ring'], [['tooth', 'teeth', 'fang'], "a shark's tooth"], [['heart'], 'a pebble shaped like a heart'],
  [['crystal'], 'a clear crystal point'], [['gear', 'cog'], 'a tiny brass gear'], [['car'], 'toy car'], [['wheel', 'tyre', 'tire'], 'a toy car wheel'],
  [['feather'], '=feather'], [['flag'], 'a chequered flag pin'], [['pencil'], 'a pencil stub'], [['cork'], 'a cork'],
  [['bolt', 'screw'], 'a wheel stud'], [['star'], 'star'], [['bell'], 'bell'], [['bead'], 'a red glass bead'], [['domino'], 'a domino'],
  [['thimble'], 'a thimble'], [['soldier'], 'a tin soldier'], [['medal'], 'a medal with no ribbon'], [['pearl'], 'a cave pearl'],
  [['coin', 'token'], '=coin'], [['button'], '=button'], [['marble', 'ball'], '=marble'], [['shell'], '=shell'], [['pebble', 'stone', 'rock'], '=pebble'],
];
const GIFT_SKIP = ['made', 'scrap', 'seed', 'treat'];       // these kinds are what they are, whatever they are called
const GEM_WORDS = /\b(gem|gems|gemstone|jewel|diamond|ruby|emerald|sapphire|opal|topaz)\b/;   // these keep the cut-gem shape

function giftShape(item, name) {
  if (GIFT_SKIP.includes(item.kind)) return null;
  const words = name.match(/[a-z]+/g) || [];
  for (const [list, target] of GIFT_WORDS) {
    if (words.some((w) => list.includes(w) || list.includes(w.replace(/s$/, '')))) return target;
  }
  return null;
}
// the colour a named or borrowed shape should be, unless the name itself says a colour; null leaves it to itemColor
function shapeColor(item, name) {
  if (GIFT_SKIP.includes(item.kind)) return null;
  name = name.trim();
  const own = SHAPES[name];
  if (own) return own[1] === undefined ? null : new THREE.Color(own[1]);
  const target = giftShape(item, name);
  if (!target || NAMED.some(([w]) => new RegExp(`\\b${w}`).test(name))) return null;
  if (target[0] !== '=') return SHAPES[target][1] === undefined ? null : new THREE.Color(SHAPES[target][1]);
  const pal = PALETTE[target.slice(1)];
  return target.slice(1) === item.kind ? null : new THREE.Color(pal[hashStr(name) % pal.length]);
}
// draws the item's own shape into base.g and returns null, or returns the kind whose shape buildItemMesh should draw
function shapeFor(item, base) {
  if (GIFT_SKIP.includes(item.kind)) return item.kind;
  const name = String(item.name || '').toLowerCase().trim();
  let entry = SHAPES[name];
  if (!entry) {
    const target = giftShape(item, name);
    if (target && target[0] === '=') return target.slice(1);
    if (target) entry = SHAPES[target];
    else if (item.kind === 'trinket' && !GEM_WORDS.test(name)) entry = SHAPES.parcel;
  }
  if (!entry || !entry[0]) return item.kind;
  entry[0](Object.assign({}, base, {
    seed: name, r: rng(hashStr(name)),
    shade: (f) => base.col.clone().multiplyScalar(f),
    glass: (o) => new THREE.MeshPhysicalMaterial(Object.assign({ color: base.col, roughness: 0.1, transparent: true, opacity: 0.6, envMapIntensity: 1.6 }, o)),
  }));
  return null;
}

/* ───────────────────────────── helmet + crab ───────────────────────────── */

const HELMETS = [
  { shell: 0xd8452a, rough: 0.5, coat: 0.35, stripe: 0xd8c49a, sw: 0.15, visor: 0x1b2024, vRough: 0.25, depth: 0.58, rim: 0x22262a, rimR: 0.02, scale: 1.0, scuffs: true },
  { shell: 0xefe3c4, rough: 0.4, coat: 0.6, stripe: 0xc49a5c, sw: 0.15, visor: 0x3a2a20, vRough: 0.5, depth: 0.54, rim: 0x6b4426, rimR: 0.03, scale: 1.12, strap: true },
  { shell: 0x2f5d46, rough: 0.42, coat: 0.6, stripe: 0xd8c49a, sw: 0.14, visor: 0x14181b, vRough: 0.15, depth: 0.66, rim: 0x1c2022, rimR: 0.02, scale: 1.25 },
  { shell: 0x26292d, rough: 0.28, coat: 1.0, metal: 0.55, stripe: 0xd1382e, sw: 0.06, visor: 0x3d6488, vRough: 0.05, vMetal: 0.9, depth: 0.66, rim: 0x111315, rimR: 0.02, scale: 1.4, weave: true },
];
const HR = 0.42, HSY = 0.95, HSZ = 1.18;

function buildHelmet(tier) {
  const s = HELMETS[clamp(tier | 0, 0, 3)];
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.set(1, HSY, HSZ);
  g.add(inner);
  const th = Math.PI * s.depth;
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: s.shell, roughness: s.rough, metalness: s.metal || 0, clearcoat: s.coat, clearcoatRoughness: 0.12, envMapIntensity: 1.25,
  });
  if (s.weave) {
    shellMat.map = canvasTex(64, (c, n) => {
      c.fillStyle = '#8d9096'; c.fillRect(0, 0, n, n);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        c.fillStyle = (x + y) % 2 ? '#ffffff' : '#7b7e85';
        c.fillRect(x * 8, y * 8, 8, 8);
      }
    }, 9, 6);
  }
  const mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; inner.add(m); return m; };
  mk(new THREE.SphereGeometry(HR, 40, 24, 0, TAU, 0, th), shellMat);
  const inside = new THREE.Mesh(new THREE.SphereGeometry(HR * 0.975, 28, 16, 0, TAU, 0, th), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 1, side: THREE.BackSide }));
  inner.add(inside);
  // centre stripe, front to back over the crown
  const stripeGeo = new THREE.SphereGeometry(HR * 1.02, 12, 40, Math.PI / 2 - (th - Math.PI / 2) + 0.02, Math.PI + 2 * (th - Math.PI / 2) - 0.04, Math.PI / 2 - s.sw, 2 * s.sw);
  stripeGeo.rotateZ(Math.PI / 2);
  mk(stripeGeo, new THREE.MeshPhysicalMaterial({ color: s.stripe, roughness: 0.4, clearcoat: s.coat, envMapIntensity: 1 })).castShadow = false;
  // visor band across the front
  const v0 = s.strap ? 0.38 : 0.31, v1 = s.strap ? 0.455 : s.depth > 0.6 ? 0.5 : 0.48;
  const vw = s.strap ? 1.45 : 1.05;
  const visorGeo = new THREE.SphereGeometry(HR * 1.032, 28, 8, Math.PI / 2 - vw, 2 * vw, Math.PI * v0, Math.PI * (v1 - v0));
  mk(visorGeo, new THREE.MeshPhysicalMaterial({
    color: s.visor, roughness: s.vRough, metalness: s.vMetal || 0.2, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2,
  })).castShadow = false;
  // rim trim (or the brown strap)
  const rimGeo = new THREE.TorusGeometry(Math.sin(th) * HR, s.rimR, 8, 48);
  rimGeo.rotateX(Math.PI / 2);
  const rim = mk(rimGeo, new THREE.MeshStandardMaterial({ color: s.rim, roughness: 0.7 }));
  rim.position.y = Math.cos(th) * HR;
  if (s.strap) {
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.03), new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.8, roughness: 0.35 }));
    buckle.position.set(0, Math.cos(th) * HR, Math.sin(th) * HR + 0.012);
    inner.add(buckle);
  }
  if (s.scuffs) {
    const sm = new THREE.MeshStandardMaterial({ color: 0xe9b9a4, roughness: 0.9, transparent: true, opacity: 0.55 });
    const r = rng(77);
    for (let i = 0; i < 7; i++) {
      const a = r() * TAU, e = 0.25 + r() * 1.0;
      const n = new THREE.Vector3(Math.sin(e) * Math.sin(a), Math.cos(e), Math.sin(e) * Math.cos(a));
      if (Math.abs(n.x) < 0.25 || (n.z > 0.3 && n.y < 0.6)) continue;
      const sc = new THREE.Mesh(new THREE.CircleGeometry(0.02 + r() * 0.025, 8), sm);
      sc.position.copy(n).multiplyScalar(HR * 1.004);
      sc.lookAt(n.clone().multiplyScalar(3));
      sc.scale.set(1 + r() * 2.2, 0.6, 1);
      sc.rotateZ(r() * 3);
      inner.add(sc);
    }
  }
  const rimY = Math.cos(th) * HR * HSY;
  return { group: g, yOut: 0.175 - rimY, yTuck: -rimY + 0.012, scale: s.scale };
}

function buildCrab() {
  const root = new THREE.Group();
  const tilt = new THREE.Group(); root.add(tilt);
  const scaleG = new THREE.Group(); tilt.add(scaleG);
  const legsG = new THREE.Group(); scaleG.add(legsG);
  const leanG = new THREE.Group(); scaleG.add(leanG);
  const helmetG = new THREE.Group(); leanG.add(helmetG);
  const coreG = new THREE.Group(); leanG.add(coreG);
  const hold = new THREE.Object3D(); leanG.add(hold);

  const coral = new THREE.MeshStandardMaterial({ color: CORAL, roughness: 0.55, envMapIntensity: 0.7 });
  const coralDark = new THREE.MeshStandardMaterial({ color: 0xcf5a36, roughness: 0.6, envMapIntensity: 0.6 });
  const coralLight = new THREE.MeshStandardMaterial({ color: 0xf6a57e, roughness: 0.5, envMapIntensity: 0.7 });
  const white = new THREE.MeshStandardMaterial({ color: 0xfaf6ee, roughness: 0.25, envMapIntensity: 1.2 });
  const black = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.2, envMapIntensity: 1.5 });
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const cast = (m) => { m.castShadow = true; return m; };

  // body
  const body = cast(new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), coral));
  body.scale.set(1.25, 0.8, 1.08);
  body.position.set(0, 0.19, 0.27);
  coreG.add(body);
  const face = cast(new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12), coralLight));
  face.scale.set(1.15, 0.6, 0.7);
  face.position.set(0, 0.16, 0.44);
  coreG.add(face);
  for (const s of [-1, 1]) {
    coreG.add(limb(V(s * 0.035, 0.24, 0.5), V(s * 0.075, 0.3, 0.66), 0.01, 0.004, coralDark, 5));
  }

  // eyes
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(s * 0.085, 0.3, 0.4);
    const tip = V(s * 0.03, 0.25, 0.09);
    e.add(limb(V(0, 0, 0), tip, 0.026, 0.02, coral, 8));
    const ball = new THREE.Group();
    ball.position.copy(tip);
    ball.add(cast(new THREE.Mesh(new THREE.SphereGeometry(0.072, 18, 14), white)));
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 10), black);
    pupil.position.set(-s * 0.008, 0.004, 0.044);
    ball.add(pupil);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(-s * 0.008 + 0.016, 0.024, 0.076);
    ball.add(glint);
    e.add(ball);
    coreG.add(e);
    eyes.push({ g: e, ball, s });
  }

  // claws (the +x one is the big one)
  const claws = [];
  for (const s of [-1, 1]) {
    const k = s > 0 ? 1.22 : 0.92;
    const c = new THREE.Group();
    c.position.set(s * 0.17, 0.15, 0.4);
    const elbow = V(s * 0.13, -0.005, 0.1);
    c.add(limb(V(0, 0, 0), elbow, 0.045, 0.04, coralDark, 8));
    const pincer = new THREE.Group();
    pincer.position.copy(elbow);
    pincer.scale.setScalar(k);
    const palm = cast(new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), coral));
    palm.scale.set(0.8, 0.68, 1.2);
    palm.position.set(0, 0, 0.1);
    pincer.add(palm);
    const finger = cast(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.15, 10), coralLight));
    finger.rotation.x = Math.PI / 2;
    finger.position.set(0, -0.022, 0.25);
    pincer.add(finger);
    const thumb = new THREE.Group();
    thumb.position.set(0, 0.03, 0.15);
    const tm = cast(new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.14, 10), coralLight));
    tm.rotation.x = Math.PI / 2;
    tm.position.set(0, 0.012, 0.075);
    thumb.add(tm);
    pincer.add(thumb);
    c.add(pincer);
    coreG.add(c);
    claws.push({ g: c, pincer, thumb, s });
  }

  // legs
  const legs = [];
  const HIP_Y = 0.15;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const fwd = [0.62, 0.05, -0.55][i];
      const leg = new THREE.Group();
      leg.position.set(s * 0.17, HIP_Y, 0.3 - i * 0.14);
      const base = s > 0 ? -fwd : Math.PI + fwd;
      leg.rotation.y = base;
      const knee = V(0.2, 0.07, 0);
      leg.add(limb(V(0, 0, 0), knee, 0.036, 0.03, coral, 7));
      leg.add(limb(knee, V(0.34, -HIP_Y + 0.004, 0), 0.03, 0.008, coralDark, 7));
      const kn = cast(new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 6), coral));
      kn.position.copy(knee);
      leg.add(kn);
      legsG.add(leg);
      legs.push({ g: leg, base, s, i });
    }
  }

  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 10), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(0, 0.32, 0.08);
  scaleG.add(hit);

  return { root, tilt, scaleG, legsG, leanG, helmetG, coreG, hold, eyes, claws, legs, hit, helmet: null };
}

// the pet shrimp: head toward +z like the crab, a little over 0.2 long without its feelers   [shrimp-ui]
function buildShrimp() {
  const root = new THREE.Group();
  const tilt = new THREE.Group(); root.add(tilt);
  const shell = new THREE.MeshStandardMaterial({ color: 0xff6d4c, emissive: 0x7a2412, roughness: 0.35, transparent: true, opacity: 0.9, envMapIntensity: 0.9 });
  const band = new THREE.MeshStandardMaterial({ color: 0xd8432e, emissive: 0x661a0e, roughness: 0.4, transparent: true, opacity: 0.92, envMapIntensity: 0.9 });
  const thin = new THREE.MeshStandardMaterial({ color: 0xf28a6c, roughness: 0.5, envMapIntensity: 0.6 });
  const black = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.2, envMapIntensity: 1.5 });
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const ballGeo = new THREE.SphereGeometry(1, 10, 8);
  const blob = (mat, sx, sy, sz, x, y, z, to) => {
    const m = new THREE.Mesh(ballGeo, mat);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z); to.add(m);
    return m;
  };

  // head and back, with a little spike at the front
  blob(shell, 0.027, 0.029, 0.052, 0, 0, 0.04, tilt);
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.045, 5), band);
  spike.rotation.x = Math.PI / 2;
  spike.position.set(0, 0.014, 0.1);
  tilt.add(spike);

  // the tail: five segments, each hinged on the one before so the whole tail can curl and flick
  const segs = [];
  let parent = tilt;
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    g.position.set(0, i ? 0 : 0.002, i ? -0.021 : -0.002);
    parent.add(g);
    const r = lerp(0.025, 0.013, i / 4);
    blob(i % 2 ? shell : band, r, r * 1.05, 0.015, 0, 0, -0.0105, g);
    segs.push(g);
    parent = g;
  }
  const fan = new THREE.Group();
  fan.position.set(0, 0, -0.019);
  parent.add(fan);
  for (const a of [-0.6, 0, 0.6]) {
    const h = new THREE.Group();
    h.rotation.y = a;
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.04, 4), band);
    b.rotation.x = Math.PI / 2;
    b.scale.set(1, 1, 0.22);
    b.position.z = -0.02;
    h.add(b);
    fan.add(h);
  }

  // eyes on stalks, two long feelers, a few thin legs
  for (const s of [-1, 1]) {
    const tip = V(s * 0.031, 0.034, 0.084);
    tilt.add(limb(V(s * 0.014, 0.02, 0.072), tip, 0.005, 0.004, shell, 5));
    blob(black, 0.0105, 0.0105, 0.0105, tip.x, tip.y, tip.z, tilt);
  }
  const feelers = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * 0.009, 0.012, 0.088);
    const mid = V(s * 0.012, 0.024, 0.085);
    g.add(limb(V(0, 0, 0), mid, 0.0045, 0.0032, thin, 4));
    const g2 = new THREE.Group();
    g2.position.copy(mid);
    g2.add(limb(V(0, 0, 0), V(s * 0.01, -0.008, 0.085), 0.0032, 0.0018, thin, 4));
    g.add(g2);
    tilt.add(g);
    feelers.push({ g, g2, s });
  }
  const legs = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      g.position.set(s * 0.014, -0.018, 0.07 - i * 0.017);
      g.add(limb(V(0, 0, 0), V(s * 0.015, -0.03, 0.006), 0.004, 0.002, thin, 4));
      tilt.add(g);
      legs.push({ g, s, i });
    }
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  root.add(hit);
  return { root, tilt, segs, fan, feelers, legs, hit };
}

/* ───────────────────────────── garden plants ───────────────────────────── */

const PLANT = {
  poppy: { h: 0.55, col: 0xd8362c, head: 0.1, centre: 0x1c1c1c },
  sunflower: { h: 1.0, col: 0xf2c230, head: 0.17, centre: 0x5a3a1c },
  daisy: { h: 0.4, col: 0xf4f1e6, head: 0.085, centre: 0xe8c547 },
  bluebell: { h: 0.5, col: 0x5a74d8, head: 0.07, droop: true },
  thistle: { h: 0.68, col: 0x9a5fc8, head: 0.09, spiky: true },
  fern: { h: 0.62, form: 'fern' },
  bean: { h: 0.95, form: 'vine' },
  clover: { h: 0.14, form: 'clover', col: 0xe89ab8 },
};
// stage: 0 a seed in the soil, 1 a sprout, 2 a young plant, 3 in bud, 4 fully grown
function buildPlant(kind, stage, seed) {
  const P = PLANT[kind] || PLANT.poppy;
  const r = rng(hashStr(`plant${seed}`));
  const g = new THREE.Group();
  const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8, envMapIntensity: 0.3 }, o));
  const green = mat(0x5c9a54, { side: THREE.DoubleSide }), dark = mat(0x3f7a45, { side: THREE.DoubleSide });
  const add = (geo, m, x, y, z, to = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; to.add(o); return o; };
  add(new THREE.SphereGeometry(0.13, 10, 8), mat(0x3d2c1f, { roughness: 1 }), 0, 0, 0).scale.y = 0.4;
  if (stage <= 0) return g;
  const k = [0, 0.2, 0.55, 0.85, 1][Math.min(4, stage)];
  const h = Math.max(0.07, P.h * k);
  const leaf = (x, y, z, sc, m = green) => {
    const o = add(new THREE.SphereGeometry(1, 8, 6), m, x, y, z);
    o.scale.set(sc, sc * 0.3, sc * 0.55);
    o.rotation.set((r() - 0.5) * 0.8, r() * TAU, (r() - 0.5) * 0.8);
    return o;
  };
  if (P.form === 'fern') {
    const n = 2 + stage * 2;
    for (let i = 0; i < n; i++) {
      const fh = h * (0.7 + r() * 0.4), w = 0.05 + 0.1 * k;
      const geo = new THREE.PlaneGeometry(w, fh, 1, 6);
      geo.translate(0, fh / 2, 0);
      const pos = geo.attributes.position, bend = fh * (0.45 + r() * 0.35);
      for (let j = 0; j < pos.count; j++) { const t = pos.getY(j) / fh; pos.setX(j, pos.getX(j) * (1 - t * 0.85)); pos.setZ(j, bend * t * t); }
      geo.computeVertexNormals();
      add(geo, i % 2 ? green : dark, 0, 0.03, 0).rotation.y = (i / n) * TAU + r() * 0.4;
    }
    return g;
  }
  if (P.form === 'clover') {
    for (let i = 0; i < stage * 5; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 0.24 * k;
      leaf(Math.sin(a) * d, 0.05 + r() * 0.05, Math.cos(a) * d, 0.06 + r() * 0.03, i % 2 ? green : dark).rotation.set(0, r() * TAU, 0);
    }
    if (stage >= 4) for (let i = 0; i < 4; i++) { const a = r() * TAU, d = r() * 0.18; add(new THREE.SphereGeometry(0.04, 8, 6), mat(P.col), Math.sin(a) * d, 0.13, Math.cos(a) * d); }
    return g;
  }
  if (P.form === 'vine') {
    add(new THREE.CylinderGeometry(0.012, 0.016, P.h, 6), mat(0x8a6a3a), 0, P.h / 2, 0);      // the pole it climbs
    const n = stage * 4;
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, a = t * 9; leaf(Math.sin(a) * 0.07, 0.06 + t * h, Math.cos(a) * 0.07, 0.06 + 0.03 * k, i % 2 ? green : dark); }
    if (stage >= 4) for (let i = 0; i < 3; i++) add(new THREE.SphereGeometry(0.03, 8, 6), mat(0x7fb35a), Math.sin(i * 2.1) * 0.09, h * (0.35 + i * 0.2), Math.cos(i * 2.1) * 0.09).scale.set(0.7, 2.4, 0.7);
    return g;
  }
  // a flower on a stem
  add(new THREE.CylinderGeometry(0.011, 0.016, h, 6), dark, 0, h / 2, 0);
  if (stage >= 2) for (let i = 0; i < stage; i++) { const a = r() * TAU; leaf(Math.sin(a) * 0.07, h * (0.2 + 0.5 * r()), Math.cos(a) * 0.07, 0.07 + 0.04 * k); }
  else { leaf(0.04, h, 0, 0.045); leaf(-0.04, h, 0, 0.045); }
  if (stage === 3) add(new THREE.SphereGeometry(P.head * 0.5, 8, 6), green, 0, h + P.head * 0.3, 0).scale.y = 1.3;
  if (stage >= 4) {
    const head = new THREE.Group();
    head.position.set(0, h + 0.02, 0);
    g.add(head);
    const pm = mat(P.col, { roughness: 0.6, side: THREE.DoubleSide });
    if (P.droop) {
      for (let i = 0; i < 3; i++) add(new THREE.ConeGeometry(P.head * 0.6, P.head * 1.5, 8, 1, true), pm, 0.05 + i * 0.03, -i * 0.07, (i - 1) * 0.03, head);
    } else if (P.spiky) {
      add(new THREE.IcosahedronGeometry(P.head, 0), pm, 0, 0, 0, head);
      add(new THREE.SphereGeometry(P.head * 0.8, 8, 6), green, 0, -P.head * 0.7, 0, head);
    } else {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const o = add(new THREE.SphereGeometry(1, 8, 6), pm, Math.cos(a) * P.head * 0.6, 0, Math.sin(a) * P.head * 0.6, head);
        o.scale.set(P.head * 0.55, P.head * 0.12, P.head * 0.32);
        o.rotation.y = -a;
      }
      add(new THREE.SphereGeometry(P.head * 0.38, 10, 8), mat(P.centre), 0, 0, 0, head).scale.y = 0.5;
      head.rotation.x = 0.7;      // tip the face toward the front glass
    }
  }
  return g;
}

/* ───────────────────────────── styles ───────────────────────────── */

const STYLE_ID = 'hc-world-style';
const CSS = `
.hc-world-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;touch-action:none}
.hc-bubble{position:absolute;left:0;top:0;max-width:270px;min-width:60px;padding:9px 13px;border-radius:16px;
  background:rgba(27,33,39,.94);border:1px solid rgba(216,196,154,.5);color:#e6e1d6;
  font:italic 14px/1.4 Georgia,'Iowan Old Style','Palatino Linotype',serif;box-shadow:0 8px 24px rgba(0,0,0,.45);
  pointer-events:none;opacity:0;transition:opacity .35s ease;z-index:3;will-change:transform;overflow-wrap:break-word}
.hc-bubble.hc-on{opacity:1}
.hc-bubble.hc-note{font-style:normal;border-color:rgba(233,118,76,.7)}
.hc-bubble::after,.hc-bubble::before{content:'';position:absolute;left:50%;border-radius:50%;
  background:rgba(27,33,39,.94);border:1px solid rgba(216,196,154,.5)}
.hc-bubble::after{bottom:-12px;width:9px;height:9px;margin-left:-5px}
.hc-bubble::before{bottom:-21px;width:5px;height:5px;margin-left:-3px}
.hc-tip{position:absolute;left:0;top:0;padding:4px 9px;border-radius:7px;background:rgba(18,22,26,.92);
  border:1px solid rgba(230,225,214,.18);color:#e6e1d6;font:12px/1.3 system-ui,'Segoe UI',sans-serif;
  pointer-events:none;white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis;opacity:0;
  transition:opacity .12s ease;z-index:4}
.hc-tip.hc-on{opacity:1}
`;

/* ═════════════════════════════ createWorld ═════════════════════════════ */

export function createWorld(container, opts = {}) {
  const token = opts.token == null ? '' : String(opts.token);
  let crabName = opts.name || '';

  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

  /* ── renderer, scene, camera ── */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const canvas = renderer.domElement;
  canvas.className = 'hc-world-canvas';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x12161a);

  const camera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 120);
  camera.position.set(0, 7, 13.8);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.4, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 6;
  controls.maxDistance = 32;
  controls.minPolarAngle = 0.4;
  controls.maxPolarAngle = 1.44;
  controls.minAzimuthAngle = -1.22;
  controls.maxAzimuthAngle = 1.22;
  controls.rotateSpeed = 0.7;
  controls.update();

  // a tiny hand-made room for reflections: dark walls, a warm lamp, a cool window
  {
    const env = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(40, 24, 40), new THREE.MeshBasicMaterial({ color: 0x141a22, side: THREE.BackSide }));
    env.add(room);
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 6.6, 4.2), side: THREE.DoubleSide }));
    lamp.position.set(8, 11.5, 8); lamp.lookAt(0, 0, 0); env.add(lamp);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 1.0, 1.5), side: THREE.DoubleSide }));
    win.position.set(-19, 4, -4); win.lookAt(0, 2, 0); env.add(win);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x3a2a1c, side: THREE.DoubleSide }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = -6; env.add(glow);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.04).texture;
    pm.dispose();
    disposeTree(env);
  }

  /* ── lights ── */
  const hemi = new THREE.HemisphereLight(0x9db4d6, 0x4a3826, 0.5);
  scene.add(hemi);
  const key = new THREE.SpotLight(0xffdfb4, 3.3, 0, 0.6, 0.85, 0);
  key.position.set(6.5, 12.5, 8.5);
  key.target.position.set(-0.3, 0, -0.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 5;
  key.shadow.camera.far = 32;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 5;
  scene.add(key, key.target);
  const key2 = new THREE.SpotLight(0xffdfb4, 3.0, 0, 0.5, 0.85, 0);       // the same lamp again, over the second tank
  key2.position.set(G2.cx + 6.5, 12.5, 8.5);
  key2.target.position.set(G2.cx + 0.4, 0, -0.4);
  key2.castShadow = true;
  key2.shadow.mapSize.set(1024, 1024);
  key2.shadow.camera.near = 5;
  key2.shadow.camera.far = 32;
  key2.shadow.bias = -0.0004;
  key2.shadow.normalBias = 0.025;
  key2.shadow.radius = 5;
  scene.add(key2, key2.target);
  const rimLight = new THREE.DirectionalLight(0x7fa0d0, 0.55);
  rimLight.position.set(-8, 5, -6);
  scene.add(rimLight);

  /* ── static set ── */
  const setG = new THREE.Group();
  scene.add(setG);
  const addSet = (m, castS = true, recv = true) => { m.castShadow = castS; m.receiveShadow = recv; setG.add(m); return m; };

  // desk
  const deskTex = canvasTex(512, (c, n) => {
    c.fillStyle = '#3a2618'; c.fillRect(0, 0, n, n);
    const r = rng(11);
    for (let i = 0; i < 420; i++) {
      const y = r() * n, l = 60 + r() * 420, x = r() * n;
      c.strokeStyle = r() > 0.5 ? `rgba(20,10,4,${0.08 + r() * 0.22})` : `rgba(140,96,60,${0.04 + r() * 0.1})`;
      c.lineWidth = 0.6 + r() * 2.2;
      c.beginPath(); c.moveTo(x, y);
      c.bezierCurveTo(x + l * 0.3, y + (r() - 0.5) * 6, x + l * 0.6, y + (r() - 0.5) * 6, x + l, y + (r() - 0.5) * 4);
      c.stroke();
      if (x + l > n) { c.beginPath(); c.moveTo(x - n, y); c.lineTo(x + l - n, y); c.stroke(); }
    }
    for (let i = 0; i < 5; i++) { c.fillStyle = 'rgba(12,6,3,.5)'; c.fillRect(0, Math.floor(r() * n), n, 2); }
  }, 5, 5);
  const desk = addSet(new THREE.Mesh(new THREE.PlaneGeometry(90, 70), new THREE.MeshStandardMaterial({ map: deskTex, roughness: 0.55, envMapIntensity: 0.5 })), false, true);
  desk.rotation.x = -Math.PI / 2;
  desk.position.y = -BASE_H;

  // trim base
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x24282d, roughness: 0.45, metalness: 0.3, envMapIntensity: 0.8 });
  const RIM = 0.1, FR = 0.22;
  for (const sz of [-1, 1]) {
    const b = addSet(new THREE.Mesh(new THREE.BoxGeometry(HALF_X * 2 + FR * 2, RIM + BASE_H, FR), trimMat));
    b.position.set(0, (RIM - BASE_H) / 2, sz * (HALF_Z + FR / 2));
  }
  for (const sx of [-1, 1]) {
    const b = addSet(new THREE.Mesh(new THREE.BoxGeometry(FR, RIM + BASE_H, HALF_Z * 2), trimMat));
    b.position.set(sx * (HALF_X + FR / 2), (RIM - BASE_H) / 2, 0);
  }

  // sand
  const sandTex = canvasTex(256, (c, n) => {
    c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, n, n);
    const r = rng(5);
    for (let i = 0; i < 9000; i++) {
      const v = r();
      c.fillStyle = v > 0.55 ? `rgba(255,255,255,${0.25 + r() * 0.5})` : `rgba(96,74,44,${0.1 + r() * 0.35})`;
      c.fillRect(r() * n, r() * n, 1 + (r() > 0.85 ? 1 : 0), 1);
    }
  }, 9, 6);
  {
    const geo = new THREE.PlaneGeometry(HALF_X * 2, HALF_Z * 2, 156, 108);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const dry = new THREE.Color(SAND), wet = new THREE.Color(0x8f7650), poolFloor = new THREE.Color(0x6f8f8c), shade = new THREE.Color(0x77654a);
    const c = new THREE.Color();
    const r = rng(3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, sandH(x, z));
      const dp = Math.hypot(x - POOL.x, z - POOL.z);
      const dc = Math.hypot(x + HALF_X, z + HALF_Z);
      const dh = Math.hypot(x - HOLLOW.x, z - HOLLOW.z);
      c.copy(dry);
      c.lerp(wet, Math.max(sstep(2.2, 1.65, dp) * 0.85, sstep(3.7, 2.2, dc + Math.sin(x * 2.1 + z) * 0.18) * 0.8));
      c.lerp(poolFloor, sstep(1.6, 0.7, dp) * 0.75);
      c.lerp(shade, Math.exp(-(dh * dh) / (2 * 0.9 * 0.9)) * 0.6);
      c.multiplyScalar(0.95 + r() * 0.1);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    addSet(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: sandTex, roughness: 0.95, envMapIntensity: 0.25 })), false, true);
  }

  // glass
  const GH = 3.5;
  const glassMat = (o) => new THREE.MeshPhysicalMaterial({ color: 0xc4dcea, transparent: true, opacity: o, roughness: 0.04, metalness: 0, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.9 });
  const pane = (w, x, z, ry, o) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, GH), glassMat(o));
    m.position.set(x, RIM + GH / 2, z); m.rotation.y = ry; m.renderOrder = 5; setG.add(m);
  };
  pane(HALF_X * 2, 0, -HALF_Z, 0, 0.075);
  pane(HALF_Z * 2, -HALF_X, 0, Math.PI / 2, 0.06);
  pane(HALF_Z * 2, HALF_X, 0, Math.PI / 2, 0.06);
  pane(HALF_X * 2, 0, HALF_Z, 0, 0.018);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(HALF_X * 2, GH, HALF_Z * 2)),
    new THREE.LineBasicMaterial({ color: 0xcfe3ee, transparent: true, opacity: 0.3 }),
  );
  edges.position.y = RIM + GH / 2;
  edges.renderOrder = 6;
  setG.add(edges);

  // tide pool
  const causticTex = canvasTex(256, (c, n) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, n, n);
    const r = rng(21);
    c.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const cx = r() * n, cy = r() * n, rad = 10 + r() * 26;
      c.strokeStyle = `rgba(255,255,255,${0.25 + r() * 0.45})`;
      c.lineWidth = 1.2 + r() * 2.2;
      for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {
        c.beginPath();
        for (let a = 0; a <= 28; a++) {
          const an = (a / 28) * TAU;
          const rr = rad * (0.75 + 0.35 * Math.sin(an * 3 + i));
          const px = cx + ox + Math.cos(an) * rr, py = cy + oy + Math.sin(an) * rr * 0.8;
          if (a === 0) c.moveTo(px, py); else c.lineTo(px, py);
        }
        c.stroke();
      }
    }
  }, 2.2, 2.2);
  const caustic2 = causticTex.clone();
  caustic2.repeat.set(1.5, 1.5);
  caustic2.needsUpdate = true;
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.05, 56), new THREE.MeshPhysicalMaterial({
    color: 0x3f9dc0, transparent: true, opacity: 0.56, roughness: 0.06, metalness: 0.1, depthWrite: false, envMapIntensity: 1.6,
  }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(POOL.x, POOL.level, POOL.z);
  water.renderOrder = 1;
  setG.add(water);
  const shimmer = [];
  for (const [tex, op] of [[causticTex, 0.2], [caustic2, 0.14]]) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(2.05, 40), new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xbfeaff,
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(POOL.x, POOL.level + 0.004 * (shimmer.length + 1), POOL.z);
    m.renderOrder = 2;
    setG.add(m);
    shimmer.push(tex);
  }

  // tide water in the back-left corner: a flat sheet whose level rises and falls against the sloping sand
  const tideMat = new THREE.MeshPhysicalMaterial({ color: 0x8cc6d6, transparent: true, opacity: 0.5, roughness: 0.1, depthWrite: false, envMapIntensity: 1.4 });
  const tideWater = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.2), tideMat);
  tideWater.rotation.x = -Math.PI / 2;
  tideWater.position.set(-HALF_X + 2.1, TIDE_IDLE, -HALF_Z + 1.6);
  tideWater.renderOrder = 1;
  setG.add(tideWater);
  const foamGeo = new THREE.RingGeometry(0.94, 1, 48, 1, Math.PI * 1.5, Math.PI / 2);
  foamGeo.rotateX(-Math.PI / 2);
  const foam = new THREE.Mesh(foamGeo, new THREE.MeshBasicMaterial({ color: 0xf2fbfb, transparent: true, opacity: 0, depthWrite: false }));
  foam.position.set(-HALF_X, TIDE_IDLE, -HALF_Z);
  foam.renderOrder = 2;
  setG.add(foam);
  const tide = { t: -1, dur: 2.6, level: TIDE_IDLE };

  // driftwood
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x9f8f7d, roughness: 0.92, envMapIntensity: 0.3 });
  {
    const T0 = -0.1, T1 = 1.08;
    const full = LOG_A.distanceTo(LOG_B);
    const geo = new THREE.CylinderGeometry(lerp(LOG_R0, LOG_R1, T1), lerp(LOG_R0, LOG_R1, T0), full * (T1 - T0), 18, 14);
    const p = geo.attributes.position, nrm = geo.attributes.normal;
    const colors = new Float32Array(p.count * 3);
    const a = new THREE.Color(0xa99a88), b = new THREE.Color(0x7b6d5e), cut = new THREE.Color(0xcdbb9e), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const ang = Math.atan2(z, x);
      const cap = Math.abs(nrm.getY(i)) > 0.9;
      if (!cap) {
        const k = 1 + 0.05 * Math.sin(ang * 3 + y * 2.1) + 0.035 * Math.sin(y * 6.5 + ang * 2);
        p.setX(i, x * k); p.setZ(i, z * k);
        c.copy(a).lerp(b, 0.5 + 0.5 * Math.sin(ang * 7 + Math.sin(y * 1.7) * 2.5));
      } else c.copy(cut).multiplyScalar(0.8 + 0.2 * Math.sin(Math.hypot(x, z) * 40));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const log = addSet(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, envMapIntensity: 0.3 })));
    const dir = new THREE.Vector3().subVectors(LOG_B, LOG_A).normalize();
    log.position.copy(LOG_A).lerp(LOG_B, (T0 + T1) / 2);
    log.quaternion.setFromUnitVectors(UP, dir);
    // a limb reaching forward over the hollow, a couple of broken stubs
    addSet(limb(new THREE.Vector3(4.45, 1.6, -2.95), new THREE.Vector3(6.02, 1.12, -0.72), 0.2, 0.12, woodMat, 10));
    addSet(limb(new THREE.Vector3(2.55, 0.95, -1.85), new THREE.Vector3(2.75, 1.42, -1.55), 0.1, 0.05, woodMat, 8));
    addSet(limb(new THREE.Vector3(3.4, 1.2, -2.5), new THREE.Vector3(3.2, 1.65, -2.95), 0.09, 0.04, woodMat, 8));
  }

  // the hook over the hollow
  const hookFx = { thread: null };
  {
    const iron = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.8 });
    const eye = addSet(new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.011, 8, 16, Math.PI * 1.5), iron));
    eye.position.set(HOOK.x, HOOK.y - 0.03, HOOK.z);
    eye.rotation.z = Math.PI * 0.75;
    const stem = addSet(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.08, 6), iron));
    stem.position.set(HOOK.x, HOOK.y + 0.04, HOOK.z);
    hookFx.thread = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 5),
      new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.9 }));
    hookFx.thread.visible = false;
    setG.add(hookFx.thread);
  }

  // rocks
  const rock = (x, z, sx, sy, sz, seed, color, sink = 0.3) => {
    const geo = jitterGeo(new THREE.IcosahedronGeometry(1, 1), 0.13, seed);
    const m = addSet(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, envMapIntensity: 0.35 })));
    m.scale.set(sx, sy, sz);
    m.position.set(x, sandH(x, z) + sy * (1 - sink) - sy * 0.25, z);
    m.rotation.y = seed * 1.7;
    return m;
  };
  rock(4.95, -3.4, 0.8, 1.05, 0.72, 1, 0x6a7078, 0.1);
  rock(5.75, -3.55, 0.5, 0.6, 0.5, 2, 0x5a6067, 0.15);
  rock(6.05, -0.55, 0.52, 0.86, 0.56, 3, 0x646a72, 0.1);
  rock(-2.25, 2.75, 0.38, 0.3, 0.32, 4, 0x70767c);
  rock(-5.65, 2.2, 0.45, 0.4, 0.4, 5, 0x5f656c);
  rock(-5.25, 2.75, 0.22, 0.18, 0.2, 6, 0x7a7f84);
  rock(-1.9, -3.75, 0.25, 0.2, 0.22, 7, 0x6b7076);

  // the stone ledge
  {
    const stone = new THREE.MeshStandardMaterial({ color: 0x7c8087, roughness: 0.85, envMapIntensity: 0.35 });
    const stoneTop = new THREE.MeshStandardMaterial({ color: 0x8d9197, roughness: 0.8, envMapIntensity: 0.4 });
    const lower = addSet(new THREE.Mesh(jitterGeo(new THREE.BoxGeometry(LEDGE.w, 0.5, LEDGE.d, 6, 1, 4), 0.012, 31), stone));
    lower.position.set(LEDGE.x, LEDGE.top - 0.08 - 0.25, LEDGE.z);
    const top = addSet(new THREE.Mesh(new THREE.BoxGeometry(LEDGE.w - 0.1, 0.08, LEDGE.d - 0.1), stoneTop));
    top.position.set(LEDGE.x, LEDGE.top - 0.04, LEDGE.z);
  }

  // the tool chest at the back of the ledge
  const chest = { hit: null, drawer: null, open: 0, hold: 0, count: 0 };
  {
    const red = new THREE.MeshStandardMaterial({ color: 0xc23a2e, roughness: 0.38, metalness: 0.35, envMapIntensity: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x8e241d, roughness: 0.45, metalness: 0.35, envMapIntensity: 0.6 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.25, metalness: 0.9, envMapIntensity: 0.9 });
    const black = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.8 });
    const g = new THREE.Group();
    g.position.set(CHEST.x, CHEST.y, CHEST.z);
    const box = (w, h, d, m, x, y, z, to = g) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; to.add(o); return o;
    };
    const { w, h, d } = CHEST;
    box(w, h, d, red, 0, h / 2, 0);                                   // body
    box(w + 0.05, 0.05, d + 0.05, dark, 0, h + 0.025, 0);             // lid
    box(w + 0.02, 0.03, d + 0.02, black, 0, 0.0, 0);                  // base strip
    for (const s of [-1, 1]) {                                        // side handles
      box(0.03, 0.04, 0.26, steel, s * (w / 2 + 0.03), h * 0.62, 0);
    }
    const rows = [0.14, 0.33, 0.52].map((k) => k / 0.62 * h);
    rows.forEach((y, i) => {
      const dg = new THREE.Group();
      dg.position.set(0, y, d / 2);
      box(w - 0.1, 0.15, 0.03, dark, 0, 0, 0.012, dg);                // drawer front
      box(w - 0.5, 0.025, 0.035, steel, 0, 0.02, 0.04, dg);           // handle
      if (i === 2) {                                                  // the top drawer really slides
        box(w - 0.16, 0.02, 0.3, black, 0, -0.065, -0.15, dg);        // its floor
        for (const s of [-1, 1]) box(0.02, 0.13, 0.3, dark, s * (w / 2 - 0.08), 0, -0.15, dg);
        chest.drawer = dg;
      }
      g.add(dg);
    });
    const hit = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, d + 0.1), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, h / 2, 0);
    hit.userData.pick = { type: 'chest' };
    g.add(hit);
    chest.hit = hit;
    setG.add(g);
  }

  // sea-grass
  const tufts = [];
  {
    const mats = [0x5f8f5a, 0x7aa66a, 0x4d7a52].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide, envMapIntensity: 0.3 }));
    const tuft = (x, z, n, hgt, seed) => {
      const r = rng(seed);
      const g = new THREE.Group();
      for (let i = 0; i < n; i++) {
        const h = hgt * (0.6 + r() * 0.5);
        const geo = new THREE.PlaneGeometry(0.075, h, 1, 6);
        geo.translate(0, h / 2, 0);
        const p = geo.attributes.position;
        const bend = 0.12 + r() * 0.28;
        for (let j = 0; j < p.count; j++) {
          const k = p.getY(j) / h;
          p.setX(j, p.getX(j) * (1 - k * 0.9));
          p.setZ(j, bend * k * k);
        }
        geo.computeVertexNormals();
        const blade = new THREE.Mesh(geo, mats[i % 3]);
        blade.castShadow = true;
        blade.rotation.y = r() * TAU;
        blade.position.set((r() - 0.5) * 0.22, 0, (r() - 0.5) * 0.22);
        g.add(blade);
      }
      g.position.set(x, sandH(x, z) - 0.02, z);
      setG.add(g);
      tufts.push({ g, ph: r() * 6 });
    };
    tuft(-5.75, 1.75, 9, 0.95, 1);
    tuft(-5.3, 2.35, 6, 0.6, 2);
    tuft(-2.0, 2.95, 7, 0.7, 3);
    tuft(5.95, 3.6, 9, 0.9, 4);
    tuft(5.4, 3.85, 5, 0.55, 5);
    tuft(2.4, -3.75, 8, 0.8, 6);
    tuft(-2.6, -3.7, 6, 0.6, 7);
    tuft(6.1, 1.7, 6, 0.6, 8);
  }

  /* ── the second tank: moss bank, spring, garden bed, cave, sand track ── */
  const garden = { plants: new Map(), drip: 0, crystal: null };
  {
    const cx = G2.cx, hx = (G2.x1 - G2.x0) / 2;
    for (const sz of [-1, 1]) {
      const b = addSet(new THREE.Mesh(new THREE.BoxGeometry(hx * 2 + FR * 2, RIM + BASE_H, FR), trimMat));
      b.position.set(cx, (RIM - BASE_H) / 2, sz * (HALF_Z + FR / 2));
    }
    for (const sx of [-1, 1]) {
      const b = addSet(new THREE.Mesh(new THREE.BoxGeometry(FR, RIM + BASE_H, HALF_Z * 2), trimMat));
      b.position.set(cx + sx * (hx + FR / 2), (RIM - BASE_H) / 2, 0);
    }

    // ground
    {
      const geo = new THREE.PlaneGeometry(hx * 2, HALF_Z * 2, 120, 108);
      geo.rotateX(-Math.PI / 2);
      geo.translate(cx, 0, 0);
      const p = geo.attributes.position;
      const colors = new Float32Array(p.count * 3);
      const dry = new THREE.Color(0xd3c59c), wet = new THREE.Color(0x8f7650), poolFloor = new THREE.Color(0x6f8f8c);
      const lane = new THREE.Color(0xb9a377), moss = new THREE.Color(0x5f8f4a), mossDark = new THREE.Color(0x44703c), shade = new THREE.Color(0x6a5b45);
      const c = new THREE.Color(), mc = new THREE.Color();
      const r = rng(17);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        p.setY(i, sandH(x, z));
        const ds = Math.hypot(x - SPRING.x, z - SPRING.z), dc = Math.hypot(x - CAVE.x, z - CAVE.z);
        const n = 0.5 + 0.5 * Math.sin(x * 5.1 + Math.sin(z * 3.3) * 2);
        c.copy(dry);
        c.lerp(lane, laneAt(x, z) * 0.6);
        c.lerp(wet, sstep(SPRING.r + 0.8, SPRING.r + 0.15, ds) * 0.85);
        c.lerp(poolFloor, sstep(SPRING.r, 0.3, ds) * 0.75);
        const green = clamp(mossAt(x, z) * 1.9 - 0.3 + (n - 0.5) * 0.3, 0, 1)
          + sstep(-3.3, -4.3, z) * 0.55 * n + sstep(G2.x1 - 1.0, G2.x1 - 0.1, x) * 0.4 * n;
        mc.copy(moss).lerp(mossDark, n);
        c.lerp(mc, clamp(green, 0, 1));
        c.lerp(shade, Math.exp(-(dc * dc) / (2 * 0.8 * 0.8)) * 0.6);
        c.multiplyScalar(0.95 + r() * 0.1);
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      addSet(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: sandTex, roughness: 0.95, envMapIntensity: 0.25 })), false, true);
    }

    // glass
    pane(hx * 2, cx, -HALF_Z, 0, 0.075);
    pane(HALF_Z * 2, G2.x0, 0, Math.PI / 2, 0.06);
    pane(HALF_Z * 2, G2.x1, 0, Math.PI / 2, 0.06);
    pane(hx * 2, cx, HALF_Z, 0, 0.018);
    const edges2 = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(hx * 2, GH, HALF_Z * 2)),
      new THREE.LineBasicMaterial({ color: 0xcfe3ee, transparent: true, opacity: 0.3 }),
    );
    edges2.position.set(cx, RIM + GH / 2, 0);
    edges2.renderOrder = 6;
    setG.add(edges2);

    // the tube between the tanks
    {
      const len = G2.x0 - HALF_X + 0.36, mid = (HALF_X + G2.x0) / 2, y = TUBE.floor + TUBE.r - 0.2;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(TUBE.r, TUBE.r, len, 32, 1, true), new THREE.MeshPhysicalMaterial({
        color: 0xc4dcea, transparent: true, opacity: 0.17, roughness: 0.03, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.4,
      }));
      tube.rotation.z = Math.PI / 2;
      tube.position.set(mid, y, TUBE.z);
      tube.renderOrder = 5;
      setG.add(tube);
      for (const x of [HALF_X - 0.18, HALF_X + FR, G2.x0 - FR, G2.x0 + 0.18]) {
        const collar = addSet(new THREE.Mesh(new THREE.TorusGeometry(TUBE.r + 0.02, 0.045, 10, 36), trimMat));
        collar.rotation.y = Math.PI / 2;
        collar.position.set(x, y, TUBE.z);
      }
      const floor = addSet(new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, 1.06),
        new THREE.MeshStandardMaterial({ color: SAND, map: sandTex, roughness: 0.95, envMapIntensity: 0.25 })), false, true);
      floor.position.set(mid, TUBE.floor - 0.1, TUBE.z);
    }

    // moss bank: soft clumps over the mound
    {
      const n = 70, r = rng(41);
      const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1),
        new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true, envMapIntensity: 0.2 }), n);
      const o = new THREE.Object3D(), cc = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 1.5;
        const x = clamp(MOSS.x + Math.sin(a) * d * 1.1, G2.x0 + 0.45, G2.x1), z = clamp(MOSS.z + Math.cos(a) * d * 0.9, -HALF_Z + 0.4, 0);
        const sc = 0.12 + r() * 0.2;
        o.position.set(x, sandH(x, z) + sc * 0.12, z);
        o.scale.set(sc, sc * 0.5, sc);
        o.rotation.y = r() * TAU;
        o.updateMatrix();
        im.setMatrixAt(i, o.matrix);
        im.setColorAt(i, cc.setHex(r() > 0.5 ? 0x5f8f4a : 0x4d7a41).multiplyScalar(0.85 + r() * 0.35));
      }
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor.needsUpdate = true;
      addSet(im, true, true);
    }

    // spring: rocks, a trickle, a small pool
    rock(17.2, -3.5, 0.85, 1.15, 0.8, 11, 0x646a72, 0.1);
    rock(17.55, -2.2, 0.5, 0.55, 0.5, 12, 0x5a6067, 0.15);
    rock(15.6, -3.75, 0.45, 0.4, 0.42, 13, 0x70767c);
    {
      const pool2 = new THREE.Mesh(new THREE.CircleGeometry(SPRING.r + 0.22, 40), water.material.clone());
      pool2.rotation.x = -Math.PI / 2;
      pool2.position.set(SPRING.x, SPRING.level, SPRING.z);
      pool2.renderOrder = 1;
      setG.add(pool2);
      const trickle = limb(new THREE.Vector3(16.85, 1.05, -3.15), new THREE.Vector3(16.55, SPRING.level, -2.75), 0.035, 0.05,
        new THREE.MeshPhysicalMaterial({ color: 0xcfeef6, transparent: true, opacity: 0.7, roughness: 0.05, depthWrite: false, envMapIntensity: 1.6 }), 8);
      trickle.renderOrder = 2;
      setG.add(trickle);
    }

    // garden bed: dark soil inside a border of sticks
    {
      const soil = addSet(new THREE.Mesh(jitterGeo(new THREE.BoxGeometry(BED.w, 0.3, BED.d, 14, 1, 7), 0.02, 51),
        new THREE.MeshStandardMaterial({ color: 0x46321f, roughness: 1, envMapIntensity: 0.15 })), false, true);
      soil.position.set(BED.x, BED.top - 0.15, BED.z);
      const hw = BED.w / 2 + 0.05, hd = BED.d / 2 + 0.05, y = BED.top + 0.02;
      const stick = (ax, az, bx, bz) => addSet(limb(new THREE.Vector3(ax, y, az), new THREE.Vector3(bx, y, bz), 0.075, 0.065, woodMat, 8));
      stick(BED.x - hw - 0.1, BED.z + hd, BED.x + hw + 0.1, BED.z + hd);
      stick(BED.x - hw - 0.1, BED.z - hd, BED.x + hw + 0.1, BED.z - hd);
      stick(BED.x - hw, BED.z - hd - 0.1, BED.x - hw, BED.z + hd + 0.1);
      stick(BED.x + hw, BED.z - hd - 0.1, BED.x + hw, BED.z + hd + 0.1);
    }

    // cave: two boulders, a slab across them, the dark between, and something glinting
    rock(16.05, 0.2, 0.62, 0.95, 0.7, 21, 0x5d636a, 0.1);
    rock(17.75, 0.2, 0.62, 0.9, 0.7, 22, 0x666c73, 0.1);
    rock(16.9, -0.6, 0.85, 1.0, 0.5, 23, 0x4f555c, 0.1);
    {
      const slab = addSet(new THREE.Mesh(jitterGeo(new THREE.IcosahedronGeometry(1, 1), 0.1, 24),
        new THREE.MeshStandardMaterial({ color: 0x5a6067, roughness: 0.9, flatShading: true, envMapIntensity: 0.35 })));
      slab.scale.set(1.55, 0.36, 0.85);
      slab.position.set(CAVE.x, 1.42, CAVE.z);
      const dark = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.15), new THREE.MeshBasicMaterial({ color: 0x2b1c0e }));   // lamplit rock at the back
      dark.position.set(CAVE.x, 0.6, CAVE.z + 0.05);
      setG.add(dark);
      // a lantern hung under the slab, so the cave is no longer pitch dark
      {
        const lx = CAVE.x - 0.28, ly = 0.98, lz = CAVE.z + 0.62;
        const iron = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.7, metalness: 0.6 });
        garden.flame = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffa640, emissiveIntensity: 2.4, roughness: 0.4 });
        const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 5), iron); hook.position.set(lx, ly + 0.17, lz);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.05, 6), iron); cap.position.set(lx, ly + 0.085, lz);
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 6), garden.flame); glass.position.set(lx, ly, lz);
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 6), iron); foot.position.set(lx, ly - 0.065, lz);
        setG.add(hook, cap, glass, foot);
        garden.lamp = new THREE.PointLight(0xffb060, 2.2, 3.6, 1.6);
        garden.lamp.position.set(lx, ly - 0.05, lz - 0.1);
        scene.add(garden.lamp);
      }
      garden.crystal = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x55d8ff, emissiveIntensity: 1.5, roughness: 0.3 });
      for (const [x, z, hgt] of [[16.62, 0.45, 0.2], [17.15, 0.5, 0.28], [16.9, 0.36, 0.14]]) {
        const cr = new THREE.Mesh(new THREE.ConeGeometry(0.05, hgt, 5), garden.crystal);
        cr.position.set(x, sandH(x, z) + hgt / 2 - 0.02, z);
        cr.rotation.set((x * 7) % 0.4 - 0.2, 0, (z * 5) % 0.4 - 0.2);
        setG.add(cr);
      }
    }

    // the reading stone: a flat stone with a fat book lying open on it, tipped toward the reader
    {
      const y0 = sandH(BOOK.x, BOOK.z);
      const stone = addSet(new THREE.Mesh(jitterGeo(new THREE.CylinderGeometry(0.62, 0.7, 0.22, 9, 1), 0.04, 61),
        new THREE.MeshStandardMaterial({ color: 0x7c8087, roughness: 0.9, flatShading: true, envMapIntensity: 0.3 })));
      stone.position.set(BOOK.x, y0 + 0.08, BOOK.z);
      const book = new THREE.Group();
      const cover = new THREE.MeshStandardMaterial({ color: 0x6e2f2a, roughness: 0.7 });
      const paper = new THREE.MeshStandardMaterial({ color: 0xefe6cf, roughness: 0.95 });
      const ink = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 1 });
      const part = (geo, mat, x, y, z, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = true; m.receiveShadow = true; book.add(m); return m; };
      part(new THREE.BoxGeometry(0.96, 0.03, 0.62), cover, 0, 0, 0);
      for (const sx of [-1, 1]) {
        part(new THREE.BoxGeometry(0.44, 0.07, 0.56), paper, sx * 0.23, 0.045, 0, -sx * 0.07);
        for (let i = 0; i < 5; i++) part(new THREE.BoxGeometry(0.3, 0.004, 0.018), ink, sx * 0.23, 0.083 - 0.004, -0.18 + i * 0.085, -sx * 0.07);
      }
      part(new THREE.BoxGeometry(0.03, 0.02, 0.85), new THREE.MeshStandardMaterial({ color: 0xc8443a, roughness: 0.8 }), 0.04, 0.085, 0.16);   // a ribbon
      book.position.set(BOOK.x, y0 + 0.2, BOOK.z);
      book.rotation.x = 0.22;
      setG.add(book);
    }

    // sand track: red and white kerbs round the inside, a chequered line across the lane
    {
      const n = 46, R = TRACK.r - 0.42;
      const km = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.04, 0.11), new THREE.MeshStandardMaterial({ roughness: 0.7 }), n);
      const o = new THREE.Object3D(), cc = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const a = trackPt(i / n, R), b = trackPt((i + 0.2) / n, R);
        o.position.set(a.x, sandH(a.x, a.z) + 0.012, a.z);
        o.rotation.set(0, -Math.atan2(b.z - a.z, b.x - a.x), 0);
        o.updateMatrix();
        km.setMatrixAt(i, o.matrix);
        km.setColorAt(i, cc.setHex(i % 2 ? 0xf2efe6 : 0xc8443a));
      }
      km.instanceMatrix.needsUpdate = true;
      km.instanceColor.needsUpdate = true;
      addSet(km, false, true);
      const chequer = canvasTex(64, (c, s) => {
        const q = s / 8;
        for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { c.fillStyle = (i + j) % 2 ? '#1c1d20' : '#f2efe6'; c.fillRect(i * q, j * q, q, q); }
      }, 0.375, 1);
      chequer.magFilter = THREE.NearestFilter;
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.72), new THREE.MeshStandardMaterial({ map: chequer, roughness: 0.9 }));
      line.rotation.x = -Math.PI / 2;
      const a = ANCHOR.track;
      line.position.set(a.x - 0.5, sandH(a.x - 0.5, a.z) + 0.014, a.z);
      line.receiveShadow = true;
      setG.add(line);
    }
  }
  function syncPlants(list) {
    const seen = new Set();
    for (const pl of Array.isArray(list) ? list : []) {
      seen.add(pl.id);
      const sig = `${pl.kind}|${pl.stage}`;
      const cur = garden.plants.get(pl.id);
      if (cur && cur.sig === sig) continue;
      if (cur) { scene.remove(cur.g); disposeTree(cur.g); }
      const g = buildPlant(pl.kind, pl.stage | 0, pl.id);
      const slot = pl.slot | 0;
      g.position.set(BED.x - 1.05 + (slot % 4) * 0.7, BED.top, BED.z + 0.32 - Math.floor(slot / 4) * 0.64);
      g.scale.setScalar(1.35);
      scene.add(g);
      garden.plants.set(pl.id, { g, sig, ph: (pl.id * 1.7) % 6 });
    }
    for (const [id, cur] of [...garden.plants]) {
      if (!seen.has(id)) { scene.remove(cur.g); disposeTree(cur.g); garden.plants.delete(id); }
    }
  }

  /* ── effects: ripples, particles, selection ring ── */
  const ripples = [];
  for (let i = 0; i < 10; i++) {
    const geo = new THREE.RingGeometry(0.88, 1, 40);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xe6f6fa, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false; m.renderOrder = 3;
    scene.add(m);
    ripples.push({ m, t: 0, life: 0, r0: 0, r1: 0 });
  }
  function spawnRipple(x, y, z, r0, r1, life) {
    const rp = ripples.find((q) => !q.m.visible) || ripples[0];
    rp.m.position.set(x, y, z); rp.t = 0; rp.life = life; rp.r0 = r0; rp.r1 = r1; rp.m.visible = true;
  }
  const puffs = [];
  const puffGeo = new THREE.SphereGeometry(0.035, 6, 5);
  for (let i = 0; i < 28; i++) {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshStandardMaterial({ color: SAND, roughness: 1 }));
    m.visible = false; m.castShadow = true;
    scene.add(m);
    puffs.push({ m, v: new THREE.Vector3(), t: 0, life: 0, floor: 0 });
  }
  function spawnPuff(x, y, z, n, color, spread = 1) {
    for (let i = 0; i < n; i++) {
      const p = puffs.find((q) => !q.m.visible);
      if (!p) return;
      const a = Math.random() * TAU, s = (0.5 + Math.random() * 0.9) * spread;
      p.m.position.set(x, y + 0.03, z);
      p.v.set(Math.sin(a) * s, 1.3 + Math.random() * 1.3, Math.cos(a) * s);
      p.m.material.color.set(color);
      p.m.scale.setScalar(0.6 + Math.random() * 0.9);
      p.t = 0; p.life = 0.5 + Math.random() * 0.35; p.floor = y; p.m.visible = true;
    }
  }
  const selRingGeo = new THREE.RingGeometry(0.25, 0.3, 36);
  selRingGeo.rotateX(-Math.PI / 2);
  const selRing = new THREE.Mesh(selRingGeo, new THREE.MeshBasicMaterial({ color: CORAL, transparent: true, opacity: 0.85, depthWrite: false }));
  selRing.visible = false; selRing.renderOrder = 4;
  scene.add(selRing);
  let selectedId = null;

  /* ── the crab ── */
  const C = buildCrab();
  scene.add(C.root);
  const crab = {
    pos: new THREE.Vector3(0, 0, 3.3), heading: 0, headingT: 0, pitch: 0,
    at: 'glass', onLog: false, mixed: null,
    tier: -1, scale: 1, scaleT: 1, scaleLock: false,
    tk: 0, tuckT: 0, walkPhase: 0, blink: 2, blinkOn: 0, boop: 0,
  };
  const ZERO = { dip: 0, lean: 0, hop: 0, yaw: 0, scuttle: 0, clawL: 0, clawR: 0, eyes: 0, scribble: 0, sink: 0 };
  const pose = Object.assign({}, ZERO), A = Object.assign({}, ZERO);
  const resetPose = () => Object.assign(pose, ZERO);

  function setTier(t) {
    t = clamp(t | 0, 0, 3);
    if (t === crab.tier) return;
    if (C.helmet) { C.helmetG.remove(C.helmet.group); disposeTree(C.helmet.group); }
    C.helmet = buildHelmet(t);
    C.helmetG.add(C.helmet.group);
    crab.tier = t;
    crab.scaleT = C.helmet.scale;
  }
  function placeCrab(place) {
    const a = anchorOf(place);
    crab.at = place; crab.onLog = !!a.log; crab.mixed = null;
    crab.pos.set(a.x, support(a.x, a.z, crab.onLog), a.z);
    crab.heading = crab.headingT = a.face;
  }

  const _v = new THREE.Vector3();
  function updateCrab(dt, time) {
    crab.heading += angDiff(crab.headingT, crab.heading) * (1 - Math.exp(-dt * 9));
    const tkStep = dt * 1.5;
    crab.tk = crab.tk < crab.tuckT ? Math.min(crab.tuckT, crab.tk + tkStep) : Math.max(crab.tuckT, crab.tk - tkStep);
    // the body pulls in first, then the helmet settles over it
    const e = sstep(0.3, 1, crab.tk), eb = sstep(0, 0.62, crab.tk);
    for (const k in pose) A[k] = damp(A[k], pose[k], k === 'hop' ? 22 : 13, dt);
    if (!crab.scaleLock) crab.scale = damp(crab.scale, crab.scaleT, 6, dt);
    crab.boop = Math.max(0, crab.boop - dt * 3.2);

    // stay on the surface, tip with the slope
    let pitchT;
    if (crab.mixed) pitchT = crab.mixed.pitch;
    else {
      crab.pos.y = support(crab.pos.x, crab.pos.z, crab.onLog);
      const fx = Math.sin(crab.heading), fz = Math.cos(crab.heading);
      const h1 = support(crab.pos.x + fx * 0.25, crab.pos.z + fz * 0.25, crab.onLog);
      const h0 = support(crab.pos.x - fx * 0.25, crab.pos.z - fz * 0.25, crab.onLog);
      pitchT = -Math.atan2(h1 - h0, 0.5);
    }
    crab.pitch = damp(crab.pitch, clamp(pitchT, -0.5, 0.5), 8, dt);

    const walk = A.scuttle;
    if (pose.scuttle > 0) crab.walkPhase += dt * 15;
    const bob = Math.abs(Math.sin(crab.walkPhase)) * 0.022 * walk * (1 - e);
    const s = crab.scale;
    C.root.position.set(crab.pos.x, crab.pos.y + (A.hop + bob - A.sink) * s, crab.pos.z);
    C.root.rotation.y = crab.heading + A.yaw;
    C.tilt.rotation.x = crab.pitch;
    const boop = crab.boop > 0 ? Math.sin(crab.boop * Math.PI) * 0.07 : 0;
    C.scaleG.scale.set(s * (1 + boop), s * (1 - boop * 0.8), s * (1 + boop));
    C.leanG.rotation.x = (A.dip * 0.17 + A.lean) * (1 - eb);
    C.leanG.rotation.z = Math.sin(crab.walkPhase) * 0.035 * walk * (1 - e);

    // helmet
    const H = C.helmet;
    const breathe = 1 + Math.sin(time * 1.5) * 0.014 * e;
    C.helmetG.position.set(0, lerp(H.yOut, H.yTuck, e) - A.dip * 0.03 * (1 - e) + Math.sin(time * 2.1) * 0.004 * (1 - e), lerp(-0.18, -0.06, e));
    C.helmetG.rotation.x = lerp(-0.13, 0, e);
    C.helmetG.scale.set(breathe, breathe * breathe, breathe);

    // body withdraws under the helmet
    C.coreG.scale.setScalar(lerp(1, 0.3, eb));
    C.coreG.position.set(0, lerp(0, 0.02, eb), lerp(0, -0.17, eb));
    C.legsG.scale.setScalar(lerp(1, 0.42, eb));
    C.legsG.position.z = lerp(0, -0.12, eb);
    C.coreG.visible = C.legsG.visible = crab.tk < 0.8;

    // legs
    for (const L of C.legs) {
      const ph = crab.walkPhase + (L.i % 2 ? Math.PI : 0) + (L.s > 0 ? 0 : Math.PI);
      const swing = Math.sin(ph) * 0.42 * walk;
      L.g.rotation.y = L.base - L.s * swing + Math.sin(time * 0.6 + L.i * 2 + L.s) * 0.02;
      L.g.rotation.z = Math.max(0, Math.cos(ph)) * 0.3 * walk;
    }

    // claws
    const carrying = carryingId != null && eb < 0.5 ? 1 : 0;
    crab.carryK = damp(crab.carryK || 0, carrying, 8, dt);
    for (const cl of C.claws) {
      const raise = cl.s > 0 ? A.clawL : A.clawR;
      const idle = Math.sin(time * 0.9 + cl.s * 1.3) * 0.06;
      const scr = cl.s < 0 ? A.scribble : 0;
      cl.g.rotation.x = -raise * 1.05 + idle + A.dip * 0.32 + scr * 0.22 - crab.carryK * 0.12;
      cl.g.rotation.y = -cl.s * (crab.carryK * 0.5 + raise * 0.15) + scr * Math.sin(time * 24) * 0.3;
      cl.g.rotation.z = scr * Math.sin(time * 17) * 0.12;
      cl.pincer.rotation.y = -cl.s * (0.45 + crab.carryK * 0.35);
      const snap = Math.max(0, Math.sin(time * 1.1 + cl.s * 2.2)) ** 6;
      cl.thumb.rotation.x = -(0.22 + snap * 0.35 + raise * 0.3) * (1 - crab.carryK * 0.6);
    }

    // eyes
    crab.blink -= dt;
    if (crab.blink <= 0) { crab.blinkOn = 0.13; crab.blink = 1.8 + Math.random() * 4.2; if (Math.random() < 0.2) crab.blink = 0.3; }
    crab.blinkOn = Math.max(0, crab.blinkOn - dt);
    for (const E of C.eyes) {
      E.g.rotation.z = Math.sin(time * 0.7 + E.s * 1.7) * 0.07 - A.yaw * 0.12;
      E.g.rotation.x = Math.sin(time * 0.9 + E.s) * 0.05 - A.eyes * 0.12 + A.dip * 0.25;
      E.g.scale.y = 1 + A.eyes * 0.24;
      E.ball.scale.set(1 + A.eyes * 0.12, (crab.blinkOn > 0 ? 0.12 : 1) * (1 + A.eyes * 0.12) / (1 + A.eyes * 0.24), 1 + A.eyes * 0.12);
    }

    // where a carried thing sits
    const raiseAvg = (A.clawL + A.clawR) * 0.5;
    C.hold.position.set(0, lerp(0.13 + raiseAvg * 0.22, 0.03, e), lerp(0.74 - raiseAvg * 0.06, 0.62, e));
  }

  /* ── items ── */
  const items = new Map();      // id -> entry
  let carryingId = null;
  let pickables = [];
  function rebuildPickables() {
    pickables = [C.hit];
    pickables.push(chest.hit);
    for (const it of items.values()) if (!it.pending && it.place !== 'chest') pickables.push(it.hit);
    for (const ph of photos.values()) pickables.push(ph.hitMesh);
    for (const st of structures.values()) pickables.push(st.hit);
    if (pet.data) pickables.push(pet.hit);   // [shrimp-ui]
  }
  function addItem(data, pending) {
    const built = buildItemMesh(data);
    const it = {
      id: data.id, data, root: built.root, hit: built.hit, height: built.height,
      place: data.place, pending: !!pending, pos: new THREE.Vector3(), tween: null, appear: 1, sig: `${data.kind}|${data.name}`,
    };
    built.hit.userData.pick = { type: 'item', it };
    it.root.visible = !pending;
    scene.add(it.root);
    items.set(it.id, it);
    return it;
  }
  function removeItem(it) {
    scene.remove(it.root);
    disposeTree(it.root);
    items.delete(it.id);
    if (selectedId === it.id) selectedId = null;
    if (carryingId === it.id) carryingId = null;
  }
  function reveal(it, instant) {
    if (!it.pending) return;
    it.pending = false;
    it.root.visible = true;
    it.appear = instant ? 1 : 0;
    it.fresh = true;
  }
  function revealFrom(sources) {
    let any = false;
    for (const it of items.values()) {
      if (it.pending && sources.includes(it.data.from)) { reveal(it, false); any = true; }
    }
    if (any) { relayout(false); rebuildPickables(); }
  }
  function relayout(instant) {
    const groups = {};
    for (const it of items.values()) {
      if (it.pending || it.id === carryingId || it.place === 'carried') continue;
      (groups[it.place] || (groups[it.place] = [])).push(it);
    }
    for (const place in groups) {
      const list = groups[place].sort((a, b) => (a.id > b.id ? 1 : a.id < b.id ? -1 : 0));
      list.forEach((it, i) => {
        const slot = slotFor(place, i);
        if (instant || it.fresh) { it.pos.copy(slot); it.tween = null; it.fresh = false; return; }
        const to = it.tween ? it.tween.to : it.pos;
        if (to.distanceToSquared(slot) < 1e-4) return;
        const d = it.pos.distanceTo(slot);
        if (place === 'chest' || !it.root.visible) chest.hold = 1.7;   // the drawer slides out for it
        it.tween = { from: it.pos.clone(), to: slot, t: 0, dur: clamp(d / 3.2, 0.35, 1.3), arc: Math.min(0.9, 0.12 + d * 0.22) };
      });
    }
  }
  function attachItem(id) {
    const it = items.get(id);
    if (!it) return;
    if (carryingId != null && carryingId !== id) detachItem();
    reveal(it, true);
    it.place = 'carried'; it.tween = null;
    carryingId = id;
    relayout(false);
  }
  function detachItem() {
    const it = items.get(carryingId);
    carryingId = null;
    if (!it) return;
    const want = snap && snap.byId.get(it.id);
    it.place = want && want.place !== 'carried' ? want.place : crab.at;
    relayout(false);
  }
  function updateItems(dt) {
    let inChest = 0;
    for (const it of items.values()) {
      if (it.pending) continue;
      if (it.place === 'chest' && it.id !== carryingId) {
        inChest++;
        if (!it.tween) { it.root.visible = false; it.root.position.copy(it.pos); continue; }   // shut away in its drawer
      }
      if (!it.root.visible) it.root.visible = true;
      if (it.id === carryingId) {
        C.hold.getWorldPosition(_v);
        _v.y -= it.height * 0.5;
        const floorY = support(_v.x, _v.z, false);
        if (!crab.onLog && _v.y < floorY) _v.y = floorY;
        it.pos.lerp(_v, 1 - Math.exp(-dt * 18));
        it.root.position.copy(it.pos);
      } else if (it.tween) {
        const tw = it.tween;
        tw.t += dt / tw.dur;
        const k = sstep(0, 1, Math.min(1, tw.t));
        it.pos.lerpVectors(tw.from, tw.to, k);
        it.root.position.copy(it.pos);
        it.root.position.y += Math.sin(k * Math.PI) * tw.arc;
        if (tw.t >= 1) it.tween = null;
      } else it.root.position.copy(it.pos);
      if (it.appear < 1) {
        it.appear = Math.min(1, it.appear + dt * 2.2);
        it.root.scale.setScalar(Math.max(0.001, easeOutBack(it.appear)));
      } else if (it.root.scale.x !== 1) it.root.scale.setScalar(1);
    }
    let hung = null;
    for (const it of items.values()) if (!it.pending && it.place === 'hook' && it.id !== carryingId && !it.tween) hung = it;
    hookFx.thread.visible = !!hung;
    if (hung) {                                   // it sways a little on its thread
      hung.root.position.x += Math.sin(clock * 1.2) * 0.014;
      const top = hung.root.position.y + hung.height, len = Math.max(0.02, HOOK.y - 0.05 - top);
      hookFx.thread.scale.y = len;
      hookFx.thread.position.set((hung.root.position.x + HOOK.x) / 2, top + len / 2, HOOK.z);
      hookFx.thread.rotation.z = Math.atan2(hung.root.position.x - HOOK.x, len);
    }
    chest.count = inChest;
    chest.hold = Math.max(0, chest.hold - dt);
    chest.open = damp(chest.open, chest.hold > 0 ? 1 : 0, 7, dt);
    chest.drawer.position.z = CHEST.d / 2 + chest.open * 0.27;
    const sel = selectedId != null && items.get(selectedId);
    if (sel && !sel.pending && sel.root.visible) {
      selRing.visible = true;
      selRing.position.set(sel.root.position.x, sel.root.position.y + 0.03, sel.root.position.z);
    } else selRing.visible = false;
  }

  /* ── photos on the back glass ── */
  const photos = new Map();   // id -> { group, slot, hitMesh, tex, caption }
  const SLOT_ORDER = [3, 4, 2, 5, 1, 6, 0, 7];
  const texLoader = new THREE.TextureLoader();
  const polaroidMat = new THREE.MeshStandardMaterial({ color: 0xf1ece0, roughness: 0.85, envMapIntensity: 0.3 });
  const tapeMat = new THREE.MeshStandardMaterial({ color: 0xd9cfae, roughness: 0.7, transparent: true, opacity: 0.8 });

  /* ── things the crab has built ── */
  const SITES = {
    workshop: { x: ANCHOR.workshop.x + 0.75, z: ANCHOR.workshop.z - 0.35 },
    cairn: { x: -2.6, z: -3.5 }, shellring: { x: -1.0, z: 1.9 }, flag: { x: 0.7, z: -3.6 },
    suncatcher: { x: -5.4, z: 3.5 }, chime: { x: -5.7, z: -0.7 }, board: { x: -1.5, z: 3.7 },
    stones: { x: -3.25, z: 1.2 }, nest: { x: HOLLOW.x, z: HOLLOW.z },
  };
  const structures = new Map();
  function buildStructure(kind) {
    const g = new THREE.Group();
    const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85 }, o));
    const put = (geo, m, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
      g.add(mesh); return mesh;
    };
    const wood = mat(0x7a6652), dark = mat(0x4f4336);
    switch (kind) {
      case 'workshop': {            // a flat board to pile spare things on
        const b = put(new THREE.BoxGeometry(1.25, 0.06, 0.8), wood, 0, 0.04, 0); b.rotation.y = 0.18;
        const c = put(new THREE.BoxGeometry(0.1, 0.06, 0.8), dark, -0.45, 0.075, 0.08); c.rotation.y = 0.18;
        const d = put(new THREE.BoxGeometry(0.1, 0.06, 0.8), dark, 0.45, 0.075, -0.08); d.rotation.y = 0.18;
        break;
      }
      case 'cairn': {
        let y = 0;
        [[0.3, 0x8a8f94], [0.23, 0xa37a6a], [0.17, 0x6f757b], [0.11, 0xb0aaa0]].forEach(([r, col], i) => {
          const s = put(new THREE.SphereGeometry(r, 12, 9), mat(col), (i % 2 ? 0.03 : -0.02), y + r * 0.55, 0);
          s.scale.y = 0.6; y += r * 1.1;
        });
        break;
      }
      case 'shellring': {
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const s = put(new THREE.ConeGeometry(0.1, 0.2, 10), mat(i % 2 ? 0xe9d9b8 : 0xd9b98c), Math.cos(a) * 0.6, 0.06, Math.sin(a) * 0.6);
          s.rotation.set(Math.PI / 2, 0, -a + Math.PI / 2);
        }
        break;
      }
      case 'flag': {
        put(new THREE.CylinderGeometry(0.12, 0.12, 0.09, 6), mat(0x9aa4ad, { metalness: 0.6, roughness: 0.4 }), 0, 0.045, 0);
        put(new THREE.CylinderGeometry(0.022, 0.028, 1.5, 8), wood, 0, 0.8, 0);
        const f = put(new THREE.SphereGeometry(0.2, 14, 8), mat(0xece8df, { roughness: 1 }), 0.26, 1.38, 0);
        f.scale.set(1.5, 0.42, 0.06); f.rotation.z = -0.25;
        break;
      }
      case 'suncatcher': {
        put(new THREE.CylinderGeometry(0.025, 0.03, 1.1, 8), wood, -0.4, 0.55, 0);
        put(new THREE.CylinderGeometry(0.025, 0.03, 1.1, 8), wood, 0.4, 0.55, 0);
        const bar = put(new THREE.CylinderGeometry(0.02, 0.02, 0.95, 8), wood, 0, 1.08, 0); bar.rotation.z = Math.PI / 2;
        [[-0.22, 0x7fc7a5], [0, 0x7fb5d6], [0.22, 0xd9a441]].forEach(([x, col], i) => {
          put(new THREE.CylinderGeometry(0.004, 0.004, 0.2 + i * 0.05, 4), dark, x, 0.97 - i * 0.025, 0);
          const gl = put(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshPhysicalMaterial({
            color: col, roughness: 0.15, transparent: true, opacity: 0.8, emissive: col, emissiveIntensity: 0.35 }), x, 0.78 - i * 0.05, 0);
          gl.scale.set(0.8, 1.2, 0.35);
        });
        break;
      }
      case 'chime': {
        put(new THREE.CylinderGeometry(0.03, 0.035, 1.3, 8), wood, 0, 0.65, 0);
        const arm = put(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8), wood, 0.28, 1.25, 0); arm.rotation.z = Math.PI / 2;
        [0.12, 0.3, 0.48].forEach((x, i) => {
          const len = 0.34 - i * 0.07;
          put(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 4), dark, x, 1.17, 0);
          put(new THREE.CylinderGeometry(0.03, 0.03, len, 10), mat([0x9aa4ad, 0xc9a24a, 0x7a8087][i], { metalness: 0.7, roughness: 0.35 }), x, 1.1 - len / 2, 0);
        });
        break;
      }
      case 'board': {
        put(new THREE.CylinderGeometry(0.025, 0.03, 0.75, 8), wood, -0.3, 0.375, 0);
        put(new THREE.CylinderGeometry(0.025, 0.03, 0.75, 8), wood, 0.3, 0.375, 0);
        put(new THREE.BoxGeometry(0.78, 0.46, 0.04), dark, 0, 0.6, 0);
        const p1 = put(new THREE.BoxGeometry(0.26, 0.2, 0.01), mat(0xefe6cf), -0.18, 0.63, 0.027); p1.rotation.z = 0.06;
        const p2 = put(new THREE.BoxGeometry(0.22, 0.26, 0.01), mat(0xf2ead8), 0.16, 0.59, 0.027); p2.rotation.z = -0.08;
        g.rotation.y = 0.25;
        break;
      }
      case 'stones': {
        const dx = POOL.x - SITES.stones.x, dz = POOL.z - SITES.stones.z;
        for (let i = 0; i < 4; i++) {
          const s = put(new THREE.CylinderGeometry(0.2 - i * 0.012, 0.22, 0.07, 9), mat([0x8a8f94, 0x6f757b, 0xb0aaa0, 0xa37a6a][i]),
            dx * i * 0.42, 0, dz * i * 0.42 + (i % 2 ? 0.06 : -0.05));
          s.rotation.y = i;
        }
        break;
      }
      case 'nest': {
        const ring = put(new THREE.TorusGeometry(0.62, 0.11, 8, 22), mat(0xb9a36a, { roughness: 1 }), 0, 0.07, 0);
        ring.rotation.x = Math.PI / 2; ring.scale.z = 0.7;
        for (let i = 0; i < 5; i++) {
          const a = i * 1.3;
          const f = put(new THREE.SphereGeometry(0.13, 10, 6), mat(i % 2 ? 0xece8df : 0xefe6cf, { roughness: 1 }), Math.cos(a) * 0.6, 0.15, Math.sin(a) * 0.6);
          f.scale.set(1.3, 0.25, 0.5); f.rotation.y = -a;
        }
        break;
      }
      default:
        return null;
    }
    const site = SITES[kind];
    const y = kind === 'stones' ? POOL.level + 0.01 : sandH(site.x, site.z) - 0.01;
    g.position.set(site.x, y, site.z);
    return g;
  }
  function syncStructures(list) {
    const want = new Map([['workshop', { id: 'workshop', name: 'the workshop board', words: '' }]]);
    for (const s of Array.isArray(list) ? list : []) if (s && SITES[s.id]) want.set(s.id, s);
    let changed = false;
    for (const [id, s] of want) {
      let cur = structures.get(id);
      if (!cur) {
        const g = buildStructure(id);
        if (!g) continue;
        const hit = new THREE.Mesh(new THREE.SphereGeometry(id === 'workshop' ? 0.5 : 0.75, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.y = 0.4;
        hit.userData.pick = { type: 'structure', id };
        g.add(hit);
        scene.add(g);
        cur = { g, hit, label: '' };
        structures.set(id, cur);
        changed = true;
      }
      const name = String(s.name || id);
      cur.label = name.charAt(0).toUpperCase() + name.slice(1) + (s.words ? ' — “' + s.words + '”' : '');
    }
    if (changed) rebuildPickables();
  }

  /* ── the smooth patch, and the latest drawing scratched into it ── */
  const PATCH = { x: 3.45, z: -0.3, w: 1.7, d: 1.3 };
  const patchY = sandH(PATCH.x, PATCH.z) + 0.035;
  {
    const smooth = new THREE.Mesh(new THREE.PlaneGeometry(PATCH.w + 0.25, PATCH.d + 0.25),
      new THREE.MeshStandardMaterial({ color: 0xe6d8b4, roughness: 1 }));
    smooth.rotation.x = -Math.PI / 2;
    smooth.position.set(PATCH.x, patchY, PATCH.z);
    smooth.receiveShadow = true;
    scene.add(smooth);
  }
  let drawingId = null, drawingMesh = null;
  function syncDrawing(d) {
    const id = d && Array.isArray(d.strokes) ? d.id : null;
    if (id === drawingId) return;
    drawingId = id;
    if (drawingMesh) { scene.remove(drawingMesh); drawingMesh.geometry.dispose(); drawingMesh.material.dispose(); drawingMesh = null; }
    if (id == null) return;
    const segs = [];
    const px = (v) => PATCH.x + (v / 100 - 0.5) * PATCH.w, pz = (v) => PATCH.z + (v / 100 - 0.5) * PATCH.d;
    for (const stroke of d.strokes) {
      for (let i = 1; i < stroke.length; i++) {
        const ax = px(stroke[i - 1][0]), az = pz(stroke[i - 1][1]), bx = px(stroke[i][0]), bz = pz(stroke[i][1]);
        if (Math.hypot(bx - ax, bz - az) > 0.001) segs.push([ax, az, bx, bz]);
      }
    }
    if (!segs.length) return;
    drawingMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.012, 0.034),
      new THREE.MeshStandardMaterial({ color: 0x7d6843, roughness: 1 }), segs.length);
    const m = new THREE.Object3D();
    segs.forEach(([ax, az, bx, bz], i) => {
      m.position.set((ax + bx) / 2, patchY + 0.008, (az + bz) / 2);
      m.rotation.set(0, -Math.atan2(bz - az, bx - ax), 0);
      m.scale.set(Math.hypot(bx - ax, bz - az) + 0.03, 1, 1);
      m.updateMatrix();
      drawingMesh.setMatrixAt(i, m.matrix);
    });
    drawingMesh.instanceMatrix.needsUpdate = true;
    scene.add(drawingMesh);
  }

  function syncPhotos(list) {
    const want = new Map();
    for (const p of list || []) if (p && p.id != null) want.set(p.id, p);
    for (const [id, ph] of photos) {
      if (!want.has(id)) {
        scene.remove(ph.group);
        if (ph.tex) ph.tex.dispose();
        ph.picMat.dispose();
        ph.disposed = true;
        photos.delete(id);
      }
    }
    for (const [id, p] of want) {
      const existing = photos.get(id);
      if (existing) { existing.caption = p.caption || ''; continue; }
      const used = new Set([...photos.values()].map((q) => q.slot));
      const slot = SLOT_ORDER.find((s) => !used.has(s));
      if (slot === undefined) continue;
      const r = rng(hashStr(`photo${id}`));
      const g = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 0.014), polaroidMat);
      frame.castShadow = true;
      g.add(frame);
      const picMat = new THREE.MeshBasicMaterial({ color: 0x2b3238 });
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.86), picMat);
      pic.position.set(0, 0.1, 0.009);
      g.add(pic);
      const tape = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.12), tapeMat);
      tape.position.set((r() - 0.5) * 0.2, 0.6, 0.011);
      tape.rotation.z = (r() - 0.5) * 0.3;
      g.add(tape);
      g.position.set(-5.25 + slot * 1.5 + (r() - 0.5) * 0.16, 1.78 + (slot % 2 ? 0.26 : -0.2) + (r() - 0.5) * 0.14, -HALF_Z + 0.06);
      g.rotation.z = (r() - 0.5) * 0.26;
      scene.add(g);
      frame.userData.pick = { type: 'photo', id };
      const ph = { group: g, slot, hitMesh: frame, tex: null, picMat, caption: p.caption || '', disposed: false };
      photos.set(id, ph);
      texLoader.load(`/photo/${encodeURIComponent(id)}.jpg?t=${encodeURIComponent(token)}`, (tex) => {
        if (ph.disposed || disposed) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        const img = tex.image;
        const asp = img && img.height ? img.width / img.height : 1;   // cover the square window
        if (asp > 1) { tex.repeat.set(1 / asp, 1); tex.offset.set((1 - 1 / asp) / 2, 0); }
        else { tex.repeat.set(1, asp); tex.offset.set(0, (1 - asp) / 2); }
        ph.tex = tex;
        picMat.map = tex;
        picMat.color.set(0xd6d6d6);
        picMat.needsUpdate = true;
      }, undefined, () => { /* leave the grey placeholder */ });
    }
    rebuildPickables();
  }

  /* ── overlays ── */
  const bubble = document.createElement('div');
  bubble.className = 'hc-bubble';
  container.appendChild(bubble);
  const tip = document.createElement('div');
  tip.className = 'hc-tip';
  container.appendChild(tip);
  let bubbleUntil = 0, bubbleW = 0, bubbleH = 0;
  function showBubble(text, isNote) {
    bubble.textContent = isNote ? `“${text}”` : text;
    bubble.classList.toggle('hc-note', !!isNote);
    bubble.classList.add('hc-on');
    bubbleUntil = clock + 9;
    bubbleW = bubble.offsetWidth; bubbleH = bubble.offsetHeight;
  }
  function updateBubble() {
    if (!bubbleUntil) return;
    if (clock > bubbleUntil) { bubble.classList.remove('hc-on'); bubbleUntil = 0; return; }
    const e = sstep(0, 1, crab.tk);
    _v.set(crab.pos.x, crab.pos.y + lerp(0.8, 0.55, e) * crab.scale + A.hop * crab.scale, crab.pos.z).project(camera);
    if (_v.z > 1) { bubble.style.visibility = 'hidden'; return; }
    bubble.style.visibility = '';
    const x = clamp((_v.x * 0.5 + 0.5) * W, bubbleW / 2 + 8, Math.max(bubbleW / 2 + 8, W - bubbleW / 2 - 8));
    const y = Math.max(bubbleH + 30, (-_v.y * 0.5 + 0.5) * H);
    bubble.style.transform = `translate(${Math.round(x - bubbleW / 2)}px,${Math.round(y - bubbleH - 26)}px)`;
  }

  /* ── pointer: hover, click vs drag ── */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pointer = { x: 0, y: 0, inside: false, dirty: false, down: null };
  function pickAt(px, py) {
    ndc.set((px / W) * 2 - 1, -(py / H) * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    for (const h of hits) {
      const p = h.object.userData.pick;
      if (!p) continue;
      if (p.type === 'item' && (p.it.pending || !items.has(p.it.id))) continue;
      return p;
    }
    return null;
  }
  function local(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }
  function onMove(ev) {
    const p = local(ev);
    pointer.x = p.x; pointer.y = p.y; pointer.inside = true; pointer.dirty = true;
  }
  function onLeave() { pointer.inside = false; pointer.dirty = true; }
  function onDown(ev) {
    if (ev.button !== undefined && ev.button !== 0) { pointer.down = null; return; }
    pointer.down = { x: ev.clientX, y: ev.clientY, id: ev.pointerId };
  }
  function onUp(ev) {
    const d = pointer.down;
    pointer.down = null;
    if (!d || d.id !== ev.pointerId) return;
    if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 5) return;
    const p = local(ev);
    const hit = pickAt(p.x, p.y);
    if (hit && hit.type === 'crab') {
      crab.boop = 1;
      if (typeof opts.onTapCrab === 'function') opts.onTapCrab();
    } else if (hit && hit.type === 'chest') {
      selectedId = null;
      chest.hold = 2.5;
      if (typeof opts.onPickChest === 'function') opts.onPickChest();
    } else if (hit && hit.type === 'pet') {   // [shrimp-ui]
      if (typeof opts.onPickPet === 'function') opts.onPickPet(pet.data);   // [shrimp-ui]
    } else if (hit && hit.type === 'item') {
      selectedId = hit.it.id;
      if (typeof opts.onPickItem === 'function') opts.onPickItem(hit.it.data);
    } else {
      selectedId = null;
      if (typeof opts.onPickItem === 'function') opts.onPickItem(null);
    }
  }
  function updateHover() {
    if (!pointer.dirty && !anim) return;
    pointer.dirty = false;
    let text = '', clickable = false;
    if (pointer.inside && !pointer.down) {
      const hit = pickAt(pointer.x, pointer.y);
      if (hit) {
        if (hit.type === 'item') { text = hit.it.data.name || hit.it.data.kind || ''; clickable = true; }
        else if (hit.type === 'crab') { text = crabName || ''; clickable = true; }
        else if (hit.type === 'chest') { text = chest.count ? `the tool chest (${chest.count} put away)` : 'the tool chest (empty)'; clickable = true; }
        else if (hit.type === 'pet') { text = petLabel(); clickable = typeof opts.onPickPet === 'function'; }   // [shrimp-ui]
        else if (hit.type === 'photo') { const ph = photos.get(hit.id); text = (ph && ph.caption) || ''; }
        else if (hit.type === 'structure') { const st = structures.get(hit.id); text = (st && st.label) || ''; }
      }
    }
    canvas.style.cursor = clickable ? 'pointer' : '';
    if (text) {
      tip.textContent = text;
      tip.classList.add('hc-on');
      const tw = tip.offsetWidth;
      const x = clamp(pointer.x + 14, 4, Math.max(4, W - tw - 4));
      const y = pointer.y + 18 + tip.offsetHeight > H ? pointer.y - tip.offsetHeight - 10 : pointer.y + 18;
      tip.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
    } else tip.classList.remove('hc-on');
  }
  C.hit.userData.pick = { type: 'crab' };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onLeave);

  /* ── the pet: a small shrimp that lives in the tide pool ── [shrimp-ui]
     The program says how it is (asleep, hungry, near, what it is doing); everything
     here is only how that looks. It never leaves the deep part of the pool. */
  const PET_R = 1.2;                                  // further out than this the water is too shallow for it
  const PET_TOP = POOL.level - 0.045;                 // it stays under the surface
  const PET_DIR = { x: -0.849, z: -0.529 };           // from the middle of the pool toward its stone, at the back left
  const PET_HOME = { x: POOL.x + PET_DIR.x * 1.15, z: POOL.z + PET_DIR.z * 1.15 };
  const petFloor = (x, z) => sandH(x, z) + 0.032;
  const SH = buildShrimp();
  const petG = new THREE.Group();                     // the shrimp, its stone and its food; hidden until there is a pet
  petG.visible = false;
  scene.add(petG);
  petG.add(SH.root);
  {
    const m = new THREE.Mesh(jitterGeo(new THREE.IcosahedronGeometry(1, 1), 0.13, 41),
      new THREE.MeshStandardMaterial({ color: 0x666c73, roughness: 0.9, flatShading: true, envMapIntensity: 0.35 }));
    m.scale.set(0.34, 0.12, 0.24);
    m.position.set(POOL.x + PET_DIR.x * 1.33, -0.05, POOL.z + PET_DIR.z * 1.33);
    m.rotation.y = Math.atan2(-PET_DIR.z, PET_DIR.x);  // long side pointing out over the water
    m.castShadow = true; m.receiveShadow = true;
    petG.add(m);
  }
  const specks = [];
  {
    const geo = new THREE.SphereGeometry(0.012, 6, 5), mat = new THREE.MeshStandardMaterial({ color: 0x6fae4a, roughness: 0.8 });
    for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(geo, mat); m.visible = false; petG.add(m); specks.push(m); }
  }
  SH.hit.userData.pick = { type: 'pet' };
  const pet = {
    data: null, hit: SH.hit,
    pos: new THREE.Vector3(POOL.x, -0.25, POOL.z), tgt: new THREE.Vector3(POOL.x, -0.25, POOL.z),
    heading: 0, headingT: 0, pitch: 0, roll: 0, vel: 0, pause: 0, flick: 0, grow: 0, hov: 0,
    mode: '', act: null,      // act: a short turn it is doing for an event { kind: 'spin' | 'feed' | 'show', t, ... }
  };
  function petLabel() {
    const d = pet.data || {};
    const who = d.name ? `${d.name} the shrimp` : 'the shrimp';
    return d.doing ? `${who}: ${d.doing}` : who;
  }
  function petClamp(p) {
    const dx = p.x - POOL.x, dz = p.z - POOL.z, d = Math.hypot(dx, dz);
    if (d > PET_R) { p.x = POOL.x + (dx / d) * PET_R; p.z = POOL.z + (dz / d) * PET_R; }
    p.y = clamp(p.y, petFloor(p.x, p.z), PET_TOP);
    return p;
  }
  // a quick burst of speed with a flick of the tail, and a ring on the water for the bigger ones
  function petKick(v) {
    pet.vel = Math.max(pet.vel, v);
    pet.flick = 1;
    if (v > 1) spawnRipple(pet.pos.x, POOL.level + 0.012, pet.pos.z, 0.03, 0.2, 0.8);
  }
  // the spot in the pool nearest the crab, `reach` crab-lengths in front of it
  function petBeside(reach) {
    const dx = crab.pos.x - POOL.x, dz = crab.pos.z - POOL.z, dl = Math.hypot(dx, dz) || 1;
    const r = clamp(dl - reach * crab.scale, 0, PET_R - 0.05);
    return { x: POOL.x + (dx / dl) * r, z: POOL.z + (dz / dl) * r };
  }
  function petWander(far, lo, hi) {
    const P = pet.pos, T = pet.tgt;
    let x = POOL.x, z = POOL.z;
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * TAU, r = lerp(far * 0.3, far, Math.random());
      x = P.x + Math.sin(a) * r; z = P.z + Math.cos(a) * r;
      if (Math.hypot(x - POOL.x, z - POOL.z) < 1.0 && Math.hypot(x - crab.pos.x, z - crab.pos.z) > 0.85 * crab.scale) break;
      x = POOL.x + Math.sin(a) * 0.4; z = POOL.z + Math.cos(a) * 0.4;      // no luck: somewhere near the middle
    }
    const f = petFloor(x, z);
    T.set(x, lerp(f, PET_TOP, lerp(lo, hi, Math.random())), z);
    petClamp(T);
  }
  // a happy turn: round in a small ring, banking, tail going
  function petSpin(dur = 2.5) {
    if (!pet.data) return;
    const P = pet.pos, dx = P.x - POOL.x, dz = P.z - POOL.z, d = Math.hypot(dx, dz), k = d > PET_R - 0.13 ? (PET_R - 0.13) / d : 1;
    pet.act = { kind: 'spin', t: 0, dur, x: POOL.x + dx * k, y: P.y, z: POOL.z + dz * k, a0: pet.heading - Math.PI / 2 };
    petKick(1.5);
  }
  function petShow(dur) {
    if (pet.data) pet.act = { kind: 'show', t: 0, dur, go: false };
  }
  // a pinch of green specks dropped in front of the crab; it darts to each as they sink
  function petFeed() {
    if (!pet.data) return;
    const b = petBeside(1.25);
    for (const s of specks) {
      s.position.set(b.x + (Math.random() - 0.5) * 0.44, POOL.level - 0.012, b.z + (Math.random() - 0.5) * 0.44);
      petClamp(s.position).y = POOL.level - 0.012;
      s.visible = true;
    }
    spawnRipple(b.x, POOL.level + 0.012, b.z, 0.05, 0.32, 1.1);
    pet.act = { kind: 'feed', t: 0, wait: 0.6 };
  }
  function syncPet(p) {
    const had = !!pet.data;
    pet.data = p && typeof p === 'object' ? p : null;
    if (had === !!pet.data) return;
    petG.visible = !!pet.data;
    pet.act = null; pet.mode = ''; pet.grow = 0; pet.vel = 0;
    for (const s of specks) s.visible = false;
    if (pet.data) {                                    // it turns up where it would be anyway
      const b = pet.data.asleep ? PET_HOME : pet.data.near ? petBeside(0.95) : { x: POOL.x + 0.2, z: POOL.z + 0.1 };
      pet.pos.set(b.x, -0.2, b.z);
      if (pet.data.asleep) pet.pos.y = -1;
      pet.tgt.copy(petClamp(pet.pos));
      pet.heading = pet.headingT = Math.atan2(POOL.x - b.x, POOL.z - b.z);
    }
    rebuildPickables();
    pointer.dirty = true;
  }
  function updatePet(dt, time) {
    const d = pet.data;
    if (!d) return;
    const P = pet.pos, T = pet.tgt;
    pet.grow = Math.min(1, pet.grow + dt * 1.5);
    for (const s of specks) if (s.visible) s.position.y = Math.max(sandH(s.position.x, s.position.z) + 0.012, s.position.y - 0.07 * dt);

    let act = pet.act;
    const mode = act ? act.kind : d.asleep ? 'asleep' : d.near ? 'near' : d.hungry ? 'hungry' : 'dart';
    if (mode !== pet.mode) { pet.mode = mode; pet.pause = 0; }
    const dist = P.distanceTo(T);
    let cruise = 0.16, pitchT = 0, rollT = 0, bob = 0, wig = 0, curl = 0, swim = 1, face = null, moving = true;
    let feel = 0.34, feelRate = 3.2, spread = 0.45, droop = 0, legs = 0.25;

    if (mode === 'spin') {
      act.t += dt;
      const k = act.t / act.dur;
      if (k >= 1) { pet.act = null; T.copy(P); pet.pause = 0.5; }
      else {
        const a = act.a0 + k * TAU * 2, r = 0.1 * Math.sin(k * Math.PI);
        P.set(act.x + Math.sin(a) * r, act.y + Math.sin(k * Math.PI) * 0.035, act.z + Math.cos(a) * r);
        pet.heading = pet.headingT = a + Math.PI / 2;
        rollT = -0.5 * Math.sin(k * Math.PI);
        pet.flick = 0.5 + 0.5 * Math.sin(act.t * 16);
        feel = 0.5; feelRate = 7; spread = 0.7; legs = 0.5;
        moving = false;
      }
    } else if (mode === 'show') {                      // right up to the crab's claws, looking up at what it holds
      act.t += dt;
      const b = petBeside(0.82);
      T.set(b.x, PET_TOP, b.z);
      if (!act.go) { act.go = true; petKick(1.5); }
      cruise = 0.5; face = crab.pos; pitchT = -0.35; spread = 0.12; feel = 0.3; feelRate = 8;
      if (dist < 0.05) wig = Math.sin(act.t * 9) * 0.2;
      if (act.t > act.dur) petSpin();
    } else if (mode === 'feed') {
      act.t += dt; act.wait -= dt;
      let best = null, bd = 9;
      for (const s of specks) if (s.visible) { const q = P.distanceTo(s.position); if (q < bd) { bd = q; best = s; } }
      if (!best || act.t > 8) { for (const s of specks) s.visible = false; petSpin(1.6); }
      else {
        T.copy(best.position);
        if (bd < 0.035) { best.visible = false; pet.flick = 1; act.wait = 0.45; }
        else if (act.wait <= 0 && pet.vel < 0.4) petKick(1.3);
        cruise = 0.3; legs = 0.5;
      }
    } else if (mode === 'asleep') {                    // tucked under its stone, still
      T.set(PET_HOME.x, petFloor(PET_HOME.x, PET_HOME.z), PET_HOME.z);
      cruise = 0.45;
      if (dist < 0.02) { face = POOL; feel = 0.03; feelRate = 0.7; spread = 0.25; droop = 0.45; legs = 0; curl = 0.1; swim = 0; }
    } else if (mode === 'near') {                      // at the side nearest the crab, watching it
      const b = petBeside(0.95), f = petFloor(b.x, b.z);
      T.set(b.x, lerp(f, PET_TOP, 0.6), b.z);
      cruise = 0.3; spread = 0.12; feel = 0.14; feelRate = 2.2;
      if (dist > 0.3 && pet.vel < 0.35) petKick(1.4);
      if (dist < 0.05) { face = crab.pos; bob = Math.sin(time * 1.7) * 0.012; pitchT = -0.18; }
    } else if (mode === 'hungry') {                    // slow, nose down, picking along the bottom
      cruise = 0.09; pitchT = 0.42; legs = 0.6; feel = 0.2; spread = 0.3; droop = 0.3;
      if (dist < 0.02) {
        pitchT += Math.sin(time * 7) * 0.1;
        pet.pause -= dt;
        if (pet.pause <= 0) { petWander(0.35, 0.1, 0.1); pet.pause = 0.8 + Math.random() * 1.6; pet.vel = Math.max(pet.vel, 0.2); }
      }
    } else {                                           // darting about: a burst, a pause, another burst
      bob = Math.sin(time * 2.3) * 0.005;
      if (dist < 0.03) {
        pet.pause -= dt;
        if (pet.pause <= 0) { petWander(0.9, 0.15, 0.9); pet.pause = 0.5 + Math.random() * 2.2; petKick(1.5); }
      } else if (pet.vel < 0.3 && dist > 0.12) petKick(1.2);
    }

    if (moving) {
      const dx = T.x - P.x, dy = T.y - P.y, dz = T.z - P.z, dl = Math.hypot(dx, dy, dz);
      if (dl > 1e-4) { const st = Math.min(dl, pet.vel * dt) / dl; P.x += dx * st; P.y += dy * st; P.z += dz * st; }
      if (face) pet.headingT = Math.atan2(face.x - P.x, face.z - P.z);
      else if (Math.hypot(dx, dz) > 0.03) pet.headingT = Math.atan2(dx, dz);
      pet.vel = damp(pet.vel, cruise, 3.5, dt);
      pet.heading += angDiff(pet.headingT, pet.heading) * (1 - Math.exp(-dt * 11));
    }
    {                                                  // keep clear of the crab's legs, and always in the water
      const cx = P.x - crab.pos.x, cz = P.z - crab.pos.z, cd = Math.hypot(cx, cz), keep = 0.62 * crab.scale;
      if (cd < keep && cd > 1e-3) { P.x = crab.pos.x + (cx / cd) * keep; P.z = crab.pos.z + (cz / cd) * keep; }
      petClamp(P);
    }

    pet.pitch = damp(pet.pitch, pitchT, 6, dt);
    pet.roll = damp(pet.roll, rollT, 8, dt);
    pet.flick = damp(pet.flick, 0, 5, dt);
    SH.root.position.set(P.x, clamp(P.y + bob, petFloor(P.x, P.z), PET_TOP), P.z);
    SH.root.rotation.y = pet.heading + wig;
    SH.root.scale.setScalar(lerp(0.3, 1.5, sstep(0, 1, pet.grow)));   // half as big again, so it can be seen from the usual view
    SH.tilt.rotation.x = pet.pitch;
    SH.tilt.rotation.z = pet.roll;
    const bend = -(0.17 + curl + pet.flick * 0.42);
    for (let i = 0; i < SH.segs.length; i++) SH.segs[i].rotation.x = bend + Math.sin(time * 5 - i * 0.9) * 0.04 * swim;
    SH.fan.rotation.x = bend * 0.8;
    for (const F of SH.feelers) {
      F.g.rotation.x = droop + Math.sin(time * feelRate + F.s * 0.9) * feel;
      F.g.rotation.y = F.s * spread + Math.cos(time * feelRate * 0.7 + F.s) * feel * 0.4;
      F.g2.rotation.x = Math.sin(time * feelRate * 1.3 + F.s * 2) * feel * 0.8;
    }
    for (const L of SH.legs) L.g.rotation.x = Math.sin(time * 11 + L.i * 1.3 + L.s) * legs;

    pet.hov += dt;                                     // it moves under a still pointer: look again now and then
    if (pet.hov > 0.3 && pointer.inside) { pet.hov = 0; pointer.dirty = true; }
  }
  // what the crab does while something happens with the pet
  function petSteps(verb) {
    const sw = (k) => sstep(0, 0.15, k) * (1 - sstep(0.85, 1, k));
    const steps = [{ dur: 0.35, begin() { crab.headingT = yawTo(POOL.x, POOL.z); } }];
    if (verb === 'feed_pet') {
      steps.push({                                     // leans over the water and sprinkles
        dur: 2.4,
        tick(k) {
          const s = sw(k);
          pose.dip = 0.6 * s; pose.eyes = 0.3 * s; pose.clawL = s * Math.max(0, Math.sin(k * 9)) * 0.7;
          if (k > 0.4 && !this.done) { this.done = true; petFeed(); }
        },
        end() { if (!this.done) petFeed(); },
      });
    } else if (verb === 'show_pet') {                  // holds the thing out over the water
      steps.push({
        dur: 3.0,
        begin() { petShow(2.8); },
        tick(k) { const s = sw(k); pose.clawL = pose.clawR = 0.6 * s; pose.lean = 0.1 * s; pose.eyes = s * (0.6 + 0.3 * Math.sin(k * 12)); },
      });
    } else if (verb === 'name_pet') {                  // both claws up and a little hop
      steps.push({
        dur: 2.4,
        tick(k) {
          const s = sw(k);
          pose.clawL = pose.clawR = 0.8 * s; pose.eyes = s; pose.hop = k < 0.3 ? 4 * (k / 0.3) * (1 - k / 0.3) * 0.2 : 0;
          if (k > 0.25 && !this.done) { this.done = true; petSpin(); }
        },
        end() { if (!this.done) petSpin(); },
      });
    } else {                                           // talk_pet: leans in, nodding along
      steps.push({
        dur: 2.6,
        tick(k, dt, t) {
          const s = sw(k);
          pose.lean = (0.12 + Math.sin(t * 6) * 0.03) * s; pose.eyes = 0.6 * s; pose.clawR = s * Math.max(0, Math.sin(t * 3)) * 0.4;
          if (k > 0.35 && !this.done) { this.done = true; petSpin(); }
        },
        end() { if (!this.done) petSpin(); },
      });
    }
    return steps;
  }

  /* ── animation steps ── */
  const WALK_SPEED = 1.6;
  let anim = null;            // { steps, i, t, started }
  const queue = [];
  let snap = null;            // latest payload (+ byId)
  let ready = false, needReconcile = false, lastEventId = null;

  function walkStep(pts, endPlace) {
    // pts: [{x,z,log?}] starting at the crab's current position
    const P = pts.map((p) => ({ x: p.x, z: p.z, log: !!p.log, y: ptY(p) }));
    const cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y, P[i].z - P[i - 1].z));
    const total = cum[cum.length - 1];
    const dur = total < 0.05 ? 0.01 : Math.max(0.35, total / Math.max(WALK_SPEED, total / 5.4));
    return {
      dur,
      tick(k) {
        if (total < 0.05) return;
        const d = k * total;
        let i = 1;
        while (i < P.length - 1 && cum[i] < d) i++;
        const a = P[i - 1], b = P[i];
        const u = clamp((d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]), 0, 1);
        crab.pos.x = lerp(a.x, b.x, u); crab.pos.z = lerp(a.z, b.z, u);
        if (a.log !== b.log) {
          crab.pos.y = lerp(a.y, b.y, u);
          crab.mixed = { pitch: -Math.atan2(b.y - a.y, Math.max(0.05, Math.hypot(b.x - a.x, b.z - a.z))) };
          crab.onLog = false;
        } else { crab.mixed = null; crab.onLog = a.log; }
        if (Math.hypot(b.x - a.x, b.z - a.z) > 1e-3) crab.headingT = Math.atan2(b.x - a.x, b.z - a.z);
        pose.scuttle = 1;
      },
      end() {
        const last = P[P.length - 1];
        crab.pos.x = last.x; crab.pos.z = last.z;
        crab.mixed = null; crab.onLog = last.log;
        if (endPlace) crab.at = endPlace;
      },
    };
  }
  function pathToPlace(place) {
    const pts = [{ x: crab.pos.x, z: crab.pos.z, log: crab.onLog }];
    let cur = pts[0];
    const a = anchorOf(place);
    if (cur.log) {
      if (a.log) { pts.push(LOG_TOP); return pts; }
      pts.push(logPt(0.03));
      pts.push(LOG_FOOT);
      cur = LOG_FOOT;
    }
    if (a.log) {
      const r = routeSand(cur, LOG_FOOT);
      for (let i = 1; i < r.length; i++) pts.push(r[i]);
      pts.push(logPt(0.03));
      pts.push(LOG_TOP);
    } else {
      const r = routeSand(cur, a);
      for (let i = 1; i < r.length; i++) pts.push(r[i]);
    }
    return pts;
  }
  const faceStep = (yaw, dur = 0.35) => ({ dur, begin() { crab.headingT = yaw; } });
  function goSteps(place) {
    return [walkStep(pathToPlace(place), place), faceStep(anchorOf(place).face)];
  }
  const wakeFirst = (steps) => {
    if (crab.tuckT > 0.5 || crab.tk > 0.5) steps.unshift({ dur: 0.75, begin() { crab.tuckT = 0; } });
    return steps;
  };
  const yawTo = (x, z) => Math.atan2(x - crab.pos.x, z - crab.pos.z);

  function buildSteps(ev) {
    const kind = ev.kind;
    const move = String(ev.move || '');
    const [verb, arg] = move.includes(':') ? [move.slice(0, move.indexOf(':')), move.slice(move.indexOf(':') + 1)] : [move, ''];
    const itemArg = () => {
      const n = Number(arg);
      return items.get(Number.isNaN(n) ? arg : n) || items.get(arg);
    };

    if (kind === 'sleep' || (kind === 'action' && verb === 'nap')) {
      return [{ dur: 1.7, begin() { crab.tuckT = 1; } }];
    }
    if (kind === 'wake') {
      return [
        { dur: 0.9, begin() { crab.tuckT = 0; } },
        { dur: 0.9, tick(k) { const s = Math.sin(k * Math.PI); pose.clawL = pose.clawR = s * 0.8; pose.eyes = s; } },
      ];
    }
    if (kind === 'tide') {
      return [{
        dur: 2.6,
        begin() { tide.t = 0; },
        tick(k) { if (k > 0.35 && !this.done) { this.done = true; revealFrom(['tide']); } pose.eyes = 0.3; },
        end() { revealFrom(['tide']); },
      }];
    }
    if (kind === 'person') {
      const steps = [];
      if (/^you tapped/i.test(String(ev.text || ''))) {
        steps.push({
          dur: 0.62,
          tick(k) {
            const tucked = crab.tk > 0.5;
            pose.hop = 4 * k * (1 - k) * (tucked ? 0.14 : 0.34);
            pose.eyes = 1; pose.clawL = pose.clawR = tucked ? 0 : 0.7;
            pose.yaw = Math.sin(k * TAU * 1.5) * 0.08;
          },
        });
        steps.push({ dur: 0.45, tick(k) { pose.eyes = 1 - k; pose.sink = Math.sin(k * Math.PI) * 0.02; } });
      } else {
        steps.push({ dur: 0.9, begin() { revealFrom(['from you']); }, tick(k) { pose.eyes = Math.sin(k * Math.PI) * 0.8; } });
      }
      return steps;
    }
    if (kind !== 'action') return [{ dur: 0.4 }];

    switch (verb) {
      case 'go':
        return wakeFirst(goSteps(arg));
      case 'unhook':
      case 'pick_up': {
        const it = itemArg();
        const steps = [];
        let stepped = null;
        if (it) {
          reveal(it, false); relayout(false); rebuildPickables();
          const tgt = it.tween ? it.tween.to : it.pos;
          const d = Math.hypot(tgt.x - crab.pos.x, tgt.z - crab.pos.z);
          const reach = 0.8 * crab.scale;
          if (!crab.onLog && it.place !== 'ledge' && it.place !== 'hook' && it.place !== 'driftwood' && d > reach + 0.1 && d < 3.2) {
            const k = (d - reach) / d;
            stepped = { x: lerp(crab.pos.x, tgt.x, k), z: lerp(crab.pos.z, tgt.z, k) };
            steps.push(walkStep([{ x: crab.pos.x, z: crab.pos.z }, stepped]));
          } else if (d > 0.3) steps.push({ dur: 0.35, begin() { crab.headingT = yawTo(tgt.x, tgt.z); } });
        }
        steps.push({
          dur: 1.5,
          tick(k) {
            pose.dip = Math.sin(k * Math.PI);
            if (k >= 0.5 && !this.done) { this.done = true; if (it) attachItem(it.id); }
          },
          end() { if (it && carryingId !== it.id) attachItem(it.id); },
        });
        if (stepped && ANCHOR[crab.at] && !ANCHOR[crab.at].log) {   // and back to its spot
          const home = ANCHOR[crab.at];
          steps.push(walkStep([stepped, home]));
          steps.push(faceStep(home.face, 0.3));
        }
        return wakeFirst(steps);
      }
      case 'stow':
      case 'display': {
        const it = itemArg();
        const to = verb === 'stow' ? 'chest' : 'ledge';
        const move = () => { if (it && it.place !== to) { it.place = to; relayout(false); rebuildPickables(); } };
        return wakeFirst([{
          dur: 2.0,
          begin() { chest.hold = 2.4; },
          tick(k) {
            const s = Math.sin(k * Math.PI);
            pose.clawL = s * (0.4 + 0.3 * Math.sin(k * 16)); pose.clawR = s * (0.4 + 0.3 * Math.cos(k * 16));
            if (k >= 0.3 && !this.done) { this.done = true; move(); }
          },
          end: move,
        }]);
      }
      case 'store':
      case 'hang':
      case 'put_down':
        return wakeFirst([{
          dur: 1.5,
          tick(k) {
            pose.dip = Math.sin(k * Math.PI);
            if (k >= 0.5 && !this.done) { this.done = true; detachItem(); }
          },
          end() { if (carryingId != null) detachItem(); },
        }]);
      case 'examine': {
        const it = itemArg();
        const held = it && it.id === carryingId;
        const steps = [];
        if (it && it.pending) { reveal(it, false); relayout(false); rebuildPickables(); }
        if (it && !held) steps.push({ dur: 0.4, begin() { const t = it.tween ? it.tween.to : it.pos; crab.headingT = yawTo(t.x, t.z); } });
        steps.push({
          dur: 2.6,
          tick(k) {
            const s = sstep(0, 0.2, k) * (1 - sstep(0.82, 1, k));
            pose.clawL = pose.clawR = s * (held ? 0.75 : 0.6);
            pose.lean = s * (held ? -0.04 : 0.13);
            pose.eyes = s * (0.7 + 0.3 * Math.sin(k * 14));
            pose.yaw = s * Math.sin(k * 9) * 0.05;
          },
        });
        return wakeFirst(steps);
      }
      case 'dig':
        return wakeFirst([{
          dur: 2.6,
          tick(k, dt, t) {
            const s = sstep(0, 0.12, k) * (1 - sstep(0.85, 1, k));
            pose.scuttle = s; pose.dip = 0.75 * s; pose.yaw = Math.sin(t * 17) * 0.13 * s; pose.sink = 0.02 * s;
            this.acc = (this.acc || 0) + dt;
            if (this.acc > 0.11 && s > 0.5) {
              this.acc = 0;
              const h = crab.heading, r = 0.55 * crab.scale;
              spawnPuff(crab.pos.x + Math.sin(h) * r, crab.pos.y, crab.pos.z + Math.cos(h) * r, 2, SAND);
            }
            if (k > 0.7 && !this.done) { this.done = true; revealFrom(['dug up']); }
          },
          end() { revealFrom(['dug up']); },
        }]);
      case 'dip': {
        const steps = crab.at === 'pool' && !crab.onLog ? [] : goSteps('pool');
        const a = ANCHOR.pool;
        const dx = POOL.x - a.x, dz = POOL.z - a.z, dl = Math.hypot(dx, dz);
        const inP = { x: a.x + (dx / dl) * 0.32, z: a.z + (dz / dl) * 0.32 };
        steps.push({ dur: 0.01, begin() { crab.headingT = a.face; } });
        steps.push(walkStep([a, inP]));
        steps.push({
          dur: 2.3,
          tick(k, dt, t) {
            const s = sstep(0, 0.15, k) * (1 - sstep(0.85, 1, k));
            pose.sink = (0.07 + Math.sin(t * 5.2) * 0.045) * s;
            pose.eyes = 0.5 * s; pose.clawL = pose.clawR = 0.25 * s * (0.5 + 0.5 * Math.sin(t * 5.2));
            this.acc = (this.acc === undefined ? 0.4 : this.acc) + dt;
            if (this.acc > 0.45) { this.acc = 0; spawnRipple(crab.pos.x, POOL.level + 0.012, crab.pos.z, 0.35 * crab.scale, 1.15 * crab.scale, 1.5); }
          },
        });
        steps.push(walkStep([inP, { x: a.x - (dx / dl) * 0.02, z: a.z - (dz / dl) * 0.02 }, a]));
        steps.push(faceStep(a.face, 0.3));
        return wakeFirst(steps);
      }
      case 'look_around':
        return wakeFirst([{
          dur: 3.4,
          tick(k) { pose.yaw = Math.sin(k * TAU) * 0.95 * Math.sin(k * Math.PI) ** 0.5; pose.eyes = 0.65 * Math.sin(k * Math.PI); },
        }]);
      case 'attend':    // [plans] at the glass for something on the calendar
      case 'watch':
        return wakeFirst([
          faceStep(0, 0.6),
          { dur: 2.2, tick(k) { pose.eyes = sstep(0, 0.2, k) * (1 - sstep(0.85, 1, k)); } },
        ]);
      case 'idle':                  // [quiet] stays put and gazes about a little
        return wakeFirst([{
          dur: 3.2,
          tick(k) { pose.yaw = Math.sin(k * TAU) * 0.14; pose.eyes = 0.5 * Math.sin(k * Math.PI); },
        }]);
      case 'write_diary':
      case 'leave_note':
        return wakeFirst([{
          dur: 2.5,
          tick(k) {
            const s = sstep(0, 0.15, k) * (1 - sstep(0.85, 1, k));
            pose.scribble = s; pose.lean = 0.07 * s; pose.dip = 0.3 * s; pose.eyes = -0.3 * s;
          },
        }]);
      case 'new_helmet': {
        let from = 1;
        return [
          { dur: 0.95, begin() { crab.tuckT = 1; } },
          {
            dur: 0.25,
            begin() {
              const want = snap && snap.crab && snap.crab.helmet != null ? snap.crab.helmet | 0 : crab.tier + 1;
              from = crab.scale;
              crab.scaleLock = true;
              setTier(want > crab.tier ? want : Math.min(3, crab.tier + 1));
              spawnPuff(crab.pos.x, crab.pos.y + 0.25, crab.pos.z, 10, 0xfff0c8, 1.3);
            },
            tick(k) { pose.hop = Math.sin(k * Math.PI) * 0.08; },
          },
          {
            dur: 1.3,
            begin() { crab.tuckT = 0; },
            tick(k) {
              crab.scale = lerp(from, crab.scaleT, easeOutBack(sstep(0, 1, k)));
              pose.hop = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.16;
              pose.eyes = Math.sin(k * Math.PI); pose.clawL = pose.clawR = Math.sin(k * Math.PI) * 0.7;
            },
            end() { crab.scale = crab.scaleT; crab.scaleLock = false; },
          },
        ];
      }
      case 'eat':       // [plans] claws to the mouth; the treat is gone at the next sync
      case 'toss':      // a flick of both claws; the thing is gone at the next sync
        return wakeFirst([{
          dur: 1.4,
          tick(k) { const s = Math.sin(k * Math.PI); pose.clawL = pose.clawR = s * 0.9; pose.lean = -s * 0.1; pose.hop = s * 0.06; },
        }]);
      case 'lap': {
        const steps = crab.at === 'track' ? [] : goSteps('track');
        steps.push({ dur: 0.6, begin() { crab.headingT = Math.PI / 2; }, tick(k) { pose.dip = Math.sin(k * Math.PI) * 0.5; } });
        steps.push({
          dur: 5.6,
          tick(k, dt) {
            const u = k * k * (3 - 2 * k) * 0.12 + k * 0.88;       // a little launch off the line
            const a = trackPt(u), b = trackPt(u + 0.012);
            crab.pos.x = a.x; crab.pos.z = a.z; crab.onLog = false; crab.mixed = null;
            crab.headingT = Math.atan2(b.x - a.x, b.z - a.z);
            pose.scuttle = 1; pose.lean = 0.1;
            crab.walkPhase += dt * 12;
            this.acc = (this.acc || 0) + dt;
            if (this.acc > 0.16) { this.acc = 0; spawnPuff(a.x, crab.pos.y, a.z, 1, SAND, 0.6); }
          },
          end() { const a = ANCHOR.track; crab.pos.x = a.x; crab.pos.z = a.z; crab.at = 'track'; },
        });
        const best = /new best/.test(String(ev.text || ''));
        steps.push({
          dur: best ? 1.5 : 0.7,
          begin() { crab.headingT = 0; },
          tick(k) {
            const sw = Math.sin(k * Math.PI);
            pose.eyes = sw;
            if (best) { pose.clawL = pose.clawR = sw; pose.hop = Math.abs(Math.sin(k * TAU * 1.5)) * 0.12; }
          },
        });
        return wakeFirst(steps);
      }
      case 'forage':
      case 'explore': {
        const src = verb === 'forage' ? 'found' : 'cave';
        const steps = [];
        const a = ANCHOR.cave, inside = { x: a.x, z: a.z - 0.8 };
        if (verb === 'explore') steps.push(walkStep([{ x: crab.pos.x, z: crab.pos.z }, inside]));
        steps.push({
          dur: 2.4,
          tick(k, dt, t) {
            const sw = sstep(0, 0.12, k) * (1 - sstep(0.85, 1, k));
            pose.dip = 0.7 * sw; pose.yaw = Math.sin(t * 13) * 0.14 * sw;
            pose.clawL = sw * (0.3 + 0.3 * Math.sin(t * 11)); pose.clawR = sw * (0.3 + 0.3 * Math.cos(t * 11));
            if (k > 0.7 && !this.done) { this.done = true; revealFrom([src]); }
          },
          end() { revealFrom([src]); },
        });
        if (verb === 'explore') { steps.push(walkStep([inside, a])); steps.push(faceStep(0, 0.3)); }
        return wakeFirst(steps);
      }
      case 'drink':
        return wakeFirst([{
          dur: 2.2,
          tick(k, dt) {
            const sw = sstep(0, 0.15, k) * (1 - sstep(0.85, 1, k));
            pose.dip = sw; pose.eyes = 0.3 * sw;
            this.acc = (this.acc === undefined ? 0.3 : this.acc) + dt;
            if (this.acc > 0.5) { this.acc = 0; spawnRipple(SPRING.x - 0.55, SPRING.level + 0.012, SPRING.z + 0.5, 0.1, 0.5, 1.2); }
          },
        }]);
      case 'research':   // [research] the wire is beside the reading stone: it leans in just the same
      case 'read':
        return wakeFirst([{
          dur: 4.2,
          begin() { crab.headingT = Math.PI; },
          tick(k, dt, t) {
            const sw = sstep(0, 0.12, k) * (1 - sstep(0.88, 1, k));
            pose.lean = 0.14 * sw; pose.eyes = sw * (0.6 + 0.4 * Math.sin(t * 1.3));
            pose.yaw = Math.sin(t * 0.9) * 0.1 * sw;                        // eyes along the lines
            pose.clawR = sw * Math.max(0, Math.sin(t * 2.1 - 1.2)) * 0.8;    // now and then, turn a page
          },
        }]);
      case 'rest':
        return wakeFirst([{ dur: 3.0, tick(k) { const sw = sstep(0, 0.2, k) * (1 - sstep(0.8, 1, k)); pose.sink = 0.09 * sw; pose.eyes = -0.2 * sw; } }]);
      case 'craft':
        return wakeFirst([{
          dur: 2.8,
          tick(k) {
            const s = Math.sin(k * Math.PI);
            pose.clawL = s * (0.4 + 0.3 * Math.sin(k * 18)); pose.clawR = s * (0.4 + 0.3 * Math.cos(k * 18));
            if (k > 0.75 && !this.done) { this.done = true; revealFrom(['made']); }
          },
          end() { revealFrom(['made']); },
        }]);
      case 'plant':
      case 'tend':
      case 'draw':
      case 'play_tune':
      case 'build':
      case 'tidy':
        return wakeFirst([{
          dur: 2.2,
          tick(k) { const s = Math.sin(k * Math.PI); pose.clawL = s * (0.4 + 0.3 * Math.sin(k * 16)); pose.clawR = s * (0.4 + 0.3 * Math.cos(k * 16)); },
        }]);
      case 'name_pet':   // [shrimp-ui]
      case 'feed_pet':   // [shrimp-ui]
      case 'talk_pet':   // [shrimp-ui]
      case 'show_pet':   // [shrimp-ui]
        return wakeFirst(petSteps(verb));   // [shrimp-ui]
      default:
        return [{ dur: 0.5 }];
    }
  }

  // no animation: just make the world reflect the event (used when the queue backs up)
  function applyInstant(ev) {
    const move = String(ev.move || '');
    const i = move.indexOf(':');
    const verb = i < 0 ? move : move.slice(0, i), arg = i < 0 ? '' : move.slice(i + 1);
    if (ev.kind === 'sleep') { crab.tuckT = crab.tk = 1; return; }
    if (ev.kind === 'wake') { crab.tuckT = crab.tk = 0; return; }
    if (ev.kind === 'tide') { revealFrom(['tide']); return; }
    if (ev.kind === 'person') { revealFrom(['from you']); return; }
    if (ev.kind !== 'action') return;
    if (verb === 'nap') { crab.tuckT = crab.tk = 1; return; }
    crab.tuckT = crab.tk = 0;
    if (verb === 'go') placeCrab(arg);
    else if (verb === 'pick_up' || verb === 'unhook') { const n = Number(arg); attachItem(items.has(n) ? n : arg); }
    else if (verb === 'put_down' || verb === 'store' || verb === 'hang') detachItem();
    else if (verb === 'stow' || verb === 'display') {
      const n = Number(arg), it = items.get(Number.isNaN(n) ? arg : n);
      if (it) { it.place = verb === 'stow' ? 'chest' : 'ledge'; relayout(false); rebuildPickables(); }
    }
    else if (verb === 'dig') revealFrom(['dug up']);
    else if (verb === 'craft') revealFrom(['made']);
    else if (verb === 'forage') revealFrom(['found']);
    else if (verb === 'explore') revealFrom(['cave']);
    else if (verb === 'new_helmet') {
      const want = snap && snap.crab && snap.crab.helmet != null ? snap.crab.helmet | 0 : crab.tier + 1;
      setTier(want > crab.tier ? want : Math.min(3, crab.tier + 1));
    }
  }

  function wantTucked() {
    return !!snap && (snap.state !== 'awake' || !!(snap.crab && snap.crab.tucked));
  }
  // make the scene match the latest snapshot
  function reconcile(instant) {
    if (!snap) return;
    const cr = snap.crab || {};
    for (const [id, it] of [...items]) if (!snap.byId.has(id)) removeItem(it);
    carryingId = null;
    for (const d of snap.items) {
      const it = items.get(d.id);
      if (!it) continue;
      reveal(it, instant);
      it.place = d.place;
      if (d.place === 'carried' || (cr.carrying != null && cr.carrying === d.id)) {
        if (carryingId == null) { carryingId = d.id; it.place = 'carried'; it.tween = null; }
        else it.place = crab.at;
      }
    }
    relayout(instant);
    rebuildPickables();
    if (cr.helmet != null) setTier(cr.helmet);
    const tuck = wantTucked();
    crab.tuckT = tuck ? 1 : 0;
    const place = cr.place || crab.at;
    if (instant) {
      placeCrab(place);
      crab.tk = crab.tuckT;
      crab.scale = crab.scaleT;
      if (carryingId != null) {
        const it = items.get(carryingId);
        C.root.position.copy(crab.pos); C.root.rotation.y = crab.heading;
        updateCrab(0, 0);
        C.root.updateMatrixWorld(true);
        C.hold.getWorldPosition(it.pos);
        it.pos.y -= it.height * 0.5;
      }
    } else if (place !== crab.at) {
      if (tuck && crab.tk > 0.5) placeCrab(place);
      else {
        const steps = goSteps(place);
        steps.push({ dur: 0.01, end() { crab.at = place; } });
        if (tuck) { crab.tuckT = 0; steps.push({ dur: 0.2, end() { crab.tuckT = wantTucked() ? 1 : 0; } }); }
        anim = { steps, i: 0, t: 0, started: false };
      }
    }
  }

  function runAnim(dt) {
    if (!anim) {
      while (queue.length > 6) applyInstant(queue.shift());
      if (queue.length) {
        const ev = queue.shift();
        let steps;
        try { steps = buildSteps(ev); } catch (err) { console.error('world: bad event', ev, err); steps = [{ dur: 0.1 }]; }
        anim = { steps, i: 0, t: 0, started: false };
        const note = ev.kind === 'action' && ev.move === 'leave_note' && ev.words;
        const text = note ? String(ev.words) : ev.thought ? String(ev.thought) : '';
        if (text.trim()) showBubble(text.trim(), !!note);
      } else if (needReconcile && ready) {
        needReconcile = false;
        reconcile(false);
      }
    }
    if (!anim) return;
    const st = anim.steps[anim.i];
    if (!st) { anim = null; resetPose(); needReconcile = true; return; }
    if (!anim.started) { anim.started = true; if (st.begin) st.begin(); }
    anim.t += dt;
    const k = st.dur > 0 ? Math.min(1, anim.t / st.dur) : 1;
    if (st.tick) st.tick(k, dt, anim.t);
    if (anim.t >= st.dur) {
      if (st.end) st.end();
      anim.i++; anim.t = 0; anim.started = false;
      resetPose();
      if (anim.i >= anim.steps.length) { anim = null; needReconcile = true; }
    }
  }

  /* ── camera: follow the crab up close, or show the whole tank ── */
  let follow = true, zoomT = 1.6, camSnap = true;      // the first frame lands on its view at once
  const HOME = new THREE.Vector3((G2.x1 - HALF_X) / 2, 0.4, 0);       // the middle of both tanks
  const _goal = new THREE.Vector3(), _off = new THREE.Vector3();
  function updateCamera(dt) {
    if (!ready) return;
    if (follow) _goal.set(crab.pos.x, crab.pos.y + 0.4, crab.pos.z); else _goal.copy(HOME);
    // slide the point the camera looks at, carrying the camera with it so the angle is kept
    const k = camSnap ? 1 : Math.min(1, dt * 2.2);
    _off.copy(_goal).sub(controls.target).multiplyScalar(k);
    controls.target.add(_off);
    camera.position.add(_off);
    if (zoomT > 0) {                        // for a moment after switching, ease to the right distance
      zoomT -= dt;
      _off.copy(camera.position).sub(controls.target);
      const want = follow ? 7.4 : 25.5;
      _off.setLength(lerp(_off.length(), want, camSnap ? 1 : Math.min(1, dt * 3)));
      camera.position.copy(controls.target).add(_off);
    }
    camSnap = false;
  }

  /* ── frame loop ── */
  let W = 0, H = 0, clock = 0, last = performance.now(), raf = 0, disposed = false;
  let sharp = !!opts.sharp;
  function setSharp(on) {
    sharp = !!on;
    for (const light of [key, key2]) {             // crisper shadows to go with it
      const size = sharp ? 2048 : 1024;
      if (light.shadow.mapSize.x !== size) {
        light.shadow.mapSize.set(size, size);
        if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
      }
    }
    W = H = 0;                                     // work the picture size out again
    resize();
  }
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h || (w === W && h === H)) return;
    W = w; H = h;
    // Smooth: never draw more than about 1.5 million pixels, which on a very wide
    // screen means the picture is stretched and looks soft, but is easy on the
    // graphics card. Sharp: draw every pixel of the panel, up to about 8 million.
    renderer.setPixelRatio(sharp
      ? Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8e6 / (w * h)))
      : Math.min(window.devicePixelRatio || 1, 1.25, Math.sqrt(1.5e6 / (w * h))));
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    // keep the whole tank in view when the panel is narrow
    const base = 45, refAspect = 1.5;
    camera.fov = aspect >= refAspect ? base
      : clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base) / 2) * refAspect / aspect)), base, 75);
    camera.updateProjectionMatrix();
    pointer.dirty = true;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  /* ── time of day and weather ──
     The lamp over the tanks follows the real clock (the program sends the hour),
     and the misters in the lid give an occasional shower. */
  //            hour  lamp colour  lamp  sky tint  ground    fill  backdrop  rim   exposure
  const SKY = [[0,    0x8fa9e6,    1.05, 0x46598a, 0x1c1822, 0.46, 0x070a10, 0.34, 0.98],
               [5,    0x8fa9e6,    1.05, 0x46598a, 0x1c1822, 0.46, 0x070a10, 0.34, 0.98],
               [6.5,  0xffa98a,    1.9,  0x8f8fb5, 0x3a2c28, 0.42, 0x191620, 0.45, 1.0],
               [9,    0xffdfb4,    3.3,  0x9db4d6, 0x4a3826, 0.50, 0x12161a, 0.55, 1.12],
               [16,   0xffdfb4,    3.3,  0x9db4d6, 0x4a3826, 0.50, 0x12161a, 0.55, 1.12],
               [19,   0xffac70,    2.3,  0xa493ad, 0x44302a, 0.48, 0x191416, 0.5,  1.04],
               [21,   0x8fa9e6,    1.05, 0x46598a, 0x1c1822, 0.46, 0x070a10, 0.34, 0.98],
               [24.01, 0x8fa9e6,   1.05, 0x46598a, 0x1c1822, 0.46, 0x070a10, 0.34, 0.98]];
  const sky = { hour: 12, rain: false, wet: 0, shown: '', night: 0, drop: 0 };
  const _skyC = new THREE.Color();
  function applySky() {
    const h = ((sky.hour % 24) + 24) % 24;
    let i = 0;
    while (i < SKY.length - 2 && SKY[i + 1][0] <= h) i++;
    const a = SKY[i], b = SKY[i + 1], k = clamp((h - a[0]) / (b[0] - a[0]), 0, 1);
    const lamp = lerp(a[2], b[2], k) * (1 - 0.28 * sky.wet);
    key.color.setHex(a[1]).lerp(_skyC.setHex(b[1]), k);
    key2.color.copy(key.color);
    key.intensity = lamp; key2.intensity = lamp * 0.91;
    hemi.color.setHex(a[3]).lerp(_skyC.setHex(b[3]), k);
    hemi.groundColor.setHex(a[4]).lerp(_skyC.setHex(b[4]), k);
    hemi.intensity = lerp(a[5], b[5], k);
    scene.background.setHex(a[6]).lerp(_skyC.setHex(b[6]), k);
    rimLight.intensity = lerp(a[7], b[7], k);
    renderer.toneMappingExposure = lerp(a[8], b[8], k) * (1 - 0.08 * sky.wet);
    sky.night = clamp((1.9 - lerp(a[2], b[2], k)) / 0.85, 0, 1);
  }
  function setSky(s) {
    if (!s || typeof s.hour !== 'number') return;
    sky.hour = s.hour; sky.rain = !!s.rain;
    if (sky.shown === '') sky.wet = sky.rain ? 1 : 0;          // first look: no fade
  }

  // rain: short streaks falling inside both tanks
  const RAIN_N = 240, RAIN_TOP = 3.3;
  const rainPos = new Float32Array(RAIN_N * 6), rainDrops = [];
  for (let i = 0; i < RAIN_N; i++) {
    const second = i % 23 >= 13;                               // shared by floor area, roughly
    rainDrops.push({
      x: second ? lerp(G2.x0 + 0.2, G2.x1 - 0.2, Math.random()) : lerp(-HALF_X + 0.2, HALF_X - 0.2, Math.random()),
      z: lerp(-HALF_Z + 0.2, HALF_Z - 0.2, Math.random()),
      y: Math.random() * RAIN_TOP, v: 4.2 + Math.random() * 1.6,
    });
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xcfe3f2, transparent: true, opacity: 0, depthWrite: false }));
  rain.frustumCulled = false; rain.visible = false; rain.renderOrder = 4;
  scene.add(rain);

  // fireflies over the garden bed and the moss, out only at night
  const FLY_N = 14, flyPos = new Float32Array(FLY_N * 3), flies = [];
  for (let i = 0; i < FLY_N; i++) {
    flies.push({ x: lerp(G2.x0 + 1, G2.x1 - 1.2, Math.random()), z: lerp(-3.6, 0.6, Math.random()),
                 y: 0.5 + Math.random() * 0.9, ph: Math.random() * TAU, sp: 0.35 + Math.random() * 0.5 });
  }
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
  const flyMat = new THREE.PointsMaterial({ color: 0xe8ff8a, size: 0.085, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const flyPts = new THREE.Points(flyGeo, flyMat);
  flyPts.frustumCulled = false; flyPts.visible = false;
  scene.add(flyPts);

  function updateSky(dt, time) {
    const target = sky.rain ? 1 : 0;
    if (sky.wet !== target) sky.wet = Math.abs(target - sky.wet) < 0.01 ? target : sky.wet + (target - sky.wet) * Math.min(1, dt * 0.6);
    const sig = sky.hour.toFixed(2) + '|' + sky.wet.toFixed(2);
    if (sig !== sky.shown) { sky.shown = sig; applySky(); }
    rain.visible = sky.wet > 0.02;
    if (rain.visible) {
      rain.material.opacity = 0.55 * sky.wet;
      for (let i = 0; i < RAIN_N; i++) {
        const d = rainDrops[i];
        d.y -= d.v * dt;
        if (d.y < sandH(d.x, d.z)) d.y = RAIN_TOP - Math.random() * 0.4;
        const o = i * 6;
        rainPos[o] = d.x; rainPos[o + 1] = d.y; rainPos[o + 2] = d.z;
        rainPos[o + 3] = d.x + 0.015; rainPos[o + 4] = d.y + 0.24; rainPos[o + 5] = d.z;
      }
      rainGeo.attributes.position.needsUpdate = true;
      sky.drop += dt;
      if (sky.drop > 0.3) {                                   // rings on the water
        sky.drop = 0;
        const a = Math.random() * TAU, r = Math.random();
        if (Math.random() < 0.7) spawnRipple(POOL.x + Math.cos(a) * r * 1.2, POOL.level + 0.012, POOL.z + Math.sin(a) * r * 1.2, 0.03, 0.22, 0.9);
        else spawnRipple(SPRING.x + Math.cos(a) * r * 0.6, SPRING.level + 0.012, SPRING.z + Math.sin(a) * r * 0.6, 0.03, 0.18, 0.9);
      }
    }
    const glow = sky.night * (1 - sky.wet);
    flyPts.visible = glow > 0.02;
    if (flyPts.visible) {
      for (let i = 0; i < FLY_N; i++) {
        const f = flies[i], o = i * 3;
        flyPos[o] = f.x + Math.sin(time * f.sp + f.ph) * 0.5;
        flyPos[o + 1] = f.y + Math.sin(time * f.sp * 1.7 + f.ph * 2) * 0.18;
        flyPos[o + 2] = f.z + Math.cos(time * f.sp * 0.8 + f.ph) * 0.5;
      }
      flyGeo.attributes.position.needsUpdate = true;
      flyMat.opacity = glow * (0.55 + 0.4 * Math.sin(time * 2.3));
    }
  }

  function updateFx(dt, time) {
    updateSky(dt, time);
    shimmer[0].offset.set(time * 0.021, time * 0.013);
    shimmer[1].offset.set(-time * 0.016, time * 0.019 + 0.3);
    water.material.opacity = 0.54 + Math.sin(time * 0.8) * 0.03;
    // tide
    let level = TIDE_IDLE + Math.sin(time * 0.55) * 0.009, foamOp = 0.22;
    if (tide.t >= 0) {
      tide.t += dt;
      const k = tide.t / tide.dur;
      if (k >= 1) tide.t = -1;
      else {
        const s = Math.sin(Math.min(1, k * 1.25) * Math.PI * 0.5) * (1 - sstep(0.45, 1, k));
        level = lerp(level, TIDE_SURGE, s);
        foamOp = 0.22 + 0.6 * Math.sin(Math.min(1, k * 1.2) * Math.PI);
        tideMat.color.setHex(0x8cc6d6).lerp(_foamCol, s * 0.5);
        tideMat.opacity = 0.5 + s * 0.2;
      }
    } else if (tideMat.opacity !== 0.5) { tideMat.opacity = 0.5; tideMat.color.setHex(0x8cc6d6); }
    tideWater.position.y = level;
    // foam line rides the water's edge: find where the corner slope meets the water level
    let lo = 0.6, hi = 3.3;
    for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (-0.13 * sstep(3.3, 0.6, mid) < level) lo = mid; else hi = mid; }
    foam.scale.setScalar(lo + 0.03);
    foam.material.opacity = foamOp;
    foam.position.y = level + 0.012;
    for (const rp of ripples) {
      if (!rp.m.visible) continue;
      rp.t += dt;
      const k = rp.t / rp.life;
      if (k >= 1) { rp.m.visible = false; continue; }
      rp.m.scale.setScalar(lerp(rp.r0, rp.r1, 1 - (1 - k) * (1 - k)));
      rp.m.material.opacity = 0.6 * (1 - k);
    }
    for (const p of puffs) {
      if (!p.m.visible) continue;
      p.t += dt;
      p.v.y -= 7.5 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.t > p.life || p.m.position.y < p.floor - 0.02) p.m.visible = false;
    }
    for (const t of tufts) t.g.rotation.z = Math.sin(time * 0.8 + t.ph) * 0.045;
    for (const pl of garden.plants.values()) pl.g.rotation.z = Math.sin(time * 0.9 + pl.ph) * 0.035;
    garden.crystal.emissiveIntensity = (1.3 + Math.sin(time * 1.7) * 0.5) * (1 + sky.night);   // brighter after dark
    {                                                          // the cave lantern flickers, and counts for more after dark
      const f = 0.86 + Math.sin(time * 9.1) * 0.06 + Math.sin(time * 23.7) * 0.04;
      garden.lamp.intensity = (1.5 + 1.6 * sky.night) * f;
      garden.flame.emissiveIntensity = 2.4 * f;
    }
    garden.drip += dt;
    if (garden.drip > 1.5) { garden.drip = 0; spawnRipple(16.55, SPRING.level + 0.012, -2.75, 0.06, 0.5, 1.6); }
    if (selRing.visible) selRing.material.opacity = 0.65 + Math.sin(time * 4) * 0.2;
    updatePet(dt, time);   // [shrimp-ui]
  }
  const _foamCol = new THREE.Color(0xeaf7f7);

  function frame(now) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    // 30 frames a second is plenty for a terrarium and leaves the graphics
    // card free for the language model (and for everything else).
    if (now - last < 1000 / 30 - 2) return;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (document.hidden || !W || !H) return;
    clock += dt;
    if (ready) {
      runAnim(dt);
      updateCrab(dt, clock);
      updateItems(dt);
    }
    updateFx(dt, clock);
    updateCamera(dt);
    controls.update();
    updateHover();
    updateBubble();
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  /* ── public interface ── */
  function update(payload) {
    if (disposed || !payload) return;
    const list = Array.isArray(payload.items) ? payload.items : [];
    snap = Object.assign({}, payload, { items: list, byId: new Map(list.map((d) => [d.id, d])) });
    if (payload.name) crabName = payload.name;
    const first = !ready;

    // items: refresh data, add new ones (held back until an event or the next reconcile reveals them)
    for (const d of list) {
      let it = items.get(d.id);
      if (it && it.sig !== `${d.kind}|${d.name}`) { const sel = selectedId === d.id; removeItem(it); it = null; if (sel) selectedId = d.id; }
      if (it) { it.data = d; it.hit.userData.pick.it = it; } else addItem(d, !first);
    }
    syncPhotos(payload.photos);
    syncStructures(payload.structures);
    syncDrawing(payload.drawing);
    syncPlants(payload.plants);
    setSky(payload.sky);
    syncPet(payload.pet);   // [shrimp-ui]

    const evs = Array.isArray(payload.events) ? payload.events : [];
    if (first) {
      setTier(payload.crab && payload.crab.helmet != null ? payload.crab.helmet : 0);
      ready = true;
      reconcile(true);
    } else {
      for (const ev of evs) {
        if (!ev) continue;
        if (typeof ev.id === 'number' && typeof lastEventId === 'number' && ev.id <= lastEventId) continue;
        queue.push(ev);
      }
      needReconcile = true;
    }
    for (const ev of evs) if (ev && typeof ev.id === 'number' && (lastEventId == null || ev.id > lastEventId)) lastEventId = ev.id;
    if (typeof payload.last_event === 'number' && (lastEventId == null || payload.last_event > lastEventId)) lastEventId = payload.last_event;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onLeave);
    controls.dispose();
    for (const ph of photos.values()) { ph.disposed = true; if (ph.tex) ph.tex.dispose(); ph.picMat.dispose(); }
    photos.clear();
    disposeTree(scene);
    if (scene.environment) scene.environment.dispose();
    renderer.dispose();
    canvas.remove();
    bubble.remove();
    tip.remove();
  }

  const api = { update, dispose, setSharp, setFollow(on) { follow = !!on; zoomT = 1.6; } };
  if (opts.debug) api._debug = { scene, camera, controls, crab, items, queue };   // test hook, not part of the interface
  return api;
}
