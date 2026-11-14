// Procedural low-to-mid-poly props shared by tiles: trees, bushes, rocks,
// logs. Each builder returns a BufferGeometry with baked vertex colours,
// normalised so the object's base sits at y=0 (height ~1 for trees).
// Geometries are cached by (kind, seed) so all tiles share GPU buffers.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, createNoise2D, lerp, clamp } from '../core/noise.js';

const cache = new Map();
const cached = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
};

const C = (hex) => new THREE.Color(hex);
const tmpColor = new THREE.Color();

// Strip uv/normal and weld so displacement + smooth normals work cleanly.
function prep(geo) {
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  return mergeVertices(geo);
}

function paint(geo, fn) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const arr = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  const nn = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (n) nn.fromBufferAttribute(n, i);
    const c = fn(v, nn, i);
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function displace(geo, fn) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    fn(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function normaliseHeight(geo, targetHeight = 1) {
  geo.computeBoundingBox();
  const s = targetHeight / geo.boundingBox.max.y;
  geo.scale(s, s, s);
  geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------------------
// Conifer (spruce / fir): stacked shaggy tiers with drooping rims.
// ---------------------------------------------------------------------------
export function coniferGeometry(seed) {
  return cached(`conifer-${seed}`, () => {
    const rand = mulberry32(seed * 7919 + 1);
    const noise = createNoise2D(rand);
    const parts = [];

    const bark = C('#3b2616');
    const trunk = prep(new THREE.CylinderGeometry(0.011, 0.025, 0.9, 7, 1));
    trunk.translate(0, 0.45, 0);
    trunk.computeVertexNormals();
    paint(trunk, (v) => tmpColor.copy(bark).multiplyScalar(0.8 + 0.3 * v.y));
    parts.push(trunk);

    const dark = C('#0b1f10');
    const mid = C('#183a1f');
    const tip = C(rand() < 0.5 ? '#3d5f33' : '#35583a');
    const tiers = 8 + Math.floor(rand() * 3);
    const branches = 6 + Math.floor(rand() * 3); // spiky star-shaped silhouette
    let y = 0.1 + rand() * 0.05;
    for (let i = 0; i < tiers; i++) {
      const f = i / (tiers - 1);
      const r = lerp(0.3, 0.07, Math.pow(f, 0.9)) * (0.85 + rand() * 0.3);
      const h = lerp(0.3, 0.16, f);
      const cone = prep(new THREE.ConeGeometry(r, h, 14, 2, false)) // (lighter: 14×2 segments);
      const y0 = y;
      const rot = rand() * 6.28;
      cone.translate(0, y0 + h / 2, 0);
      displace(cone, (v) => {
        const d = Math.hypot(v.x, v.z);
        if (d < 1e-4) return;
        const t = (v.y - y0) / h; // 0 rim .. 1 apex
        const ang = Math.atan2(v.z, v.x);
        const spike = Math.pow(Math.abs(Math.sin(ang * branches * 0.5 + rot)), 3);
        const n = noise(v.x * 14 + i * 5.3, v.z * 14 + v.y * 9);
        const k = 1 + (spike * 0.38 - 0.12 + n * 0.3) * (1 - t);
        v.x *= k; v.z *= k;
        // branch tips droop, more so on the spikes
        if (t < 0.34) v.y -= (0.34 - t) * (0.12 + spike * 0.12) * (r / 0.3) + noise(v.x * 25, v.z * 25) * 0.015;
      });
      paint(cone, (v, nrm) => {
        const d = Math.hypot(v.x, v.z);
        const outer = clamp(d / (r * 1.1), 0, 1);
        tmpColor.lerpColors(dark, mid, clamp(outer * 0.9 + nrm.y * 0.25, 0, 1));
        tmpColor.lerp(tip, clamp((outer - 0.75) * 1.6 + f * 0.25, 0, 0.55));
        return tmpColor.multiplyScalar(0.8 + noise(v.x * 40, v.y * 40 + v.z * 9) * 0.35);
      });
      parts.push(cone);
      y += h * (0.42 + rand() * 0.08);
    }
    const spire = prep(new THREE.ConeGeometry(0.022, 0.12, 6, 1));
    spire.translate(0, y + 0.08, 0);
    spire.computeVertexNormals();
    paint(spire, () => mid);
    parts.push(spire);

    return normaliseHeight(mergeGeometries(parts), 1);
  });
}

// ---------------------------------------------------------------------------
// Deciduous (oak / beech): trunk + lumpy clustered crown.
// ---------------------------------------------------------------------------
export function deciduousGeometry(seed) {
  return cached(`decid-${seed}`, () => {
    const rand = mulberry32(seed * 104729 + 3);
    const noise = createNoise2D(rand);
    const parts = [];

    const bark = C('#4a3524');
    const trunkH = 0.5 + rand() * 0.1;
    const trunk = prep(new THREE.CylinderGeometry(0.019, 0.035, trunkH, 7, 3));
    trunk.translate(0, trunkH / 2, 0);
    displace(trunk, (v) => { v.x += Math.sin(v.y * 6 + seed) * 0.012; });
    paint(trunk, (v) => tmpColor.copy(bark).multiplyScalar(0.75 + 0.4 * (v.y / trunkH)));
    parts.push(trunk);

    // two short branches
    for (let b = 0; b < 2; b++) {
      const br = prep(new THREE.CylinderGeometry(0.008, 0.014, 0.25, 5, 1));
      br.translate(0, 0.125, 0);
      br.rotateZ((b ? -1 : 1) * (0.6 + rand() * 0.3));
      br.rotateY(rand() * Math.PI);
      br.translate(0, trunkH * 0.7, 0);
      br.computeVertexNormals();
      paint(br, () => bark);
      parts.push(br);
    }

    const leafDark = C('#14280f');
    const leafMid = C('#2c4d1d');
    const leafLight = C('#56772f');
    const blobs = 9 + Math.floor(rand() * 4);
    const cy = trunkH + 0.12;
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * Math.PI * 2 + rand();
      const off = i === 0 ? 0 : 0.13 + rand() * 0.1;
      const r = i === 0 ? 0.24 : 0.11 + rand() * 0.07;
      const bx = Math.cos(a) * off, bz = Math.sin(a) * off;
      const by = cy + (i === 0 ? 0.1 : rand() * 0.26);
      const blob = prep(new THREE.IcosahedronGeometry(r, 3));
      displace(blob, (v) => {
        const len = v.length();
        const n = noise(v.x * 9 + i * 3.1, v.z * 9 + v.y * 9) * 0.5 + noise(v.x * 22, v.y * 22 + v.z * 5) * 0.2;
        v.multiplyScalar(1 + n * 0.35);
        v.y *= 0.85;
        if (len === 0) return;
      });
      blob.translate(bx, by, bz);
      paint(blob, (v, nrm) => {
        const up = nrm.y * 0.5 + 0.5;
        tmpColor.lerpColors(leafDark, leafMid, up);
        tmpColor.lerp(leafLight, clamp((up - 0.6) * 1.2 + noise(v.x * 25, v.z * 25) * 0.4, 0, 0.7));
        return tmpColor.multiplyScalar(0.85 + noise(v.x * 40, v.y * 40) * 0.25);
      });
      parts.push(blob);
    }
    return normaliseHeight(mergeGeometries(parts), 1);
  });
}

// ---------------------------------------------------------------------------
// Bush / undergrowth
// ---------------------------------------------------------------------------
export function bushGeometry(seed) {
  return cached(`bush-${seed}`, () => {
    const rand = mulberry32(seed * 31 + 11);
    const noise = createNoise2D(rand);
    const parts = [];
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const r = 0.35 + rand() * 0.25;
      const g = prep(new THREE.IcosahedronGeometry(r, 1));
      displace(g, (v) => v.multiplyScalar(1 + noise(v.x * 6 + i, v.z * 6 + v.y * 6) * 0.35));
      g.translate((rand() - 0.5) * 0.6, r * 0.6, (rand() - 0.5) * 0.6);
      paint(g, (v, nrm) => {
        tmpColor.lerpColors(C('#112414'), C('#2f5022'), nrm.y * 0.5 + 0.5);
        return tmpColor.multiplyScalar(0.8 + noise(v.x * 20, v.z * 20) * 0.3);
      });
      parts.push(g);
    }
    return normaliseHeight(mergeGeometries(parts), 1);
  });
}

// ---------------------------------------------------------------------------
// Rock with moss on top
// ---------------------------------------------------------------------------
export function rockGeometry(seed, { moss = true, detail = 2 } = {}) {
  return cached(`rock-${seed}-${moss}-${detail}`, () => {
    const rand = mulberry32(seed * 13 + 5);
    const noise = createNoise2D(rand);
    const g = prep(new THREE.DodecahedronGeometry(1, detail));
    displace(g, (v) => {
      v.multiplyScalar(1 + noise(v.x * 1.7, v.z * 1.7 + v.y) * 0.35 + noise(v.x * 5, v.y * 5) * 0.08);
      v.y = v.y * 0.6;
    });
    g.translate(0, 0.25, 0);
    const stone = C('#77736c');
    const stoneDark = C('#4a4741');
    const mossC = C('#4b6a2a');
    paint(g, (v, nrm) => {
      tmpColor.lerpColors(stoneDark, stone, clamp(0.5 + noise(v.x * 4, v.z * 4 + v.y * 3) * 0.8, 0, 1));
      if (moss) tmpColor.lerp(mossC, clamp((nrm.y - 0.55) * 3 + noise(v.x * 6, v.z * 6) * 0.6, 0, 0.85));
      return tmpColor;
    });
    g.computeBoundingSphere();
    return g;
  });
}

// ---------------------------------------------------------------------------
// Logs (horizontal, lying along X) and stumps — the "wood" resource cue.
// ---------------------------------------------------------------------------
function barkedCylinder(rTop, rBot, h, segs = 10) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, segs, 1);
  g.deleteAttribute('uv');
  const barkC = C('#4a3220');
  const endC = C('#c9a06a');
  const ringC = C('#8f6a40');
  paint(g, (v, nrm) => {
    if (Math.abs(nrm.y) > 0.9) {
      const d = Math.hypot(v.x, v.z) / Math.max(rTop, rBot);
      return tmpColor.lerpColors(endC, ringC, (Math.sin(d * 18) * 0.5 + 0.5) * 0.6 + (d > 0.85 ? 0.4 : 0));
    }
    return tmpColor.copy(barkC).multiplyScalar(0.8 + Math.random() * 0.3);
  });
  return g;
}

export function logPileGeometry() {
  return cached('logpile', () => {
    const parts = [];
    const r = 0.05, L = 0.42;
    const layout = [[-0.1, 0], [0, 0], [0.1, 0], [-0.05, 1], [0.05, 1], [0, 2]];
    for (const [z, row] of layout) {
      const g = barkedCylinder(r, r, L * (0.9 + Math.random() * 0.2));
      g.rotateZ(Math.PI / 2);
      g.translate((Math.random() - 0.5) * 0.04, r + row * r * 1.75, z);
      parts.push(g);
    }
    return mergeGeometries(parts);
  });
}

export function stumpGeometry() {
  return cached('stump', () => {
    const g = barkedCylinder(0.045, 0.06, 0.07, 9);
    g.translate(0, 0.035, 0);
    return g;
  });
}

export function fallenLogGeometry() {
  return cached('fallenlog', () => {
    const g = barkedCylinder(0.035, 0.045, 0.5, 9);
    g.rotateZ(Math.PI / 2);
    g.translate(0, 0.035, 0);
    // moss on top
    const col = g.attributes.color;
    const nrm = g.attributes.normal;
    const moss = C('#4d6b2b');
    for (let i = 0; i < col.count; i++) {
      if (nrm.getY(i) > 0.5 && Math.random() < 0.7) col.setXYZ(i, moss.r, moss.g, moss.b);
    }
    return g;
  });
}

// ===========================================================================
// Hard-edged helpers (buildings, fences): non-indexed with flat normals.
// ===========================================================================
function flat(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Grass tuft: a handful of curved, tapered blades (height 1, unit scale).
// Normals are bent upward so the blades light softly like a lawn.
// ---------------------------------------------------------------------------
export function grassTuftGeometry(seed, { blades = 7, base = '#2c4a1a', tip = '#7d9a44' } = {}) {
  return cached(`grass-${seed}-${blades}-${base}-${tip}`, () => {
    const rand = mulberry32(seed * 977 + 17);
    const pos = [], nor = [], col = [], idx = [];
    const cBase = C(base), cTip = C(tip);
    const up = new THREE.Vector3(0, 1, 0);
    for (let b = 0; b < blades; b++) {
      const a = rand() * Math.PI * 2;
      const lean = 0.15 + rand() * 0.55;
      const hgt = 0.6 + rand() * 0.4;
      const w = 0.05 + rand() * 0.03;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const ox = (rand() - 0.5) * 0.25, oz = (rand() - 0.5) * 0.25;
      const n = new THREE.Vector3().copy(dir).multiplyScalar(0.35).add(up).normalize();
      const levels = [0, 0.45, 0.8, 1];
      const start = pos.length / 3;
      levels.forEach((t, li) => {
        const out = lean * t * t * hgt;
        const cx = ox + dir.x * out, cz = oz + dir.z * out, cy = t * hgt * (1 - lean * 0.25 * t);
        const ww = w * (1 - t) + (li === levels.length - 1 ? 0 : 0.004);
        const tint = new THREE.Color().lerpColors(cBase, cTip, Math.pow(t, 0.8));
        for (const s of li === levels.length - 1 ? [0] : [-1, 1]) {
          pos.push(cx + side.x * ww * s, cy, cz + side.z * ww * s);
          nor.push(n.x, n.y, n.z);
          col.push(tint.r, tint.g, tint.b);
        }
      });
      // strip: (0,1),(2,3),(4,5),(6)
      for (let l = 0; l < 2; l++) {
        const a0 = start + l * 2;
        idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3);
      }
      idx.push(start + 4, start + 6, start + 5);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  });
}

// Wild flower: stem + small head. Head colour comes from the instance tint.
export function flowerGeometry() {
  return cached('flower', () => {
    const stem = prep(new THREE.CylinderGeometry(0.03, 0.04, 1, 3, 1));
    stem.translate(0, 0.5, 0);
    stem.computeVertexNormals();
    paint(stem, () => C('#4f6e2a'));
    const head = prep(new THREE.IcosahedronGeometry(0.16, 0));
    head.scale(1, 0.6, 1);
    head.translate(0, 1.0, 0);
    head.computeVertexNormals();
    paint(head, () => C('#ffffff'));
    return mergeGeometries([stem, head]);
  });
}

// ---------------------------------------------------------------------------
// Shepherd's hut (unit width ~1 along X, door facing +Z, base at y=0).
// Variants: walls stone / whitewash / timber; roof thatch / slate / shingle.
// ---------------------------------------------------------------------------
export function hutGeometry(seed) {
  return cached(`hut-${seed}`, () => {
    const rand = mulberry32(seed * 7717 + 9);
    const noise = createNoise2D(rand);
    const parts = [];
    const W = 1, D = 0.75, H = 0.5;
    const wallType = ['stone', 'whitewash', 'timber'][Math.floor(rand() * 3)];
    const roofType = ['thatch', 'slate', 'shingle'][Math.floor(rand() * 3)];

    const wallCol = {
      stone: [C('#8a857a'), C('#5e5a52')],
      whitewash: [C('#e6e1d3'), C('#bdb6a5')],
      timber: [C('#7a5535'), C('#4e3420')],
    }[wallType];
    const walls = flat(new THREE.BoxGeometry(W, H, D, 10, 5, 8));
    walls.translate(0, H / 2, 0);
    paint(walls, (v) => {
      let t;
      if (wallType === 'stone') t = clamp(0.5 + noise(v.x * 14 + v.z * 9, v.y * 16) * 1.2, 0, 1);
      else if (wallType === 'timber') t = 0.5 + 0.5 * Math.sin(v.y * 60) * 0.6 + noise(v.x * 5, v.z * 5) * 0.3;
      else t = 0.8 + noise(v.x * 6 + v.z * 4, v.y * 6) * 0.4 - (v.y < 0.06 ? 0.5 : 0); // dirty base
      return tmpColor.lerpColors(wallCol[1], wallCol[0], clamp(t, 0, 1));
    });
    parts.push(walls);

    // door + window
    const door = flat(new THREE.BoxGeometry(0.18, 0.32, 0.03));
    const doorX = rand() < 0.5 ? -0.2 : 0.2;
    door.translate(doorX, 0.16, D / 2 + 0.01);
    paint(door, () => C('#3a2716'));
    parts.push(door);
    const win = flat(new THREE.BoxGeometry(0.14, 0.12, 0.03));
    win.translate(-doorX * 1.1, 0.3, D / 2 + 0.01);
    paint(win, () => C('#1b1a18'));
    parts.push(win);

    // gable roof: ridge along X
    const RH = 0.38 + rand() * 0.08;
    const over = 0.09;
    const slope = Math.hypot(D / 2 + over, RH + over * 0.6);
    const angle = Math.atan2(RH, D / 2);
    const thick = roofType === 'thatch' ? 0.12 : 0.04;
    const roofCol = {
      thatch: [C('#b08d4c'), C('#6e5530')],
      slate: [C('#4d535a'), C('#2c3035')],
      shingle: [C('#6a4a2e'), C('#3c2a1a')],
    }[roofType];
    for (const s of [-1, 1]) {
      const r = flat(new THREE.BoxGeometry(W + over * 2, thick, slope, 12, 1, 8));
      if (roofType === 'thatch') {
        const p = r.attributes.position;
        for (let i = 0; i < p.count; i++) {
          if (p.getY(i) > 0) p.setY(i, p.getY(i) + noise(p.getX(i) * 9, p.getZ(i) * 9) * 0.03);
        }
        r.computeVertexNormals();
      }
      r.translate(0, thick / 2, -slope / 2);
      r.rotateX(-angle);
      if (s < 0) r.rotateY(Math.PI);
      r.translate(0, H + RH, 0);
      paint(r, (v) => {
        let t;
        if (roofType === 'slate') t = 0.5 + 0.5 * Math.sin(v.y * 90) * 0.5 + noise(v.x * 20, v.z * 20) * 0.3;
        else if (roofType === 'shingle') t = 0.5 + Math.sin(v.y * 70 + Math.floor(v.x * 12) * 2) * 0.3;
        else t = 0.55 + noise(v.x * 30, v.y * 50) * 0.6;
        return tmpColor.lerpColors(roofCol[1], roofCol[0], clamp(t, 0, 1));
      });
      parts.push(r);
    }
    // gable triangles
    const shape = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, RH)]);
    const gable = flat(new THREE.ExtrudeGeometry(shape, { depth: W - 0.002, bevelEnabled: false }));
    gable.rotateY(Math.PI / 2);
    gable.translate(-(W - 0.002) / 2, H, 0);
    paint(gable, (v) => tmpColor.copy(wallType === 'stone' ? C('#5a4632') : wallCol[0]).multiplyScalar(wallType === 'stone' ? 1 : 0.9));
    parts.push(gable);

    // chimney (not on thatch-free timber huts sometimes)
    if (rand() < 0.75) {
      const ch = flat(new THREE.BoxGeometry(0.12, 0.45, 0.12, 1, 4, 1));
      ch.translate(W * 0.32 * (rand() < 0.5 ? 1 : -1), H + RH * 0.6 + 0.12, -0.08);
      paint(ch, (v) => tmpColor.lerpColors(C('#4f4b45'), C('#7a756c'), clamp(0.5 + noise(v.y * 30, v.x * 30), 0, 1)));
      parts.push(ch);
    }
    const g = mergeGeometries(parts);
    g.computeBoundingSphere();
    return g;
  });
}

// ---------------------------------------------------------------------------
// Wooden post-and-rail fence along a closed polygon (world units; not cached).
// gapIndex: segment left open as a gate.
// ---------------------------------------------------------------------------
export function fenceGeometry(points, heightFn, { gapIndex = -1, postH = 0.032, seed = 1 } = {}) {
  const rand = mulberry32(seed);
  const parts = [];
  const wood = C('#6b5a46'), woodDark = C('#4a3d2f');
  const postW = 0.0035;
  points.forEach((p) => {
    const g = flat(new THREE.BoxGeometry(postW, postH, postW));
    g.rotateY(rand() * 0.5);
    g.rotateZ((rand() - 0.5) * 0.12);
    g.translate(p.x, heightFn(p.x, p.z) + postH / 2 - 0.004, p.z);
    paint(g, () => tmpColor.lerpColors(woodDark, wood, rand()));
    parts.push(g);
  });
  for (let i = 0; i < points.length; i++) {
    if (i === gapIndex) continue;
    const a = points[i], b = points[(i + 1) % points.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ang = Math.atan2(b.z - a.z, b.x - a.x);
    for (const hFrac of [0.4, 0.8]) {
      const g = flat(new THREE.BoxGeometry(len, 0.0022, 0.0015));
      g.rotateZ((rand() - 0.5) * 0.06);
      g.rotateY(-ang);
      const ha = heightFn(a.x, a.z), hb = heightFn(b.x, b.z);
      g.translate((a.x + b.x) / 2, (ha + hb) / 2 + postH * hFrac - 0.004, (a.z + b.z) / 2);
      paint(g, () => tmpColor.lerpColors(woodDark, wood, 0.3 + rand() * 0.7));
      parts.push(g);
    }
  }
  return mergeGeometries(parts);
}

// ---------------------------------------------------------------------------
// Sheep parts (unit scale ≈ 1 m sheep). Forward is +Z.
//   body: origin on the ground; head: origin at the neck joint;
//   leg: origin at the hip, hanging down to y = -0.45.
// ---------------------------------------------------------------------------
export const SHEEP_NECK = new THREE.Vector3(0, 0.8, 0.44);
export const SHEEP_HIPS = [
  new THREE.Vector3(-0.17, 0.46, 0.3), new THREE.Vector3(0.17, 0.46, 0.3),   // front L/R
  new THREE.Vector3(-0.17, 0.46, -0.3), new THREE.Vector3(0.17, 0.46, -0.3), // back L/R
];

export function sheepBodyGeometry() {
  return cached('sheep-body', () => {
    const noise = createNoise2D(mulberry32(4242));
    const body = prep(new THREE.IcosahedronGeometry(1, 3));
    displace(body, (v) => {
      v.multiplyScalar(1 + noise(v.x * 5 + v.z * 3, v.y * 5) * 0.07 + noise(v.x * 13, v.y * 13 + v.z * 7) * 0.05);
    });
    body.scale(0.42, 0.34, 0.56);
    body.translate(0, 0.64, 0);
    const tail = prep(new THREE.IcosahedronGeometry(0.1, 1));
    tail.scale(1, 1.3, 0.8);
    tail.translate(0, 0.6, -0.56);
    tail.computeVertexNormals();
    const wool = C('#ece6d6'), woolShade = C('#b9b09c');
    for (const g of [body, tail]) {
      paint(g, (v, n) => tmpColor.lerpColors(woolShade, wool, clamp(0.55 + n.y * 0.3 + noise(v.x * 28, v.y * 28 + v.z * 11) * 0.5, 0, 1)));
    }
    return mergeGeometries([body, tail]);
  });
}

export function sheepHeadGeometry() {
  return cached('sheep-head', () => {
    const face = C('#2a221d');
    const wool = C('#e3dccb');
    const head = prep(new THREE.IcosahedronGeometry(1, 2));
    head.scale(0.13, 0.15, 0.24);
    head.rotateX(0.35);
    head.translate(0, -0.06, 0.2);
    head.computeVertexNormals();
    paint(head, (v) => tmpColor.copy(face).multiplyScalar(0.9 + v.z * 0.3));
    const cap = prep(new THREE.IcosahedronGeometry(1, 2));
    cap.scale(0.15, 0.12, 0.15);
    cap.translate(0, 0.05, 0.06);
    cap.computeVertexNormals();
    paint(cap, () => wool);
    const parts = [head, cap];
    for (const s of [-1, 1]) {
      const ear = prep(new THREE.IcosahedronGeometry(1, 1));
      ear.scale(0.12, 0.03, 0.05);
      ear.rotateZ(s * -0.35);
      ear.translate(s * 0.17, 0.0, 0.05);
      ear.computeVertexNormals();
      paint(ear, () => face);
      parts.push(ear);
    }
    return mergeGeometries(parts);
  });
}

export function sheepLegGeometry() {
  return cached('sheep-leg', () => {
    const g = prep(new THREE.CylinderGeometry(0.045, 0.035, 0.47, 5, 1));
    g.translate(0, -0.235, 0);
    g.computeVertexNormals();
    paint(g, (v) => tmpColor.copy(C('#2b231e')).multiplyScalar(v.y > -0.12 ? 1.6 : 1));
    return g;
  });
}

// ===========================================================================
// FIELD props
// ===========================================================================
// Wheat clump: a few stalks with ears (height 1). Normals bent upward.
export function wheatClumpGeometry(seed, { stalks = 4, stem = ['#6f7334', '#c4a04a'], ear = ['#c9a24c', '#ecd08a'] } = {}) {
  return cached(`wheat-${seed}-${stalks}-${stem}-${ear}`, () => {
    const rand = mulberry32(seed * 313 + 7);
    const pos = [], nor = [], col = [], idx = [];
    const s0 = C(stem[0]), s1 = C(stem[1]), e0 = C(ear[0]), e1 = C(ear[1]);
    const up = new THREE.Vector3(0, 1, 0);
    const vert = (x, y, z, c, n) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); nor.push(n.x, n.y, n.z); return pos.length / 3 - 1; };
    for (let s = 0; s < stalks; s++) {
      const a = rand() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const lean = 0.04 + rand() * 0.14;
      const hgt = 0.78 + rand() * 0.22;
      const ox = (rand() - 0.5) * 0.3, oz = (rand() - 0.5) * 0.3;
      const n = dir.clone().multiplyScalar(0.3).add(up).normalize();
      const at = (t) => ({ x: ox + dir.x * lean * t * t, y: t * hgt, z: oz + dir.z * lean * t * t });
      // stem (2 levels, 2 verts each — one quad is enough at this size)
      const lv = [0, 0.8];
      const ids = [];
      lv.forEach((t) => {
        const p = at(t);
        const w = 0.018 * (1 - t * 0.5);
        const c = new THREE.Color().lerpColors(s0, s1, t);
        ids.push(vert(p.x - side.x * w, p.y, p.z - side.z * w, c, n), vert(p.x + side.x * w, p.y, p.z + side.z * w, c, n));
      });
      for (let l = 0; l < lv.length - 1; l++) {
        const a0 = ids[l * 2], a1 = ids[l * 2 + 1], b0 = ids[l * 2 + 2], b1 = ids[l * 2 + 3];
        idx.push(a0, b0, a1, a1, b0, b1);
      }
      // ear: two crossed diamonds from t=0.78 to t=1.05
      const pb = at(0.78), pt = at(1.06), pm = at(0.92);
      for (const ax of [side, dir]) {
        const w = 0.055;
        const b = vert(pb.x, pb.y, pb.z, e0, n);
        const l = vert(pm.x - ax.x * w, pm.y, pm.z - ax.z * w, e0, n);
        const r = vert(pm.x + ax.x * w, pm.y, pm.z + ax.z * w, e1, n);
        const t = vert(pt.x, pt.y, pt.z, e1, n);
        idx.push(b, r, l, l, r, t);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  });
}

// Medieval granary tower (unit height ≈ 1.25, radius 0.2): rubble-stone or
// wooden-stave drum with a pointed thatch or shingle roof. (No modern silos.)
export function siloGeometry(seed) {
  return cached(`silo-${seed}`, () => {
    const rand = mulberry32(seed * 911 + 3);
    const noise = createNoise2D(rand);
    const kind = rand() < 0.5 ? 'stone' : 'wood';
    const body = prep(new THREE.CylinderGeometry(0.19, 0.21, 0.85, 18, 8, true));
    body.translate(0, 0.425, 0);
    body.computeVertexNormals();
    const base = kind === 'stone' ? C('#8a8274') : C('#7d5a38');
    paint(body, (v) => {
      let f;
      if (kind === 'stone') f = 0.75 + clamp(0.5 + noise(Math.atan2(v.z, v.x) * 4, v.y * 12) * 0.9, 0, 1) * 0.4;
      else f = 0.75 + 0.3 * (Math.sin(Math.atan2(v.z, v.x) * 18) * 0.5 + 0.5) - (Math.abs(v.y - 0.25) < 0.025 || Math.abs(v.y - 0.6) < 0.025 ? 0.4 : 0);
      return tmpColor.copy(base).multiplyScalar(f);
    });
    // pointed roof with overhang
    const thatch = rand() < 0.6;
    const roof = prep(new THREE.ConeGeometry(0.27, 0.42, 18, 3));
    roof.translate(0, 0.85 + 0.21, 0);
    displace(roof, (v) => { if (thatch) v.y += noise(v.x * 30, v.z * 30) * 0.008; });
    const rc = thatch ? [C('#7a6235'), C('#b0904f')] : [C('#3c2a1a'), C('#6a4a2e')];
    paint(roof, (v) => tmpColor.lerpColors(rc[0], rc[1], clamp(0.5 + noise(v.x * 25 + v.y * 20, v.z * 25) * 0.9, 0, 1)));
    // small dark hatch near the top
    const hatch = flat(new THREE.BoxGeometry(0.08, 0.1, 0.03));
    hatch.translate(0, 0.68, 0.2);
    paint(hatch, () => C('#2a1d12'));
    return mergeGeometries([body.toNonIndexed(), roof.toNonIndexed(), hatch]);
  });
}

export function roundBaleGeometry() {
  return cached('roundbale', () => {
    const g = new THREE.CylinderGeometry(1, 1, 1.1, 14, 1);
    g.deleteAttribute('uv');
    g.rotateZ(Math.PI / 2);
    g.translate(0, 1, 0);
    paint(g, (v, n) => tmpColor.copy(Math.abs(n.x) > 0.9 ? C('#b7974a') : C('#d0b066')).multiplyScalar(0.85 + Math.random() * 0.25));
    return g;
  });
}

// ===========================================================================
// HILLS / MOUNTAIN props
// ===========================================================================
// Mine adit: timber frame + dark tunnel. Unit width ~1, faces +Z, base y=0.
export function mineEntranceGeometry() {
  return cached('mine', () => {
    const parts = [];
    const timber = C('#5b4128');
    const hole = flat(new THREE.BoxGeometry(0.8, 0.85, 0.7));
    hole.translate(0, 0.42, -0.3);
    paint(hole, () => C('#0b0907'));
    parts.push(hole);
    for (const s of [-1, 1]) {
      const post = flat(new THREE.BoxGeometry(0.13, 1.0, 0.13));
      post.translate(s * 0.47, 0.5, 0.06);
      paint(post, () => tmpColor.copy(timber).multiplyScalar(0.85 + Math.random() * 0.3));
      parts.push(post);
    }
    const lintel = flat(new THREE.BoxGeometry(1.2, 0.15, 0.16));
    lintel.translate(0, 1.04, 0.06);
    paint(lintel, () => timber);
    parts.push(lintel);
    // rails sticking out of the tunnel
    for (const s of [-1, 1]) {
      const rail = flat(new THREE.BoxGeometry(0.04, 0.03, 1.4));
      rail.translate(s * 0.18, 0.02, 0.3);
      paint(rail, () => C('#3d3a36'));
      parts.push(rail);
    }
    return mergeGeometries(parts);
  });
}

// Bottle kiln for firing bricks (unit radius ~0.5, height ~1.3).
export function kilnGeometry() {
  return cached('kiln', () => {
    const noise = createNoise2D(mulberry32(77));
    const body = prep(new THREE.LatheGeometry(
      [[0.5, 0], [0.52, 0.2], [0.48, 0.5], [0.34, 0.8], [0.16, 1.0], [0.12, 1.25], [0.13, 1.3], [0.0, 1.3]].map(([x, y]) => new THREE.Vector2(x, y)), 16));
    body.computeVertexNormals();
    paint(body, (v) => {
      const soot = clamp((v.y - 0.85) * 2.5, 0, 0.8);
      tmpColor.lerpColors(C('#7e3f2a'), C('#a5573a'), clamp(0.5 + noise(v.x * 20 + v.z * 13, v.y * 25) * 0.8, 0, 1));
      return tmpColor.lerp(C('#1e1a18'), soot);
    });
    const door = flat(new THREE.BoxGeometry(0.22, 0.3, 0.1));
    door.translate(0, 0.15, 0.49);
    paint(door, () => C('#120e0b'));
    return mergeGeometries([body.toNonIndexed(), door]);
  });
}

// Stack of drying bricks (unit box ~1 x 0.6 x 0.5).
export function brickStackGeometry() {
  return cached('bricks', () => {
    const g = flat(new THREE.BoxGeometry(1, 0.6, 0.5, 6, 6, 3));
    g.translate(0, 0.3, 0);
    paint(g, (v) => {
      const row = Math.floor(v.y * 10);
      const mortar = (v.y * 10) % 1 < 0.15;
      return tmpColor.copy(C(row % 2 ? '#a24c32' : '#8f4029')).multiplyScalar(mortar ? 0.7 : 0.9 + Math.random() * 0.2);
    });
    return g;
  });
}
