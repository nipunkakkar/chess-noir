import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, resultText } from '../game.js';

function play(game, moves) {
  for (const san of moves) {
    const move = game.chess.moves({ verbose: true }).find(move => move.san === san);
    assert.ok(move, 'Legal move: ' + san); game.move(game.chess.turn(), move.from, move.to, move.promotion);
  }
}
test('rejects illegal and out-of-turn moves without changing the position', () => {
  const game = new Game(), start = game.chess.fen();
  assert.throws(() => game.move('b', 'e7', 'e5'), /turn/);
  assert.throws(() => game.move('w', 'e2', 'e5'));
  assert.equal(game.chess.fen(), start); assert.equal(game.snapshots.length, 0);
});
test('checkmate ends play and takeback restores the preceding position', () => {
  const game = new Game(); play(game, ['f3','e5','g4','Qh4#']);
  assert.deepEqual(game.result, { winner: 'b', reason: 'checkmate' });
  assert.throws(() => game.move('w', 'a2', 'a3'), /finished/);
  assert.equal(game.undo(), true); assert.equal(game.result, null); assert.equal(game.chess.turn(), 'b');
});
test('castling moves king and rook; undo restores castling rights', () => {
  const game = new Game(); play(game, ['e4','e5','Nf3','Nc6','Bc4','Nf6','O-O']);
  assert.equal(game.chess.get('g1').type, 'k'); assert.equal(game.chess.get('f1').type, 'r'); assert.equal(game.chess.get('h1'), undefined);
  game.undo(); assert.equal(game.chess.get('e1').type, 'k'); assert.equal(game.chess.getCastlingRights('w').k, true);
});
test('en passant captures the pawn on its adjacent square', () => {
  const game = new Game(); play(game, ['e4','a6','e5','d5','exd6']);
  assert.equal(game.chess.get('d5'), undefined); assert.equal(game.chess.get('d6').color, 'w');
  game.undo(); assert.equal(game.chess.get('d5').type, 'p');
});
test('all promotion choices are honored', () => {
  for (const type of ['q','r','b','n']) {
    const game = new Game(); game.chess.load('7k/P7/8/8/8/8/7p/7K w - - 0 1');
    game.move('w','a7','a8',type); assert.equal(game.chess.get('a8').type,type);
  }
});
test('stalemate, insufficient material and fifty moves are draws', () => {
  const cases = [
    ['7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 'stalemate'],
    ['7k/8/6K1/8/8/8/8/8 w - - 0 1', 'material'],
    ['7k/8/6K1/8/8/8/8/R7 w - - 100 51', 'fifty-moves']
  ];
  for (const [fen, reason] of cases) { const game = new Game(); game.chess.load(fen); game.detectResult(); assert.equal(game.result.reason, reason); }
});
test('threefold repetition preserves complete move history', () => {
  const game = new Game(); play(game, ['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1','Ng8']);
  assert.equal(game.result.reason,'repetition'); assert.equal(game.snapshot().moves.length,8);
});
test('clock starts after first move, applies increments and pauses precisely', () => {
  let now = 10000; const game = new Game({ control: 'blitz', now: () => now });
  now += 900000; assert.equal(game.time('w'),300000);
  game.move('w','e2','e4'); assert.equal(game.remaining.w,303000);
  now += 1234; assert.equal(game.time('b'),298766);
  game.pause(true); now += 600000; assert.equal(game.time('b'),298766);
  game.pause(false); now += 1000; game.move('b','e7','e5'); assert.equal(game.remaining.b,300766);
  game.undo(); assert.equal(game.remaining.b,297766); assert.equal(game.chess.turn(),'b');
});
test('clock expiration rejects late moves and awards the right result', () => {
  let now = 0; const game = new Game({ control: 'rapid', now: () => now });
  game.move('w','e2','e4'); now = 600001;
  assert.throws(() => game.move('b','e7','e5'),/finished/); assert.deepEqual(game.result,{ winner:'w',reason:'timeout' });
});
test('a bare king cannot win on time', () => {
  let now = 0; const game = new Game({ control:'rapid',now:() => now });
  game.chess.load('7k/8/6K1/8/8/8/P7/8 w - - 0 1'); game.runningAt = 0;
  now = 600001; game.settle(); assert.equal(game.result.winner,null);
});
test('draw requires the other player; a move clears the offer', () => {
  const game = new Game(); game.draw('w'); assert.equal(game.result,null); game.draw('w'); assert.equal(game.result,null);
  game.move('w','e2','e4'); assert.equal(game.offer,null); game.draw('b'); game.draw('w'); assert.equal(game.result.reason,'agreement');
});
test('resignation and names have predictable results', () => {
  const game = new Game({ white:'  Alice  ',black:'\nBob\n' }); game.resign('w');
  assert.equal(game.names.w,'Alice'); assert.equal(game.names.b,'Bob'); assert.equal(resultText(game.result).title,'Black wins');
});
