// Hex board layout helpers (pointy-top axial coordinates).
import { SQRT3 } from '../tiles/hexGeometry.js';

export const HEX_SPACING = 1.0; // centre-to-corner distance of the grid cell

export function axialToWorld(q, r, size = HEX_SPACING) {
  return { x: size * SQRT3 * (q + r / 2), z: size * 1.5 * r };
}

// All axial coords within `radius` rings of the centre (radius 2 -> 19 hexes,
// the classic 3-4-5-4-3 Catan island).
export function hexagonalBoard(radius = 2) {
  const cells = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      cells.push({ q, r });
    }
  }
  return cells;
}
