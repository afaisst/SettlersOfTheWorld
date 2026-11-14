// Medieval player pieces: cobblestone ROADS (on hex edges), TOWNS (fenced
// hamlets on hex corners) and CITIES (castles on hex corners).
// Player colour shows on road kerbs, house roofs, castle tower roofs & banners.
// All pieces are built around their own origin with y = 0 at the tile top.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/noise.js';
import { cobbleTexture, cobbleBump, timberTexture, roofTexture, stoneTexture, woodTexture } from './textures.js';
import { createShip } from './ship.js';
import { flagMaterial } from './flag.js';

export const PLAYERS = {
  red: { name: 'Red', color: '#b8322a' },
  blue: { name: 'Blue', color: '#2f5fa8' },
  white: { name: 'White', color: '#ece8de' },
  purple: { name: 'Purple', color: '#9446c8' }, // (was orange — too close to red and the hills)
};

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
let shared = null;
function sharedMats() {
  if (shared) return shared;
  shared = {
    cobble: new THREE.MeshStandardMaterial({ map: cobbleTexture(), bumpMap: cobbleBump(), bumpScale: 1.5, roughness: 0.9 }),
    timber: new THREE.MeshStandardMaterial({ map: timberTexture(), roughness: 0.95 }),
    stone: new THREE.MeshStandardMaterial({ map: stoneTexture(), color: '#e6e0d2', roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.95 }),
    dark: new THREE.MeshStandardMaterial({ color: '#17120e', roughness: 1 }),
    dirt: new THREE.MeshStandardMaterial({ color: '#6e5a40', roughness: 1 }),
    pole: new THREE.MeshStandardMaterial({ color: '#3d2c1e', roughness: 0.8 }),
  };
  return shared;
}
const playerMatCache = new Map();
function playerMats(player) {
  if (playerMatCache.has(player)) return playerMatCache.get(player);
  const col = new THREE.Color(PLAYERS[player].color);
  const mats = {
    roof: new THREE.MeshStandardMaterial({ map: roofTexture(), color: col, roughness: 0.75 }),
    kerb: new THREE.MeshStandardMaterial({ map: stoneTexture(), color: col.clone().lerp(new THREE.Color('#ffffff'), 0.15), roughness: 0.8 }),
    banner: flagMaterial(col, { amp: 0.012, waves: 1.3 }), // waves in the wind
  };
  playerMatCache.set(player, mats);
  return mats;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
// Box with UVs scaled by face size so textures keep a constant world density.
function box(w, h, d, density = 20) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] * density, uv.getY(i) * dims[f][1] * density);
    }
  }
  return g;
}
function cylinder(rTop, rBot, h, seg = 12, density = 20, open = false) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  const uv = g.attributes.uv;
  const circ = Math.PI * 2 * Math.max(rTop, rBot);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ * density, uv.getY(i) * h * density);
  return g;
}
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
// Row of merlons (battlements) along a line, as one merged geometry.
function merlons(x1, z1, x2, z2, y, thick, size = 0.011) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(2, Math.floor(len / (size * 2)));
  const ang = Math.atan2(z2 - z1, x2 - x1);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const g = box(size, size * 1.1, thick);
    g.rotateY(-ang);
    g.translate(x1 + (x2 - x1) * t, y + size * 0.55, z1 + (z2 - z1) * t);
    parts.push(g);
  }
  return mergeGeometries(parts);
}
function ringMerlons(r, y, n, size = 0.01) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const g = box(size, size * 1.1, size * 0.9);
    g.rotateY(-a);
    g.translate(Math.cos(a) * r, y + size * 0.55, Math.sin(a) * r);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

// Banner on a pole; the cloth is gently rippled.
function banner(player, height = 0.14, size = 0.05) {
  const g = new THREE.Group();
  g.add(mesh(cylinder(0.0025, 0.003, height, 6), sharedMats().pole, 0, height / 2, 0));
  const cloth = new THREE.PlaneGeometry(size, size * 0.62, 8, 2);
  const p = cloth.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + size / 2;
    p.setZ(i, Math.sin(x / size * Math.PI * 1.6) * size * 0.08 * (x / size));
    p.setX(i, x);
  }
  cloth.computeVertexNormals();
  const flag = mesh(cloth, playerMats(player).banner, 0.003, height - size * 0.34, 0);
  flag.name = 'flag';
  g.add(flag);
  return g;
}

// A medieval half-timbered house (door faces +Z). Returns a Group.
function house(player, w, d, h, rand) {
  const S = sharedMats(), P = playerMats(player);
  const g = new THREE.Group();
  g.add(mesh(box(w, h, d, 18), S.timber, 0, h / 2, 0));
  const rh = d * (0.7 + rand() * 0.25);                // steep roof
  // gable ends (timber)
  const tri = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rh)]);
  const gable = new THREE.ExtrudeGeometry(tri, { depth: w * 0.98, bevelEnabled: false });
  gable.rotateY(Math.PI / 2);
  gable.translate(-w * 0.49, h, 0);
  const guv = gable.attributes.uv;
  for (let i = 0; i < guv.count; i++) guv.setXY(i, guv.getX(i) * 18, guv.getY(i) * 18);
  g.add(mesh(gable, S.timber));
  // roof slabs (player colour)
  const over = 0.008;
  const slope = Math.hypot(d / 2 + over, rh + over * 0.8);
  const ang = Math.atan2(rh, d / 2);
  for (const s of [-1, 1]) {
    const slab = box(w + over * 2, 0.005, slope, 22);
    slab.translate(0, 0.0025, -slope / 2);
    slab.rotateX(-ang);
    if (s < 0) slab.rotateY(Math.PI);
    g.add(mesh(slab, P.roof, 0, h + rh, 0));
  }
  // chimney, door, window
  if (rand() < 0.7) g.add(mesh(box(0.01, rh * 0.9, 0.01), S.stone, (rand() < 0.5 ? -1 : 1) * w * 0.3, h + rh * 0.6, -d * 0.15));
  g.add(mesh(box(w * 0.2, h * 0.55, 0.002), S.wood, (rand() - 0.5) * w * 0.4, h * 0.275, d / 2 + 0.001));
  return g;
}

// ---------------------------------------------------------------------------
// ROAD — lies along local X, centred, spanning one hex edge.
// ---------------------------------------------------------------------------
export const ROAD_LENGTH = 0.72; // edge length is 1.0; leaves room for corner pieces

/**
 * Road along local X from x = from to x = to (edge midpoint is the origin,
 * the edge runs from -0.5 to +0.5). Ends are trimmed per corner by the caller.
 */
export function createRoad(player, { from = -ROAD_LENGTH / 2, to = ROAD_LENGTH / 2, width = 0.12, seed = 1 } = {}) {
  const rand = mulberry32(seed);
  const S = sharedMats(), P = playerMats(player);
  const g = new THREE.Group();
  g.name = 'road';
  const length = to - from, cx = (from + to) / 2;
  g.add(mesh(box(length, 0.014, width * 0.74, 9), S.cobble, cx, 0.007, 0));
  // kerb stones in player colour along both sides (one merged mesh)
  const per = Math.max(1, Math.round(length / 0.026));
  const stones = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < per; i++) {
      const st = box(length / per * 0.92, 0.018 + rand() * 0.004, 0.016, 30);
      st.rotateY((rand() - 0.5) * 0.15);
      st.translate(from + (i + 0.5) * (length / per), 0.009, side * width * 0.43);
      stones.push(st);
    }
  }
  g.add(mesh(mergeGeometries(stones), P.kerb));
  return g;
}

export const CITY_HALF = 0.15; // castle half wall length (local units)
export const JUNCTION_R = 0.075;
/**
 * Cobbled square where a player's roads meet at a corner. `openings` are the
 * world-space directions (radians, atan2(z, x)) of the roads entering it.
 */
export function createJunction(player, openings, { width = 0.12, seed = 1 } = {}) {
  const rand = mulberry32(seed);
  const S = sharedMats(), P = playerMats(player);
  const g = new THREE.Group();
  g.name = 'junction';
  // flat cobbled top with evenly scaled UVs (same cobble size as the roads), plus a thin rim
  const top = new THREE.CircleGeometry(JUNCTION_R, 28).rotateX(-Math.PI / 2);
  const tuv = top.attributes.uv;
  for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getX(i) * JUNCTION_R * 2 * 9, tuv.getY(i) * JUNCTION_R * 2 * 9);
  g.add(mesh(top, S.cobble, 0, 0.014, 0));
  g.add(mesh(cylinder(JUNCTION_R, JUNCTION_R, 0.014, 28, 9, true), S.cobble, 0, 0.007, 0));
  const half = Math.asin(Math.min(0.99, (width * 0.5) / JUNCTION_R)); // angular half-width of a road
  const n = 22;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (openings.some((o) => Math.abs(Math.atan2(Math.sin(a - o), Math.cos(a - o))) < half)) continue;
    const st = box(0.022, 0.018 + rand() * 0.004, 0.016, 30);
    st.rotateY(-a + Math.PI / 2);
    st.translate(Math.cos(a) * (JUNCTION_R - 0.006), 0.009, Math.sin(a) * (JUNCTION_R - 0.006));
    parts.push(st);
  }
  if (parts.length) g.add(mesh(mergeGeometries(parts), P.kerb));
  return g;
}

const angDist = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
// ---------------------------------------------------------------------------
// HARBOUR — wooden jetty on posts with crates, and a small moored cog whose
// sail is in the player's colour. Built in the piece's local frame.
// ---------------------------------------------------------------------------
const WATER_Y = -0.027; // sea surface in piece-local units (pieces are scaled ~1.3–1.6)

/** Harbour options: `boats` adds a decorative moored boat to every jetty. */
export const HARBOUR = { boats: true };

export function createBoat(player, seed = 1) {
  return createShip(PLAYERS[player].color, { length: 0.15, seed });
}

/** Jetty + boat pointing along local angle `seaAng`, starting at radius r0. */
function addHarbour(g, player, seaAng, r0, rand) {
  const S = sharedMats();
  const len = 0.26, w = 0.046;
  const h = new THREE.Group();
  h.name = 'harbour';
  // deck planks (local X = out to sea)
  h.add(mesh(box(len, 0.008, w, 40), S.wood, r0 + len / 2, 0.004, 0));
  // posts down into the water
  const posts = [];
  for (let x = r0 + 0.02; x <= r0 + len; x += 0.05) {
    for (const s of [-1, 1]) {
      const p = cylinder(0.005, 0.005, 0.08, 6, 30);
      p.translate(x, -0.03, s * (w / 2 - 0.002));
      posts.push(p);
    }
  }
  h.add(mesh(mergeGeometries(posts), S.pole));
  // crates & barrels
  for (let i = 0; i < 3; i++) {
    const x = r0 + 0.05 + rand() * (len - 0.1), z = (rand() - 0.5) * w * 0.5;
    if (rand() < 0.5) h.add(mesh(box(0.014, 0.014, 0.014, 60), S.wood, x, 0.015, z));
    else h.add(mesh(cylinder(0.0075, 0.0075, 0.016, 10, 60), S.wood, x, 0.016, z));
  }
  // moored boat alongside the end of the jetty
  const bs = Math.floor(rand() * 1000), side = rand() < 0.5 ? -1 : 1, flip = rand() < 0.5 ? 0 : Math.PI, wob = (rand() - 0.5) * 0.1;
  if (HARBOUR.boats) { // decorative only — in the game real ships sail instead
    const boat = createBoat(player, bs);
    boat.position.set(r0 + len * 0.6, WATER_Y + 0.004, side * (w / 2 + 0.042));
    boat.rotation.y = flip + wob; // moored bow-out or bow-in
    h.add(boat);
  }
  h.rotation.y = -seaAng; // local X -> sea direction
  g.add(h);
}

// ---------------------------------------------------------------------------
// TOWN (settlement) — a few houses inside a wooden palisade.
// ---------------------------------------------------------------------------
export function createTown(player, { seed = 1, gateAng = null, gateAngs = null, seaAng = null } = {}) {
  const rand = mulberry32(seed * 97 + 5);
  const S = sharedMats();
  const g = new THREE.Group();
  g.name = 'town';
  const R = 0.18;
  // one gate per road (gateAngs, local angles); the first is the main gate
  if (!gateAngs || !gateAngs.length) gateAngs = [gateAng ?? rand() * Math.PI * 2];
  gateAng = gateAngs[0];
  const nearGate = (a, lim) => gateAngs.some((ga) => angDist(a, ga) < lim);

  // trampled ground inside
  g.add(mesh(new THREE.CircleGeometry(R * 1.02, 24).rotateX(-Math.PI / 2), S.dirt, 0, 0.003, 0));

  // palisade of sharpened stakes, with a gate gap
  const stakes = [];
  const n = 48;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (nearGate(a, 0.22)) continue;
    if (seaAng !== null && angDist(a, seaAng) < 0.75) continue; // open to the harbour
    const hgt = 0.04 + rand() * 0.008;
    const r0 = 0.0055 + rand() * 0.001;
    const post = cylinder(r0, r0, hgt, 6, 30);
    post.translate(0, hgt / 2, 0);
    const tip = cylinder(0, r0, 0.01, 6, 30);
    tip.translate(0, hgt + 0.005, 0);
    for (const p of [post, tip]) {
      p.rotateZ((rand() - 0.5) * 0.08);
      p.translate(Math.cos(a) * R, 0, Math.sin(a) * R);
      stakes.push(p);
    }
  }
  g.add(mesh(mergeGeometries(stakes), S.wood));
  // gate posts with lintel, one gate per road
  for (const ga of gateAngs) {
    const gx = Math.cos(ga) * R, gz = Math.sin(ga) * R;
    const px = -Math.sin(ga), pz = Math.cos(ga);
    for (const s of [-1, 1]) g.add(mesh(box(0.012, 0.06, 0.012), S.wood, gx + px * s * 0.042, 0.03, gz + pz * s * 0.042));
    const lintel = mesh(box(0.097, 0.01, 0.012), S.wood, gx, 0.062, gz);
    lintel.rotation.y = -Math.atan2(pz, px);
    g.add(lintel);
  }

  // houses around the inside, doors facing the centre, none blocking the gate
  // house slots spread around the ring, keeping clear of the gate and the harbour side
  const slots = [];
  for (let k = 0; k < 24; k++) {
    const a = gateAng + (k / 24) * Math.PI * 2;
    if (nearGate(a, gateAngs.length >= 3 ? 0.5 : 1.0)) continue;
    if (seaAng !== null && angDist(a, seaAng) < 1.25) continue;
    slots.push(a);
  }
  // each house needs ~4 slots of arc so neighbours don't overlap
  const crowded = gateAngs.length >= 3; // little arcs between gates -> small cottages
  const nHouses = crowded ? Math.min(3, Math.max(1, Math.floor(slots.length / 3)))
    : Math.min(3 + (rand() < 0.5 ? 1 : 0), Math.max(slots.length >= 4 ? 2 : 1, Math.floor(slots.length / 4)));
  for (let i = 0; i < nHouses; i++) {
    if (!slots.length) break;
    const a = slots[Math.round((i + 0.5) * slots.length / nHouses - 0.5)] + (rand() - 0.5) * 0.12;
    const sz = crowded && i > 0 ? 0.68 : 1;
    const w = (0.088 + rand() * 0.018) * sz, d = (0.064 + rand() * 0.01) * sz;
    const h = ((i === 0 ? 0.072 : 0.052) + rand() * 0.012) * sz;
    const hs = house(player, w, d, h, rand);
    const rr = R * 0.55;
    hs.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    hs.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); // +Z toward centre
    g.add(hs);
  }
  // well + banner near the middle
  const wx = Math.cos(gateAng) * 0.035, wz = Math.sin(gateAng) * 0.035; // well just inside the gate
  g.add(mesh(cylinder(0.013, 0.014, 0.015, 12, 40), S.stone, wx, 0.0075, wz));
  g.add(mesh(new THREE.CircleGeometry(0.01, 12).rotateX(-Math.PI / 2), S.dark, wx, 0.0155, wz));
  const b = banner(player, 0.17, 0.055);
  b.position.set(-Math.cos(gateAng) * 0.02, 0, -Math.sin(gateAng) * 0.02);
  b.rotation.y = rand() * Math.PI * 2;
  g.add(b);
  if (seaAng !== null) addHarbour(g, player, seaAng, R * 0.85, rand);
  return g;
}

// ---------------------------------------------------------------------------
// CITY — a small castle: curtain wall, corner towers, gatehouse, keep.
// ---------------------------------------------------------------------------
export function createCity(player, { seed = 1, seaAng = null, gateAngs = [] } = {}) {
  const rand = mulberry32(seed * 131 + 7);
  const S = sharedMats(), P = playerMats(player);
  const g = new THREE.Group();
  g.name = 'city';
  const H = 0.15;          // half wall length
  const WH = 0.07;         // wall height
  const T = 0.022;         // wall thickness

  g.add(mesh(new THREE.PlaneGeometry(H * 2, H * 2).rotateX(-Math.PI / 2), S.dirt, 0, 0.003, 0));
  // cobbled square around the castle: roads join it from any direction
  const AP = H + 0.06;
  const apron = box(AP * 2, 0.01, AP * 2, 7);
  g.add(mesh(apron, S.cobble, 0, 0.005, 0));
  const kerbs = [];
  for (const [x1, z1, x2, z2] of [[-AP, -AP, AP, -AP], [AP, -AP, AP, AP], [AP, AP, -AP, AP], [-AP, AP, -AP, -AP]]) {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.round(len / 0.022);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const k = box(len / n * 0.9, 0.013, 0.012, 30);
      k.rotateY(-Math.atan2(z2 - z1, x2 - x1));
      k.translate(x1 + (x2 - x1) * t, 0.0065, z1 + (z2 - z1) * t);
      kerbs.push(k);
    }
  }
  g.add(mesh(mergeGeometries(kerbs), sharedMats().stone));

  // which wall faces the sea (harbour): snap the sea direction to a side
  // (local angle in atan2(z, x) terms: +X = 0, front/+Z = π/2, -X = π, back/-Z = -π/2)
  const SIDE_ANG = [-Math.PI / 2, 0, Math.PI];   // back, right, left  (front = π/2)
  let seaSide = null;                            // index into sides, or 'front'
  if (seaAng !== null) {
    const opts = [[0, SIDE_ANG[0]], [1, SIDE_ANG[1]], [2, SIDE_ANG[2]], ['front', Math.PI / 2]];
    seaSide = opts.reduce((best, o) => (angDist(o[1], seaAng) < angDist(best[1], seaAng) ? o : best))[0];
  }
  // Extra roads (beyond the one at the main gatehouse) get a side gate exactly
  // where the road's direction meets the wall. Roads meet a hex corner 120°
  // apart, so they usually arrive toward the back of a side wall, not its middle.
  // gates: side index -> list of positions along that wall (t, in wall direction)
  const gates = new Map();
  const addGate = (side, t) => gates.set(side, [...(gates.get(side) || []), t]);
  if (seaSide !== null && seaSide !== 'front') addGate(seaSide, 0); // water gate, mid-wall
  const LIM = H - 0.075; // keep gate towers clear of the corner towers
  for (const ga of gateAngs) {
    const cx = Math.cos(ga), cz = Math.sin(ga);
    const k = H / Math.max(Math.abs(cx), Math.abs(cz)); // ray hits the square here
    const hx = cx * k, hz = cz * k;
    let side, t;
    if (Math.abs(cz) >= Math.abs(cx)) {
      if (cz > 0) continue;                    // front wall: main gatehouse already there
      side = 0; t = hx;                        // back wall runs along +x
    } else if (cx > 0) { side = 1; t = hz; }   // right wall runs along +z
    else { side = 2; t = -hz; }                // left wall runs along -z
    addGate(side, Math.max(-LIM, Math.min(LIM, t)));
  }
  const gateSides = new Set(gates.keys());

  // curtain walls (front wall has the main gate; the sea-facing wall gets a water gate)
  const sides = [
    { x1: -H, z1: -H, x2: H, z2: -H }, { x1: H, z1: -H, x2: H, z2: H }, { x1: -H, z1: H, x2: -H, z2: -H },
  ];
  const wallSeg = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const wall = mesh(box(len, WH, T), S.stone, (x1 + x2) / 2, WH / 2, (z1 + z2) / 2);
    wall.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    g.add(wall);
    g.add(mesh(merlons(x1, z1, x2, z2, WH, T), S.stone));
  };
  sides.forEach((s, si) => {
    if (!gates.has(si)) { wallSeg(s.x1, s.z1, s.x2, s.z2); return; }
    // side gate(s) (road or water gate): wall split around arched openings flanked by small towers
    const ux = (s.x2 - s.x1) / (2 * H), uz = (s.z2 - s.z1) / (2 * H); // along the wall
    const cx0 = (s.x1 + s.x2) / 2, cz0 = (s.z1 + s.z2) / 2;
    const gap = 0.034;
    // merge gates that would overlap, then build wall pieces between them
    const ts = [...gates.get(si)].sort((a, b) => a - b).filter((t, i, arr) => i === 0 || t - arr[i - 1] > gap * 2.6);
    let from = -H;
    for (const t of ts) {
      wallSeg(cx0 + ux * from, cz0 + uz * from, cx0 + ux * (t - gap), cz0 + uz * (t - gap));
      from = t + gap;
    }
    wallSeg(cx0 + ux * from, cz0 + uz * from, s.x2, s.z2);
    const rot = -Math.atan2(uz, ux);
    for (const t of ts) {
    const mx = cx0 + ux * t, mz = cz0 + uz * t;
    for (const sg of [-1, 1]) {
      const tx = mx + ux * gap * sg, tz = mz + uz * gap * sg;
      g.add(mesh(cylinder(0.019, 0.021, 0.088, 12), S.stone, tx, 0.044, tz));
      g.add(mesh(ringMerlons(0.018, 0.088, 7, 0.008), S.stone, tx, 0, tz));
    }
    const lintel = mesh(box(gap * 2, 0.026, T * 1.1), S.stone, mx, 0.065, mz);
    lintel.rotation.y = rot;
    g.add(lintel);
    const arch = mesh(box(gap * 1.6, 0.052, T * 1.2), S.dark, mx, 0.026, mz);
    arch.rotation.y = rot;
    g.add(arch);
    }
  });
  // front wall in two halves around the gatehouse
  for (const sgn of [-1, 1]) {
    const x1 = sgn * H, x2 = sgn * 0.04;
    g.add(mesh(box(Math.abs(x1 - x2), WH, T), S.stone, (x1 + x2) / 2, WH / 2, H));
    g.add(mesh(merlons(x1, H, x2, H, WH, T), S.stone));
  }

  // corner towers with conical roofs in player colour
  const TR = 0.036, TH = 0.12;
  for (const [cx, cz] of [[-H, -H], [H, -H], [H, H], [-H, H]]) {
    g.add(mesh(cylinder(TR, TR * 1.08, TH, 14), S.stone, cx, TH / 2, cz));
    g.add(mesh(cylinder(TR * 1.12, TR * 1.12, 0.008, 14), S.stone, cx, TH + 0.004, cz));
    g.add(mesh(new THREE.ConeGeometry(TR * 1.22, 0.075, 14), P.roof, cx, TH + 0.008 + 0.0375, cz));
  }

  // gatehouse: two squat towers, dark archway, crenellated top
  for (const sgn of [-1, 1]) {
    g.add(mesh(cylinder(0.024, 0.026, 0.095, 12), S.stone, sgn * 0.04, 0.0475, H + 0.004));
    g.add(mesh(ringMerlons(0.022, 0.095, 8, 0.009), S.stone, sgn * 0.04, 0, H + 0.004));
  }
  g.add(mesh(box(0.06, 0.03, T * 1.1), S.stone, 0, 0.07, H));
  g.add(mesh(box(0.04, 0.05, T * 1.2), S.dark, 0, 0.025, H));
  g.add(mesh(merlons(-0.03, H, 0.03, H, 0.085, T * 1.1, 0.009), S.stone));

  // keep: tall square tower with battlements, a turret, and the banner
  const KW = 0.095, KD = 0.085, KH = 0.2;
  const kx = (rand() - 0.5) * 0.03, kz = -0.03;
  g.add(mesh(box(KW, KH, KD), S.stone, kx, KH / 2, kz));
  for (const [x1, z1, x2, z2] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
    g.add(mesh(merlons(kx + x1 * KW / 2, kz + z1 * KD / 2, kx + x2 * KW / 2, kz + z2 * KD / 2, KH, 0.012, 0.01), S.stone));
  }
  const tx = kx + KW / 2 - 0.012, tz = kz - KD / 2 + 0.012;
  g.add(mesh(cylinder(0.018, 0.018, 0.05, 12), S.stone, tx, KH + 0.025, tz));
  g.add(mesh(new THREE.ConeGeometry(0.023, 0.05, 12), P.roof, tx, KH + 0.075, tz));
  // windows (dark slits) on the keep front
  for (const y of [0.08, 0.14]) g.add(mesh(box(0.01, 0.022, 0.002), S.dark, kx, y, kz + KD / 2 + 0.001));
  const b = banner(player, 0.11, 0.055);
  b.position.set(kx - 0.02, KH, kz);
  g.add(b);

  // a couple of houses in the bailey
  for (let i = 0; i < 2; i++) {
    if (gateSides.has(i ? 1 : 2)) continue; // keep the passage behind a side gate clear
    const hs = house(player, 0.055, 0.04, 0.035, rand);
    hs.position.set((i ? 1 : -1) * 0.075, 0, 0.07);
    hs.rotation.y = (i ? -1 : 1) * Math.PI / 2;
    g.add(hs);
  }
  if (seaSide !== null) {
    // jetty runs straight out from the water gate (or from the main gate if that faces the sea)
    const ang = seaSide === 'front' ? Math.PI / 2 : SIDE_ANG[seaSide];
    addHarbour(g, player, ang, H + (seaSide === 'front' ? 0.03 : 0.012), rand);
  }
  return g;
}
