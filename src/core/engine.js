// Rendering engine: renderer, scene, lights, quality presets, table, camera
// rig, the board group with its tiles, and the animation loop. Both the
// game and the tile workshop build on top of this.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CameraRig } from './cameraRig.js';
import { createTable } from './table.js';
import { mulberry32 } from './noise.js';
import { createTile } from '../tiles/tileFactory.js';
import { TILE_THICKNESS } from '../tiles/hexGeometry.js';
import { windUniforms } from '../tiles/wind.js';
import { waterUniforms, setWaterQuality } from '../tiles/water.js';
import { axialToWorld } from '../board/layout.js';
import { updateShips } from '../pieces/ship.js';

// ---------- Renderer / scene ------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // refreshed every N frames (see QUALITY)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const bg = new THREE.Color('#1a130d');
scene.background = bg;
scene.fog = new THREE.Fog(bg, 22, 45);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

// ---------- Lights ----------------------------------------------------------
scene.add(new THREE.HemisphereLight('#dfe9ff', '#4a3826', 0.45));
const sun = new THREE.DirectionalLight('#fff0d8', 3.2);
sun.position.set(6, 11, 4);
sun.castShadow = true;
const sc = sun.shadow.camera;
sc.left = sc.bottom = -7; sc.right = sc.top = 7; sc.near = 1; sc.far = 30;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.015;
scene.add(sun, sun.target);
const SUN_OFFSET = new THREE.Vector3(6, 11, 4);
const sunAt = new THREE.Vector3();
/** Keep the shadow camera centred on what the camera is looking at (big multi-island maps). */
function followSun(focus) {
  if (sunAt.distanceToSquared(focus) < 0.04) return;
  sunAt.set(focus.x, 0, focus.z);
  sun.target.position.copy(sunAt);
  sun.position.copy(sunAt).add(SUN_OFFSET);
  renderer.shadowMap.needsUpdate = true;
}
/** Distance fog of the scene: start / end (the background colour hides the table edge). */
function setDepthFog(near, far) { scene.fog.near = near; scene.fog.far = far; }

// ---------- Quality presets ---------------------------------------------------
// Shadows are the most expensive part of a frame; they are redrawn only every
// `shadowEvery` frames and the shadow camera is fitted to the current board.
export const QUALITY = {
  high: { pixelRatio: 2, shadowMap: 4096, shadowEvery: 1 },
  balanced: { pixelRatio: 1.5, shadowMap: 2048, shadowEvery: 2 },
  fast: { pixelRatio: 1, shadowMap: 1024, shadowEvery: 4 },
};
let quality = 'balanced';
try { quality = localStorage.getItem('sotw-quality') || quality; } catch { /* storage unavailable */ }
if (!QUALITY[quality]) quality = 'balanced';
function applyQuality(name) {
  quality = name;
  const q = QUALITY[name];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (sun.shadow.mapSize.x !== q.shadowMap) {
    sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  renderer.shadowMap.needsUpdate = true;
  setWaterQuality(name); // Fast: coarser sea, simpler shading
  try { localStorage.setItem('sotw-quality', name); } catch { /* ignore */ }
}
function fitShadowCamera(extent) {
  sc.left = sc.bottom = -extent; sc.right = sc.top = extent;
  sc.updateProjectionMatrix();
  renderer.shadowMap.needsUpdate = true;
}
applyQuality(quality);

// ---------- Table & camera ------------------------------------------------------
scene.add(createTable());
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 100);
const rig = new CameraRig(camera, canvas, {
  target: new THREE.Vector3(0, TILE_THICKNESS, 0),
  minDist: 1.6, maxDist: 6, azimuth: 0.4, zoom: 0.5,
  minElevDeg: 30, maxElevDeg: 84, // zoomed out = nearly top-down
});

// ---------- Board ---------------------------------------------------------------
const board = new THREE.Group();
board.position.y = TILE_THICKNESS; // tiles rest on the table
scene.add(board);
let tiles = [];

// axial neighbour offsets, indexed by edge k (edge normal at 60°·k)
const NEIGHBOURS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

/** Free everything on the board (tiles dispose their own terrain; pieces their geometry). */
function clearBoard() {
  for (const t of tiles) t.dispose?.();
  for (const c of board.children) {
    if (c.userData.isTile) continue;
    c.traverse((o) => { if ((o.isMesh || o.isLineSegments) && !o.geometry.userData.shared) o.geometry.dispose(); });
  }
  board.clear();
  tiles = [];
}

/**
 * Build tiles for `cells` ([{q, r, type}]). Land tiles get a seeded random
 * orientation; sea tiles stay aligned and learn which edges touch land (surf).
 */
function buildMap(cells, { seed = 1 } = {}) {
  clearBoard();
  const rand = mulberry32(seed * 7 + 3);
  const byKey = new Map(cells.map((c) => [`${c.q},${c.r}`, c]));
  cells.forEach((cell, i) => {
    const opts = { seed: seed * 1000 + i };
    if (cell.type === 'water') {
      opts.landEdges = NEIGHBOURS.map(([dq, dr]) => {
        const n = byKey.get(`${cell.q + dq},${cell.r + dr}`);
        return !!n && n.type !== 'water';
      });
    }
    const tile = createTile(cell.type, opts);
    const { x, z } = axialToWorld(cell.q, cell.r);
    tile.group.position.set(x, 0, z);
    const turn = Math.floor(rand() * 6);
    if (cell.type !== 'water') tile.group.rotation.y = (turn * Math.PI) / 3;
    tile.group.userData.isTile = true;
    board.add(tile.group);
    tiles.push(tile);
  });
  return tiles;
}

// ---------- Loop ------------------------------------------------------------------
const updaters = new Set();
/** Draw fewer grass tufts / flowers / wheat stalks on tiles far from the camera. */
function applyLod(tile, d) {
  tile.lodMeshes ??= tile.group.children.filter((o) => o.userData.lod);
  if (!tile.lodMeshes.length) return;
  const k = Math.min(1, Math.max(0, (d - 5) / 12)) ;
  const step = Math.round(k * 10) + (quality === 'fast' ? 20 : 0);
  if (tile.lodStep === step) return;
  tile.lodStep = step;
  const fast = quality === 'fast' ? 0.6 : 1;
  for (const m of tile.lodMeshes) {
    const { kind, full } = m.userData.lod;
    const frac = (kind === 'fine' ? 1 - 0.85 * k : 1 - 0.6 * k) * fast;
    m.count = Math.max(1, Math.round(full * frac));
  }
}
const frustum = new THREE.Frustum(), projScreen = new THREE.Matrix4(), tileSphere = new THREE.Sphere(new THREE.Vector3(), 1.3);
const clock = new THREE.Clock();
let frame = 0;
let paused = false; // e.g. while the start menu (static backdrop) covers the screen
renderer.setAnimationLoop(() => {
  if (paused) { clock.getDelta(); return; }
  if (frame++ % QUALITY[quality].shadowEvery === 0) renderer.shadowMap.needsUpdate = true;
  const dt = Math.min(clock.getDelta(), 0.1);
  windUniforms.uTime.value = clock.elapsedTime;
  rig.update(dt);
  if (rig._focus) followSun(rig._focus);
  waterUniforms.uTime.value = clock.elapsedTime;
  // animate (sheep, hawks…) only tiles that are shown and inside the view
  camera.updateMatrixWorld();
  projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projScreen);
  for (const t of tiles) {
    if (!t.group.visible) continue;
    tileSphere.center.set(t.group.position.x, board.position.y + 0.2, t.group.position.z);
    if (!frustum.intersectsSphere(tileSphere)) continue;
    t.update(clock.elapsedTime, dt);
    applyLod(t, camera.position.distanceTo(tileSphere.center));
  }
  updateShips(clock.elapsedTime);
  for (const fn of updaters) fn(clock.elapsedTime, dt);
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

export const engine = {
  THREE, renderer, scene, camera, rig, board, sun, canvas, windUniforms,
  get tiles() { return tiles; },
  get quality() { return quality; },
  applyQuality, fitShadowCamera, buildMap, clearBoard, setDepthFog,
  get paused() { return paused; },
  set paused(v) { paused = !!v; if (!v) renderer.shadowMap.needsUpdate = true; },
  onUpdate(fn) { updaters.add(fn); return () => updaters.delete(fn); },
};
