// FOREST tile (resource: wood / lumber).
// Mixed conifer forest on gently rolling, mossy ground, with undergrowth,
// mossy boulders, a fallen log, and a small central clearing with a log pile
// and stumps. The clearing is kept open on purpose: the number token will
// sit there later.

import * as THREE from 'three';
import { mulberry32, createNoise2D, fbm, lerp, clamp, smoothstep } from '../core/noise.js';
import { createHexTerrainGeometry, createTileBody, edgeFalloff, hexNorm } from './hexGeometry.js';
import { getMaterials } from './materials.js';
import {
  coniferGeometry, deciduousGeometry, bushGeometry, rockGeometry,
  logPileGeometry, stumpGeometry, fallenLogGeometry, hutGeometry,
} from './props.js';

const CONIFER_VARIANTS = 4;
const DECIDUOUS_VARIANTS = 3;
const CLEARING_R = 0.21;
const TREE_SCALE = 0.65; // trees ≈ 65% of the original size (closer to building scale)
const TREE_HEIGHT = 0.5; // forest trees are squat: half the height for the same width

export function createForestTile({ seed = 1, radius = 0.97 } = {}) {
  const rand = mulberry32(seed);
  const noise = createNoise2D(rand);
  const m = getMaterials();
  const group = new THREE.Group();
  group.name = 'forest';

  // Per-tile personality so neighbouring forests don't look cloned.
  const P = {
    decid: [0.6, 0.25, 0.0, -0.25][Math.floor(rand() * 4)], // lower = more broadleaf trees
    density: 0.65 + rand() * 0.25,      // spacing factor (lower = denser)
    tall: 0.9 + rand() * 0.25,
    autumn: rand() < 0.25 ? 0.35 : 0.06,
    clearing: ['logpile', 'logpile', 'cabin', 'stumps'][Math.floor(rand() * 4)],
    hills: 0.07 + rand() * 0.07,
    rocks: 3 + Math.floor(rand() * 8),
  };

  // ---------- Terrain -------------------------------------------------------
  // Clearing props are decided up front so the clearing can grow a yard around a cabin.
  const clearAng = rand() * Math.PI * 2;
  const cabinPos = P.clearing === 'cabin'
    ? { x: Math.cos(clearAng) * CLEARING_R * 1.6, z: Math.sin(clearAng) * CLEARING_R * 1.6 } : null;
  const clearing = (x, z) => {
    let c = 1 - smoothstep(CLEARING_R * 0.7, CLEARING_R * 1.25, Math.hypot(x, z));
    if (cabinPos) c = Math.max(c, 1 - smoothstep(0.1, 0.17, Math.hypot(x - cabinPos.x, z - cabinPos.z)));
    return c;
  };
  const heightFn = (x, z) => {
    const n = fbm(noise, x * 1.4 + 10, z * 1.4 - 4, 4) * 0.5 + 0.5; // 0..1
    const hill = n * P.hills;
    const flat = 0.03;
    return lerp(hill, flat, clearing(x, z)) * edgeFalloff(x, z, radius);
  };

  const moss = new THREE.Color('#2b4219');
  const mossDeep = new THREE.Color('#1c2e12');
  const litter = new THREE.Color('#4a3a22');
  const grass = new THREE.Color('#4f6b31');
  const edgeGrass = new THREE.Color('#3d5a22');
  const c = new THREE.Color();
  const treeSpots = []; // filled during scatter, used by colorFn
  const colorFn = (x, z, y) => {
    const n1 = fbm(noise, x * 3 + 50, z * 3, 3);
    const n2 = noise(x * 9 - 20, z * 9);
    c.lerpColors(mossDeep, moss, clamp(0.5 + n1 * 1.2, 0, 1));
    c.lerp(litter, clamp(n2 * 0.9, 0, 0.55));
    c.lerp(grass, clearing(x, z) * 0.75);
    // darker, needle-covered soil under tree canopies (fake ambient occlusion)
    let shade = 0;
    for (const t of treeSpots) {
      const d = Math.hypot(x - t.x, z - t.z) / t.r;
      if (d < 1) shade = Math.max(shade, 1 - d * d);
    }
    c.multiplyScalar(1 - shade * 0.45);
    c.lerp(edgeGrass, smoothstep(0.9, 1.0, hexNorm(x, z, radius))); // match side strata
    return [c.r, c.g, c.b];
  };

  // ---------- Scatter helpers ----------------------------------------------
  const placed = []; // {x,z,r}
  const fits = (x, z, r) => placed.every((p) => Math.hypot(p.x - x, p.z - z) > (p.r + r) * P.density);
  const dummy = new THREE.Object3D();
  const buckets = new Map(); // key -> {geo, mat, depth, list: [{matrix,color}]}

  const add = (key, geo, mat, depth, x, z, scale, { tilt = 0.06, color = null, yOffset = -0.006, rotY = null, sx = 1, sz = 1 } = {}) => {
    if (!buckets.has(key)) buckets.set(key, { geo, mat, depth, list: [] });
    dummy.position.set(x, heightFn(x, z) + yOffset * scale, z);
    dummy.rotation.set((rand() - 0.5) * tilt, rotY ?? rand() * Math.PI * 2, (rand() - 0.5) * tilt);
    dummy.scale.set(scale * sx, scale, scale * sz);
    dummy.updateMatrix();
    buckets.get(key).list.push({ matrix: dummy.matrix.clone(), color });
  };

  const randomPointInHex = (maxNorm) => {
    for (;;) {
      const x = (rand() * 2 - 1) * radius;
      const z = (rand() * 2 - 1) * radius;
      if (hexNorm(x, z, radius) < maxNorm) return [x, z];
    }
  };

  // ---------- Clearing props (varies per tile) -----------------------------
  {
    const a = clearAng;
    const lx = Math.cos(a) * CLEARING_R * 0.85, lz = Math.sin(a) * CLEARING_R * 0.85;
    if (P.clearing === 'logpile') {
      add('logpile', logPileGeometry(), m.solid, null, lx, lz, 0.2, { tilt: 0, rotY: -a + Math.PI / 2, yOffset: 0 }); // log pile (kept small next to the squat trees)
      placed.push({ x: lx, z: lz, r: 0.09 });
    } else if (P.clearing === 'cabin') {
      // woodcutter's cabin at the clearing edge, door facing the centre
      const { x: cx, z: cz } = cabinPos;
      const cabin = new THREE.Mesh(hutGeometry(1 + Math.floor(rand() * 9)), m.solid);
      cabin.position.set(cx, heightFn(cx, cz) - 0.004, cz);
      cabin.rotation.y = Math.atan2(-cx, -cz);
      cabin.scale.setScalar(0.14);
      cabin.castShadow = cabin.receiveShadow = true;
      group.add(cabin);
      placed.push({ x: cx, z: cz, r: 0.15 });
      // keep the path between cabin and centre open
      placed.push({ x: cx * 0.65, z: cz * 0.65, r: 0.08 });
    }
    const nStumps = P.clearing === 'stumps' ? 7 : 3;
    for (let i = 0; i < nStumps; i++) {
      const b = a + 1.6 + i * (4.6 / nStumps) + rand() * 0.4;
      const d = CLEARING_R * (0.6 + rand() * 0.5);
      const sx = Math.cos(b) * d, sz = Math.sin(b) * d;
      if (!fits(sx, sz, 0.03)) continue;
      add('stump', stumpGeometry(), m.solid, null, sx, sz, (0.7 + rand() * 0.5) * TREE_SCALE * 0.55, { tilt: 0.1, yOffset: -0.01 });
      placed.push({ x: sx, z: sz, r: 0.05 });
    }
  }
  // Reserve the clearing for the number token
  placed.push({ x: 0, z: 0, r: CLEARING_R * 0.9 });

  // ---------- Rocks ---------------------------------------------------------
  for (let i = 0; i < P.rocks; i++) {
    const [x, z] = randomPointInHex(0.85);
    const s = (0.025 + rand() * 0.04) * TREE_SCALE;
    if (!fits(x, z, s * 1.2)) continue;
    add(`rock${i % 3}`, rockGeometry(1 + (i % 3)), m.solid, null, x, z, s, { tilt: 0.5, yOffset: -0.2 });
    placed.push({ x, z, r: s * 1.1 });
  }

  // ---------- Fallen log ----------------------------------------------------
  {
    const [x, z] = randomPointInHex(0.6);
    if (fits(x, z, 0.12) && Math.hypot(x, z) > CLEARING_R * 1.4) {
      add('fallenlog', fallenLogGeometry(), m.solid, null, x, z, 0.9 * TREE_SCALE * 0.6, { tilt: 0.05, yOffset: -0.01 });
      placed.push({ x, z, r: 0.12 });
    }
  }

  // ---------- Trees ---------------------------------------------------------
  // Deciduous trees cluster where a low-frequency noise is high.
  const decidField = (x, z) => noise(x * 1.3 + 77, z * 1.3 - 31);
  const MAX_DECID_SHARE = 0.09; // light-green broadleaf trees: at most ~9% of a forest
  const trees = [];
  let attempts = 0;
  while (attempts++ < 6000) {
    const [x, z] = randomPointInHex(0.94);
    const edge = hexNorm(x, z, radius);
    const score = decidField(x, z);
    const isDecid = score > P.decid && rand() < 0.8;
    // trees near the edge are a bit smaller so they don't overhang neighbours
    const edgeShrink = lerp(1, 0.75, smoothstep(0.75, 0.94, edge));
    const h = (isDecid ? 0.26 + rand() * 0.12 : 0.28 + rand() * 0.2) * edgeShrink * P.tall * TREE_SCALE;
    const footprint = h * (isDecid ? 0.32 : 0.24);
    if (!fits(x, z, footprint)) continue;
    placed.push({ x, z, r: footprint });
    treeSpots.push({ x, z, r: footprint * 2.2 });
    trees.push({ x, z, h, isDecid, score, v: rand(), tintR: rand(), tintA: rand(), tintB: rand(), tintC: rand() });
  }
  // Cap the broadleaf share: turn the weakest-cluster ones into spruces,
  // keeping the core of the grove where the noise field is strongest.
  const decid = trees.filter((t) => t.isDecid).sort((a, b) => a.score - b.score);
  const allowed = Math.floor(trees.length * MAX_DECID_SHARE);
  for (let i = 0; i < decid.length - allowed; i++) {
    decid[i].isDecid = false;
    decid[i].h *= 1.1;
  }
  for (const t of trees) {
    const v = Math.floor(t.v * (t.isDecid ? DECIDUOUS_VARIANTS : CONIFER_VARIANTS));
    const geo = t.isDecid ? deciduousGeometry(v + 1) : coniferGeometry(v + 1);
    const tint = t.isDecid
      ? (t.tintR < P.autumn ? (t.tintA < 0.5 ? new THREE.Color(1.35, 0.95, 0.45) : new THREE.Color(1.4, 0.7, 0.35)) : new THREE.Color().setHSL(0.0, 0, 0.85 + t.tintB * 0.3))
      : new THREE.Color(0.85 + t.tintA * 0.3, 0.9 + t.tintB * 0.25, 0.85 + t.tintC * 0.25);
    // half as tall, same width: scale = h/2, widened ×2 back to the full footprint
    add(t.isDecid ? `decid${v}` : `conifer${v}`, geo, m.tree, m.treeDepth, t.x, t.z, t.h * TREE_HEIGHT, { color: tint, sx: 1 / TREE_HEIGHT, sz: 1 / TREE_HEIGHT });
  }

  // ---------- Undergrowth ---------------------------------------------------
  for (let i = 0; i < 60; i++) {
    const [x, z] = randomPointInHex(0.93);
    if (Math.hypot(x, z) < CLEARING_R * 0.8) continue;
    if (cabinPos && Math.hypot(x - cabinPos.x, z - cabinPos.z) < 0.1) continue;
    const s = (0.03 + rand() * 0.035) * 0.8;
    add(`bush${i % 3}`, bushGeometry(i % 3), m.bush, m.bushDepth, x, z, s, {
      tilt: 0.2, color: new THREE.Color().setScalar(0.75 + rand() * 0.35), sx: 1.4, sz: 1.4,
    });
  }

  // ---------- Terrain mesh (built after scatter so it can shade under trees)
  const terrain = new THREE.Mesh(createHexTerrainGeometry({ radius, rings: 28, heightFn, colorFn }), m.ground);
  terrain.receiveShadow = true;
  group.add(terrain);
  group.add(createTileBody({ radius, strata: { top: '#3d5a22' } }));

  // ---------- Build instanced meshes ---------------------------------------
  for (const [key, b] of buckets) {
    const mesh = new THREE.InstancedMesh(b.geo, b.mat, b.list.length);
    mesh.name = key;
    b.list.forEach((it, i) => {
      mesh.setMatrixAt(i, it.matrix);
      if (it.color) mesh.setColorAt(i, it.color);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (b.depth) mesh.customDepthMaterial = b.depth;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  return {
    group,
    type: 'forest',
    update() {},
    dispose() { terrain.geometry.dispose(); },
    /** Fire: trees and bushes turn charred; null restores their colours. */
    setWeather(kind) {
      group.children.forEach((o) => {
        if (!o.isInstancedMesh || !o.instanceColor || !/conifer|decid|bush/.test(o.name)) return;
        if (!o.userData.origColors) o.userData.origColors = o.instanceColor.array.slice();
        const orig = o.userData.origColors, arr = o.instanceColor.array;
        for (let i = 0; i < arr.length; i += 3) {
          if (kind !== 'fire') { arr[i] = orig[i]; arr[i + 1] = orig[i + 1]; arr[i + 2] = orig[i + 2]; continue; }
          // charred: mostly blackened grey-brown, a few still singed green, uneven
          // (instance colour multiplies the trees' green vertex colours, so go dark & warm)
          const v = ((i * 7919) % 100) / 100;
          const k = v < 0.12 ? 0.55 : 0.16 + v * 0.1;
          arr[i] = 1.6 * k; arr[i + 1] = 0.75 * k; arr[i + 2] = 0.9 * k;
        }
        o.instanceColor.needsUpdate = true;
      });
    },
  };
}
