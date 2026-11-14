import { t } from '../i18n.js';
// Small hand-drawn SVG icons for the HUD and menu. Piece icons take the
// player's colour (roofs, kerbs, flags) so the HUD always matches whose turn it is.

const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
  return `rgb(${c.join(',')})`;
};

export function roadIcon(color) {
  return `<svg viewBox="0 0 64 64" class="icon"><g transform="rotate(-25 32 32)">
    <rect x="6" y="24" width="52" height="16" rx="4" fill="#8f877a" stroke="#4a443b" stroke-width="2"/>
    ${[10, 20, 30, 40, 50].map((x) => `<ellipse cx="${x}" cy="29" rx="4" ry="2.6" fill="#b5ab99"/><ellipse cx="${x + 5}" cy="35" rx="4" ry="2.6" fill="#a69c8a"/>`).join('')}
    <rect x="6" y="20" width="52" height="5" rx="2" fill="${color}" stroke="${shade(color, 0.6)}" stroke-width="1.5"/>
    <rect x="6" y="39" width="52" height="5" rx="2" fill="${color}" stroke="${shade(color, 0.6)}" stroke-width="1.5"/>
  </g></svg>`;
}

export function townIcon(color) {
  const roof = color, dark = shade(color, 0.65);
  return `<svg viewBox="0 0 64 64" class="icon">
    <path d="M6 50 Q32 40 58 50 L58 54 Q32 46 6 54 Z" fill="#8a6440"/>
    <rect x="10" y="32" width="20" height="17" fill="#f3ead8" stroke="#3b2a1c" stroke-width="2"/>
    <path d="M10 40 H30 M20 32 V49" stroke="#3b2a1c" stroke-width="2"/>
    <path d="M7 33 L20 20 L33 33 Z" fill="${roof}" stroke="${dark}" stroke-width="2" stroke-linejoin="round"/>
    <rect x="32" y="28" width="22" height="21" fill="#f3ead8" stroke="#3b2a1c" stroke-width="2"/>
    <path d="M32 38 H54 M43 28 V49" stroke="#3b2a1c" stroke-width="2"/>
    <path d="M29 29 L43 14 L57 29 Z" fill="${roof}" stroke="${dark}" stroke-width="2" stroke-linejoin="round"/>
    <rect x="40" y="41" width="6" height="8" fill="#5a4130"/>
    <path d="M24 12 V24" stroke="#3d2c1e" stroke-width="2"/><path d="M24 12 L33 15 L24 18 Z" fill="${color}" stroke="${dark}"/>
  </svg>`;
}

export function cityIcon(color) {
  const roof = color, dark = shade(color, 0.65);
  return `<svg viewBox="0 0 64 64" class="icon">
    <rect x="12" y="30" width="40" height="22" fill="#d9d2c2" stroke="#5f584c" stroke-width="2"/>
    ${[14, 22, 30, 38, 46].map((x) => `<rect x="${x}" y="26" width="4" height="5" fill="#d9d2c2" stroke="#5f584c" stroke-width="1.5"/>`).join('')}
    <rect x="25" y="16" width="14" height="36" fill="#e6dfcf" stroke="#5f584c" stroke-width="2"/>
    <rect x="28" y="40" width="8" height="12" rx="4" fill="#2a211a"/>
    <rect x="6" y="26" width="10" height="26" fill="#e6dfcf" stroke="#5f584c" stroke-width="2"/>
    <rect x="48" y="26" width="10" height="26" fill="#e6dfcf" stroke="#5f584c" stroke-width="2"/>
    <path d="M4 27 L11 14 L18 27 Z M46 27 L53 14 L60 27 Z" fill="${roof}" stroke="${dark}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M23 17 L32 5 L41 17 Z" fill="${roof}" stroke="${dark}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M32 5 V0" stroke="#3d2c1e" stroke-width="1.5"/>
  </svg>`;
}

export function diceIcon() {
  return `<svg viewBox="0 0 64 64" class="icon">
    <rect x="6" y="18" width="30" height="30" rx="7" fill="#fffaf0" stroke="#5b4636" stroke-width="2.5" transform="rotate(-12 21 33)"/>
    <g transform="rotate(-12 21 33)" fill="#5b4636"><circle cx="14" cy="26" r="2.8"/><circle cx="21" cy="33" r="2.8"/><circle cx="28" cy="40" r="2.8"/></g>
    <rect x="30" y="14" width="28" height="28" rx="7" fill="#fffaf0" stroke="#5b4636" stroke-width="2.5" transform="rotate(14 44 28)"/>
    <g transform="rotate(14 44 28)" fill="#c0392b"><circle cx="38" cy="22" r="2.8"/><circle cx="50" cy="34" r="2.8"/><circle cx="38" cy="34" r="2.8"/><circle cx="50" cy="22" r="2.8"/></g>
  </svg>`;
}

/** Little cog with a sail in the player's colour. */
export function shipIcon(color) {
  return `<svg viewBox="0 0 64 64" class="icon"><path d="M31 8 V44" stroke="#5a3d24" stroke-width="3"/>
    <path d="M33 10 C48 16 50 30 46 40 H33 Z" fill="${color}" stroke="#4a3628" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M29 14 C20 22 19 32 22 40 H29 Z" fill="#fff6e4" stroke="#4a3628" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M8 44 H56 L48 56 H16 Z" fill="#8a5a32" stroke="#4a3628" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M12 47 H52" stroke="${color}" stroke-width="3"/></svg>`;
}

/** Pirate skull over crossed sabres (rob a ship). */
export function pirateIcon() {
  return `<svg viewBox="0 0 64 64" class="icon">
    <g stroke="#4a3628" stroke-width="3" stroke-linecap="round"><path d="M10 54 L50 14" /><path d="M54 54 L14 14" /></g>
    <g stroke="#cfd6de" stroke-width="2" stroke-linecap="round"><path d="M12 52 L49 15" /><path d="M52 52 L15 15" /></g>
    <path d="M8 50 l6 6 M56 50 l-6 6" stroke="#8a5a32" stroke-width="5" stroke-linecap="round"/>
    <path d="M32 12 C19 12 14 21 15 30 C16 36 20 38 21 42 L21 48 H43 L43 42 C44 38 48 36 49 30 C50 21 45 12 32 12 Z" fill="#fffaf0" stroke="#4a3628" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="25" cy="30" r="5" fill="#2b2622"/><circle cx="39" cy="30" r="5" fill="#2b2622"/>
    <path d="M32 35 l-3 5 h6 z" fill="#2b2622"/><path d="M26 48 V44 M32 48 V44 M38 48 V44" stroke="#4a3628" stroke-width="2"/>
    <path d="M14 20 C22 6 42 6 50 20 C42 16 22 16 14 20 Z" fill="#c8372d" stroke="#4a3628" stroke-width="2" stroke-linejoin="round"/></svg>`;
}

/** Wrapped present (trade offers). */
export function giftIcon() {
  return `<svg viewBox="0 0 64 64" class="icon"><rect x="10" y="26" width="44" height="30" rx="4" fill="#ff9d7a" stroke="#4a3628" stroke-width="2.5"/>
    <rect x="6" y="18" width="52" height="10" rx="3" fill="#ffc94d" stroke="#4a3628" stroke-width="2.5"/>
    <path d="M32 18 V56" stroke="#4a3628" stroke-width="7"/><path d="M32 18 V56" stroke="#ffe08a" stroke-width="3"/>
    <path d="M32 18 C22 4 10 10 18 18 Z M32 18 C42 4 54 10 46 18 Z" fill="#ffe08a" stroke="#4a3628" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
}

export const RESOURCE_INFO = {
  wood: { label: t('Lumber'), svg: `<svg viewBox="0 0 64 64" class="icon"><rect x="28" y="40" width="8" height="16" fill="#6b4a2b"/><path d="M32 6 L50 30 H40 L54 46 H10 L24 30 H14 Z" fill="#3f7d3a" stroke="#244d22" stroke-width="2" stroke-linejoin="round"/></svg>` },
  brick: { label: t('Brick'), svg: `<svg viewBox="0 0 64 64" class="icon">${[[6, 34], [26, 34], [46, 34], [16, 20], [36, 20], [26, 6]].map(([x, y]) => `<rect x="${x}" y="${y + 14}" width="18" height="12" rx="2" fill="#c0603e" stroke="#7d3520" stroke-width="2"/>`).join('')}</svg>` },
  wool: { label: t('Wool'), svg: `<svg viewBox="0 0 64 64" class="icon"><g fill="#fffaf2" stroke="#8b8172" stroke-width="2"><circle cx="22" cy="30" r="11"/><circle cx="36" cy="26" r="12"/><circle cx="44" cy="36" r="10"/><circle cx="28" cy="40" r="11"/></g><ellipse cx="14" cy="34" rx="6" ry="7" fill="#3b302a"/><rect x="24" y="48" width="4" height="10" fill="#3b302a"/><rect x="40" y="46" width="4" height="10" fill="#3b302a"/></svg>` },
  grain: { label: t('Grain'), svg: `<svg viewBox="0 0 64 64" class="icon">${[-14, 0, 14].map((dx) => `<g transform="translate(${32 + dx} 0) rotate(${dx} 0 56)"><path d="M0 58 V24" stroke="#a8862d" stroke-width="2.5"/>${[0, 1, 2, 3].map((k) => `<ellipse cx="-4" cy="${14 + k * 7}" rx="3.2" ry="5" fill="#e7c157" stroke="#a8862d" transform="rotate(-25 -4 ${14 + k * 7})"/><ellipse cx="4" cy="${14 + k * 7}" rx="3.2" ry="5" fill="#e7c157" stroke="#a8862d" transform="rotate(25 4 ${14 + k * 7})"/>`).join('')}</g>`).join('')}</svg>` },
  ore: { label: t('Ore'), svg: `<svg viewBox="0 0 64 64" class="icon"><path d="M8 50 L18 26 L32 18 L48 24 L58 48 Z" fill="#7d8088" stroke="#45474d" stroke-width="2" stroke-linejoin="round"/><path d="M18 26 L28 38 L48 24 M28 38 L24 50 M28 38 L44 50" stroke="#45474d" stroke-width="2" fill="none"/><circle cx="36" cy="32" r="3" fill="#cfd8e6"/><circle cx="20" cy="40" r="2.5" fill="#cfd8e6"/></svg>` },
};
