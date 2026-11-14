// Floating number tokens: round "wooden" discs (Catan style) that hover above
// each land tile, always facing the camera, gently bobbing. 6 and 8 are red;
// dots under the number show how likely the roll is.

import * as THREE from 'three';
import { axialToWorld } from '../board/layout.js';
import { pipCount } from './mapgen.js';

const texCache = new Map();
function tokenTexture(n) {
  if (texCache.has(n)) return texCache.get(n);
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const R = S * 0.46;
  // soft drop shadow, wooden rim, cream face
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.arc(S / 2 + 4, S / 2 + 7, R, 0, Math.PI * 2); g.fill();
  const rim = g.createRadialGradient(S / 2, S / 2, R * 0.7, S / 2, S / 2, R);
  rim.addColorStop(0, '#c99a62'); rim.addColorStop(1, '#8a5f34');
  g.fillStyle = rim;
  g.beginPath(); g.arc(S / 2, S / 2, R, 0, Math.PI * 2); g.fill();
  const face = g.createRadialGradient(S / 2 - 20, S / 2 - 25, 10, S / 2, S / 2, R * 0.86);
  face.addColorStop(0, '#fffdf4'); face.addColorStop(1, '#f1e2c4');
  g.fillStyle = face;
  g.beginPath(); g.arc(S / 2, S / 2, R * 0.86, 0, Math.PI * 2); g.fill();
  const hot = n >= 6 && n <= 8;
  const col = hot ? '#c8372d' : '#4a3628';
  g.fillStyle = col;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${n >= 10 ? 104 : 118}px Fredoka, "Trebuchet MS", system-ui, sans-serif`;
  g.fillText(String(n), S / 2, S / 2 - 12);
  // probability dots
  const pips = pipCount(n), gap = 19;
  for (let i = 0; i < pips; i++) {
    g.beginPath();
    g.arc(S / 2 + (i - (pips - 1) / 2) * gap, S / 2 + 62, 7, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(n, t);
  return t;
}

// Robber token for the one land tile without a number (the "desert slot")
let robberTex = null;
function robberTexture() {
  if (robberTex) return robberTex;
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const R = S * 0.46;
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.arc(S / 2 + 4, S / 2 + 7, R, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#6b5a4c';
  g.beginPath(); g.arc(S / 2, S / 2, R, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#4a3f37';
  g.beginPath(); g.arc(S / 2, S / 2, R * 0.86, 0, Math.PI * 2); g.fill();
  // hooded robber silhouette
  g.fillStyle = '#1f1a17';
  g.beginPath();
  g.moveTo(S / 2, S * 0.2);
  g.bezierCurveTo(S * 0.66, S * 0.2, S * 0.68, S * 0.42, S * 0.62, S * 0.5);
  g.bezierCurveTo(S * 0.72, S * 0.6, S * 0.74, S * 0.76, S * 0.72, S * 0.8);
  g.lineTo(S * 0.28, S * 0.8);
  g.bezierCurveTo(S * 0.26, S * 0.76, S * 0.28, S * 0.6, S * 0.38, S * 0.5);
  g.bezierCurveTo(S * 0.32, S * 0.42, S * 0.34, S * 0.2, S / 2, S * 0.2);
  g.fill();
  g.fillStyle = '#f2d36b'; // glinting eyes
  g.beginPath(); g.arc(S * 0.46, S * 0.38, 6, 0, Math.PI * 2); g.arc(S * 0.54, S * 0.38, 6, 0, Math.PI * 2); g.fill();
  robberTex = new THREE.CanvasTexture(c);
  robberTex.colorSpace = THREE.SRGBColorSpace;
  return robberTex;
}

// Weather badge: small round icon + rounds left, shown above a struck tile's token
const badgeCache = new Map();
function badgeTexture(kind, rounds) {
  const key = `${kind}-${rounds}`;
  if (badgeCache.has(key)) return badgeCache.get(key);
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const bg = { storm: '#3c4250', rain: '#4f6d8a', fire: '#c2451d', disease: '#6b7f2a', quake: '#7a4a2a' }[kind];
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(S / 2 + 2, S / 2 + 4, 52, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(S / 2, S / 2, 52, 0, Math.PI * 2); g.fill();
  g.fillStyle = bg; g.beginPath(); g.arc(S / 2, S / 2, 46, 0, Math.PI * 2); g.fill();
  g.save(); g.translate(S / 2, S / 2 - 8);
  const cloud = (col) => { g.fillStyle = col; [[-14, 2, 13], [0, -6, 16], [15, 2, 12], [0, 6, 14]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }); };
  if (kind === 'storm') { // blizzard: cloud, snowflakes and a small bolt
    g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.lineCap = 'round';
    for (const [fx, fy] of [[-16, 26], [16, 28]]) for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; g.beginPath(); g.moveTo(fx - Math.cos(a) * 7, fy - Math.sin(a) * 7); g.lineTo(fx + Math.cos(a) * 7, fy + Math.sin(a) * 7); g.stroke(); }
    cloud('#d7dbe3'); g.fillStyle = '#ffd84a'; g.beginPath(); g.moveTo(2, 8); g.lineTo(-8, 26); g.lineTo(0, 24); g.lineTo(-4, 38); g.lineTo(10, 18); g.lineTo(2, 20); g.closePath(); g.fill(); }
  if (kind === 'rain') { cloud('#e8eef4'); g.strokeStyle = '#bfe0ff'; g.lineWidth = 4; g.lineCap = 'round'; [-12, 0, 12].forEach((x) => { g.beginPath(); g.moveTo(x, 20); g.lineTo(x - 4, 32); g.stroke(); }); }
  if (kind === 'fire') { g.fillStyle = '#ffd04a'; g.beginPath(); g.moveTo(0, -22); g.bezierCurveTo(18, -4, 20, 14, 0, 28); g.bezierCurveTo(-20, 14, -16, -2, -6, -8); g.bezierCurveTo(-4, 0, 0, 2, 0, -22); g.fill();
    g.fillStyle = '#fff3c2'; g.beginPath(); g.moveTo(0, 2); g.bezierCurveTo(9, 10, 8, 20, 0, 26); g.bezierCurveTo(-8, 20, -8, 12, 0, 2); g.fill(); }
  if (kind === 'disease') { g.fillStyle = '#f4f1e8'; [[-8, 4, 11], [6, 0, 12], [12, 10, 9], [-2, 12, 10]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = '#2b2622'; g.beginPath(); g.ellipse(-20, 8, 7, 8, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2b2622'; g.lineWidth = 3; g.beginPath(); g.moveTo(-24, 5); g.lineTo(-17, 11); g.moveTo(-17, 5); g.lineTo(-24, 11); g.stroke(); }
  if (kind === 'quake') { g.strokeStyle = '#ffe2b8'; g.lineWidth = 6; g.lineJoin = 'round'; g.beginPath(); g.moveTo(-6, -26); g.lineTo(6, -10); g.lineTo(-8, 2); g.lineTo(8, 14); g.lineTo(-2, 30); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(-8, 2); g.lineTo(-22, 8); g.moveTo(6, -10); g.lineTo(20, -14); g.stroke(); }
  g.restore();
  // rounds-left bubble
  g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(S - 26, S - 26, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#4a3628'; g.font = '700 30px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(rounds), S - 26, S - 24);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  badgeCache.set(key, t);
  return t;
}

const matCache = new Map();
const tokenMaterial = (n) => {
  if (!matCache.has(n)) matCache.set(n, new THREE.SpriteMaterial({ map: n == null ? robberTexture() : tokenTexture(n), transparent: true, depthWrite: false, fog: false }));
  return matCache.get(n);
};
// golden "lit" version of a token for the roll highlight
const glowCache = new Map();
function glowMaterial(n) {
  if (!glowCache.has(n)) {
    const m = tokenMaterial(n).clone();
    m.color = new THREE.Color(1.25, 1.1, 0.6);
    glowCache.set(n, m);
  }
  return glowCache.get(n);
}
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
const shadowGeo = new THREE.CircleGeometry(0.13, 24).rotateX(-Math.PI / 2);
shadowGeo.userData.shared = true;

const _ray = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);

/** Height of the terrain (board space) around the tile centre, sampled with a few rays. */
function groundHeight(tile, x, z) {
  tile.group.updateMatrixWorld(true);
  const meshes = [];
  tile.group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) meshes.push(o); });
  let top = 0, centre = 0;
  for (const [dx, dz] of [[0, 0], [0.18, 0], [-0.18, 0], [0, 0.18], [0, -0.18]]) {
    _ray.set(new THREE.Vector3(x + dx, 5, z + dz), DOWN);
    const hit = _ray.intersectObjects(meshes, false)[0];
    const y = hit ? hit.point.y : 0;
    top = Math.max(top, y);
    if (dx === 0 && dz === 0) centre = y;
  }
  return { top, centre };
}

/**
 * Add tokens for every land cell with a number. Returns { group, update(t) }.
 * Heights are in world space; the group is added to the scene (not the board)
 * so the board's tile-clearing never touches it.
 */
export function createTokens(scene, cells, tiles, { zoom = () => 1 } = {}) {
  const group = new THREE.Group();
  group.name = 'tokens';
  const items = [];
  cells.forEach((c, i) => {
    if (c.type === 'water') return; // number == null -> robber token (no production)
    const { x, z } = axialToWorld(c.q, c.r);
    const { top, centre } = groundHeight(tiles[i], x, z);
    const sprite = new THREE.Sprite(tokenMaterial(c.number));
    const base = Math.max(top + 0.22, 0.55); // float clear of trees & peaks
    sprite.position.set(x, base, z);
    sprite.scale.setScalar(0.44);
    sprite.renderOrder = 5;
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.set(x, centre + 0.004, z);
    shadow.renderOrder = 4;
    group.add(sprite, shadow);
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }));
    badge.scale.setScalar(0.24);
    badge.visible = false;
    badge.renderOrder = 6;
    group.add(badge);
    items.push({ sprite, base, phase: i * 1.7, shadow, number: c.number, flash: -10, ci: i, badge });
  });
  scene.add(group);
  let clock = 0;
  return {
    group,
    /** Show weather badges: weather = Map(cellIndex -> { kind, turnsLeft }). */
    setWeather(weather, players) {
      for (const it of items) {
        const w = weather.get(it.ci);
        it.badge.visible = !!w;
        if (w) it.badge.material.map = badgeTexture(w.kind, Math.ceil(w.turnsLeft / players));
        it.badge.material.needsUpdate = true;
      }
    },
    /** Make every token showing `n` jump and glow for a moment (dice result). */
    flash(n) { for (const it of items) if (it.number === n) it.flash = clock; },
    /** Hide tokens of cells still under the fog of war. */
    setRevealed(revealed) {
      for (const it of items) { const v = revealed.has(it.ci); it.sprite.visible = it.shadow.visible = v; it.hidden = !v; }
    },
    setVisible(v) { group.visible = v; },
    update(t) {
      clock = t;
      // fade with zoom: fully opaque when zoomed out, see-through up close so
      // towns and castles behind a token stay visible
      const z = zoom();
      const op = z >= 0.45 ? 1 : 0.1 + 0.9 * (z / 0.45) ** 1.3;
      for (const m of matCache.values()) m.opacity = op;
      for (const m of glowCache.values()) m.opacity = Math.min(1, op + 0.3);
      shadowMat.opacity = 0.22 * op;
      for (const it of items) {
        if (it.hidden) continue;
        let f = t - it.flash; // seconds since flashed
        if (f < 0) f = 99;
        const hop = f < 2.2 ? Math.sin(Math.min(f, 0.6) / 0.6 * Math.PI) * 0.12 + Math.max(0, 1 - f / 2.2) * 0.05 : 0;
        const big = f < 2.2 ? 1 + 0.35 * Math.max(0, 1 - f / 2.2) : 1;
        it.sprite.scale.setScalar(0.44 * big);
        it.sprite.material = f < 2.2 && Math.floor(f * 6) % 2 === 0 ? glowMaterial(it.number) : tokenMaterial(it.number);
        it.sprite.position.y = it.base + hop + Math.sin(t * 1.2 + it.phase) * 0.018;
        if (it.badge.visible) { it.badge.position.set(it.sprite.position.x + 0.17, it.sprite.position.y + 0.15, it.sprite.position.z); it.badge.material.opacity = Math.max(0.7, op); }
        const s = 1 - (it.sprite.position.y - it.base) * 2;
        it.shadow.scale.setScalar(s);
      }
    },
    dispose() { scene.remove(group); },
  };
}
