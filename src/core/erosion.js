// Droplet-based hydraulic erosion on a square heightmap (after Hans Theobald
// Beyer's / Sebastian Lague's well-known approach). Thousands of simulated
// raindrops run downhill, pick up sediment where they speed up and drop it
// where they slow down — carving gullies, sharpening ridges and leaving
// debris fans at the foot of slopes.
//
// map:  Float32Array (size*size), heights roughly 0..1, modified in place
// Returns { wear, deposit } maps for colouring (scree, gullies).

export function erode(map, size, rand, {
  droplets = 30000,
  radius = 3,
  inertia = 0.05,
  capacity = 4,
  minCapacity = 0.01,
  depositSpeed = 0.3,
  erodeSpeed = 0.3,
  evaporate = 0.01,
  gravity = 4,
  lifetime = 30,
} = {}) {
  const wear = new Float32Array(size * size);
  const deposit = new Float32Array(size * size);

  // precomputed erosion brush
  const brushOff = [], brushW = [];
  let wsum = 0;
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const d = Math.hypot(x, y);
      if (d <= radius) { brushOff.push([x, y]); const w = 1 - d / radius; brushW.push(w); wsum += w; }
    }
  }
  for (let i = 0; i < brushW.length; i++) brushW[i] /= wsum;

  const sample = (px, py) => {
    const x = Math.floor(px), y = Math.floor(py);
    const u = px - x, v = py - y;
    const i = y * size + x;
    const a = map[i], b = map[i + 1], c = map[i + size], d = map[i + size + 1];
    return {
      h: a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v,
      gx: (b - a) * (1 - v) + (d - c) * v,
      gy: (c - a) * (1 - u) + (d - b) * u,
    };
  };

  for (let n = 0; n < droplets; n++) {
    let px = rand() * (size - 2), py = rand() * (size - 2);
    let dx = 0, dy = 0, speed = 1, water = 1, sediment = 0;
    for (let step = 0; step < lifetime; step++) {
      const nx = Math.floor(px), ny = Math.floor(py);
      const u = px - nx, v = py - ny;
      const s = sample(px, py);
      dx = dx * inertia - s.gx * (1 - inertia);
      dy = dy * inertia - s.gy * (1 - inertia);
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) break;
      dx /= len; dy /= len;
      px += dx; py += dy;
      if (px < 0 || px >= size - 2 || py < 0 || py >= size - 2) break;
      const dh = sample(px, py).h - s.h;
      const cap = Math.max(-dh * speed * water * capacity, minCapacity);
      const i = ny * size + nx;
      if (sediment > cap || dh > 0) {
        const amt = dh > 0 ? Math.min(dh, sediment) : (sediment - cap) * depositSpeed;
        sediment -= amt;
        map[i] += amt * (1 - u) * (1 - v);
        map[i + 1] += amt * u * (1 - v);
        map[i + size] += amt * (1 - u) * v;
        map[i + size + 1] += amt * u * v;
        deposit[i] += amt;
      } else {
        const amt = Math.min((cap - sediment) * erodeSpeed, -dh);
        for (let k = 0; k < brushOff.length; k++) {
          const bx = nx + brushOff[k][0], by = ny + brushOff[k][1];
          if (bx < 0 || by < 0 || bx >= size || by >= size) continue;
          const j = by * size + bx;
          const w = amt * brushW[k];
          const d = map[j] < w ? map[j] : w;
          map[j] -= d;
          wear[j] += d;
          sediment += d;
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed + dh * gravity));
      water *= 1 - evaporate;
    }
  }
  return { wear, deposit };
}

// Separable box blur (small radius) for smoothing helper maps.
export function blurMap(src, size, r = 1) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0, c = 0;
    for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < size) { s += src[y * size + xx]; c++; } }
    tmp[y * size + x] = s / c;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0, c = 0;
    for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < size) { s += tmp[yy * size + x]; c++; } }
    out[y * size + x] = s / c;
  }
  return out;
}
