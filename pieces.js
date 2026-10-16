// Original Staunton-inspired pieces, independent of external images and fonts.
const shapes = {
  p: '<circle cx="30" cy="17" r="7.5"/><path d="M24 25h12c2 0 3 3 1 5l-3 2c0 6 2 10 6 13H20c4-3 6-7 6-13l-3-2c-2-2-1-5 1-5Z"/><path d="M20 44h20l3 5v4H17v-4Z"/><path class="piece-detail" d="M20 49h20"/>',
  r: '<path d="M15 10h7v7h5v-7h6v7h5v-7h7v15l-7 6v11l4 5v6H18v-6l4-5V31l-7-6Z"/><path class="piece-detail" d="M18 24h24M23 31h14M23 42h14M20 48h20"/>',
  n: '<path d="m17 44 2-8c2-5 7-8 11-12l-9 5-7-1-3-6 10-9 5-1 2-7 5 6c14 2 17 18 13 34Z"/><path class="piece-detail" d="M32 15c8 5 10 13 6 23M19 24l4-2"/><path class="piece-eye" d="M26 17h3v3h-3Z"/><path d="M18 44h27l2 5v4H15v-4Z"/><path class="piece-detail" d="M18 49h26"/>',
  b: '<circle cx="30" cy="8" r="3"/><path d="M30 11c-3 5-12 11-12 18 0 6 5 9 12 9s12-3 12-9c0-7-9-13-12-18Z"/><path class="piece-detail" d="m33 19-8 10"/><path d="M25 37h10l3 7H22Z"/><path d="M20 44h20l4 5v4H16v-4Z"/><path class="piece-detail" d="M20 49h20"/>',
  q: '<path d="m13 19 5 18h24l5-18-11 9-6-15-6 15Z"/><circle cx="12" cy="16" r="3.5"/><circle cx="30" cy="10" r="3.5"/><circle cx="48" cy="16" r="3.5"/><path d="M20 37h20v5l3 6v5H17v-5l3-6Z"/><path class="piece-detail" d="M21 41h18M20 48h20"/>',
  k: '<path d="M27 5h6v5h5v5h-5v7h-6v-7h-5v-5h5Z"/><path d="M30 26c-11-16-24-3-16 8l8 9h16l8-9c8-11-5-24-16-8Z"/><path class="piece-detail" d="M30 24v13M22 37h16"/><path d="M20 43h20l4 6v4H16v-4Z"/><path class="piece-detail" d="M20 49h20"/>'
};
export const pieceSVG = (type, color) => `<svg class="piece-svg ${color === 'w' ? 'ivory' : 'obsidian'}" viewBox="0 0 60 60" aria-hidden="true"><g stroke-linecap="round" stroke-linejoin="round" stroke-width="1.65">${shapes[type] || ''}</g></svg>`;
export const pieceName = { p: 'pawn', r: 'rook', n: 'knight', b: 'bishop', q: 'queen', k: 'king' };
