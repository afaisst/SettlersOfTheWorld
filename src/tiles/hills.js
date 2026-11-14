// HILLS tile (resource: brick / clay).
// Rolling brown hills with dry grass, cut by terraced open clay pits in
// orange-red earth, mine adits dug into the hillsides, and — on some tiles —
// a brick works with a bottle kiln and stacks of drying bricks.

import * as THREE from 'three';
import { mulberry32, createNoise2D, fbm, lerp, clamp, smoothstep } from '../core/noise.js';
import { createHexTerrainGeometry, createTileBody, edgeFalloff, hexNorm } from './hexGeometry.js';
import { getMaterials, buildInstanced, createScatter } from './materials.js';
import {
  grassTuftGeometry, bushGeometry, rockGeometry, deciduousGeometry,
  mineEntranceGeometry, kilnGeometry, brickStackGeometry,
} from './props.js';

const TOKEN_R = 0.22;

export function createHillsTile({ seed = 1, radius = 0.97 } = {}) {
  const rand = mulberry32(seed);
  const noise = createNoise2D(rand);
  const m = getMaterials();
  const group = new THREE.Group();
  group.name = 'hills';
  const disposables = [];

  // ---------- Hills & pits ---------------------------------------------------------
  const hills = [];
  const nHills = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < nHills; i++) {
    const a = rand() * Math.PI * 2, d = 0.35 + rand() * 0.35;
    hills.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, h: 0.09 + rand() * 0.08, r: 0.26 + rand() * 0.16 }); // gentle hills
  }
  const pits = [];
  const terrace = (t, n) => {
    const s = t * n;
    return (Math.floor(s) + smoothstep(0.82, 1.0, s % 1)) / n; // steep risers, flat benches
  };
  // 0 outside .. 1 on the pit floor. A super-ellipse (p=8) gives a rectangular,
  // machine-dug excavation with slightly rounded corners.
  const pitT = (p, x, z) => {
    const dx = x - p.x, dz = z - p.z;
    const cr = Math.cos(p.rot), sr = Math.sin(p.rot);
    const u = Math.abs((dx * cr + dz * sr) / p.r), v = Math.abs((-dx * sr + dz * cr) / (p.r * p.aspect));
    const d = Math.pow(u ** 8 + v ** 8, 1 / 8) * (1 + noise(x * 14, z * 14) * 0.015);
    return clamp((1 - d) / 0.72, 0, 1);
  };

  const baseFn = (x, z) => {
    let h = 0;
    for (const hl of hills) {
      const d = Math.hypot(x - hl.x, z - hl.z) / hl.r;
      h = Math.max(h, hl.h * Math.exp(-d * d * 1.6));
    }
    h += (fbm(noise, x * 2.2 + 5, z * 2.2, 4) * 0.5 + 0.5) * 0.05;
    return h;
  };
  // pit rims are cut flat into the slope at the pit-centre level
  // Open pits go only on flat, low ground between the hills (never on a hill).
  // The pit floor level is the lowest point of its rim, so nothing is raised.
  const nPits = 1 + Math.floor(rand() * 3);
  for (let t = 0; t < 200 && pits.length < nPits; t++) {
    const a = rand() * Math.PI * 2, d = 0.3 + rand() * 0.4;
    const p = { x: Math.cos(a) * d, z: Math.sin(a) * d, r: 0.14 + rand() * 0.1, depth: 0.08 + rand() * 0.06, steps: 3 + Math.floor(rand() * 3), rot: rand() * 6, aspect: 0.55 + rand() * 0.3 };
    if (hexNorm(p.x, p.z, radius) > 0.85 - p.r * 0.6 || Math.hypot(p.x, p.z) < TOKEN_R + p.r * 0.8) continue;
    if (pits.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r + p.r + 0.05)) continue;
    let lo = Infinity, hi = -Infinity;
    const cr = Math.cos(p.rot), sr = Math.sin(p.rot);
    for (let k = 0; k < 20; k++) {
      const ang = (k / 20) * Math.PI * 2;
      const u = Math.cos(ang) * p.r * 1.1, v = Math.sin(ang) * p.r * p.aspect * 1.1;
      const h = baseFn(p.x + u * cr - v * sr, p.z + u * sr + v * cr);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    if (hi - lo > 0.03 || hi > 0.09) continue; // not flat / on a hill
    p.level = lo;
    pits.push(p);
  }
  const heightFn = (x, z) => {
    let h = baseFn(x, z);
    for (const p of pits) {
      const t = pitT(p, x, z);
      if (t <= 0) continue;
      const rim = lerp(h, p.level, smoothstep(0, 0.06, t)); // cut flat into the slope
      h = rim - p.depth * terrace(t, p.steps);
    }
    return h * edgeFalloff(x, z, radius, 0.68);
  };

  const dryGrass = new THREE.Color('#8a7246');
  const grassG = new THREE.Color('#6c6638');
  const earth = new THREE.Color('#7a4f30');
  const clay = new THREE.Color('#b8643a');
  const clayDark = new THREE.Color('#8a4428');
  const clayPale = new THREE.Color('#c98a5a');
  const c = new THREE.Color();
  const pitAt = (x, z) => pits.reduce((mx, p) => Math.max(mx, pitT(p, x, z)), 0);
  const colorFn = (x, z, y, n) => {
    const slope = 1 - n.y;
    c.lerpColors(grassG, dryGrass, clamp(0.5 + fbm(noise, x * 3 + 20, z * 3, 3) * 1.4, 0, 1));
    c.lerp(earth, clamp(slope * 3.5 + noise(x * 7, z * 7 + 40) * 0.7 + 0.15, 0, 0.9)); // bare earth on slopes
    const pt = pitAt(x, z);
    if (pt > 0) {
      // banded clay layers by height, pale on terrace treads, dark on risers
      const band = Math.sin(y * 260 + noise(x * 20, z * 20) * 2) * 0.5 + 0.5;
      const pc = new THREE.Color().lerpColors(clayDark, clay, band).lerp(clayPale, clamp((n.y - 0.85) * 4, 0, 0.6));
      c.lerp(pc, smoothstep(0.02, 0.2, pt));
    }
    c.lerp(dryGrass, smoothstep(0.93, 1.0, hexNorm(x, z, radius)) * 0.6);
    return [c.r, c.g, c.b];
  };

  const terrainGeo = createHexTerrainGeometry({ radius, rings: 84, heightFn, colorFn });
  disposables.push(terrainGeo);
  const terrain = new THREE.Mesh(terrainGeo, m.ground);
  terrain.castShadow = true;
  terrain.receiveShadow = true;
  group.add(terrain);
  group.add(createTileBody({ radius, strata: { top: '#7a6c3c', layers: [
    { color: '#7a4a2e', size: 0.25 }, { color: '#a5583a', size: 0.2 }, { color: '#8a4a30', size: 0.25 }, { color: '#6e4430', size: 0.3 },
  ] } }));

  const scatter = createScatter(rand, heightFn);
  const add = scatter.add;
  const obstacles = pits.map((p) => ({ x: p.x, z: p.z, r: p.r * 1.05 }));
  const free = (x, z, r) => obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r);
  const grad = (x, z) => {
    const e = 0.01;
    return { x: (heightFn(x + e, z) - heightFn(x - e, z)) / (2 * e), z: (heightFn(x, z + e) - heightFn(x, z - e)) / (2 * e) };
  };

  // ---------- Mine adits on hillsides ------------------------------------------------
  const nMines = 1 + Math.floor(rand() * 3);
  for (let t = 0, placed = 0; t < 600 && placed < nMines; t++) {
    const x = (rand() * 2 - 1) * radius * 0.85, z = (rand() * 2 - 1) * radius * 0.85;
    if (hexNorm(x, z, radius) > 0.82 || Math.hypot(x, z) < TOKEN_R || !free(x, z, 0.06)) continue;
    const g = grad(x, z);
    const sl = Math.hypot(g.x, g.z);
    if (sl < 0.38 || baseFn(x, z) < 0.04) continue; // needs a real hillside
    const face = Math.atan2(-g.x, -g.z);           // horizontal adit facing downhill
    // entrance floor at the ground level just in front, tunnel driven into the hill
    const fx = x + Math.sin(face) * 0.025, fz = z + Math.cos(face) * 0.025;
    const bx = x - Math.sin(face) * 0.09, bz = z - Math.cos(face) * 0.09;
    const sc = 0.048 + rand() * 0.01;
    // the hill must rise above the entrance behind it, so the tunnel is buried
    if (heightFn(bx, bz) - heightFn(fx, fz) < sc * 0.95) continue;
    const mine = new THREE.Mesh(mineEntranceGeometry(), m.solid);
    mine.position.set(x, heightFn(fx, fz) - 0.004, z);
    mine.rotation.y = face;
    mine.scale.setScalar(sc);
    mine.castShadow = mine.receiveShadow = true;
    group.add(mine);
    // tailings heap of red earth in front
    const sx = x + Math.sin(face) * 0.08, sz = z + Math.cos(face) * 0.08;
    for (let i = 0; i < 4; i++) {
      add('tailings', rockGeometry(80 + (i % 2), { moss: false }), m.solid, null, sx + (rand() - 0.5) * 0.035, sz + (rand() - 0.5) * 0.035, 0.01 + rand() * 0.01, {
        tilt: 1, yOffset: -0.3, color: new THREE.Color(1.5, 0.85, 0.6),
      });
    }
    obstacles.push({ x, z, r: 0.07 });
    placed++;
  }

  // ---------- Brick works ---------------------------------------------------------------
  if (rand() < 0.6) {
    for (let t = 0; t < 60; t++) {
      const a = rand() * Math.PI * 2, d = 0.4 + rand() * 0.2;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const g = grad(x, z);
      if (Math.hypot(g.x, g.z) > 0.35 || !free(x, z, 0.1) || hexNorm(x, z, radius) > 0.8) continue;
      add('kiln', kilnGeometry(), m.solid, null, x, z, 0.075 + rand() * 0.02, { tilt: 0, yOffset: -0.05 });
      for (let i = 0; i < 5; i++) {
        const bx = x + (rand() - 0.5) * 0.18, bz = z + (rand() - 0.5) * 0.18;
        if (Math.hypot(bx - x, bz - z) < 0.06) continue;
        add('bricks', brickStackGeometry(), m.solid, null, bx, bz, 0.018 + rand() * 0.006, { tilt: 0, yOffset: 0 });
      }
      obstacles.push({ x, z, r: 0.12 });
      break;
    }
  }

  // ---------- Vegetation: sparse dry grass, scrub, a few trees ------------------------
  const tuft = grassTuftGeometry(31, { blades: 6, base: '#6a5a30', tip: '#b49a5e' });
  for (let i = 0; i < 1500; i++) {
    const x = (rand() * 2 - 1) * radius, z = (rand() * 2 - 1) * radius;
    if (hexNorm(x, z, radius) > 0.97 || pitAt(x, z) > 0.02 || !free(x, z, 0.005)) continue;
    const g = grad(x, z);
    if (Math.hypot(g.x, g.z) > 0.6 && rand() < 0.7) continue;
    add('grass', tuft, m.grass, null, x, z, 0.008 + rand() * 0.008, {
      tilt: 0.3, castShadow: false, sx: 1.8, sz: 1.8, color: new THREE.Color().setScalar(0.8 + rand() * 0.35),
    });
  }
  for (let i = 0; i < 30; i++) {
    const x = (rand() * 2 - 1) * radius, z = (rand() * 2 - 1) * radius;
    if (hexNorm(x, z, radius) > 0.92 || pitAt(x, z) > 0 || !free(x, z, 0.02)) continue;
    add(`bush${i % 3}`, bushGeometry(10 + (i % 3)), m.bush, m.bushDepth, x, z, 0.02 + rand() * 0.02, {
      tilt: 0.2, sx: 1.4, sz: 1.4, color: new THREE.Color(1.05, 0.95, 0.75),
    });
  }
  const nTrees = Math.floor(rand() * 5);
  for (let i = 0, t = 0; i < nTrees && t < 50; t++) {
    const x = (rand() * 2 - 1) * radius, z = (rand() * 2 - 1) * radius;
    if (hexNorm(x, z, radius) > 0.88 || Math.hypot(x, z) < TOKEN_R || pitAt(x, z) > 0 || !free(x, z, 0.04)) continue;
    add(`tree${i % 3}`, deciduousGeometry(1 + (i % 3)), m.tree, m.treeDepth, x, z, (0.2 + rand() * 0.08) * 0.65, { color: new THREE.Color(1.0, 0.95, 0.8) });
    obstacles.push({ x, z, r: 0.04 });
    i++;
  }
  for (let i = 0; i < 10; i++) {
    const x = (rand() * 2 - 1) * radius, z = (rand() * 2 - 1) * radius;
    if (hexNorm(x, z, radius) > 0.9 || !free(x, z, 0.02)) continue;
    add(`rock${i % 2}`, rockGeometry(50 + (i % 2), { moss: false }), m.solid, null, x, z, 0.012 + rand() * 0.015, { tilt: 0.6, yOffset: -0.25, color: new THREE.Color(1.15, 0.95, 0.8) });
  }

  buildInstanced(scatter.buckets, group);

  return {
    group,
    type: 'hills',
    update() {},
    dispose() { disposables.forEach((g) => g.dispose()); },
  };
}
