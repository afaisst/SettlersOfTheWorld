// Help page ("How to play"), in English and German. The text explains every
// rule; all numbers come straight from the game's rule constants (game.js,
// mapgen.js), so costs, points, chances and supplies always match the game.
// When a rule itself changes, update the matching section below — in BOTH languages.

import {
  SUPPLY, COSTS, WIN_POINTS, WIN_RANGE, BANK_RATE, WEATHER, WEATHER_LEVELS, WEATHER_DEFAULT, WEATHER_ROUNDS,
  LONGEST_ROAD_MIN, LONGEST_ROAD_POINTS, ISLAND_POINTS, TILE_RESOURCE,
} from './game/game.js';
import { ISLAND_SIZES } from './game/mapgen.js';
import { applyMenuBackground } from './game/menuBackground.js';
import { roadIcon, townIcon, cityIcon, diceIcon, shipIcon, giftIcon, pirateIcon, RESOURCE_INFO } from './game/icons.js';
import { t, tr, lang, LANGS, setLang, translatePage } from './i18n.js';

const C = '#b8322a'; // icon colour on this page
const res = (r) => `<span class="ri" title="${RESOURCE_INFO[r].label}">${RESOURCE_INFO[r].svg}</span>`;
const cost = (c) => `<span class="cost-line">${Object.entries(c).map(([r, n]) => `<b>${n}</b>${res(r)}`).join(' ')}</span>`;
const icon = (svg) => `<span class="hi">${svg}</span>`;
const TILE_LABEL = { forest: t('Forest'), hills: t('Hills'), pasture: t('Pasture'), field: t('Field'), mountains: t('Mountains') };
const sizes = Object.entries(ISLAND_SIZES).map(([k, [a, b]]) => `<b>${t(k[0].toUpperCase() + k.slice(1))}</b> ${a === b ? `${a}` : `${a}–${b}`} ${t('tiles')}`).join(', ');
const levels = Object.entries(WEATHER_LEVELS).map(([k, v]) => `<b>${t(k[0].toUpperCase() + k.slice(1))}</b> ${Math.round(v * 100)}%`).join(' · ');
const defLevel = t(WEATHER_DEFAULT[0].toUpperCase() + WEATHER_DEFAULT.slice(1));

const SECTIONS = [
  {
    id: 'goal', title: tr({ en: 'The goal', de: 'Das Ziel' }), icon: icon(cityIcon(C)), html: tr({ en: `
      <p>Build towns and castles, lay roads, sail to new islands — the first settlement to reach
      the target score wins the game. You choose the target in the start menu (<b>Points to win</b>,
      ${WIN_RANGE[0]}–${WIN_RANGE[1]}); the default is <b class="big">${WIN_POINTS} points</b>.</p>
      <p>When someone wins, fireworks go up over all of their towns and cities.</p>
      <p>2 to 4 players play at one computer, taking turns ("hot seat"), as red, blue, white or purple. At the start of every turn
      the camera swings to the current player's last view.</p>`, de: `
      <p>Baut Dörfer und Burgen, legt Straßen an, segelt zu neuen Inseln — wer zuerst die Zielpunktzahl erreicht,
      gewinnt. Das Ziel wählt ihr im Startmenü (<b>Punkte zum Sieg</b>, ${WIN_RANGE[0]}–${WIN_RANGE[1]});
      voreingestellt sind <b class="big">${WIN_POINTS} Punkte</b>.</p>
      <p>Wer gewinnt, bekommt ein Feuerwerk über all seinen Dörfern und Burgen.</p>
      <p>2 bis 4 Spieler spielen abwechselnd an einem Computer, als Rot, Blau, Weiß oder Lila. Zu Beginn jedes Zuges
      schwenkt die Kamera zur letzten Ansicht des Spielers, der dran ist.</p>` }),
  },
  {
    id: 'world', title: tr({ en: 'The world', de: 'Die Welt' }), icon: icon(`<svg viewBox="0 0 64 64" class="icon"><polygon points="32,4 56,18 56,46 32,60 8,46 8,18" fill="#94c45a" stroke="#4a3628" stroke-width="3"/><path d="M20 40 l8-14 8 14z M32 38 l7-12 7 12z" fill="#2f6a32"/></svg>`), html: tr({ en: `
      <p>The <b>main island</b> has 19 land tiles. Every land tile produces one resource and carries a
      number token (2–12, the 7 included — there is no robber):</p>`, de: `
      <p>Die <b>Hauptinsel</b> hat 19 Landfelder. Jedes Landfeld liefert einen Rohstoff und trägt einen
      Zahlenchip (2–12, auch die 7 — es gibt keinen Räuber):</p>` }) + `
      <table class="t"><tr>${Object.entries(TILE_RESOURCE).map(([tt, r]) => `<td>${TILE_LABEL[tt]}<br>${res(r)}<small>${RESOURCE_INFO[r].label}</small></td>`).join('')}</tr></table>` + tr({ en: `
      <p>Red numbers (6, 7, 8) are rolled most often; the dots under a number show how likely it is.
      The same number never sits on two neighbouring tiles.</p>
      <p>In the start menu choose how many <b>islands</b> (1 = just the main island) and their <b>size</b>:
      ${sizes}. Extra islands lie two sea hexes off the main island, each with random land and at least one good number (5–9).</p>`, de: `
      <p>Rote Zahlen (6, 7, 8) werden am häufigsten gewürfelt; die Punkte unter einer Zahl zeigen, wie wahrscheinlich sie ist.
      Gleiche Zahlen liegen nie nebeneinander.</p>
      <p>Im Startmenü wählt ihr die Anzahl der <b>Inseln</b> (1 = nur die Hauptinsel) und ihre <b>Größe</b>:
      ${sizes}. Weitere Inseln liegen zwei Meeresfelder vor der Hauptinsel, mit zufälligem Land und mindestens einer guten Zahl (5–9).</p>` }),
  },
  {
    id: 'fog', title: tr({ en: 'Fog of war', de: 'Nebel' }), icon: icon(`<svg viewBox="0 0 64 64" class="icon"><g fill="#fbfaf7" stroke="#8a6f5a" stroke-width="2.5"><circle cx="22" cy="36" r="12"/><circle cx="36" cy="28" r="14"/><circle cx="46" cy="40" r="10"/><rect x="18" y="38" width="30" height="12" stroke="none"/></g></svg>`), html: tr({ en: `
      <p>At the start you only see the main island and the first ring of sea; everything else is hidden in clouds.</p>
      <ul>
        <li>A <b>ship</b> clears the fog from its hex and the six hexes around it.</li>
        <li>A <b>road</b> or <b>town</b> clears the tiles touching its corners.</li>
        <li>Discoveries are permanent — and they can't be undone.</li>
      </ul>
      <p>Only explored tiles can be built on, be hit by bad weather, or show tornados.</p>`, de: `
      <p>Am Anfang seht ihr nur die Hauptinsel und den ersten Meeresring; alles andere liegt unter Wolken.</p>
      <ul>
        <li>Ein <b>Schiff</b> lichtet den Nebel auf seinem Feld und den sechs Feldern drumherum.</li>
        <li>Eine <b>Straße</b> oder ein <b>Dorf</b> lichtet die Felder an ihren Ecken.</li>
        <li>Entdeckungen bleiben — und lassen sich nicht rückgängig machen.</li>
      </ul>
      <p>Nur erkundete Felder können bebaut, von Unwetter getroffen werden oder Tornados zeigen.</p>` }),
  },
  {
    id: 'setup', title: tr({ en: 'Setting up', de: 'Aufbau' }), icon: icon(townIcon(C)), html: tr({ en: `
      <p>Before the dice start rolling, everyone places <b>2 towns</b> and <b>2 roads</b> on the main island, for free:</p>
      <ol>
        <li>Round 1 goes 1 → 2 → 3 → 4; round 2 goes back 4 → 3 → 2 → 1 (the last player places twice in a row).</li>
        <li>Each setup turn: one town on a free corner, then two roads leading away from it.</li>
        <li>Your <b>second</b> town pays out one resource for every tile it touches.</li>
      </ol>`, de: `
      <p>Bevor gewürfelt wird, setzt jeder kostenlos <b>2 Dörfer</b> und <b>2 Straßen</b> auf die Hauptinsel:</p>
      <ol>
        <li>Runde 1 geht 1 → 2 → 3 → 4; Runde 2 zurück 4 → 3 → 2 → 1 (der Letzte setzt zweimal hintereinander).</li>
        <li>Jeder Aufbauzug: ein Dorf auf eine freie Ecke, dann zwei Straßen davon weg.</li>
        <li>Euer <b>zweites</b> Dorf bringt sofort einen Rohstoff von jedem angrenzenden Feld.</li>
      </ol>` }),
  },
  {
    id: 'turn', title: tr({ en: 'Your turn', de: 'Dein Zug' }), icon: icon(diceIcon()), html: tr({ en: `
      <ol>
        <li><b>Roll the dice</b> (once, always first).</li>
        <li><b>Collect</b>: every tile showing the rolled number produces — a town gets 1, a castle 2 of its resource.
          Resources fly to the owner's name tag.</li>
        <li><b>Build, trade and sail</b> as much as you like and can afford.</li>
        <li><b>End turn</b>.</li>
      </ol>
      <p>When your turn starts, a turning ring in your colour briefly circles each of your towns and cities, so you can spot them quickly.</p>
      <p>Changed your mind? <b>Undo</b> takes back building, trades, loading and sailing from this turn
      (but not discoveries, robberies or sinkings).</p>`, de: `
      <ol>
        <li><b>Würfeln</b> (einmal, immer zuerst).</li>
        <li><b>Ernten</b>: jedes Feld mit der gewürfelten Zahl liefert — ein Dorf bekommt 1, eine Burg 2 seines Rohstoffs.
          Die Rohstoffe fliegen zum Namensschild des Besitzers.</li>
        <li><b>Bauen, handeln und segeln</b>, so viel ihr wollt und bezahlen könnt.</li>
        <li><b>Zug beenden</b>.</li>
      </ol>
      <p>Wenn dein Zug beginnt, kreist kurz ein drehender Ring in deiner Farbe um jedes deiner Dörfer und jede Burg, damit du sie schnell findest.</p>
      <p>Anders überlegt? <b>Rückgängig</b> nimmt Bauen, Handel, Beladen und Segeln dieses Zuges zurück
      (aber keine Entdeckungen, Überfälle oder Untergänge).</p>` }),
  },
  {
    id: 'build', title: tr({ en: 'Building', de: 'Bauen' }), icon: icon(roadIcon(C)), html: `
      <table class="t costs">
        <tr><th></th><th>${t('Cost')}</th><th>${t('Supply')}</th><th>${t('Rules')}</th></tr>
        <tr><td>${icon(roadIcon(C))}${t('Road')}</td><td>${cost(COSTS.road)}</td><td>${SUPPLY.road}</td><td>${tr({ en: "On a land edge connected to your own road, town or castle. An opponent's town blocks the way.", de: 'Auf eine Landkante, die an deine Straße, dein Dorf oder deine Burg anschließt. Ein fremdes Dorf versperrt den Weg.' })}</td></tr>
        <tr><td>${icon(townIcon(C))}${t('Town')}</td><td>${cost(COSTS.town)}</td><td>${SUPPLY.town}</td><td>${tr({ en: 'On a free corner touching one of your roads (or next to your ship, see Settling). No other town or castle may be on a neighbouring corner.', de: 'Auf eine freie Ecke an einer deiner Straßen (oder neben deinem Schiff, siehe Besiedeln). Auf den Nachbarecken darf kein anderes Dorf und keine Burg stehen.' })}</td></tr>
        <tr><td>${icon(cityIcon(C))}${tr({ en: 'City (castle)', de: 'Burg' })}</td><td>${cost(COSTS.city)}</td><td>${SUPPLY.city}</td><td>${tr({ en: 'Upgrades one of your towns (the town goes back to your supply). Produces 2 instead of 1.', de: 'Baut eines deiner Dörfer aus (das Dorf geht in deinen Vorrat zurück). Liefert 2 statt 1.' })}</td></tr>
        <tr><td>${icon(shipIcon(C))}${t('Ship')}</td><td>${cost(COSTS.ship)}</td><td>${SUPPLY.ship}</td><td>${tr({ en: 'Built with the little ship button at one of your coastal towns or castles. See Ships.', de: 'Wird mit dem kleinen Schiffsknopf an einem deiner Küstendörfer oder einer Küstenburg gebaut. Siehe Schiffe.' })}</td></tr>
      </table>` + tr({ en: `
      <p>Pick a piece in the Build panel (or press <kbd>R</kbd> <kbd>T</kbd> <kbd>C</kbd>), then click a glowing spot.
      Hovering a spot shows what it costs and which island pays. Right-click or <kbd>Esc</kbd> cancels.</p>`, de: `
      <p>Wähle ein Teil im Bau-Feld (oder drücke <kbd>R</kbd> <kbd>T</kbd> <kbd>C</kbd>) und klicke auf einen leuchtenden Platz.
      Zeigst du auf einen Platz, siehst du den Preis und welche Insel bezahlt. Rechtsklick oder <kbd>Esc</kbd> bricht ab.</p>` }),
  },
  {
    id: 'islands', title: tr({ en: 'Island resources', de: 'Rohstoffe der Inseln' }), icon: icon(`<svg viewBox="0 0 64 64" class="icon"><ellipse cx="32" cy="44" rx="26" ry="10" fill="#2f78a3"/><path d="M14 44 q18 -26 36 0z" fill="#94c45a" stroke="#4a3628" stroke-width="2.5"/></svg>`), html: tr({ en: `
      <p>Every island keeps its <b>own stock</b> of resources for every player. What a tile produces goes to
      the stock of its island, and building on an island is paid from that island's stock.</p>
      <ul>
        <li>The top-left panel always shows your <b>main island</b>; when you look at another island its panel appears underneath.</li>
        <li><b>All islands</b> opens a table of everything you own: each island, every ship's cargo and your open gifts.</li>
        <li>Goods travel between islands only by ship.</li>
      </ul>`, de: `
      <p>Jede Insel hat für jeden Spieler ihren <b>eigenen Vorrat</b>. Was ein Feld liefert, landet im Vorrat seiner Insel,
      und Bauen auf einer Insel wird aus dem Vorrat dieser Insel bezahlt.</p>
      <ul>
        <li>Das Feld oben links zeigt immer deine <b>Hauptinsel</b>; schaust du auf eine andere Insel, erscheint deren Feld darunter.</li>
        <li><b>Alle Inseln</b> öffnet eine Tabelle mit allem, was du besitzt: jede Insel, jede Schiffsladung und deine offenen Geschenke.</li>
        <li>Waren reisen nur per Schiff zwischen den Inseln.</li>
      </ul>` }),
  },
  {
    id: 'trade', title: tr({ en: 'Trading', de: 'Handel' }), icon: icon(giftIcon()), html: tr({ en: `
      <h3>With the bank (${BANK_RATE} : 1)</h3>
      <p>After rolling, drag a resource you have at least ${BANK_RATE} of onto another resource of the same panel:
      you pay ${BANK_RATE} and get 1. Works on every island with its own stock.</p>
      <h3>With other players (gifts)</h3>
      <p>Drag a resource onto another player's name tag to offer it (+1 each time). The goods are set aside at once
      and a gift badge appears on their name. Hovering a name shows the gifts that player gives and receives.</p>
      <p>At the start of their turn the other player gets a pop-up: <b>Accept</b> (the goods go to their main island)
      or <b>Reject</b> (they go back where they came from). Then they can send something back to you.</p>`, de: `
      <h3>Mit der Bank (${BANK_RATE} : 1)</h3>
      <p>Nach dem Würfeln ziehst du einen Rohstoff, von dem du mindestens ${BANK_RATE} hast, auf einen anderen Rohstoff im selben Feld:
      du zahlst ${BANK_RATE} und bekommst 1. Klappt auf jeder Insel mit ihrem eigenen Vorrat.</p>
      <h3>Mit anderen Spielern (Geschenke)</h3>
      <p>Zieh einen Rohstoff auf das Namensschild eines Mitspielers, um ihn anzubieten (+1 pro Mal). Die Waren werden sofort
      beiseitegelegt und ein Geschenk-Symbol erscheint an seinem Namen. Zeigst du auf einen Namen, siehst du, was er gibt und bekommt.</p>
      <p>Zu Beginn seines Zuges bekommt der andere Spieler ein Fenster: <b>Annehmen</b> (die Waren gehen auf seine Hauptinsel)
      oder <b>Ablehnen</b> (sie gehen zurück). Dann kann er dir selbst etwas schicken.</p>` }),
  },
  {
    id: 'ships', title: tr({ en: 'Ships', de: 'Schiffe' }), icon: icon(shipIcon(C)), html: tr({ en: `
      <ul>
        <li><b>Build</b>: after rolling, click the ship button at one of your coastal towns or castles — ${cost(COSTS.ship)}
          from that island. You have ${SUPPLY.ship} ships. The Ships card in the Build panel lights up when you can build one.</li>
        <li><b>Sail</b>: click your ship (or the ship icon above it), then a glowing sea hex. A ship sails <b>1 hex per turn</b>,
          after rolling. A brand-new ship sails from your next turn on.</li>
        <li><b>Load</b>: while your ship lies at one of your harbours, drag resources from that island's panel onto the ship.
          <b>Unload</b> by clicking the cargo icons above it.</li>
        <li><b>Settle</b>: next to your ship you may build a town on an explored coast even without a road — the cargo pays
          ${cost(COSTS.town)} and the rest of the cargo is unloaded onto the new island.</li>
      </ul>`, de: `
      <ul>
        <li><b>Bauen</b>: nach dem Würfeln klickst du auf den Schiffsknopf an einem deiner Küstendörfer oder einer Küstenburg — ${cost(COSTS.ship)}
          von dieser Insel. Du hast ${SUPPLY.ship} Schiffe. Die Schiffs-Karte im Bau-Feld leuchtet, wenn du eins bauen kannst.</li>
        <li><b>Segeln</b>: klick auf dein Schiff (oder das Schiffssymbol darüber), dann auf ein leuchtendes Meeresfeld. Ein Schiff segelt
          <b>1 Feld pro Zug</b>, nach dem Würfeln. Ein neues Schiff segelt erst ab deinem nächsten Zug.</li>
        <li><b>Beladen</b>: liegt dein Schiff an einem deiner Häfen, ziehst du Rohstoffe aus dem Feld dieser Insel auf das Schiff.
          <b>Entladen</b> per Klick auf die Ladungssymbole darüber.</li>
        <li><b>Besiedeln</b>: neben deinem Schiff darfst du auch ohne Straße ein Dorf an eine erkundete Küste bauen — die Ladung bezahlt
          ${cost(COSTS.town)}, der Rest wird auf der neuen Insel ausgeladen.</li>
      </ul>` }),
  },
  {
    id: 'pirates', title: tr({ en: 'Pirates', de: 'Piraten' }), icon: icon(pirateIcon()), html: tr({ en: `
      <p>When one of your ships shares a hex with an opponent's ship, a skull button appears above yours.
      Click it, then click the enemy ship: <b>all its cargo</b> goes onto your ship, and the robbed ship burns and sinks.
      Its owner gets the ship back into their supply and may build it again.</p>
      <p>Each ship can rob once per turn. A robbery can't be undone.</p>`, de: `
      <p>Teilt eines deiner Schiffe ein Feld mit einem fremden Schiff, erscheint ein Totenkopf-Knopf über deinem.
      Klick darauf und dann auf das fremde Schiff: <b>die ganze Ladung</b> kommt auf dein Schiff, und das überfallene Schiff brennt und sinkt.
      Sein Besitzer bekommt das Schiff zurück in den Vorrat und darf es neu bauen.</p>
      <p>Jedes Schiff kann einmal pro Zug überfallen. Ein Überfall lässt sich nicht rückgängig machen.</p>` }),
  },
  {
    id: 'tornados', title: tr({ en: 'Tornados', de: 'Tornados' }), icon: icon(`<svg viewBox="0 0 64 64" class="icon"><ellipse cx="32" cy="14" rx="22" ry="8" fill="#555a63"/><path d="M14 20 h36 l-8 10 h-20z M22 32 h20 l-6 10 h-8z M28 44 h8 l-3 10 h-2z" fill="#8f949c"/></svg>`), html: tr({ en: `
      <p>There are as many tornados as islands. They start at the far edge of the map, and at the end of every turn each one
      moves one sea hex in a random direction.</p>
      <p>A ship caught by a tornado — or sailing into one — <b>sinks with all its cargo</b> (the ship returns to its owner's supply).
      Tornados are only visible on explored sea, so watch out in the fog!</p>`, de: `
      <p>Es gibt so viele Tornados wie Inseln. Sie starten am fernen Kartenrand und ziehen am Ende jedes Zuges
      ein Meeresfeld in eine zufällige Richtung.</p>
      <p>Ein Schiff, das ein Tornado erwischt — oder das in einen hineinsegelt — <b>sinkt mit seiner ganzen Ladung</b> (das Schiff geht zurück in den Vorrat).
      Tornados sieht man nur auf erkundetem Meer — also Vorsicht im Nebel!</p>` }),
  },
  {
    id: 'weather', title: tr({ en: 'Bad weather', de: 'Unwetter' }), icon: icon(`<svg viewBox="0 0 64 64" class="icon"><g fill="#d7dbe3"><circle cx="22" cy="26" r="10"/><circle cx="34" cy="20" r="12"/><circle cx="46" cy="28" r="9"/><rect x="18" y="26" width="30" height="10"/></g><path d="M34 34 l-8 14 h7 l-4 12 12-16 h-7 l4-10z" fill="#ffd84a" stroke="#4a3628" stroke-width="1.5"/></svg>`), html: tr({ en: `
      <p>Whenever the dice are rolled there is a chance of bad weather. You set it with the <b>Bad weather</b> slider in the start menu:
      ${levels} (default: ${defLevel}).
      Bad weather strikes one explored tile showing the
      rolled number. Everyone with a town or castle there loses <b>half</b> (rounded down) of that resource on that island,
      and the tile produces nothing for <b>${WEATHER_ROUNDS} rounds</b> (a badge counts down).</p>`, de: `
      <p>Bei jedem Würfeln kann Unwetter kommen. Wie oft, stellt ihr mit dem Regler <b>Unwetter</b> im Startmenü ein:
      ${levels} (voreingestellt: ${defLevel}).
      Das Unwetter trifft ein erkundetes Feld mit der gewürfelten Zahl. Wer dort ein Dorf oder eine Burg hat, verliert
      die <b>Hälfte</b> (abgerundet) dieses Rohstoffs auf dieser Insel, und das Feld liefert <b>${WEATHER_ROUNDS} Runden</b> lang nichts
      (ein Symbol zählt herunter).</p>` }) + `
      <table class="t"><tr>${Object.entries(WEATHER).map(([tt, w]) => `<td><b>${t(w.name)}</b><br><small>${TILE_LABEL[tt]}</small>${res(w.res)}</td>`).join('')}</tr></table>`,
  },
  {
    id: 'points', title: tr({ en: 'Points', de: 'Punkte' }), icon: icon(`<svg viewBox="0 0 64 64" class="icon"><path d="M32 6 l8 17 18 2 -13 12 4 18 -17-9 -17 9 4-18 -13-12 18-2z" fill="#ffd166" stroke="#4a3628" stroke-width="2.5" stroke-linejoin="round"/></svg>`), html: `
      <table class="t pts">
        <tr><td>${icon(townIcon(C))}${t('Town')}</td><td>1</td></tr>
        <tr><td>${icon(cityIcon(C))}${tr({ en: 'City (castle)', de: 'Burg' })}</td><td>2</td></tr>
        <tr><td>${icon(roadIcon(C))}${tr({ en: `Longest Road — the longest unbroken road of at least ${LONGEST_ROAD_MIN} pieces (loops count once; an opponent's town breaks it). Ties keep the current holder.`, de: `Längste Straße — die längste durchgehende Straße aus mindestens ${LONGEST_ROAD_MIN} Teilen (Schleifen zählen einmal; ein fremdes Dorf unterbricht sie). Bei Gleichstand behält sie der bisherige Besitzer.` })}</td><td>${LONGEST_ROAD_POINTS}</td></tr>
        <tr><td>${icon(shipIcon(C))}${tr({ en: 'Every new island with one of your towns or castles', de: 'Jede neue Insel mit einem deiner Dörfer oder einer Burg' })}</td><td>${ISLAND_POINTS}</td></tr>
      </table>` + tr({ en: `
      <p>Hover a player's name in the scoreboard for their full breakdown. The first to reach the chosen <b>Points to win</b> (default ${WIN_POINTS}) wins.</p>`, de: `
      <p>Zeig auf einen Namen in der Punkteleiste für die genaue Aufstellung. Wer zuerst die gewählten <b>Punkte zum Sieg</b> (voreingestellt ${WIN_POINTS}) erreicht, gewinnt.</p>` }),
  },
  {
    id: 'controls', title: tr({ en: 'Controls', de: 'Steuerung' }), icon: icon(`<svg viewBox="0 0 64 64" class="icon"><rect x="18" y="6" width="28" height="48" rx="14" fill="#fff" stroke="#4a3628" stroke-width="3"/><path d="M32 8 v16" stroke="#4a3628" stroke-width="3"/><rect x="29" y="14" width="6" height="8" rx="3" fill="#ff7f66"/></svg>`), html: tr({ en: `
      <table class="t keys">
        <tr><td>Drag the map</td><td>Move the view in any direction</td></tr>
        <tr><td><kbd>Shift</kbd> + drag</td><td>Rotate the map around the point you look at</td></tr>
        <tr><td>Mouse wheel / pinch</td><td>Zoom in and out (zooming out tilts the view top-down)</td></tr>
        <tr><td>Mini map (lower right)</td><td>Click or drag to jump there; it turns with your view</td></tr>
        <tr><td>Point at a town, city or ship</td><td>A little tag shows which empire it belongs to</td></tr>
        <tr><td><kbd>R</kbd> <kbd>T</kbd> <kbd>C</kbd></td><td>Pick road, town or castle</td></tr>
        <tr><td><kbd>Esc</kbd> / right click</td><td>Cancel the current tool or selection</td></tr>
      </table>`, de: `
      <table class="t keys">
        <tr><td>Karte ziehen</td><td>Ansicht in jede Richtung verschieben</td></tr>
        <tr><td><kbd>Shift</kbd> + ziehen</td><td>Karte um den Blickpunkt drehen</td></tr>
        <tr><td>Mausrad / Zwei-Finger</td><td>Hinein- und herauszoomen (beim Herauszoomen wird die Sicht steiler)</td></tr>
        <tr><td>Minikarte (unten rechts)</td><td>Klicken oder ziehen, um dorthin zu springen; sie dreht sich mit deiner Ansicht</td></tr>
        <tr><td>Auf Dorf, Burg oder Schiff zeigen</td><td>Ein kleines Schild zeigt, zu welchem Reich es gehört</td></tr>
        <tr><td><kbd>R</kbd> <kbd>T</kbd> <kbd>C</kbd></td><td>Straße, Dorf oder Burg wählen</td></tr>
        <tr><td><kbd>Esc</kbd> / Rechtsklick</td><td>Aktuelles Werkzeug oder Auswahl abbrechen</td></tr>
      </table>` }),
  },
  {
    id: 'menu', title: tr({ en: 'Menu, saving & graphics', de: 'Menü, Speichern & Grafik' }), icon: icon(`<svg viewBox="0 0 64 64" class="icon"><rect x="10" y="8" width="44" height="48" rx="6" fill="#9ae6c4" stroke="#4a3628" stroke-width="3"/><rect x="18" y="8" width="28" height="16" fill="#fff" stroke="#4a3628" stroke-width="3"/><rect x="18" y="34" width="28" height="16" rx="3" fill="#fff8ec"/></svg>`), html: tr({ en: `
      <ul>
        <li>The <b>Menu</b> button (lower left) lets you change the graphics, <b>save</b> the game, open this help (in its own tab, so the game keeps running), or exit.
          Exiting an unsaved game asks whether to save first.</li>
        <li>There is one save slot in this browser. <b>Continue saved game</b> on the start menu picks it up again.</li>
        <li><b>Graphics</b>: High looks best; <b>Fast</b> uses a simpler sea and fewer details for slower computers.</li>
        <li><b>Language</b>: English or German — switch it at the top of the start menu (or of this page).</li>
        <li><b>Debug game</b> (start menu) starts without fog and with 100 of every resource — handy for trying things out.</li>
      </ul>`, de: `
      <ul>
        <li>Mit dem Knopf <b>Menü</b> (unten links) änderst du die Grafik, <b>speicherst</b> das Spiel, öffnest diese Hilfe (in einem eigenen Tab, das Spiel läuft weiter) oder beendest.
          Beim Beenden eines ungespeicherten Spiels wirst du gefragt, ob du vorher speichern willst.</li>
        <li>Es gibt einen Speicherplatz in diesem Browser. <b>Gespeichertes Spiel fortsetzen</b> im Startmenü macht dort weiter.</li>
        <li><b>Grafik</b>: Hoch sieht am schönsten aus; <b>Schnell</b> nutzt ein einfacheres Meer und weniger Details für langsamere Computer.</li>
        <li><b>Sprache</b>: Englisch oder Deutsch — umschalten oben im Startmenü (oder auf dieser Seite).</li>
        <li><b>Test-Spiel</b> (Startmenü) startet ohne Nebel und mit 100 von jedem Rohstoff — praktisch zum Ausprobieren.</li>
      </ul>` }),
  },
];

// ---------- render ----------
translatePage();
// (ids get an "h-" prefix: plain ids like "menu" or "build" are styled by the game's CSS)
document.getElementById('toc').innerHTML = SECTIONS.map((s) => `<a href="#h-${s.id}">${s.icon}${s.title}</a>`).join('');
document.getElementById('helpMain').innerHTML = SECTIONS.map((s) => `
  <section class="help-card" id="h-${s.id}"><h2>${s.icon}${s.title}</h2>${s.html}</section>`).join('');
const title = document.getElementById('helpTitle');
title.innerHTML = [...title.textContent].map((ch, i) => (ch === ' ' ? ' ' : `<span style="animation-delay:${i * 0.08}s">${ch}</span>`)).join('');
document.title = `${t('How to play')} · ${t('Settlers of the World')}`;
// language switch
const ls = document.getElementById('helpLang');
ls.innerHTML = Object.entries(LANGS).map(([k, name]) => `<button type="button" class="${k === lang ? 'on' : ''}" data-lang="${k}">${name}</button>`).join('');
ls.querySelectorAll('button').forEach((b) => { b.onclick = () => setLang(b.dataset.lang); });
// opened from the game in its own tab -> "back" just closes this tab
const back = document.getElementById('backLink');
back.textContent = window.opener ? t('← Back to the game') : t('← Back to the menu');
back.addEventListener('click', (e) => { if (window.opener) { e.preventDefault(); window.close(); } });
applyMenuBackground(document.body); // same illustrated sea as the start menu
