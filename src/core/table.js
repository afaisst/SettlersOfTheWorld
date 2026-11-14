// Procedural wooden table (oak planks). Placeholder until we make it fancier.
import * as THREE from 'three';
import { mulberry32, createNoise2D } from './noise.js';

function makeWoodCanvases(size = 1024, planks = 6, seed = 42) {
  const rand = mulberry32(seed);
  const noise = createNoise2D(rand);
  const color = document.createElement('canvas');
  const bump = document.createElement('canvas');
  color.width = color.height = bump.width = bump.height = size;
  const cg = color.getContext('2d');
  const bg = bump.getContext('2d');
  const cImg = cg.createImageData(size, size);
  const bImg = bg.createImageData(size, size);

  const pw = size / planks;
  const plankTone = Array.from({ length: planks }, () => 0.82 + rand() * 0.3);
  const plankOffset = Array.from({ length: planks }, () => rand() * 1000);
  // end joints (butt seams) at a random height per plank
  const joint = Array.from({ length: planks }, () => rand() * size);
  const knots = Array.from({ length: 7 }, () => ({ x: rand() * size, y: rand() * size, r: 6 + rand() * 14 }));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = Math.floor(x / pw);
      const lx = x - p * pw;
      const off = plankOffset[p];
      const yy = (y + (y > joint[p] ? 377 : 0));
      // distort grain lines with low-freq noise, plus knot swirl
      let warp = noise((lx + off) * 0.01, yy * 0.0025) * 30 + noise(lx * 0.03, yy * 0.01) * 6;
      for (const k of knots) {
        const dx = x - k.x, dy = (y - k.y) * 0.5;
        const d2 = dx * dx + dy * dy;
        warp += (k.r * k.r * 18) / (d2 + k.r * k.r) * Math.sign(dx || 1) * 0.6;
      }
      const g = lx + warp + off;
      const rings = Math.sin(g * 0.35) * 0.5 + 0.5;
      const fine = noise(x * 0.5, y * 0.02) * 0.5 + 0.5;
      let tone = plankTone[p] * (0.78 + rings * 0.14 + fine * 0.12);
      let seam = 1;
      if (lx < 1.5 || lx > pw - 1.5) seam = 0.35;
      if (Math.abs(y - joint[p]) < 1.2) seam = 0.45;
      tone *= seam;
      // warm oak / walnut-ish palette
      const i = (y * size + x) * 4;
      cImg.data[i] = Math.min(255, 118 * tone + 12);
      cImg.data[i + 1] = Math.min(255, 80 * tone + 9);
      cImg.data[i + 2] = Math.min(255, 52 * tone + 7);
      cImg.data[i + 3] = 255;
      const b = 255 * (0.5 + rings * 0.25 + fine * 0.1) * seam;
      bImg.data[i] = bImg.data[i + 1] = bImg.data[i + 2] = b;
      bImg.data[i + 3] = 255;
    }
  }
  cg.putImageData(cImg, 0, 0);
  bg.putImageData(bImg, 0, 0);
  return { color, bump };
}

export function createTable({ size = 60, repeat = 5 } = {}) {
  const { color, bump } = makeWoodCanvases();
  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bump);
  for (const t of [map, bumpMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 16;
  }
  const mat = new THREE.MeshStandardMaterial({
    map, bumpMap, bumpScale: 0.25, roughness: 0.55, metalness: 0.0,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = Math.PI / 2 * 0.12; // planks slightly off-axis to the board
  mesh.receiveShadow = true;
  mesh.name = 'table';
  return mesh;
}
