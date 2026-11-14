// A small flock of sheep that graze, look around and wander.
// Rendered with three InstancedMeshes (bodies, heads, legs) whose matrices
// are rewritten every frame — cheap even with a whole board of pastures.

import * as THREE from 'three';
import {
  sheepBodyGeometry, sheepHeadGeometry, sheepLegGeometry, SHEEP_NECK, SHEEP_HIPS,
} from './props.js';

const _m = new THREE.Matrix4();
const _base = new THREE.Matrix4();
const _local = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

const _roll = new THREE.Quaternion();
const FWD = new THREE.Vector3(0, 0, 1);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * @param rand     seeded RNG
 * @param count    number of sheep
 * @param heightFn terrain height (tile-local)
 * @param isFree   (x, z, r) -> boolean, true if a sheep may stand there
 * @param spawn    {x, z} rough flock centre
 * @param material shared animal material
 */
export function createFlock({ rand, count, heightFn, isFree, spawn, material, scale = 0.045 }) {
  const group = new THREE.Group();
  group.name = 'flock';
  const bodies = new THREE.InstancedMesh(sheepBodyGeometry(), material, count);
  const heads = new THREE.InstancedMesh(sheepHeadGeometry(), material, count);
  const legs = new THREE.InstancedMesh(sheepLegGeometry(), material, count * 4);
  for (const m of [bodies, heads, legs]) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false; // instances move; bounding sphere would go stale
    group.add(m);
  }

  const R = scale * 0.6; // personal-space radius
  const sheep = [];
  for (let i = 0; i < count; i++) {
    let x = spawn.x, z = spawn.z;
    for (let t = 0; t < 60; t++) {
      const a = rand() * Math.PI * 2, d = rand() * 0.22;
      const cx = spawn.x + Math.cos(a) * d, cz = spawn.z + Math.sin(a) * d;
      if (isFree(cx, cz, R) && sheep.every((o) => Math.hypot(o.x - cx, o.z - cz) > R * 2)) { x = cx; z = cz; break; }
    }
    const black = rand() < 0.1;
    const wool = black ? new THREE.Color(0.16, 0.14, 0.13) : new THREE.Color().setRGB(0.92 + rand() * 0.08, 0.9 + rand() * 0.08, 0.85 + rand() * 0.1);
    bodies.setColorAt(i, wool);
    heads.setColorAt(i, black ? new THREE.Color(0.35, 0.33, 0.32) : new THREE.Color(1, 1, 1));
    const s = scale * (0.8 + rand() * 0.3); // a few lambs-ish smaller ones
    sheep.push({
      x, z, heading: rand() * Math.PI * 2, s,
      mode: 'graze', timer: 1 + rand() * 6,
      tx: x, tz: z,
      speed: 0.022 + rand() * 0.01,
      moving: 0, phase: rand() * 10,
      pitch: 1.0, targetPitch: 1.0, yaw: 0, targetYaw: 0, chew: rand() * 10,
    });
  }
  for (const m of [bodies, heads]) m.instanceColor.needsUpdate = true;

  const flockCentre = () => {
    let x = 0, z = 0;
    for (const s of sheep) { x += s.x; z += s.z; }
    return { x: x / sheep.length, z: z / sheep.length };
  };

  function pickTarget(sh) {
    const c = flockCentre();
    for (let t = 0; t < 20; t++) {
      // mostly short hops, biased toward the flock (sheep stay together)
      const a = rand() * Math.PI * 2, d = 0.04 + rand() * 0.16;
      const bx = sh.x + (c.x - sh.x) * 0.35 + Math.cos(a) * d;
      const bz = sh.z + (c.z - sh.z) * 0.35 + Math.sin(a) * d;
      if (isFree(bx, bz, R)) { sh.tx = bx; sh.tz = bz; return true; }
    }
    return false;
  }

  function step(dt) {
    for (const sh of sheep) {
      // sick sheep topple over and lie still; healthy ones get back up
      sh.fall = sh.sick ? Math.min(1, (sh.fall || 0) + dt * 1.2) : Math.max(0, (sh.fall || 0) - dt * 0.8); // <0 = waiting to fall
      if (sh.sick || sh.fall > 0) { sh.moving = 0; continue; }
      sh.timer -= dt;
      if (sh.mode === 'graze') {
        sh.targetPitch = 1.05;
        sh.targetYaw = Math.sin(sh.chew * 0.3) * 0.2;
        if (sh.timer < 0) {
          if (rand() < 0.65 && pickTarget(sh)) { sh.mode = 'walk'; sh.timer = 12; }
          else { sh.mode = 'look'; sh.timer = 1.5 + rand() * 2.5; sh.targetYaw = (rand() - 0.5) * 1.4; }
        }
      } else if (sh.mode === 'look') {
        sh.targetPitch = -0.1;
        if (sh.timer < 0) { sh.mode = 'graze'; sh.timer = 3 + rand() * 7; }
      } else if (sh.mode === 'walk') {
        sh.targetPitch = 0.2;
        sh.targetYaw = 0;
        const dx = sh.tx - sh.x, dz = sh.tz - sh.z;
        const dist = Math.hypot(dx, dz);
        const want = Math.atan2(dx, dz);
        const diff = wrapAngle(want - sh.heading);
        sh.heading += THREE.MathUtils.clamp(diff, -2.2 * dt, 2.2 * dt);
        if (dist < 0.01 || sh.timer < 0) {
          sh.mode = 'graze'; sh.timer = 3 + rand() * 8;
        } else if (Math.abs(diff) < 1.0) {
          const v = sh.speed * Math.min(1, dist / 0.03 + 0.3);
          const nx = sh.x + Math.sin(sh.heading) * v * dt;
          const nz = sh.z + Math.cos(sh.heading) * v * dt;
          if (isFree(nx, nz, R)) { sh.x = nx; sh.z = nz; sh.moving = v; }
          else if (!pickTarget(sh)) { sh.mode = 'graze'; sh.timer = 2; }
        }
      }
      if (sh.mode !== 'walk') sh.moving *= Math.max(0, 1 - dt * 6);

      // gentle separation so they don't overlap
      for (const o of sheep) {
        if (o === sh) continue;
        const dx = sh.x - o.x, dz = sh.z - o.z;
        const d = Math.hypot(dx, dz);
        const minD = (sh.s + o.s) * 0.62;
        if (d > 1e-5 && d < minD) {
          const push = (minD - d) * 0.5;
          const nx = sh.x + (dx / d) * push, nz = sh.z + (dz / d) * push;
          if (isFree(nx, nz, R * 0.8)) { sh.x = nx; sh.z = nz; }
        }
      }

      const k = 1 - Math.exp(-dt * 4);
      sh.pitch += (sh.targetPitch - sh.pitch) * k;
      sh.yaw += (sh.targetYaw - sh.yaw) * k;
      sh.phase += sh.moving / sh.s * dt * 2.4; // stride rate scales with speed
      sh.chew += dt * 6;
    }
  }

  function writeMatrices() {
    sheep.forEach((sh, i) => {
      const bob = Math.abs(Math.sin(sh.phase)) * 0.025 * Math.min(1, sh.moving * 60);
      _p.set(sh.x, heightFn(sh.x, sh.z) - sh.s * 0.02 + bob * sh.s, sh.z);
      _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, sh.heading);
      const fall = sh.fall || 0;
      if (fall > 0) { // roll onto the side (ease-in like a topple)
        const f = fall * fall * (3 - 2 * fall);
        _q.multiply(_roll.setFromAxisAngle(FWD, f * 1.5 * (sh.side || 1)));
        _p.y -= f * sh.s * 0.22;
      }
      _s.setScalar(sh.s);
      _base.compose(_p, _q, _s);
      bodies.setMatrixAt(i, _base);

      // head: rotate about the neck (graze = head down; plus a little chewing nod)
      const nod = sh.mode === 'graze' ? Math.sin(sh.chew) * 0.04 : 0;
      _e.set(sh.pitch + nod, sh.yaw, 0, 'YXZ');
      _local.compose(SHEEP_NECK, _q.setFromEuler(_e), _s.setScalar(1));
      heads.setMatrixAt(i, _m.multiplyMatrices(_base, _local));

      // legs: diagonal pairs swing together
      const amp = Math.min(0.5, sh.moving * 25);
      SHEEP_HIPS.forEach((hip, j) => {
        const diag = j === 0 || j === 3 ? 0 : Math.PI;
        _e.set(Math.sin(sh.phase + diag) * amp, 0, 0);
        _local.compose(hip, _q.setFromEuler(_e), _s.setScalar(1));
        legs.setMatrixAt(i * 4 + j, _m.multiplyMatrices(_base, _local));
      });
    });
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    legs.instanceMatrix.needsUpdate = true;
  }

  writeMatrices();
  return {
    group,
    sheep,
    update(dt) {
      step(Math.min(dt, 0.05));
      writeMatrices();
    },
    /** Disease: a share of the flock falls over (staggered); null heals them. */
    setSick(fraction) {
      sheep.forEach((sh, i) => {
        const sick = fraction > 0 && (i / sheep.length) < fraction + 0.01;
        if (sick && !sh.sick) { sh.side = Math.random() < 0.5 ? -1 : 1; sh.fall = -Math.random() * 2; } // negative = delay
        sh.sick = sick;
      });
    },
  };
}
