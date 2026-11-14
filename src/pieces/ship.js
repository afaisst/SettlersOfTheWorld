// Medieval cog — used for harbour boats now, and later as the seafaring
// player piece (sailing to islands). Built at unit length (bow at +X) with
// the waterline at y = 0; scale the returned group to the size you need.
//   hull: lofted, clinker-planked, sheer rising to bow & stern, player-colour wale
//   fore- and aftcastle with railings, mast + yard + billowing square sail,
//   shrouds, bowsprit, stern rudder and a masthead pennant.

import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';
import { flagMaterial } from './flag.js';
import { mergeStatic } from './merge.js';

const L = 1.0, W = 0.36, D = 0.17;   // length, beam, hull depth
const WATERLINE = -0.09;             // hull y that sits at the water surface

// ---------------------------------------------------------------------------
// Textures & materials
// ---------------------------------------------------------------------------
const texCache = {};
function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function plankTexture() {
  return (texCache.planks ??= canvas(256, 256, (g, w, h) => {
    const rand = mulberry32(5);
    const rows = 8, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const v = 0.75 + rand() * 0.35;
      g.fillStyle = `rgb(${92 * v | 0},${64 * v | 0},${40 * v | 0})`;
      g.fillRect(0, r * rh, w, rh);
      for (let i = 0; i < 40; i++) { // grain
        g.fillStyle = `rgba(30,20,10,${rand() * 0.25})`;
        g.fillRect(rand() * w, r * rh + rand() * rh, 20 + rand() * 40, 1);
      }
      g.fillStyle = 'rgba(15,10,5,0.85)';           // clinker overlap shadow
      g.fillRect(0, r * rh + rh - 3, w, 3);
      g.fillStyle = 'rgba(255,230,190,0.15)';        // lit plank edge
      g.fillRect(0, r * rh, w, 2);
    }
    g.fillStyle = 'rgba(20,14,8,0.6)';               // butt joints
    for (let r = 0; r < rows; r++) g.fillRect((r * 97) % w, r * rh, 2, rh);
  }));
}
function sailTexture() {
  return (texCache.sail ??= canvas(128, 128, (g, w, h) => {
    g.fillStyle = '#f2f2f2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 2, h);    // vertical cloths
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(0, 0, w, 5); g.fillRect(0, h - 5, w, 5);        // hems
  }));
}
let mats = null;
function shared() {
  return (mats ??= {
    hull: new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.85, side: THREE.DoubleSide }),
    deck: new THREE.MeshStandardMaterial({ map: plankTexture(), color: '#c9a37a', roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: '#4a3220', roughness: 0.8 }),
    rope: new THREE.LineBasicMaterial({ color: '#2a2018' }),
  });
}
const playerMats = new Map();
function pmats(color) {
  if (!playerMats.has(color)) {
    const c = new THREE.Color(color);
    playerMats.set(color, {
      wale: new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, side: THREE.DoubleSide }),
      sail: new THREE.MeshStandardMaterial({ map: sailTexture(), color: c.clone().lerp(new THREE.Color('#ffffff'), 0.04), roughness: 0.9, side: THREE.DoubleSide }),
      flag: flagMaterial(c, { amp: 0.03, waves: 1.2 }),
    });
  }
  return playerMats.get(color);
}

// ---------------------------------------------------------------------------
// Hull shape
// ---------------------------------------------------------------------------
// s ∈ [-1 (stern), 1 (bow)]
const taper = (s) => (s > 0 ? 1 - Math.pow(s, 1.7) : 1 - Math.pow(-s, 3.5));
const halfBeam = (s) => (W / 2) * Math.pow(Math.max(taper(s), 0), 0.55);
const depthAt = (s) => D * (0.7 + 0.3 * Math.max(taper(s), 0));
const sheerAt = (s) => D * (0.32 * s * s + (s < 0 ? 0.12 * s * s : 0.06 * s * s)); // ends rise
const sectionY = (s, t) => sheerAt(s) - depthAt(s) * (1 - Math.pow(Math.abs(t), 2.4));

let hullGeoCache = null;
function hullGeometry() {
  if (hullGeoCache) return hullGeoCache;
  const NX = 36, NT = 16;
  const pos = [], uv = [];
  for (let i = 0; i <= NX; i++) {
    const s = (i / NX) * 2 - 1, x = s * (L / 2);
    for (let j = 0; j <= NT; j++) {
      const t = (j / NT) * 2 - 1;
      pos.push(x, sectionY(s, t) - WATERLINE, halfBeam(s) * t);
      uv.push((i / NX) * 6, (Math.abs(t)) * 4); // planks run bow-to-stern
    }
  }
  const idx = [];
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NT; j++) {
      const a = i * (NT + 1) + j, b = a + NT + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.shared = true;
  return (hullGeoCache = g);
}

// Painted wale: the top strake on the outside only, a hair proud of the hull
let waleGeoCache = null;
function waleGeometry() {
  if (waleGeoCache) return waleGeoCache;
  const NX = 36, pos = [], idx = [];
  for (let i = 0; i <= NX; i++) {
    const s = (i / NX) * 2 - 1, x = s * (L / 2);
    for (const t of [-1, -0.86, 0.86, 1]) {
      pos.push(x, sectionY(s, t) - WATERLINE, halfBeam(s) * t * 1.015 + Math.sign(t) * 0.002);
    }
  }
  for (let i = 0; i < NX; i++) {
    const a = i * 4, b = a + 4;
    idx.push(a, a + 1, b, b, a + 1, b + 1);          // port band (faces -Z)
    idx.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3); // starboard band (faces +Z)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.shared = true;
  return (waleGeoCache = g);
}

// Flat deck inside the hull at height deckY (hull coords)
let deckGeoCache = null;
function deckGeometry(deckY) {
  if (deckGeoCache) return deckGeoCache;
  const NX = 30, pos = [], uv = [], idx = [];
  let n = 0;
  for (let i = 0; i <= NX; i++) {
    const s = -0.97 + (i / NX) * 1.9;
    const rise = (sheerAt(s) - deckY) / depthAt(s);
    const tt = rise < 1 ? Math.pow(Math.max(0, 1 - rise), 1 / 2.4) : 0;
    const z = halfBeam(s) * tt * 0.98;
    pos.push(s * L / 2, deckY - WATERLINE, -z, s * L / 2, deckY - WATERLINE, z);
    uv.push(i / NX * 6, 0, i / NX * 6, 1.5);
    if (i > 0) idx.push(n - 2, n - 1, n, n - 1, n + 1, n); // counter-clockwise from above (faces up)
    n += 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.shared = true;
  return (deckGeoCache = g);
}

// ---------------------------------------------------------------------------
// Ship
// ---------------------------------------------------------------------------
const ships = new Set(); // for the bobbing animation

export function createShip(color, { length = 0.15, seed = 1 } = {}) {
  const rand = mulberry32(seed * 31 + 9);
  const S = shared(), P = pmats(color);
  const ship = new THREE.Group();
  ship.name = 'ship';
  const body = new THREE.Group(); // rocks; the outer group carries position/heading
  ship.add(body);
  const m = (geo, mat, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    body.add(o);
    return o;
  };
  const up = -WATERLINE; // shift from hull coords to waterline coords

  m(hullGeometry(), S.hull);
  m(waleGeometry(), P.wale);
  const deckY = -D * 0.28;
  m(deckGeometry(deckY), S.deck);

  // aftcastle (stern) and forecastle (bow): raised decks with railings
  const castle = (x0, x1, h, sMid) => {
    const len = x1 - x0, w = halfBeam(sMid) * 1.75;
    const base = sheerAt(sMid) + up;
    m(new THREE.BoxGeometry(len, h, w), S.wood, (x0 + x1) / 2, base + h / 2 - 0.01, 0);
    m(new THREE.BoxGeometry(len * 1.02, 0.008, w * 1.04), S.deck, (x0 + x1) / 2, base + h, 0);
    const posts = Math.max(3, Math.round(len / 0.03));
    for (const side of [-1, 1]) {
      for (let k = 0; k <= posts; k++) {
        m(new THREE.BoxGeometry(0.008, 0.035, 0.008), S.wood, x0 + (k / posts) * len, base + h + 0.0175, side * w / 2);
      }
      m(new THREE.BoxGeometry(len, 0.007, 0.01), S.wood, (x0 + x1) / 2, base + h + 0.035, side * w / 2);
    }
    for (const end of [x0, x1]) m(new THREE.BoxGeometry(0.01, 0.007, w), S.wood, end, base + h + 0.035, 0);
  };
  castle(-0.47, -0.22, 0.07, -0.7);  // aftcastle
  castle(0.25, 0.42, 0.05, 0.65);    // forecastle

  // mast, yard, sail
  const mastX = 0.03, mastH = 0.95;
  m(new THREE.CylinderGeometry(0.009, 0.013, mastH, 8), S.wood, mastX, deckY + up + mastH / 2, 0);
  m(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 8), S.wood, mastX, deckY + up + mastH - 0.04, 0); // top (crow's nest)
  const yardY = deckY + up + mastH * 0.82, sailW = W * 1.45, sailH = 0.42;
  m(new THREE.CylinderGeometry(0.006, 0.006, sailW * 1.08, 6).rotateX(Math.PI / 2), S.wood, mastX + 0.012, yardY, 0);
  const sail = new THREE.PlaneGeometry(sailW, sailH, 10, 8);
  const sp = sail.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const u = sp.getX(i) / (sailW / 2), v = 0.5 - sp.getY(i) / sailH; // v: 0 top .. 1 bottom
    const belly = (1 - u * u) * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, v * 1.1)));
    sp.setZ(i, belly * 0.07);
    sp.setY(i, sp.getY(i) + Math.abs(u) * v * 0.015); // corners pulled in
  }
  sail.computeVertexNormals();
  sail.rotateY(Math.PI / 2); // span across the beam, billowing forward (+X)
  m(sail, P.sail, mastX + 0.02, yardY - sailH / 2 - 0.005, 0);

  // masthead pennant
  const pen = new THREE.BufferGeometry();
  // long tapering pennant, subdivided so it can ripple (uv.x: 0 at mast -> 1 at tip)
  const pp = [], pu = [], pi = [];
  const N = 10;
  for (let k = 0; k <= N; k++) {
    const u = k / N, half = 0.02 * (1 - u * 0.92);
    pp.push(-0.16 * u, half, 0, -0.16 * u, -half, 0);
    pu.push(u, 1, u, 0);
    if (k) pi.push(2 * k - 2, 2 * k - 1, 2 * k, 2 * k, 2 * k - 1, 2 * k + 1);
  }
  pen.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
  pen.setAttribute('uv', new THREE.Float32BufferAttribute(pu, 2));
  pen.setIndex(pi);
  pen.computeVertexNormals();
  m(pen, P.flag, mastX, deckY + up + mastH, 0).name = 'flag';

  // bowsprit & rudder
  const bow = m(new THREE.CylinderGeometry(0.006, 0.009, 0.22, 6), S.wood, L / 2 + 0.05, sheerAt(1) + up - 0.01, 0);
  bow.rotation.z = -Math.PI / 2 + 0.35;
  m(new THREE.BoxGeometry(0.06, 0.16, 0.012), S.wood, -L / 2 - 0.015, sheerAt(-1) + up - 0.11, 0);

  // shrouds: masthead down to the gunwales
  const ropes = [];
  const top = new THREE.Vector3(mastX, deckY + up + mastH - 0.05, 0);
  for (const side of [-1, 1]) {
    for (const dx of [-0.12, -0.05, 0.02]) {
      const s = (mastX + dx) / (L / 2);
      ropes.push(top.x, top.y, top.z, mastX + dx, sheerAt(s) + up, side * halfBeam(s));
    }
  }
  ropes.push(top.x, top.y, 0, L / 2 + 0.15, sheerAt(1) + up + 0.03, 0); // forestay
  ropes.push(top.x, top.y, 0, -0.45, sheerAt(-0.9) + up + 0.1, 0);      // backstay
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(ropes, 3));
  body.add(new THREE.LineSegments(rg, S.rope));

  mergeStatic(body); // ~60 parts -> one mesh per material (pennant keeps waving)
  ship.scale.setScalar(length);
  ship.userData.phase = rand() * Math.PI * 2;
  ship.userData.body = body;
  ships.add(ship);
  return ship;
}

/** Gentle rocking & bobbing for all ships in the scene. */
export function updateShips(time) {
  for (const s of ships) {
    if (!s.parent) { ships.delete(s); continue; }
    const p = s.userData.phase, b = s.userData.body;
    b.rotation.x = Math.sin(time * 0.9 + p) * 0.035;         // roll
    b.rotation.z = Math.sin(time * 0.7 + p * 1.7) * 0.025;   // pitch
    b.position.y = Math.sin(time * 1.1 + p) * 0.008;         // heave (unit-length coords)
  }
}
