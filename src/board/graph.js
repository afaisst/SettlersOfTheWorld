// Corner (vertex) and edge graph of a hex board — where towns/cities (corners)
// and roads (edges) can go. Pointy-top hexes; corner k of a cell is at angle
// 30° + 60°·k, radius = HEX_SPACING.

import { axialToWorld, HEX_SPACING } from './layout.js';

export function buildBoardGraph(cells) {
  const vertices = [];   // { x, z, cells: [cellIndex], neighbors: [vIndex], edges: [eIndex] }
  const edges = [];      // { a, b, cells: [cellIndex], x, z, angle }
  const vKey = new Map();
  const eKey = new Map();
  const keyOf = (x, z) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`;

  cells.forEach((cell, ci) => {
    const c = axialToWorld(cell.q, cell.r);
    const ids = [];
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 180) * (30 + 60 * k);
      const x = c.x + Math.cos(a) * HEX_SPACING, z = c.z + Math.sin(a) * HEX_SPACING;
      const key = keyOf(x, z);
      let id = vKey.get(key);
      if (id === undefined) {
        id = vertices.length;
        vertices.push({ x, z, cells: [], neighbors: [], edges: [] });
        vKey.set(key, id);
      }
      vertices[id].cells.push(ci);
      ids.push(id);
    }
    for (let k = 0; k < 6; k++) {
      const a = ids[k], b = ids[(k + 1) % 6];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      let id = eKey.get(key);
      if (id === undefined) {
        id = edges.length;
        const va = vertices[a], vb = vertices[b];
        edges.push({ a, b, cells: [], x: (va.x + vb.x) / 2, z: (va.z + vb.z) / 2, angle: Math.atan2(vb.z - va.z, vb.x - va.x) });
        eKey.set(key, id);
        va.neighbors.push(b); vb.neighbors.push(a);
        va.edges.push(id); vb.edges.push(id);
      }
      edges[id].cells.push(ci);
    }
  });
  return { vertices, edges };
}
