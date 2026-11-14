// Shared hex-tile building blocks: the subdivided terrain top, the tile
// "cardboard" body with soil strata on the sides, and hex math helpers.
// Hexes are POINTY-TOP (vertex pointing along ±Z), matching Catan's layout
// of horizontal rows (3-4-5-4-3).

import * as THREE from 'three';
import { smoothstep } from '../core/noise.js';

export const SQRT3 = Math.sqrt(3);
export const TILE_THICKNESS = 0.16;

export function hexCorner(i, radius) {
  const a = (Math.PI / 180) * (60 * i + 30);
  return new THREE.Vector2(radius * Math.cos(a), radius * Math.sin(a));
}

// 0 at centre, 1 on the hex boundary (hex "norm").
export function hexNorm(x, z, radius) {
  const apothem = (radius * SQRT3) / 2;
  const d0 = Math.abs(x);
  const d1 = Math.abs(x * 0.5 + z * 0.8660254);
  const d2 = Math.abs(-x * 0.5 + z * 0.8660254);
  return Math.max(d0, d1, d2) / apothem;
}

// 1 in the interior, fading to 0 at the edge so neighbouring tiles meet flush.
export function edgeFalloff(x, z, radius, start = 0.72) {
  return 1 - smoothstep(start, 1.0, hexNorm(x, z, radius));
}

/**
 * Subdivided hexagonal surface built from concentric hex rings.
 * heightFn(x, z) -> y ; colorFn(x, z, y, normal) -> [r, g, b] (linear 0..1)
 */
export function createHexTerrainGeometry({ radius, rings = 24, heightFn, colorFn }) {
  const pos = [];
  const uv = [];
  const corners = Array.from({ length: 6 }, (_, i) => hexCorner(i, radius));

  const pushPoint = (x, z) => {
    const y = heightFn(x, z);
    pos.push(x, y, z);
    uv.push(x * 0.5 + 0.5, z * 0.5 + 0.5);
  };

  pushPoint(0, 0);
  for (let k = 1; k <= rings; k++) {
    const f = k / rings;
    for (let i = 0; i < 6 * k; i++) {
      const s = Math.floor(i / k);
      const t = (i % k) / k;
      const c0 = corners[s];
      const c1 = corners[(s + 1) % 6];
      pushPoint((c0.x + (c1.x - c0.x) * t) * f, (c0.y + (c1.y - c0.y) * t) * f);
    }
  }

  const ringStart = (k) => (k === 0 ? 0 : 1 + 3 * k * (k - 1));
  const idx = [];
  for (let k = 1; k <= rings; k++) {
    const nOut = 6 * k;
    const nIn = 6 * (k - 1);
    for (let s = 0; s < 6; s++) {
      for (let j = 0; j < k; j++) {
        const o0 = ringStart(k) + ((s * k + j) % nOut);
        const o1 = ringStart(k) + ((s * k + j + 1) % nOut);
        const i0 = k === 1 ? 0 : ringStart(k - 1) + ((s * (k - 1) + j) % nIn);
        idx.push(o0, i0, o1);
        if (j < k - 1) {
          const i1 = ringStart(k - 1) + ((s * (k - 1) + j + 1) % nIn);
          idx.push(i0, i1, o1);
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Colours are evaluated after normals so colorFn can use slope (4th arg).
  const n = geo.attributes.normal;
  const col = new Float32Array(pos.length);
  const nv = new THREE.Vector3();
  for (let i = 0; i < pos.length / 3; i++) {
    nv.fromBufferAttribute(n, i);
    const c = colorFn(pos[i * 3], pos[i * 3 + 2], pos[i * 3 + 1], nv);
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// ---------------------------------------------------------------------------
// Tile body (sides): a cross-section of soil layers, like a diorama.
// ---------------------------------------------------------------------------
const sideTextureCache = new Map();

export function createStrataTexture({ top = '#3d5a22', layers } = {}) {
  const key = top + JSON.stringify(layers || '');
  if (sideTextureCache.has(key)) return sideTextureCache.get(key);

  const w = 512, h = 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const bands = layers || [
    { color: '#4a3424', size: 0.28 },
    { color: '#5e4330', size: 0.22 },
    { color: '#6f5844', size: 0.2 },
    { color: '#544032', size: 0.3 },
  ];
  // Wavy soil bands
  let y = h * 0.16;
  for (const b of bands) {
    const bh = b.size * h * 0.84;
    g.fillStyle = b.color;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.03 + y) * 2 + Math.sin(x * 0.11) * 1.2);
    g.lineTo(w, h); g.lineTo(0, h); g.closePath();
    g.fill();
    y += bh;
  }
  // Pebbles
  for (let i = 0; i < 260; i++) {
    const px = Math.random() * w, py = h * 0.2 + Math.random() * h * 0.8;
    const r = 0.6 + Math.random() * 2.2;
    const l = 70 + Math.random() * 70;
    g.fillStyle = `rgb(${l},${l * 0.9},${l * 0.8})`;
    g.beginPath(); g.ellipse(px, py, r * 1.3, r, Math.random() * 3, 0, Math.PI * 2); g.fill();
  }
  // Grain noise
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // Grass / top layer with hanging roots
  g.fillStyle = top;
  g.beginPath();
  g.moveTo(0, 0);
  for (let x = 0; x <= w; x += 3) g.lineTo(x, h * 0.13 + Math.random() * h * 0.06);
  g.lineTo(w, 0); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(40,28,18,0.6)';
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * w;
    g.beginPath(); g.moveTo(x, h * 0.15);
    g.quadraticCurveTo(x + Math.random() * 8 - 4, h * 0.25, x + Math.random() * 10 - 5, h * (0.25 + Math.random() * 0.2));
    g.lineWidth = 0.7; g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  tex.anisotropy = 8;
  sideTextureCache.set(key, tex);
  return tex;
}

export function createTileBody({ radius, thickness = TILE_THICKNESS, strata }) {
  const group = new THREE.Group();
  const sideGeo = new THREE.CylinderGeometry(radius, radius, thickness, 6, 1, true);
  sideGeo.translate(0, -thickness / 2, 0);
  const side = new THREE.Mesh(
    sideGeo,
    new THREE.MeshStandardMaterial({ map: createStrataTexture(strata), roughness: 1, flatShading: true })
  );
  side.castShadow = true;
  side.receiveShadow = true;
  group.add(side);

  // Bottom cap (only visible when looking from very low angles / gaps)
  const bottom = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 6).rotateX(Math.PI / 2).rotateY(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2a1f16, roughness: 1 })
  );
  bottom.position.y = -thickness;
  group.add(bottom);
  return group;
}

// Small tiling noise texture to break up flat vertex colours on terrain.
let detailTex = null;
export function getGroundDetailTexture() {
  if (detailTex) return detailTex;
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const img = g.createImageData(s, s);
  for (let i = 0; i < s * s; i++) {
    const v = 200 + Math.random() * 55;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // little blades / needles
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * s, y = Math.random() * s, a = Math.random() * Math.PI;
    const l = 2 + Math.random() * 4;
    const v = 150 + Math.random() * 105;
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  detailTex = new THREE.CanvasTexture(c);
  detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping;
  detailTex.repeat.set(3, 3);
  detailTex.colorSpace = THREE.SRGBColorSpace;
  return detailTex;
}
