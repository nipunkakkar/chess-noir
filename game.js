import { Chess } from './vendor/chess.js';

export const CONTROLS = { none: [0, 0], rapid: [600, 0], blitz: [300, 3], relaxed: [900, 10] };
export const colorName = color => color === 'w' ? 'White' : 'Black';
export const cleanName = (value, fallback) => String(value || '').trim().replace(/[\x00-\x1f]/g, '').slice(0, 24) || fallback;

// The host owns the rules and clock. Guests send commands, never positions.
export class Game {
  constructor({ white = 'White', black = 'Black', control = 'none', now = Date.now } = {}) {
    this.chess = new Chess();
    this.names = { w: cleanName(white, 'White'), b: cleanName(black, 'Black') };
    this.control = Object.hasOwn(CONTROLS, control) ? control : 'none';
    this.now = now;
    this.reset();
  }
  reset() {
    this.chess.reset();
    this.remaining = { w: CONTROLS[this.control][0] * 1000, b: CONTROLS[this.control][0] * 1000 };
    this.runningAt = null; this.paused = false; this.result = null; this.offer = null; this.snapshots = []; this.version = 0;
  }
  time(color, at = this.now()) {
    return Math.max(0, this.remaining[color] - (this.runningAt !== null && !this.paused && this.chess.turn() === color ? at - this.runningAt : 0));
  }
  settle() {
    if (this.runningAt === null || this.paused || this.result || this.control === 'none') return;
    const color = this.chess.turn(), at = this.now();
    this.remaining[color] = this.time(color, at); this.runningAt = at;
    if (this.remaining[color] <= 0) {
      const winner = color === 'w' ? 'b' : 'w';
      // A bare king cannot win on time. Other rare dead positions are handled by chess.js.
      const material = this.chess.board().flat().filter(piece => piece?.color === winner && piece.type !== 'k');
      this.end(material.length ? { winner, reason: 'timeout' } : { winner: null, reason: 'timeout-material' });
    }
  }
  move(color, from, to, promotion = 'q') {
    this.settle();
    if (this.result) throw new Error('This game has finished. Start a rematch.');
    if (this.paused) throw new Error('The game is paused.');
    if (color !== this.chess.turn()) throw new Error('Wait for your turn.');
    const before = { remaining: { ...this.remaining }, started: this.runningAt !== null };
    const move = this.chess.move({ from, to, promotion });
    this.snapshots.push(before);
    if (this.control !== 'none') { this.remaining[color] += CONTROLS[this.control][1] * 1000; this.runningAt = this.now(); }
    this.offer = null; this.version++;
    this.detectResult();
    return move;
  }
  detectResult() {
    if (this.chess.isCheckmate()) this.end({ winner: this.chess.turn() === 'w' ? 'b' : 'w', reason: 'checkmate' });
    else if (this.chess.isStalemate()) this.end({ winner: null, reason: 'stalemate' });
    else if (this.chess.isInsufficientMaterial()) this.end({ winner: null, reason: 'material' });
    else if (this.chess.isThreefoldRepetition()) this.end({ winner: null, reason: 'repetition' });
    else if (this.chess.isDrawByFiftyMoves()) this.end({ winner: null, reason: 'fifty-moves' });
  }
  end(result) { this.result = result; this.runningAt = null; this.offer = null; this.version++; }
  resign(color) { this.settle(); if (!this.result) this.end({ winner: color === 'w' ? 'b' : 'w', reason: 'resignation' }); }
  draw(color) {
    this.settle(); if (this.result) return;
    if (this.offer && this.offer !== color) this.end({ winner: null, reason: 'agreement' });
    else { this.offer = color; this.version++; }
  }
  pause(value) {
    this.settle(); if (this.result || this.paused === value) return;
    this.paused = value;
    if (this.runningAt !== null) this.runningAt = this.now();
    this.version++;
  }
  undo() {
    if (!this.snapshots.length) return false;
    const before = this.snapshots.pop(); this.chess.undo(); this.remaining = before.remaining;
    this.runningAt = before.started ? this.now() : null; this.result = null; this.offer = null; this.version++; return true;
  }
  snapshot() {
    this.settle();
    return { moves: this.chess.history(), names: { ...this.names }, control: this.control,
      remaining: { w: this.time('w'), b: this.time('b') }, running: this.runningAt !== null && !this.paused && !this.result,
      paused: this.paused, result: this.result, offer: this.offer, version: this.version };
  }
}

export const resultText = result => {
  const reasons = { checkmate: 'Checkmate', stalemate: 'Stalemate', material: 'Insufficient material', repetition: 'Threefold repetition', 'fifty-moves': 'Fifty-move rule', agreement: 'Draw by agreement', resignation: 'Resignation', timeout: 'Time is up', 'timeout-material': 'Time is up · insufficient mating material' };
  return result ? { title: result.winner ? `${colorName(result.winner)} wins` : 'A game well shared', detail: reasons[result.reason] || 'Game over' } : null;
};
