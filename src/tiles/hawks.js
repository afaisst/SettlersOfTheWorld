// Hawks circling over a mountain: slow soaring loops with banking, the odd
// lazy wing-beat, a gentle rise and fall. A hawk is ~0.07 wide (about 2.5×
// true scale, like the sheep) so it reads from the table view.

import * as THREE from 'three';

let geos = null;
function hawkGeometries() {
  if (geos) return geos;
  // body: slim spindle along +X (head forward), tail fan at the back
  const body = new THREE.SphereGeometry(1, 8, 6);
  body.scale(0.016, 0.0045, 0.005);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute([-0.012, 0, 0, -0.026, 0, -0.007, -0.026, 0, 0.007], 3));
  tail.computeVertexNormals();
  // wing: swept triangle-ish shape from the shoulder outward (+Z), split in two
  // segments so the tip can droop; mirrored for the other side
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([
    0.008, 0, 0, -0.008, 0, 0, 0.002, 0, 0.02,      // inner
    -0.008, 0, 0, -0.006, 0, 0.02, 0.002, 0, 0.02,
    0.002, 0, 0.02, -0.006, 0, 0.02, -0.008, 0, 0.036, // outer, swept back
  ], 3));
  wing.computeVertexNormals();
  geos = { body, tail, wing };
  for (const g of Object.values(geos)) g.userData.shared = true;
  return geos;
}

let mat = null;
const hawkMat = () => (mat ??= new THREE.MeshStandardMaterial({ color: '#4a3424', roughness: 0.9, side: THREE.DoubleSide }));

/**
 * @param centre  {x, y, z} point (tile-local) to circle around, above the summit
 * @param count   number of hawks
 */
export function createHawks(rand, centre, count = 2) {
  const G = hawkGeometries(), M = hawkMat();
  const group = new THREE.Group();
  group.name = 'hawks';
  const birds = [];
  for (let i = 0; i < count; i++) {
    const bird = new THREE.Group();
    const roll = new THREE.Group(); // banking happens here
    bird.add(roll);
    roll.add(new THREE.Mesh(G.body, M), new THREE.Mesh(G.tail, M));
    const wings = [1, -1].map((side) => {
      const w = new THREE.Mesh(G.wing, M);
      w.scale.z = side;
      roll.add(w);
      return w;
    });
    roll.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    group.add(bird);
    birds.push({
      bird, roll, wings,
      r: 0.18 + rand() * 0.16,
      h: centre.y + 0.1 + rand() * 0.14,
      speed: (0.32 + rand() * 0.12) * (rand() < 0.5 ? 1 : -1), // rad/s, either direction
      phase: rand() * Math.PI * 2,
      flap: rand() * 10,
      cx: centre.x + (rand() - 0.5) * 0.12, cz: centre.z + (rand() - 0.5) * 0.12,
    });
  }
  return {
    group,
    update(t) {
      for (const b of birds) {
        const a = b.phase + t * b.speed;
        // slightly elliptical, wandering loop
        const r = b.r * (1 + 0.15 * Math.sin(t * 0.13 + b.phase));
        b.bird.position.set(b.cx + Math.cos(a) * r, b.h + Math.sin(t * 0.4 + b.phase) * 0.025, b.cz + Math.sin(a) * r * 0.85);
        // heading = tangent of the circle (local +X forward)
        const dir = Math.sign(b.speed);
        b.bird.rotation.y = -(a + dir * Math.PI / 2);
        b.roll.rotation.x = dir * 0.35; // bank into the turn
        // mostly gliding; every few seconds a short burst of wing-beats
        const cycle = (t + b.flap) % 6;
        const beat = cycle < 1.2 ? Math.sin(cycle * 14) * 0.5 : 0.08 + Math.sin(t * 1.5 + b.flap) * 0.04;
        b.wings[0].rotation.x = -beat;
        b.wings[1].rotation.x = beat;
      }
    },
  };
}
