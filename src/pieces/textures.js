// Procedural canvas textures for the medieval player pieces.
import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';

const cache = new Map();

function canvasTex(key, w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h, mulberry32(key.length * 7919 + 13));
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

const shade = (base, f) => `rgb(${Math.min(255, base[0] * f) | 0},${Math.min(255, base[1] * f) | 0},${Math.min(255, base[2] * f) | 0})`;

// Rounded cobbles in loose rows, dark joints. Also returns a matching bump map.
function drawCobbles(g, w, h, rand, bump = false) {
  g.fillStyle = bump ? '#202020' : '#3a352f';
  g.fillRect(0, 0, w, h);
  const rows = 8, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = (r % 2) * rh * 0.5 - rh;
    while (x < w + rh) {
      const cw = rh * (0.7 + rand() * 0.6);
      const cx = x + cw / 2, cy = r * rh + rh / 2 + (rand() - 0.5) * rh * 0.15;
      const v = rand(), warm = rand() * 12;
      const base = [112 + v * 45 + warm, 106 + v * 42 + warm * 0.5, 96 + v * 38];
      const grad = g.createRadialGradient(cx - cw * 0.15, cy - rh * 0.15, 1, cx, cy, cw * 0.6);
      if (bump) { grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#606060'); }
      else { grad.addColorStop(0, shade(base, 1.2)); grad.addColorStop(1, shade(base, 0.75)); }
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(cx, cy, cw * 0.44, rh * 0.42, (rand() - 0.5) * 0.3, 0, Math.PI * 2);
      g.fill();
      x += cw;
    }
  }
}
export const cobbleTexture = () => canvasTex('cobble', 512, 256, (g, w, h, r) => drawCobbles(g, w, h, r));
export const cobbleBump = () => canvasTex('cobble-bump', 512, 256, (g, w, h, r) => drawCobbles(g, w, h, r, true), { srgb: false });

// Half-timbered wall: cream plaster with dark oak frame (posts, rails, braces).
export const timberTexture = () => canvasTex('timber', 256, 256, (g, w, h, rand) => {
  g.fillStyle = '#e4dccb';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1800; i++) {
    const v = 200 + rand() * 45;
    g.fillStyle = `rgba(${v},${v - 8},${v - 22},0.35)`;
    g.fillRect(rand() * w, rand() * h, 2, 2);
  }
  g.strokeStyle = '#3b2a1c';
  g.lineCap = 'square';
  const beam = (x1, y1, x2, y2, lw = 14) => { g.lineWidth = lw; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  beam(0, 7, w, 7); beam(0, h - 7, w, h - 7); beam(0, h * 0.5, w, h * 0.5, 11);   // sill, plate, mid rail
  beam(7, 0, 7, h); beam(w - 7, 0, w - 7, h); beam(w * 0.5, 0, w * 0.5, h, 11);  // posts
  beam(7, h * 0.5, w * 0.5, 7, 9); beam(w - 7, h * 0.5, w * 0.5, 7, 9);          // braces
});

// Roof tiles (greyscale, tinted by the material colour = player colour).
export const roofTexture = () => canvasTex('roof', 256, 256, (g, w, h, rand) => {
  g.fillStyle = '#7a7a7a';
  g.fillRect(0, 0, w, h);
  const rows = 10, rh = h / rows, tw = w / 8;
  for (let r = 0; r < rows; r++) {
    for (let c = -1; c < 9; c++) {
      const x = c * tw + (r % 2) * tw * 0.5, y = r * rh;
      const v = 175 + rand() * 60;
      const grad = g.createLinearGradient(0, y, 0, y + rh);
      grad.addColorStop(0, `rgb(${v * 0.75},${v * 0.75},${v * 0.75})`);
      grad.addColorStop(1, `rgb(${v},${v},${v})`);
      g.fillStyle = grad;
      g.beginPath();
      g.roundRect(x + 1, y + 1, tw - 2, rh - 1, [0, 0, 6, 6]);
      g.fill();
    }
  }
});

// Ashlar masonry for castles (light limestone, staggered courses).
export const stoneTexture = () => canvasTex('ashlar', 256, 256, (g, w, h, rand) => {
  g.fillStyle = '#6f6a60';
  g.fillRect(0, 0, w, h);
  const rows = 8, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = (r % 2) * -20;
    while (x < w) {
      const bw = 34 + rand() * 30;
      const v = 150 + rand() * 50;
      g.fillStyle = `rgb(${v},${v * 0.96},${v * 0.88})`;
      g.fillRect(x + 1.5, r * rh + 1.5, bw - 3, rh - 3);
      for (let i = 0; i < 10; i++) {
        g.fillStyle = `rgba(80,75,65,${rand() * 0.25})`;
        g.fillRect(x + rand() * bw, r * rh + rand() * rh, 3, 3);
      }
      x += bw;
    }
  }
});

// Weathered vertical planks / logs for palisades and doors.
export const woodTexture = () => canvasTex('wood', 128, 128, (g, w, h, rand) => {
  g.fillStyle = '#5a4130';
  g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 2) {
    const v = 0.8 + rand() * 0.4;
    g.fillStyle = shade([110, 82, 58], v);
    g.fillRect(x, 0, 2, h);
  }
});
