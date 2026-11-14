// MOUNTAINS tile (resource: ore).
// Natural-looking massif generated the way terrain tools do it:
//   1. an elongated, curving, irregular footprint (centred or toward one side),
//   2. domain-warped ridged noise for branching ridges and uneven summits,
//   3. droplet hydraulic erosion that carves gullies and drops scree fans.
// Summits ≈ 2–2.5× tree height with a dusting of snow, forest on the lower
// slopes and meadow around the foot.

import * as THREE from 'three';
import { mulberry32, createNoise2D, fbm, lerp, clamp, smoothstep } from '../core/noise.js';
import { erode, blurMap } from '../core/erosion.js';
import { createHexTerrainGeometry, createTileBody, edgeFalloff, hexNorm } from './hexGeometry.js';
import { getMaterials, buildInstanced, createScatter } from './materials.js';
import { coniferGeometry } from './props.js';
import { createHawks } from './hawks.js';

const GRID = 129; // heightmap resolution (cells span the tile's bounding square)

export function createMountainsTile({ seed = 1, radius = 0.97 } = {}) {
  const rand = mulberry32(seed);
  const noise = createNoise2D(rand);
  const noise2 = createNoise2D(rand);
  const warpN = createNoise2D(rand);
  const m = getMaterials();
  const group = new THREE.Group();
  group.name = 'mountains';
  const disposables = [];

  // ---------- 1. Footprint: an elongated, gently curving chain of blobs ----------
  // The chain runs along a random axis and may sit off-centre toward one side.
  const axis = rand() * Math.PI;
  const ax = { x: Math.cos(axis), z: Math.sin(axis) };    // along the range
  const nx = { x: -ax.z, z: ax.x };                         // across the range
  const sideShift = rand() < 0.35 ? 0 : (rand() < 0.5 ? -1 : 1) * (0.12 + rand() * 0.16);
  const curve = (rand() - 0.5) * 0.5;
  const length = 0.65 + rand() * 0.35;                      // half-length of the chain
  const blobs = [];
  const nBlobs = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < nBlobs; i++) {
    const t = nBlobs === 1 ? 0 : (i / (nBlobs - 1)) * 2 - 1;  // -1 .. 1 along the chain
    const along = t * length * 0.8 + (rand() - 0.5) * 0.08;
    const across = sideShift + curve * (t * t - 0.4) + (rand() - 0.5) * 0.08;
    blobs.push({
      x: ax.x * along + nx.x * across, z: ax.z * along + nx.z * across,
      ra: 0.36 + rand() * 0.12,         // stretched along the axis
      rc: 0.26 + rand() * 0.07,         // narrower across
      h: (1 - 0.25 * Math.abs(t)) * (0.85 + rand() * 0.15), // highest near the middle
    });
  }
  const footprint = (x, z) => {
    let acc = 0;
    for (const b of blobs) {
      const dx = x - b.x, dz = z - b.z;
      const u = (dx * ax.x + dz * ax.z) / b.ra, v = (dx * nx.x + dz * nx.z) / b.rc;
      acc = Math.max(acc, b.h * Math.exp(-(u * u + v * v) * 1.1));
    }
    // ragged outline
    return clamp(acc + fbm(noise2, x * 3 + 4, z * 3, 3) * 0.18, 0, 1.2);
  };

  // ---------- 2. Ridged noise, domain warped so ridges branch naturally ----------
  const ridged = (x, z) => {
    const wx = x + fbm(warpN, x * 1.8, z * 1.8, 3) * 0.22;
    const wz = z + fbm(warpN, x * 1.8 + 9, z * 1.8 - 3, 3) * 0.22;
    let sum = 0, amp = 0.55, f = 1.7, prev = 1;
    for (let o = 0; o < 5; o++) {
      let n = 1 - Math.abs(noise(wx * f + o * 17, wz * f - o * 11));
      n = Math.pow(n, 1.6); // a bit gentler than n²
      sum += n * amp * prev;     // higher octaves stronger on ridges (multifractal)
      prev = clamp(n * 1.2, 0, 1);
      amp *= 0.47; f *= 2.03; // slightly weaker fine octaves = fewer needles
    }
    return sum;
  };

  // ---------- 3. Build heightmap, erode it ----------------------------------------
  const span = radius * 2;
  const cell = span / (GRID - 1);
  const map = new Float32Array(GRID * GRID);
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const x = -radius + i * cell, z = -radius + j * cell;
      const f = footprint(x, z);
      // broad massif (plateau-like base); the ridged noise supplies several summits
      const shape = smoothstep(0.12, 0.75, f) * (0.75 + 0.25 * smoothstep(0.5, 1.0, f));
      map[j * GRID + i] = shape * (0.3 + ridged(x, z) * 0.95) * edgeFalloff(x, z, radius, 0.66);
    }
  }
  // normalise to 0..1 for the erosion parameters
  let mx = 0;
  for (let k = 0; k < map.length; k++) mx = Math.max(mx, map[k]);
  for (let k = 0; k < map.length; k++) map[k] /= mx;
  const { wear, deposit } = erode(map, GRID, rand, { droplets: 40000 });
  // soften single-cell needles while keeping the eroded detail
  const soft = blurMap(map, GRID, 1);
  for (let k = 0; k < map.length; k++) map[k] = map[k] * 0.35 + soft[k] * 0.65;
  const wearB = blurMap(wear, GRID, 1);
  const depB = blurMap(deposit, GRID, 2);
  let wMax = 1e-6, dMax = 1e-6, hMax = 0;
  for (let k = 0; k < map.length; k++) { wMax = Math.max(wMax, wearB[k]); dMax = Math.max(dMax, depB[k]); hMax = Math.max(hMax, map[k]); }

  const targetTop = 0.66 + rand() * 0.14;           // ≈ 2× tree height
  const hScale = targetTop / hMax;
  const bilinear = (arr, x, z) => {
    const gx = clamp((x + radius) / cell, 0, GRID - 1.001), gz = clamp((z + radius) / cell, 0, GRID - 1.001);
    const i = Math.floor(gx), j = Math.floor(gz), u = gx - i, v = gz - j;
    const k = j * GRID + i;
    return arr[k] * (1 - u) * (1 - v) + arr[k + 1] * u * (1 - v) + arr[k + GRID] * (1 - u) * v + arr[k + GRID + 1] * u * v;
  };
  const heightFn = (x, z) => bilinear(map, x, z) * hScale * edgeFalloff(x, z, radius, 0.85)
    + (fbm(noise2, x * 6, z * 6, 2) * 0.5 + 0.5) * 0.012;

  // ---------- Colours ------------------------------------------------------------------
  const snowLine = targetTop * (0.87 + rand() * 0.06);
  const meadow = new THREE.Color('#5b6b33');
  const meadowDry = new THREE.Color('#7a7444');
  const forestFloor = new THREE.Color('#34402a');
  const rock = new THREE.Color('#8f8676');
  const rockDark = new THREE.Color('#4f4a43');
  const rockWarm = new THREE.Color('#9a8670');
  const scree = new THREE.Color('#a39a8a');
  const snow = new THREE.Color('#f2f4f7');
  const c = new THREE.Color();
  const colorFn = (x, z, y, n) => {
    const slope = 1 - n.y; // 0 flat .. 1 vertical
    const rn = noise2(x * 8, z * 8);
    const gully = clamp(bilinear(wearB, x, z) / wMax * 2.5, 0, 1);
    const fan = clamp(bilinear(depB, x, z) / dMax * 3, 0, 1);
    c.lerpColors(rock, rockDark, clamp(0.35 + slope * 0.6 + rn * 0.3, 0, 1));
    c.lerp(rockWarm, clamp(noise(x * 3 + 9, z * 3) * 0.8, 0, 0.45));
    c.lerp(rockDark, gully * 0.55);              // dark eroded gullies
    c.lerp(scree, fan * (1 - smoothstep(0.3, 0.6, slope)) * 0.8); // pale debris fans
    // forest-covered lower slopes, meadow at the foot
    const skirt = (1 - smoothstep(0.2, 0.36, y + rn * 0.05)) * smoothstep(0.05, 0.14, y) * (1 - smoothstep(0.45, 0.7, slope));
    c.lerp(forestFloor, skirt * 0.8);
    const grass = (1 - smoothstep(0.05, 0.13, y + rn * 0.03)) * (1 - smoothstep(0.3, 0.55, slope));
    c.lerp(new THREE.Color().lerpColors(meadow, meadowDry, clamp(0.5 + rn, 0, 1)), grass);
    // light snow on the summits; steeper faces stay bare
    const steepOK = lerp(0.5, 0.8, smoothstep(snowLine, targetTop, y));
    const sn = smoothstep(snowLine - 0.04, snowLine + 0.06, y + rn * 0.06) * (1 - smoothstep(steepOK - 0.15, steepOK, slope));
    c.lerp(snow, sn);
    c.lerp(meadow, smoothstep(0.93, 1.0, hexNorm(x, z, radius)) * 0.6);
    return [c.r, c.g, c.b];
  };

  const terrainGeo = createHexTerrainGeometry({ radius, rings: 80, heightFn, colorFn });
  disposables.push(terrainGeo);
  const terrain = new THREE.Mesh(terrainGeo, m.rockSmooth);
  terrain.castShadow = true;
  terrain.receiveShadow = true;
  group.add(terrain);
  group.add(createTileBody({ radius, strata: { top: '#55642f', layers: [
    { color: '#5a5550', size: 0.3 }, { color: '#6b655d', size: 0.25 }, { color: '#4e4a45', size: 0.2 }, { color: '#615a52', size: 0.25 },
  ] } }));

  const scatter = createScatter(rand, heightFn);
  const add = scatter.add;
  const slopeAt = (x, z) => {
    const e = 0.01;
    return Math.hypot(heightFn(x + e, z) - heightFn(x - e, z), heightFn(x, z + e) - heightFn(x, z - e)) / (2 * e);
  };

  // ---------- Conifers on the lower slopes -----------------------------------------
  const placed = [];
  for (let i = 0, n = 0; i < 1500 && n < 70; i++) {
    const x = (rand() * 2 - 1) * radius, z = (rand() * 2 - 1) * radius;
    if (hexNorm(x, z, radius) > 0.93) continue;
    const y = heightFn(x, z);
    if (y > 0.32 || slopeAt(x, z) > 1.3) continue; // forest skirts the lower slopes
    if (noise(x * 4 + 3, z * 4) < -0.1) continue; // patchy stands
    const h = (0.16 + rand() * 0.12) * (1 - y * 1.5) * 0.65;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < (p.r + h * 0.24) * 0.8)) continue;
    placed.push({ x, z, r: h * 0.24 });
    const v = Math.floor(rand() * 4);
    add(`conifer${v}`, coniferGeometry(v + 1), m.tree, m.treeDepth, x, z, h, {
      color: new THREE.Color(0.8 + rand() * 0.2, 0.85 + rand() * 0.2, 0.85 + rand() * 0.2),
    });
    n++;
  }

  buildInstanced(scatter.buckets, group);

  // ---------- Hawks circling above the highest summit ---------------------------
  let peak = { x: 0, y: 0, z: 0 };
  for (let i = -20; i <= 20; i++) for (let j = -20; j <= 20; j++) {
    const x = (i / 20) * radius * 0.8, z = (j / 20) * radius * 0.8, y = heightFn(x, z);
    if (y > peak.y) peak = { x, y, z };
  }
  const hawks = createHawks(rand, peak, 1 + Math.floor(rand() * 3));
  group.add(hawks.group);

  return {
    group,
    type: 'mountains',
    update(time) { hawks.update(time); },
    dispose() { disposables.forEach((g) => g.dispose()); },
  };
}
