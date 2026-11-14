// Weather effects over a tile (world space, added to the scene).
//   storm   — mountains: BLIZZARD — storm clouds, driving snow, lightning flashes + a one-off
//             rockslide (rocks tumbling down the slopes in a dust cloud)
//   rain    — fields: heavy grey clouds and dense rain
//   fire    — forest: flames and rising smoke (trees are charred by the tile)
//   disease — pasture: sickly greenish haze (sheep fall over in the tile)
//   quake   — hills: the tile shakes (main shock + aftershocks), dust bursts, ground cracks
// Every effect: createWeatherFX(kind, centre, sampleHeight) -> { group, update(t, dt), dispose() }

import * as THREE from 'three';
import { windUniforms } from '../tiles/wind.js';

// ---------- shared textures ----------
const texCache = {};
function softDot(key, inner, outer) {
  return (texCache[key] ??= (() => {
    const S = 64, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })());
}
function cloudTexture() {
  return (texCache.cloud ??= (() => {
    const S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    for (let i = 0; i < 14; i++) { // lumpy cloud from overlapping soft blobs
      const x = S * (0.25 + Math.random() * 0.5), y = S * (0.35 + Math.random() * 0.3), r = S * (0.14 + Math.random() * 0.14);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })());
}

function flameTexture() {
  return (texCache.flame2 ??= (() => {
    const S = 64, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    // teardrop flame tongue, bright at the base
    const gr = g.createRadialGradient(S / 2, S * 0.68, 2, S / 2, S * 0.6, S * 0.42);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(S / 2, S * 0.05);
    g.bezierCurveTo(S * 0.78, S * 0.42, S * 0.86, S * 0.7, S / 2, S * 0.95);
    g.bezierCurveTo(S * 0.14, S * 0.7, S * 0.22, S * 0.42, S / 2, S * 0.05);
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })());
}

// ---------- particle helper (THREE.Points with per-particle life) ----------
function particles({ count, size, texture, color, blending = THREE.NormalBlending, opacity = 1 }) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  const mat = new THREE.PointsMaterial({
    size, map: texture, vertexColors: true, transparent: true, opacity, depthWrite: false, blending,
    color: color ?? 0xffffff, sizeAttenuation: true, fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/** A dark cloud bank made of sprites, floating above the tile. */
function cloudBank(group, centre, height, tint, n = 9, spread = 0.55) {
  const sprites = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTexture(), color: tint, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
    const s = new THREE.Sprite(m);
    const a = Math.random() * Math.PI * 2, d = Math.random() * spread;
    s.position.set(centre.x + Math.cos(a) * d, height + Math.random() * 0.12, centre.z + Math.sin(a) * d);
    s.scale.setScalar(0.55 + Math.random() * 0.45);
    s.userData.base = s.position.clone();
    s.userData.phase = Math.random() * 10;
    group.add(s);
    sprites.push(s);
  }
  return (t) => {
    for (const s of sprites) {
      s.position.x = s.userData.base.x + Math.sin(t * 0.25 + s.userData.phase) * 0.06;
      s.position.z = s.userData.base.z + Math.cos(t * 0.2 + s.userData.phase) * 0.04;
    }
  };
}

/** Rain streaks: short line segments falling from the cloud to the ground. */
function rain(group, centre, top, ground, count = 420, radius = 0.62, color = 0xbcd2e6) {
  const pos = new Float32Array(count * 6);
  const drops = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * radius;
    drops.push({ x: centre.x + Math.cos(a) * d, z: centre.z + Math.sin(a) * d, y: ground + Math.random() * (top - ground), v: 2.2 + Math.random() * 0.8 });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55, fog: false }));
  lines.frustumCulled = false;
  group.add(lines);
  // splash rings on the ground
  const splash = particles({ count: 60, size: 0.035, texture: softDot('splash', 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'), opacity: 0.6 });
  group.add(splash);
  const sp = splash.geometry.attributes.position;
  return (t, dt) => {
    const w = windUniforms.uWindDir.value, ws = 0.25 * windUniforms.uWindStrength.value;
    drops.forEach((d, i) => {
      d.y -= d.v * dt;
      if (d.y < ground) {
        if (i < 60) sp.setXYZ(i, d.x, ground + 0.01, d.z);
        d.y = top + Math.random() * 0.1;
      }
      const k = i * 6;
      pos[k] = d.x - w.x * ws * 0.06; pos[k + 1] = d.y + 0.06; pos[k + 2] = d.z - w.y * ws * 0.06;
      pos[k + 3] = d.x; pos[k + 4] = d.y; pos[k + 5] = d.z;
    });
    geo.attributes.position.needsUpdate = true;
    sp.needsUpdate = true;
  };
}

/** Blizzard snow: dense flakes drifting with the wind, swirling, settling on the slopes. */
function snow(group, centre, top, sampleHeight, count = 900, radius = 0.68) {
  const pts = particles({ count, size: 0.028, texture: softDot('flake', 'rgba(255,255,255,1)', 'rgba(255,255,255,0)'), opacity: 0.95 });
  group.add(pts);
  const p = pts.geometry.attributes.position;
  const fl = Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * radius;
    return { ox: Math.cos(a) * d, oz: Math.sin(a) * d, y: Math.random(), v: 0.18 + Math.random() * 0.22, ph: Math.random() * 10 };
  });
  return (t, dt) => {
    const w = windUniforms.uWindDir.value, ws = 0.35 + 0.35 * windUniforms.uWindStrength.value;
    fl.forEach((f, i) => {
      f.y -= f.v * dt / Math.max(0.2, top - 0.2);
      const drift = (1 - f.y) * ws * 0.35; // driven sideways by the wind as it falls
      let x = centre.x + f.ox + w.x * drift + Math.sin(t * 2.1 + f.ph) * 0.03;
      let z = centre.z + f.oz + w.y * drift + Math.cos(t * 1.7 + f.ph) * 0.03;
      const gy = sampleHeight(centre.x + f.ox, centre.z + f.oz);
      const y = gy + (top - gy) * f.y;
      if (f.y <= 0) { f.y = 1; const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * radius; f.ox = Math.cos(a) * d - w.x * 0.15; f.oz = Math.sin(a) * d - w.y * 0.15; }
      p.setXYZ(i, x, y, z);
    });
    p.needsUpdate = true;
  };
}

// ---------- effects ----------
/** Soft additive glow ball (stands in for a point light). */
let _glowTex = null;
function glowSprite(color, size) {
  if (!_glowTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    _glowTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: _glowTex, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  s.scale.setScalar(size);
  return s;
}

export function createWeatherFX(kind, centre, rawHeight, { target = null } = {}) {
  // cache terrain heights on a coarse grid (raycasts are expensive)
  const G = 24, R = 0.95, grid = new Float32Array((G + 1) * (G + 1));
  for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) grid[j * (G + 1) + i] = rawHeight(centre.x - R + (2 * R * i) / G, centre.z - R + (2 * R * j) / G);
  const sampleHeight = (x, z) => {
    const gx = Math.min(G - 0.001, Math.max(0, ((x - centre.x + R) / (2 * R)) * G)), gz = Math.min(G - 0.001, Math.max(0, ((z - centre.z + R) / (2 * R)) * G));
    const i = Math.floor(gx), j = Math.floor(gz), u = gx - i, v = gz - j, k = j * (G + 1) + i;
    return grid[k] * (1 - u) * (1 - v) + grid[k + 1] * u * (1 - v) + grid[k + G + 1] * (1 - u) * v + grid[k + G + 2] * u * v;
  };
  const group = new THREE.Group();
  group.name = `weather-${kind}`;
  const updaters = [];
  const disposables = [];
  const ground = sampleHeight(centre.x, centre.z);

  if (kind === 'storm' || kind === 'rain') {
    const storm = kind === 'storm';
    const cloudY = storm ? Math.max(1.12, ground + 0.45) : 0.95;
    updaters.push(cloudBank(group, centre, cloudY, storm ? 0x5d6470 : 0x6d747d, storm ? 12 : 9));
    if (storm) updaters.push(snow(group, centre, cloudY - 0.05, sampleHeight));
    else updaters.push(rain(group, centre, cloudY - 0.05, Math.max(0.16, ground - 0.1), 520));
  }

  if (kind === 'storm') {
    // lightning: a jagged bolt from cloud to a high point, with a light flash
    const flash = glowSprite(0xc8d8ff, 2.2); // (no PointLight: adding lights recompiles every material)
    flash.position.set(centre.x, 1.0, centre.z);
    group.add(flash);
    const boltGeo = new THREE.BufferGeometry();
    boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
    const bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: 0xeef4ff, transparent: true, opacity: 0, fog: false }));
    bolt.frustumCulled = false;
    group.add(bolt);
    let next = 0.4, on = 0;
    const strike = () => {
      const a = Math.random() * Math.PI * 2, d = Math.random() * 0.4;
      const tx = centre.x + Math.cos(a) * d, tz = centre.z + Math.sin(a) * d, ty = sampleHeight(tx, tz);
      const p = boltGeo.attributes.position;
      for (let i = 0; i < 16; i++) {
        const k = i / 15;
        p.setXYZ(i, centre.x + (tx - centre.x) * k + (Math.random() - 0.5) * 0.08 * (1 - k * 0.5),
          1.3 + (ty - 1.3) * k, centre.z + (tz - centre.z) * k + (Math.random() - 0.5) * 0.08 * (1 - k * 0.5));
      }
      p.needsUpdate = true;
    };
    updaters.push((t, dt) => {
      next -= dt;
      if (next <= 0) { strike(); on = 0.22; next = 1.2 + Math.random() * 3; }
      on = Math.max(0, on - dt);
      const f = on > 0 ? (Math.sin(on * 70) > -0.3 ? 1 : 0.2) : 0; // flicker
      bolt.material.opacity = f;
      flash.material.opacity = Math.min(1, f * 0.9);
    });

    // rockslide: rocks tumble from the summit down the slopes, kicking up dust
    let peak = { x: centre.x, z: centre.z, y: ground };
    for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) {
      const x = centre.x + i * 0.1, z = centre.z + j * 0.1, y = sampleHeight(x, z);
      if (y > peak.y) peak = { x, z, y };
    }
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 1, flatShading: true });
    disposables.push(rockGeo, rockMat);
    const rocks = [];
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(rockGeo, rockMat);
      m.scale.setScalar(0.008 + Math.random() * 0.016);
      m.castShadow = true;
      const a = Math.random() * Math.PI * 2;
      rocks.push({ m, x: peak.x + (Math.random() - 0.5) * 0.08, z: peak.z + (Math.random() - 0.5) * 0.08, dir: a,
        v: 0, delay: Math.random() * 1.5, done: false, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()) });
      m.visible = false;
      group.add(m);
    }
    const dust = particles({ count: 140, size: 0.12, texture: softDot('dust', 'rgba(170,155,135,0.55)', 'rgba(170,155,135,0)') });
    group.add(dust);
    const dl = new Array(140).fill(null).map(() => ({ life: 0, x: 0, y: -10, z: 0 }));
    let di = 0, clock = 0;
    updaters.push((t, dt) => {
      clock += dt;
      for (const r of rocks) {
        if (r.done || clock < r.delay) continue;
        r.m.visible = true;
        // roll downhill: follow the steepest descent with some randomness
        const e = 0.02, h = sampleHeight(r.x, r.z);
        const gx = sampleHeight(r.x + e, r.z) - sampleHeight(r.x - e, r.z);
        const gz = sampleHeight(r.x, r.z + e) - sampleHeight(r.x, r.z - e);
        const gl = Math.hypot(gx, gz) || 1;
        const steep = Math.min(1, gl / (2 * e));
        r.v = Math.min(0.9, r.v + (steep * 1.6 - 0.25) * dt);
        r.dir += (Math.random() - 0.5) * 0.4;
        const dx = -gx / gl * 0.8 + Math.cos(r.dir) * 0.2, dz = -gz / gl * 0.8 + Math.sin(r.dir) * 0.2;
        r.x += dx * r.v * dt; r.z += dz * r.v * dt;
        r.m.position.set(r.x, h + r.m.scale.x + Math.abs(Math.sin(clock * 9 + r.delay * 5)) * 0.01 * r.v, r.z);
        r.m.rotation.x += r.spin.x * r.v * 14 * dt; r.m.rotation.z += r.spin.z * r.v * 14 * dt;
        if (Math.random() < r.v * 0.6) { const d = dl[di++ % dl.length]; d.life = 1; d.x = r.x; d.y = h + 0.02; d.z = r.z; }
        if (r.v <= 0.02 && clock > r.delay + 0.5) r.done = true; // came to rest
        if (Math.hypot(r.x - centre.x, r.z - centre.z) > 0.8) r.done = true;
      }
      const p = dust.geometry.attributes.position;
      dl.forEach((d, i) => {
        d.life = Math.max(0, d.life - dt * 0.5);
        d.y += dt * 0.05;
        p.setXYZ(i, d.x, d.life > 0 ? d.y : -10, d.z);
      });
      p.needsUpdate = true;
      dust.material.opacity = 0.9;
    });
  }

  if (kind === 'fire') {
    // flames over a few hot spots spread across the forest, plus a smoke column
    const spots = [];
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2, d = 0.15 + Math.random() * 0.55;
      const x = centre.x + Math.cos(a) * d, z = centre.z + Math.sin(a) * d;
      spots.push({ x, z, y: sampleHeight(x, z) + 0.04, r: 0.08 + Math.random() * 0.08 });
    }
    const N = 260;
    const flames = particles({ count: N, size: 0.17, texture: flameTexture(), blending: THREE.AdditiveBlending });
    group.add(flames);
    const fl = Array.from({ length: N }, () => ({ life: Math.random(), s: spots[0], ox: 0, oz: 0 }));
    const fc = flames.geometry.attributes.color, fp = flames.geometry.attributes.position;
    const S = 260;
    const smoke = particles({ count: S, size: 0.38, texture: softDot('smoke3', 'rgba(70,66,62,0.5)', 'rgba(70,66,62,0)') });
    group.add(smoke);
    const sm = Array.from({ length: S }, () => ({ life: Math.random(), s: spots[0], ox: 0, oz: 0 }));
    const sc = smoke.geometry.attributes.color, sp = smoke.geometry.attributes.position;
    const glow = glowSprite(0xff7a2a, 1.8);
    glow.position.set(centre.x, ground + 0.25, centre.z);
    group.add(glow);
    updaters.push((t, dt) => {
      const w = windUniforms.uWindDir.value;
      fl.forEach((f, i) => {
        f.life -= dt * (1.4 + (i % 5) * 0.2);
        if (f.life <= 0) { f.life = 1; f.s = spots[i % spots.length]; f.ox = (Math.random() - 0.5) * f.s.r * 2; f.oz = (Math.random() - 0.5) * f.s.r * 2; }
        const age = 1 - f.life;
        const shrink = 1 - age * 0.6; // tongues narrow as they rise
        fp.setXYZ(i, f.s.x + f.ox * shrink + Math.sin(t * 9 + i) * 0.012, f.s.y + age * 0.22, f.s.z + f.oz * shrink);
        const k = f.life * f.life;
        fc.setXYZ(i, 0.55 * f.life + 0.1, 0.12 + 0.3 * k, 0.02 + 0.06 * k * k); // yellow-orange core -> red, fading (additive)
      });
      sm.forEach((m, i) => {
        m.life -= dt * 0.18;
        if (m.life <= 0) { m.life = 1; m.s = spots[i % spots.length]; m.ox = (Math.random() - 0.5) * 0.1; m.oz = (Math.random() - 0.5) * 0.1; }
        const age = 1 - m.life;
        sp.setXYZ(i, m.s.x + m.ox + w.x * age * 0.5, m.s.y + 0.15 + age * 1.3, m.s.z + m.oz + w.y * age * 0.5);
        const g = 0.45 + age * 0.55; // dark near the fire, paler & thinner higher up
        sc.setXYZ(i, g, g, g);
      });
      fp.needsUpdate = fc.needsUpdate = sp.needsUpdate = sc.needsUpdate = true;
      glow.material.opacity = 0.42 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07;
    });
  }

  if (kind === 'disease') {
    const N = 160;
    const haze = particles({ count: N, size: 0.14, texture: softDot('haze', 'rgba(160,190,90,0.45)', 'rgba(160,190,90,0)') });
    group.add(haze);
    const hp = haze.geometry.attributes.position;
    const hz = Array.from({ length: N }, () => ({ a: Math.random() * Math.PI * 2, d: Math.sqrt(Math.random()) * 0.7, y: Math.random(), sp: 0.04 + Math.random() * 0.05 }));
    updaters.push((t, dt) => {
      hz.forEach((h, i) => {
        h.y = (h.y + dt * h.sp) % 1;
        h.a += dt * 0.15;
        const x = centre.x + Math.cos(h.a) * h.d, z = centre.z + Math.sin(h.a) * h.d;
        hp.setXYZ(i, x, ground + 0.02 + h.y * 0.25, z);
      });
      hp.needsUpdate = true;
    });
  }

  if (kind === 'quake') {
    // cracks: dark jagged lines draped over the ground
    const crackMat = new THREE.LineBasicMaterial({ color: 0x2a1a10, fog: false });
    for (let c = 0; c < 5; c++) {
      const pts = [];
      let a = Math.random() * Math.PI * 2, x = centre.x + (Math.random() - 0.5) * 0.3, z = centre.z + (Math.random() - 0.5) * 0.3;
      for (let i = 0; i < 14; i++) {
        pts.push(new THREE.Vector3(x, sampleHeight(x, z) + 0.004, z));
        a += (Math.random() - 0.5) * 1.1;
        x += Math.cos(a) * 0.04; z += Math.sin(a) * 0.04;
        if (Math.hypot(x - centre.x, z - centre.z) > 0.75) break;
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), crackMat);
      line.userData.n = pts.length;
      line.geometry.setDrawRange(0, 0); // cracks "open up" during the shock
      group.add(line);
    }
    const cracks = group.children.filter((o) => o.isLine);
    // dust bursts
    const N = 220;
    const dust = particles({ count: N, size: 0.16, texture: softDot('qdust', 'rgba(150,110,75,0.6)', 'rgba(150,110,75,0)') });
    group.add(dust);
    const dp = dust.geometry.attributes.position;
    const dl = Array.from({ length: N }, () => ({ life: 0, x: 0, y: -10, z: 0, vy: 0 }));
    let di = 0, clock = 0;
    // shake schedule: main shock, then a couple of aftershocks
    const shocks = [[0.2, 2.6, 0.03], [5.5, 1.0, 0.012], [11, 0.8, 0.01]];
    const base = target ? target.position.clone() : null;
    let nextAfter = 18;
    updaters.push((t, dt) => {
      clock += dt;
      let amp = 0;
      for (const [s0, len, a] of shocks) if (clock > s0 && clock < s0 + len) amp = Math.max(amp, a * (1 - (clock - s0) / len));
      if (clock > nextAfter) { shocks.push([clock, 0.7, 0.008]); nextAfter = clock + 8 + Math.random() * 10; } // occasional tremor
      if (target) {
        target.position.set(base.x + Math.sin(clock * 47) * amp, base.y + Math.abs(Math.sin(clock * 31)) * amp * 0.4, base.z + Math.cos(clock * 53) * amp);
      }
      if (amp > 0.005 && Math.random() < amp * 40) {
        for (let k = 0; k < 3; k++) {
          const d = dl[di++ % N];
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.7;
          d.x = centre.x + Math.cos(a) * r; d.z = centre.z + Math.sin(a) * r; d.y = sampleHeight(d.x, d.z) + 0.02; d.life = 1; d.vy = 0.05 + Math.random() * 0.08;
        }
      }
      dl.forEach((d, i) => { d.life = Math.max(0, d.life - dt * 0.35); d.y += d.vy * dt; dp.setXYZ(i, d.x, d.life > 0 ? d.y : -10, d.z); });
      dp.needsUpdate = true;
      const open = Math.min(1, clock / 2.2);
      for (const c of cracks) c.geometry.setDrawRange(0, Math.floor(c.userData.n * open));
    });
    disposables.push({ dispose: () => { if (target) target.position.copy(base); } });
  }

  return {
    group,
    update(t, dt) { for (const u of updaters) u(t, dt); },
    dispose() {
      group.traverse((o) => {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      disposables.forEach((d) => d.dispose());
      group.parent?.remove(group);
    },
  };
}
