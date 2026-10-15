// Original vector pieces: crisp, consistent, and independent of installed fonts.
const shapes = {
  p: '<circle cx="30" cy="17" r="8"/><path d="M25 25h10l-1 9 6 10H20l6-10z"/><path d="M19 44h22l3 7H16z"/>',
  r: '<path d="M16 10h7v7h4v-7h6v7h4v-7h7v14l-6 5 2 15H20l2-15-6-5z"/><path d="M18 44h24l3 7H15z"/><path d="M23 28h14"/>',
  n: '<path d="m19 44 5-13-8 2-5-6 8-11 10-5 3-6 5 9c10 5 10 18 5 30z"/><path d="M18 44h25l3 7H15z"/><path d="m22 19 4-2m-10 9 5-1m12-8c-1 9-5 14-10 19"/>',
  b: '<path d="M30 7c-5 6-14 12-14 20 0 5 5 9 14 9s14-4 14-9c0-8-9-14-14-20Z"/><path d="m33 16-8 12m0 8-4 8h18l-4-8"/><path d="M18 44h24l3 7H15z"/>',
  q: '<path d="m14 22 5 21h22l5-21-11 9-5-13-5 13z"/><circle cx="12" cy="18" r="4"/><circle cx="30" cy="13" r="4"/><circle cx="48" cy="18" r="4"/><path d="M18 43h24l3 8H15z"/>',
  k: '<path d="M30 5v14m-6-8h12"/><path d="M30 25c-11-15-24-1-15 8l8 10h14l8-10c9-9-4-23-15-8Z"/><path d="M22 35h16M19 43h22l4 8H15z"/>'
};
export const pieceSVG = (type, color) => `<svg class="piece-svg ${color === 'w' ? 'ivory' : 'obsidian'}" viewBox="0 0 60 60" aria-hidden="true"><g stroke-linecap="round" stroke-linejoin="round" stroke-width="2.1">${shapes[type] || ''}</g></svg>`;
export const pieceName = { p: 'pawn', r: 'rook', n: 'knight', b: 'bishop', q: 'queen', k: 'king' };
