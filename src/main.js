// Entry point: start menu & game (default) and the tile workshop (dev view).
import { engine } from './core/engine.js';
import { GameController } from './game/controller.js';
import { Workshop } from './workshop.js';
import { translatePage } from './i18n.js';

translatePage(); // static texts of index.html in the chosen language (before the menu builds itself)

window.sotw = { engine, scene: engine.scene, camera: engine.camera, rig: engine.rig, renderer: engine.renderer, get tiles() { return engine.tiles; } };

const workshop = new Workshop(engine, { onBack: () => { game.newIsland(); game.showMenu(); } });
const game = new GameController(engine, { onWorkshop: () => workshop.show() });
window.sotw.controller = game;

game.newIsland();
game.showMenu();
