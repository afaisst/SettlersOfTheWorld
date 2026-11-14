// Registry of tile builders. Add the other terrain types here as they're made.
import { createForestTile } from './forest.js';
import { createPastureTile } from './pasture.js';
import { createFieldTile } from './field.js';
import { createMountainsTile } from './mountains.js';
import { createHillsTile } from './hills.js';
import { createWaterTile } from './water.js';

export const TILE_TYPES = {
  forest: { label: 'Forest (wood)', build: createForestTile, ready: true },
  pasture: { label: 'Pasture (sheep)', build: createPastureTile, ready: true },
  field: { label: 'Field (grain)', build: createFieldTile, ready: true },
  mountains: { label: 'Mountains (ore)', build: createMountainsTile, ready: true },
  hills: { label: 'Hills (brick)', build: createHillsTile, ready: true },
  water: { label: 'Water (sea)', build: createWaterTile, ready: true },
};

export function createTile(type, opts) {
  const def = TILE_TYPES[type];
  if (!def || !def.ready) throw new Error(`Tile type "${type}" is not implemented yet`);
  return def.build(opts);
}
