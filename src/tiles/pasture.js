// PASTURE tile (resource: wool / sheep).
// Mostly flat, wind-swept meadow with a grazing flock. Each tile rolls its own
// set of features so no two pastures look alike:
//   shepherd's hut (+ fenced pen, hay bales, worn path), pond with reeds,
//   dry-stone wall, lone trees, wildflower patches, lush vs. dry grass.
// The tile centre stays free of buildings/water for the number token.

import * as THREE from 'three';
import { mulberry32, createNoise2D, fbm, lerp, clamp, smoothstep } from '../core/noise.js';
import { createHexTerrainGeometry, createTileBody, edgeFalloff, hexNorm } from './hexGeometry.js';
import { getMaterials, buildInstanced, createScatter } from './materials.js';
import {
  deciduousGeometry, bushGeometry, rockGeometry, grassTuftGeometry, flowerGeometry,
  hutGeometry, fenceGeometry,
} from './props.js';
import { createFlock } from './sheep.js';

const TOKEN_R = 0.26;

function hayBaleGeometry() {
  const g = new THREE.CylinderGeometry(1, 1, 1.3, 14, 1);
  g.deleteAttribute('uv');
  g.rotateZ(Math.PI / 2);
  g.translate(0, 1, 0);
  const p = g.attributes.position, n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const side = new THREE.Color('#c8a95e'), end = new THREE.Color('#a8893f');
  for (let i = 0; i < p.count; i++) {
    const c = Math.abs(n.getX(i)) > 0.9 ? end : side;
    const f = 0.85 + Math.random() * 0.25;
    col[i * 3] = c.r * f; col[i * 3 + 1] = c.g * f; col[i * 3 + 2] = c.b * f;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
let hayGeo = null;

export function createPastureTile({ seed = 1, radius = 0.97 } = {}) {
  const rand = mulberry32(seed);
  const noise = createNoise2D(rand);
  const m = getMaterials();
  const group = new THREE.Group();
  group.name = 'pasture';
  const disposables = [];

  // ---------- Per-tile personality ------------------------------------------
  const P = {
    lush: rand(),                       // 0 = dry late-summer, 1 = lush spring
    undulation: 0.015 + rand() * 0.035,
    sheep: 4 + Math.floor(rand() * 6),
    hut: rand() < 0.75,
    pen: rand() < 0.65,
    pond: rand() < 0.35,
    wall: rand() < 0.5,
    trees: Math.floor(rand() * 4),
    flowers: rand(),
  };

  // ---------- Layout of features (decided before terrain) -------------------
  const obstacles = []; // {x,z,r} — sheep avoid, grass skipped inside if 'noGrass'
  const flatten = [];   // {x,z,r,level}
  const freeOf = (x, z, r, pad = 0) => obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r + pad);
  const polar = (a, d) => ({ x: Math.cos(a) * d, z: Math.sin(a) * d });
  const baseHeight = (x, z) => (fbm(noise, x * 1.1 + 3, z * 1.1 - 7, 3) * 0.5 + 0.5) * P.undulation * edgeFalloff(x, z, radius);

  let hut = null, pen = null, pond = null, path = null;
  if (P.hut) {
    const a = rand() * Math.PI * 2;
    const d = 0.46 + rand() * 0.1;
    const p = polar(a, d);
    const rotY = Math.atan2(-p.x, -p.z) + (rand() - 0.5) * 0.8; // door roughly faces centre
    hut = { ...p, a, rotY, scale: 0.15 + rand() * 0.03, seed: Math.floor(rand() * 9) + 1 };
    obstacles.push({ x: p.x, z: p.z, r: hut.scale * 0.68, noGrass: true });
    flatten.push({ x: p.x, z: p.z, r: hut.scale * 0.85, level: baseHeight(p.x, p.z) });

    if (P.pen) {
      const side = rand() < 0.5 ? 1 : -1;
      const perp = rotY + side * Math.PI / 2;
      const pr = 0.075 + rand() * 0.035;
      const off = hut.scale * 0.62 + pr;
      const cx = p.x + Math.sin(perp) * off, cz = p.z + Math.cos(perp) * off;
      if (hexNorm(cx, cz, radius) < 0.82 && Math.hypot(cx, cz) > TOKEN_R + pr) {
        pen = { x: cx, z: cz, r: pr };
        obstacles.push({ x: cx, z: cz, r: pr + 0.01 });
      }
    }
    // worn path from the door to the tile edge
    const door = { x: p.x + Math.sin(rotY) * hut.scale * 0.5, z: p.z + Math.cos(rotY) * hut.scale * 0.5 };
    const ea = a + (rand() - 0.5) * 1.6;
    const end = polar(ea, radius * 0.98);
    const ctrl = { x: (door.x + end.x) / 2 + (rand() - 0.5) * 0.3, z: (door.z + end.z) / 2 + (rand() - 0.5) * 0.3 };
    path = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, u = 1 - t;
      path.push({ x: u * u * door.x + 2 * u * t * ctrl.x + t * t * end.x, z: u * u * door.z + 2 * u * t * ctrl.z + t * t * end.z });
    }
  }

  if (P.pond) {
    for (let t = 0; t < 30; t++) {
      const pr = 0.08 + rand() * 0.07;
      const p = polar(rand() * Math.PI * 2, 0.32 + rand() * 0.3);
      if (hexNorm(p.x, p.z, radius) < 0.8 - pr && Math.hypot(p.x, p.z) > TOKEN_R + pr && freeOf(p.x, p.z, pr, 0.04)) {
        pond = { ...p, r: pr, level: baseHeight(p.x, p.z) };
        obstacles.push({ x: p.x, z: p.z, r: pr * 1.15, noGrass: true });
        flatten.push({ x: p.x, z: p.z, r: pr * 1.5, level: pond.level });
        break;
      }
    }
  }

  const distToPath = (x, z) => {
    if (!path) return 9;
    let best = 9;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const abx = b.x - a.x, abz = b.z - a.z;
      const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz), 0, 1);
      best = Math.min(best, Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t)));
    }
    return best;
  };

  // ---------- Terrain -------------------------------------------------------
  const pondShape = (x, z) => {
    if (!pond) return 0;
    const ang = Math.atan2(z - pond.z, x - pond.x);
    const rr = pond.r * (1 + 0.18 * Math.sin(ang * 3 + seed) + 0.1 * Math.sin(ang * 5 + 1));
    return 1 - smoothstep(rr * 0.55, rr * 1.05, Math.hypot(x - pond.x, z - pond.z)); // 1 inside
  };
  const heightFn = (x, z) => {
    let h = baseHeight(x, z);
    for (const f of flatten) h = lerp(h, f.level, 1 - smoothstep(f.r * 0.7, f.r * 1.4, Math.hypot(x - f.x, z - f.z)));
    if (pond) h -= pondShape(x, z) * 0.035;
    return h;
  };

  const grassA = new THREE.Color().lerpColors(new THREE.Color('#6b7a34'), new THREE.Color('#3f6a22'), P.lush);
  const grassB = new THREE.Color().lerpColors(new THREE.Color('#8a8a46'), new THREE.Color('#5f8a32'), P.lush);
  const dirt = new THREE.Color('#6a5236');
  const mud = new THREE.Color('#3e3324');
  const edgeGrass = new THREE.Color('#4a6a2a');
  const c = new THREE.Color();
  const colorFn = (x, z) => {
    c.lerpColors(grassA, grassB, clamp(0.5 + fbm(noise, x * 2.5 + 40, z * 2.5, 3) * 1.3, 0, 1));
    c.multiplyScalar(0.9 + noise(x * 12, z * 12 - 9) * 0.15);
    if (path) c.lerp(dirt, (1 - smoothstep(0.008, 0.03, distToPath(x, z))) * 0.75);
    if (pond) c.lerp(mud, smoothstep(0.0, 0.6, pondShape(x, z)) * 0.9);
    if (hut) c.lerp(dirt, (1 - smoothstep(hut.scale * 0.5, hut.scale * 0.95, Math.hypot(x - hut.x, z - hut.z))) * 0.5);
    c.lerp(edgeGrass, smoothstep(0.92, 1.0, hexNorm(x, z, radius)) * 0.6);
    return [c.r, c.g, c.b];
  };

  const terrainGeo = createHexTerrainGeometry({ radius, rings: 30, heightFn, colorFn });
  disposables.push(terrainGeo);
  const terrain = new THREE.Mesh(terrainGeo, m.ground);
  terrain.receiveShadow = true;
  group.add(terrain);
  group.add(createTileBody({ radius, strata: { top: '#4a6a2a' } }));

  const scatter = createScatter(rand, heightFn);
  const add = scatter.add;

  // ---------- Hut, pen, hay ---------------------------------------------------
  if (hut) {
    const mesh = new THREE.Mesh(hutGeometry(hut.seed), m.solid);
    mesh.position.set(hut.x, heightFn(hut.x, hut.z) - 0.003, hut.z);
    mesh.rotation.y = hut.rotY;
    mesh.scale.setScalar(hut.scale);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    hayGeo ??= hayBaleGeometry();
    const nb = Math.floor(rand() * 3);
    for (let i = 0; i < nb; i++) {
      const a = hut.rotY + Math.PI + (rand() - 0.5) * 2;
      const hx = hut.x + Math.sin(a) * hut.scale * 0.75, hz = hut.z + Math.cos(a) * hut.scale * 0.75;
      add('hay', hayGeo, m.solid, null, hx, hz, 0.011, { tilt: 0, yOffset: -0.1 });
      obstacles.push({ x: hx, z: hz, r: 0.02 });
    }
  }
  if (pen) {
    const n = 8 + Math.floor(rand() * 3);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.25;
      const rr = pen.r * (0.9 + rand() * 0.2);
      pts.push({ x: pen.x + Math.cos(a) * rr, z: pen.z + Math.sin(a) * rr });
    }
    // gate on the side facing the tile centre
    const toC = Math.atan2(-pen.z, -pen.x);
    let gate = 0, bestD = 9;
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % n];
      const ma = Math.atan2((p.z + q.z) / 2 - pen.z, (p.x + q.x) / 2 - pen.x);
      const d = Math.abs(Math.atan2(Math.sin(ma - toC), Math.cos(ma - toC)));
      if (d < bestD) { bestD = d; gate = i; }
    });
    const fg = fenceGeometry(pts, heightFn, { gapIndex: gate, seed });
    disposables.push(fg);
    const fence = new THREE.Mesh(fg, m.solid);
    fence.castShadow = fence.receiveShadow = true;
    group.add(fence);
  }

  // ---------- Pond with reeds ---------------------------------------------------
  if (pond) {
    const wg = new THREE.CircleGeometry(pond.r * 1.25, 40).rotateX(-Math.PI / 2);
    disposables.push(wg);
    const water = new THREE.Mesh(wg, m.water);
    water.position.set(pond.x, pond.level - 0.012, pond.z);
    water.receiveShadow = true;
    group.add(water);
    const reeds = grassTuftGeometry(11, { blades: 5, base: '#2f3a1a', tip: '#7a7a3e' });
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2;
      const d = pond.r * (0.85 + rand() * 0.35);
      if (rand() < 0.35 && Math.sin(a * 2 + seed) < 0) continue; // clumpy
      add('reeds', reeds, m.grass, null, pond.x + Math.cos(a) * d, pond.z + Math.sin(a) * d, 0.03 + rand() * 0.025, {
        tilt: 0.3, castShadow: false, color: new THREE.Color().setScalar(0.8 + rand() * 0.3),
      });
    }
  }

  // ---------- Dry-stone wall -------------------------------------------------
  if (P.wall) {
    const a1 = rand() * Math.PI * 2;
    const span = 1.2 + rand() * 1.4;
    const steps = Math.floor(span * 95);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = a1 + span * t;
      const d = (0.9 - 0.22 * Math.sin(Math.PI * t)) * radius + noise(t * 4, seed) * 0.03;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (hexNorm(x, z, radius) > 0.93 || !freeOf(x, z, 0.012)) continue;
      if (rand() < 0.04) continue; // tumbled gaps
      const perpX = Math.cos(a), perpZ = Math.sin(a); // radial direction = across the wall
      for (let layer = 0; layer < 3; layer++) {
        const across = layer === 2 ? [0] : [-1, 1];
        for (const side of across) {
          const s = layer === 2 ? 0.008 + rand() * 0.003 : 0.009 + rand() * 0.004;
          const off = side * 0.006;
          add(`wall${layer % 2}`, rockGeometry(90 + (layer % 2), { moss: true, detail: 1 }), m.solid, null,
            x + perpX * off + (rand() - 0.5) * 0.004, z + perpZ * off + (rand() - 0.5) * 0.004, s,
            { tilt: 0.6, yOffset: -0.3 + layer * 0.95 });
        }
      }
      if (i % 3 === 0) obstacles.push({ x, z, r: 0.014 });
    }
  }

  // ---------- Lone trees & bushes --------------------------------------------
  for (let i = 0, placed = 0; i < 40 && placed < P.trees; i++) {
    const p = polar(rand() * Math.PI * 2, (0.55 + rand() * 0.33) * radius);
    if (hexNorm(p.x, p.z, radius) > 0.88 || !freeOf(p.x, p.z, 0.05)) continue;
    const h = (0.24 + rand() * 0.12) * 0.65;
    add(`tree${placed % 3}`, deciduousGeometry(1 + ((seed + placed) % 3)), m.tree, m.treeDepth, p.x, p.z, h, {
      color: new THREE.Color().setScalar(0.9 + rand() * 0.2),
    });
    obstacles.push({ x: p.x, z: p.z, r: 0.035 });
    // a few bushes at its foot
    for (let b = 0; b < 3; b++) {
      const bx = p.x + (rand() - 0.5) * 0.12, bz = p.z + (rand() - 0.5) * 0.12;
      if (!freeOf(bx, bz, 0.015)) continue;
      add(`bush${b}`, bushGeometry(b + 3), m.bush, m.bushDepth, bx, bz, 0.025 + rand() * 0.02, { tilt: 0.2, sx: 1.4, sz: 1.4, color: new THREE.Color().setScalar(0.9 + rand() * 0.2) });
    }
    placed++;
  }
  for (let i = 0; i < 4; i++) {
    const p = polar(rand() * Math.PI * 2, (0.3 + rand() * 0.6) * radius);
    if (hexNorm(p.x, p.z, radius) > 0.88 || !freeOf(p.x, p.z, 0.03)) continue;
    const s = 0.012 + rand() * 0.02;
    add(`rock${i % 2}`, rockGeometry(40 + (i % 2)), m.solid, null, p.x, p.z, s, { tilt: 0.5, yOffset: -0.25 });
    obstacles.push({ x: p.x, z: p.z, r: s });
  }

  // ---------- Grass -----------------------------------------------------------
  const tufts = [0, 1, 2].map((k) => grassTuftGeometry(k + 1, {
    blades: 4, base: k === 2 ? '#56602c' : '#3f5e24', tip: k === 2 ? '#b0a85e' : (k ? '#86a24a' : '#98b553'),
  }));
  const dryTint = new THREE.Color(1.15, 1.05, 0.7);
  const lushTint = new THREE.Color(0.85, 1.0, 0.85);
  const tint = new THREE.Color();
  const grassCount = 7500;
  for (let i = 0; i < grassCount; i++) {
    const x = (rand() * 2 - 1) * radius, z = (rand() * 2 - 1) * radius;
    if (hexNorm(x, z, radius) > 0.985) continue;
    if (obstacles.some((o) => o.noGrass && Math.hypot(o.x - x, o.z - z) < o.r * 0.95)) continue;
    const pd = distToPath(x, z);
    if (pd < 0.012 || (pd < 0.03 && rand() < 0.7)) continue;
    const meadow = fbm(noise, x * 3 - 11, z * 3 + 5, 2) * 0.5 + 0.5; // tall vs grazed
    const h = (0.008 + rand() * 0.007) * (0.7 + meadow * 0.9);
    const dryness = clamp(1 - P.lush + noise(x * 4 + 70, z * 4) * 0.6, 0, 1);
    tint.lerpColors(lushTint, dryTint, dryness).multiplyScalar(0.85 + rand() * 0.3);
    const k = dryness > 0.7 && rand() < 0.6 ? 2 : (rand() < 0.5 ? 0 : 1);
    add(`grass${k}`, tufts[k], m.grass, null, x, z, h, { tilt: 0.25, castShadow: false, color: tint.clone(), yOffset: -0.05, sx: 2.2, sz: 2.2 });
  }

  // ---------- Wildflowers ------------------------------------------------------
  const palettes = [
    [new THREE.Color(1, 1, 0.95), new THREE.Color(1, 0.85, 0.2)],   // daisies & buttercups
    [new THREE.Color(0.6, 0.45, 0.95), new THREE.Color(1, 1, 0.95)], // clover / harebells
    [new THREE.Color(0.95, 0.25, 0.2), new THREE.Color(1, 0.85, 0.2)], // poppies
  ];
  const pal = palettes[Math.floor(rand() * palettes.length)];
  const flowerCount = Math.floor(80 + P.flowers * 420);
  for (let i = 0, tries = 0; i < flowerCount && tries < flowerCount * 6; tries++) {
    const x = (rand() * 2 - 1) * radius, z = (rand() * 2 - 1) * radius;
    if (hexNorm(x, z, radius) > 0.95 || !freeOf(x, z, 0.005) || distToPath(x, z) < 0.02) continue;
    if (noise(x * 5 + 33, z * 5 - 21) < 0.15) continue; // patches
    add('flower', flowerGeometry(), m.flower, null, x, z, 0.012 + rand() * 0.008, {
      tilt: 0.3, castShadow: false, color: pal[rand() < 0.7 ? 0 : 1],
    });
    i++;
  }

  buildInstanced(scatter.buckets, group);

  // ---------- Sheep ---------------------------------------------------------------
  const isFree = (x, z, r) => hexNorm(x, z, radius) < 0.88 && freeOf(x, z, r) && (!pond || pondShape(x, z) < 0.05);
  let spawn = { x: 0, z: 0 };
  for (let t = 0; t < 30; t++) {
    const p = polar(rand() * Math.PI * 2, rand() * 0.5);
    if (isFree(p.x, p.z, 0.08)) { spawn = p; break; }
  }
  const flock = createFlock({ rand, count: P.sheep, heightFn, isFree, spawn, material: m.animal, scale: 0.055 });
  group.add(flock.group);

  return {
    group,
    type: 'pasture',
    params: P,
    update(time, dt) { flock.update(dt); },
    avoid(x, z, r) { obstacles.push({ x, z, r }); }, // sheep stay out of player pieces
    setWeather(kind) { flock.setSick(kind === 'disease' ? 0.6 : 0); },
    dispose() { disposables.forEach((g) => g.dispose()); },
  };
}
