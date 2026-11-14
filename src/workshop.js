// Tile workshop (developer view): browse single tiles, boards and demo pieces.
import * as THREE from 'three';
import { TILE_TYPES } from './tiles/tileFactory.js';
import { hexagonalBoard } from './board/layout.js';
import { buildBoardGraph } from './board/graph.js';
import { buildPieces, demoBoardState } from './pieces/placement.js';
import { HARBOUR } from './pieces/pieces.js';
import { randomIsland, LAND } from './game/mapgen.js';

export class Workshop {
  constructor(engine, { onBack }) {
    this.engine = engine;
    this.panel = document.getElementById('panel');
    this.state = { layout: 'single', type: 'forest' };
    this.seed = 1;

    const typeSel = document.getElementById('tileType');
    for (const [key, def] of Object.entries(TILE_TYPES)) {
      const o = document.createElement('option');
      o.value = key;
      o.textContent = def.label + (def.ready ? '' : ' — coming soon');
      o.disabled = !def.ready;
      typeSel.appendChild(o);
    }
    typeSel.value = this.state.type;
    typeSel.onchange = () => { this.state.type = typeSel.value; this.build(); };
    document.getElementById('layout').onchange = (e) => { this.state.layout = e.target.value; this.build(); };
    document.getElementById('wind').oninput = (e) => { engine.windUniforms.uWindStrength.value = parseFloat(e.target.value); };
    document.getElementById('reseed').onclick = () => { this.seed = Math.floor(Math.random() * 1e6); this.build(); };
    const q = document.getElementById('quality');
    q.onchange = () => engine.applyQuality(q.value);
    document.getElementById('autorotate').onchange = (e) => { engine.rig.autoRotate = e.target.checked; };
    document.getElementById('backToMenu').onclick = () => { this.hide(); onBack(); };
  }

  show() {
    this.panel.hidden = false;
    const c = window.sotw.controller;
    c?.tokens?.dispose(); // number tokens, fog and ships belong to the game world
    c?.fog?.dispose(); if (c) c.fog = null;
    c?.shipsView.clear();
    HARBOUR.boats = true;
    this.engine.setDepthFog(22, 45);
    this.engine.paused = false;
    document.getElementById('quality').value = this.engine.quality;
    this.engine.rig.autoRotate = document.getElementById('autorotate').checked;
    this.build();
  }

  hide() { this.panel.hidden = true; }

  cells() {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const { layout, type } = this.state;
    switch (layout) {
      case 'single': {
        const cells = [{ q: 0, r: 0, type }];
        if (type === 'water') cells.push({ q: 1, r: 0, type: pick(LAND) }, { q: 0, r: 1, type: pick(LAND) });
        return cells;
      }
      case 'board': return hexagonalBoard(2).map((c) => ({ ...c, type }));
      case 'mixed': return hexagonalBoard(2).map((c) => ({ ...c, type: pick(LAND) }));
      case 'pieces': return hexagonalBoard(1).map((c) => ({ ...c, type: pick(LAND.filter((t) => t !== 'mountains')) }));
      default: return randomIsland(this.seed + Math.floor(Math.random() * 1000));
    }
  }

  build() {
    const { engine } = this;
    const cells = this.cells();
    const tiles = engine.buildMap(cells, { seed: this.seed });
    const { layout } = this.state;
    if (layout === 'pieces' || layout === 'island-pieces') {
      const graph = buildBoardGraph(cells);
      const players = layout === 'pieces' ? ['red', 'blue'] : ['red', 'blue', 'white', 'purple'];
      const state = demoBoardState(graph, cells, players, { citiesPer: 1, townsPer: layout === 'pieces' ? 1 : 2 });
      const root = new THREE.Group();
      root.name = 'pieces';
      engine.board.add(root);
      buildPieces(root, tiles, graph, state, cells);
    }
    engine.fitShadowCamera({ single: 2.4, pieces: 3.6, island: 7, 'island-pieces': 7 }[layout] ?? 5.5);
    if (layout === 'single') engine.rig.setRange(1.6, 7);
    else if (layout === 'island' || layout === 'island-pieces') engine.rig.setRange(6, 26);
    else if (layout === 'pieces') engine.rig.setRange(2.5, 12);
    else engine.rig.setRange(4.5, 20);
  }
}
