import { Chess } from './vendor/chess.js';
import { Game, colorName, resultText } from './game.js';
import { Room, validCode } from './network.js';
import { pieceSVG, pieceName } from './pieces.js';
import { Sound } from './audio.js';

const $ = id => document.getElementById(id), sound = new Sound();
const files = 'abcdefgh', storageKey = 'chess-noir-local-v1';
let game = new Game(), chess = game.chess, state, room = null, orientation = 'w', selected = null, mode = 'local';
let optionsMode = 'local', lastMoves = '', displayedResult = '', busy = false, snapshotAt = Date.now(), toastTimer;
let pendingPromotion = null, confirmResolve = null, drag = null, suppressClick = false;
const squares = new Map();
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4200); }
function announce(message) { $('announcement').textContent = message; }
function myColor() { return mode === 'local' ? chess.turn() : mode === 'host' ? 'w' : 'b'; }
function canPlay() { return !busy && !state?.result && !state?.paused && (!room || (room.connected && state?.ready && state?.guestConnected)); }
function canMove() { return canPlay() && myColor() === chess.turn(); }
function confirm(title, copy, accept = 'Confirm') {
  $('confirm-title').textContent = title; $('confirm-copy').textContent = copy; $('confirm-accept').textContent = accept;
  $('confirm-dialog').showModal(); return new Promise(resolve => { confirmResolve = resolve; });
}
function resolveConfirm(value) { $('confirm-dialog').close(); confirmResolve?.(value); confirmResolve = null; }
$('confirm-accept').onclick = () => resolveConfirm(true); $('confirm-cancel').onclick = () => resolveConfirm(false);
$('confirm-dialog').addEventListener('cancel', event => { event.preventDefault(); resolveConfirm(false); });
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => button.closest('dialog').close());
$('help-button').onclick = () => $('help-dialog').showModal();

function buildBoard() {
  const focused = document.activeElement?.dataset.square;
  $('board').replaceChildren(); squares.clear();
  const ranks = orientation === 'w' ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];
  const columns = orientation === 'w' ? [...files] : [...files].reverse();
  for (const [row, rank] of ranks.entries()) for (const [column, file] of columns.entries()) {
    const square = file + rank, button = document.createElement('button');
    button.className = 'square' + ((files.indexOf(file) + rank) % 2 ? '' : ' dark'); button.dataset.square = square;
    button.type = 'button'; button.tabIndex = square === (focused || (orientation === 'w' ? 'e2' : 'e7')) ? 0 : -1;
    button.onclick = () => { if (!suppressClick) selectSquare(square); };
    button.onkeydown = event => keyboard(event, square); button.onpointerdown = event => pointerDown(event, square);
    const coord = (text, kind) => { const span = document.createElement('span'); span.className = 'coordinate ' + kind; span.textContent = text; span.setAttribute('aria-hidden', 'true'); button.append(span); };
    if (column === 0) coord(rank, 'rank'); if (row === 7) coord(file, 'file');
    squares.set(square, button); $('board').append(button);
  }
  const frame = $('board').parentElement;
  frame.before($('player-' + (orientation === 'w' ? 'b' : 'w'))); frame.after($('player-' + orientation));
  paint();
  if (focused) squares.get(focused)?.focus({ preventScroll: true });
}
function paint() {
  if (!squares.size) return;
  const history = chess.history({ verbose: true }), last = history.at(-1);
  const targets = selected && canMove() ? chess.moves({ square: selected, verbose: true }) : [];
  for (const [square, button] of squares) {
    const piece = chess.get(square); button.querySelector('.piece-svg')?.remove();
    if (piece) button.insertAdjacentHTML('afterbegin', pieceSVG(piece.type, piece.color));
    button.setAttribute('aria-label', `${square}${piece ? `, ${colorName(piece.color)} ${pieceName[piece.type]}` : ', empty'}${square === selected ? ', selected' : ''}`);
    button.setAttribute('aria-pressed', String(square === selected));
    button.classList.toggle('selected', square === selected);
    button.classList.toggle('last-move', last?.from === square || last?.to === square);
    button.classList.toggle('check', !!(piece?.type === 'k' && piece.color === chess.turn() && chess.isCheck()));
    const target = targets.find(move => move.to === square);
    button.classList.toggle('can-move', !!target && !target.captured);
    button.classList.toggle('can-capture', !!target?.captured);
  }
  $('board').setAttribute('aria-label', `Chessboard. ${state?.result ? resultText(state.result).title : colorName(chess.turn()) + ' to move'}.`);
}
async function selectSquare(square) {
  if (!canMove()) {
    if (room && !state?.ready) toast('Invite a friend to take the other seat.');
    else if (room && myColor() !== chess.turn()) toast('Your friend is thinking. Your turn is next.');
    return;
  }
  sound.unlock();
  if (selected === square) { selected = null; paint(); return; }
  if (selected) {
    const legal = chess.moves({ square: selected, verbose: true }).filter(move => move.to === square);
    if (legal.length) {
      const from = selected; selected = null;
      if (legal.some(move => move.promotion)) {
        pendingPromotion = { from, to: square }; $('promotion-choices').replaceChildren();
        for (const type of ['q','r','b','n']) {
          const button = document.createElement('button'); button.innerHTML = pieceSVG(type, chess.turn()); button.setAttribute('aria-label', 'Promote to ' + pieceName[type]);
          button.onclick = () => { $('promotion-dialog').close(); pendingPromotion = null; performMove(from, square, type); }; $('promotion-choices').append(button);
        }
        $('promotion-dialog').showModal(); paint(); return;
      }
      await performMove(from, square); return;
    }
  }
  if (chess.get(square)?.color === chess.turn()) { selected = square; paint(); }
  else { selected = null; paint(); }
}
async function performMove(from, to, promotion = 'q') {
  if (!canMove()) return;
  busy = true;
  try {
    if (room) await room.command({ type: 'move', from, to, promotion });
    else { const move = game.move(chess.turn(), from, to, promotion); update(game.snapshot(), move); save(); }
  } catch (error) { toast(error.message); }
  finally { busy = false; paint(); }
}
$('cancel-promotion').onclick = () => { pendingPromotion = null; $('promotion-dialog').close(); };
$('promotion-dialog').addEventListener('cancel', () => { pendingPromotion = null; });
function keyboard(event, square) {
  const buttons = [...squares.values()], index = buttons.findIndex(button => button.dataset.square === square);
  const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
  if (Object.hasOwn(steps, event.key)) {
    event.preventDefault(); const next = buttons[index + steps[event.key]]; if (!next) return;
    buttons.forEach(button => button.tabIndex = -1); next.tabIndex = 0; next.focus();
  } else if (event.key === 'Escape') { selected = null; paint(); }
}
function pointerDown(event, square) {
  if (event.button !== 0 || !canMove() || chess.get(square)?.color !== chess.turn()) return;
  drag = { square, x: event.clientX, y: event.clientY, active: false, element: null, pointerId: event.pointerId };
}
document.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8) {
    drag.active = true; selected = drag.square; paint();
    const source = squares.get(drag.square), piece = chess.get(drag.square), size = source.getBoundingClientRect().width;
    drag.element = document.createElement('div'); drag.element.className = 'drag-ghost'; drag.element.style.width = size + 'px'; drag.element.style.height = size + 'px'; drag.element.innerHTML = pieceSVG(piece.type, piece.color); document.body.append(drag.element); source.classList.add('drag-source');
  }
  if (drag.active) { event.preventDefault(); drag.element.style.left = event.clientX + 'px'; drag.element.style.top = event.clientY + 'px'; }
}, { passive: false });
function clearDrag() { if (drag?.element) drag.element.remove(); if (drag) squares.get(drag.square)?.classList.remove('drag-source'); drag = null; }
document.addEventListener('pointerup', event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (drag.active) {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-square]')?.dataset.square;
    suppressClick = true; setTimeout(() => suppressClick = false, 0); const source = drag.square; clearDrag();
    if (target && target !== source) selectSquare(target); else { selected = null; paint(); }
  } else clearDrag();
});
document.addEventListener('pointercancel', clearDrag);

function animateMove(move) {
  if (!move || reducedMotion()) return;
  const from = squares.get(move.from)?.getBoundingClientRect(), to = squares.get(move.to)?.getBoundingClientRect();
  if (!from || !to) return;
  const animatePiece = (source, target) => {
    const a = squares.get(source)?.getBoundingClientRect(), b = squares.get(target)?.getBoundingClientRect();
    const piece = squares.get(target)?.querySelector('svg');
    if (a && b && piece) piece.animate([{ transform: `translate(${a.x - b.x}px,${a.y - b.y}px) scale(1.08)` }, { transform: 'translate(0,0) scale(1)' }], { duration: 260, easing: 'cubic-bezier(.22,.7,.2,1)' });
  };
  animatePiece(move.from, move.to);
  if (move.flags.includes('k')) animatePiece('h' + move.from[1], 'f' + move.from[1]);
  if (move.flags.includes('q')) animatePiece('a' + move.from[1], 'd' + move.from[1]);
  if (move.captured || state.result || move.promotion) {
    const area = $('effects').getBoundingClientRect();
    for (let i = 0; i < (state.result ? 32 : 14); i++) {
      const spark = document.createElement('i'), angle = Math.random() * Math.PI * 2, distance = 25 + Math.random() * 70;
      spark.className = 'spark'; spark.style.left = to.x + to.width / 2 - area.x + 'px'; spark.style.top = to.y + to.height / 2 - area.y + 'px';
      spark.style.setProperty('--dx', Math.cos(angle) * distance + 'px'); spark.style.setProperty('--dy', Math.sin(angle) * distance + 'px'); $('effects').append(spark); setTimeout(() => spark.remove(), 600);
    }
  }
}
function update(next, explicitMove = null) {
  const key = next.moves.join(' '), changed = key !== lastMoves, previousCount = state?.moves.length || 0;
  if (room && changed) {
    chess = new Chess(); for (const move of next.moves) chess.move(move);
  } else if (!room) chess = game.chess;
  state = next; snapshotAt = Date.now();
  if (changed) selected = null;
  lastMoves = key;
  paint(); renderDetails(); renderClocks();
  const move = explicitMove || (changed && next.moves.length > previousCount ? chess.history({ verbose: true }).at(-1) : null);
  if (move) { animateMove(move); sound.play(next.result ? 'end' : chess.isCheck() ? 'check' : move.captured ? 'capture' : 'move'); announce(`${colorName(move.color)} played ${move.san}. ${$('status-title').textContent}.`); }
  if (next.result && JSON.stringify(next.result) !== displayedResult) {
    displayedResult = JSON.stringify(next.result); const text = resultText(next.result);
    $('result-title').textContent = text.title; $('result-detail').textContent = text.detail + '. Thank you for a good game.';
    setTimeout(() => { if (state.result && !$('setup-dialog').open && !$('result-dialog').open) $('result-dialog').showModal(); }, 450);
  } else if (!next.result) { displayedResult = ''; $('result-dialog').close(); }
}
function renderDetails() {
  const end = resultText(state.result), waiting = !!room && (!state.ready || !state.guestConnected || !room.connected);
  const turn = chess.turn();
  $('mode-label').textContent = room ? 'PRIVATE ONLINE ROOM' : 'SAME DEVICE';
  $('session-label').textContent = state.result ? 'WELL PLAYED' : waiting ? 'A SEAT IS WAITING' : chess.isCheck() ? 'KING UNDER PRESSURE' : 'LET’S PLAY';
  $('status-title').textContent = end ? end.title : waiting ? (state.ready ? 'Game paused' : 'Invite a friend') : `${colorName(turn)} to move`;
  $('status-icon').textContent = state.result ? '♔' : turn === 'w' ? '♔' : '♚';
  $('status-detail').textContent = end ? end.detail : waiting ? 'Play resumes when both players are connected.' : state.offer ? `${colorName(state.offer)} offers a draw. The other player can accept below.` : chess.isCheck() ? 'Your king needs a little attention. Find a safe move.' : state.moves.length ? `${state.names[turn]}, the next move is yours.` : 'Every great game begins with a single move.';
  $('connection-label').textContent = room ? (mode === 'host' ? 'You play White' : 'You play Black') : '2 players · one device';
  $('time-label').textContent = ({ none: '∞ Untimed', rapid: '10 min · Rapid', blitz: '5 + 3 · Blitz', relaxed: '15 + 10 · Leisurely' })[state.control];
  $('room-panel').hidden = !room;
  if (room) {
    $('room-code').textContent = room.code;
    $('room-message').textContent = !room.connected ? 'Connection lost. Reconnect to continue.' : !state.ready ? 'Copy the invitation link and send it to a friend. Keep this tab open.' : !state.guestConnected ? 'Waiting for your friend to reconnect. The clock is paused.' : 'Both seats are filled. Enjoy your game.';
    $('reconnect-button').hidden = room.connected;
  }
  for (const color of ['w','b']) {
    $('name-' + color).textContent = state.names[color];
    $('player-' + color).classList.toggle('active-player', !state.result && !waiting && turn === color);
    const captured = chess.history({ verbose: true }).filter(move => move.color === color && move.captured).map(move => move.captured);
    $('captures-' + color).innerHTML = captured.sort((a,b) => 'qrbnp'.indexOf(a) - 'qrbnp'.indexOf(b)).map(type => pieceSVG(type, color === 'w' ? 'b' : 'w')).join('');
  }
  $('move-count').textContent = String(state.moves.length).padStart(2, '0') + ' MOVES';
  const history = $('history'), pinned = history.scrollHeight - history.scrollTop - history.clientHeight < 45;
  if (history.dataset.moves !== lastMoves) {
    history.dataset.moves = lastMoves;
    if (state.moves.length) {
      history.replaceChildren();
      for (let index = 0; index < state.moves.length; index += 2) {
        const row = document.createElement('div'); row.className = 'move-row';
        [String(index / 2 + 1).padStart(2, '0'), state.moves[index], state.moves[index + 1] || '—'].forEach((text, column) => {
          const cell = document.createElement('span'); cell.textContent = text;
          if (column > 0 && index + column - 1 === state.moves.length - 1) cell.className = 'latest'; row.append(cell);
        }); history.append(row);
      }
      if (pinned) history.scrollTop = history.scrollHeight;
    } else history.innerHTML = '<div class="empty-journal"><span aria-hidden="true">♙</span><p>A blank page.<br>Your opening is waiting.</p></div>';
  }
  $('undo-button').disabled = !!room || !state.moves.length;
  $('undo-button').title = room ? 'Takebacks are available in same-device games.' : 'Undo the last move';
  $('resign-button').disabled = !!state.result || waiting || !state.moves.length;
  $('draw-button').disabled = !!state.result || waiting || (!!state.offer && mode !== 'local' && state.offer === myColor());
  $('draw-button').textContent = state.offer ? (mode === 'local' || state.offer !== myColor() ? '½ Accept draw' : 'Draw offered') : '½ Offer draw';
  $('export-button').disabled = !state.moves.length;
  $('board-hint').textContent = state.result ? 'A good game. Another round?' : selected ? 'Choose a highlighted square' : 'Select a piece to see its moves';
}
function renderClocks() {
  if (!state) return;
  for (const color of ['w','b']) {
    const remaining = Math.max(0, state.remaining[color] - (state.running && color === chess.turn() && (!room || room.connected) ? Date.now() - snapshotAt : 0));
    const seconds = Math.ceil(remaining / 1000), label = $('clock-' + color);
    label.textContent = state.control === 'none' ? '∞' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')}`;
    label.classList.toggle('low-time', state.control !== 'none' && seconds < 30 && !state.result);
    label.setAttribute('aria-label', state.control === 'none' ? 'No clock' : `${colorName(color)} has ${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds`);
  }
}
function save() {
  if (room) return;
  try { localStorage.setItem(storageKey, JSON.stringify({ ...game.snapshot(), snapshots: game.snapshots, at: Date.now() })); } catch { /* Games work without storage. */ }
}
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved || !Array.isArray(saved.moves) || saved.moves.length > 2000 || !saved.remaining || !Number.isFinite(saved.at)) return;
    const restored = new Game({ white: saved.names.w, black: saved.names.b, control: saved.control });
    for (const san of saved.moves) restored.chess.move(san);
    restored.remaining = saved.remaining; restored.snapshots = saved.snapshots || []; restored.result = saved.result; restored.offer = saved.offer; restored.version = saved.version;
    restored.runningAt = saved.running && !saved.result ? saved.at : null; restored.settle(); game = restored; chess = game.chess;
  } catch { /* A corrupt saved game starts afresh. */ }
}
function chooseMode(value) {
  optionsMode = value;
  document.querySelectorAll('[data-mode]').forEach(button => { button.classList.toggle('selected', button.dataset.mode === value); button.setAttribute('aria-pressed', String(button.dataset.mode === value)); });
  $('black-name-label').hidden = value !== 'local'; $('white-name-label').firstChild.textContent = value === 'local' ? 'White player' : 'Your name';
  $('white-name').placeholder = value === 'join' ? 'Black' : 'White';
  $('code-label').hidden = value !== 'join'; $('time-control-label').hidden = value === 'join';
  $('start-button').innerHTML = (value === 'local' ? 'Set the table' : value === 'host' ? 'Create private room' : 'Join the table') + ' <span aria-hidden="true">↗</span>';
  $('mode-description').textContent = value === 'local' ? 'Pass the device between turns. White makes the first move.' : value === 'host' ? 'You play White. Share the invitation link with one friend. Keep this tab open during the game.' : 'You play Black. Enter the code from your friend’s invitation. The host sets the clock.';
  $('setup-error').textContent = '';
}
document.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => chooseMode(button.dataset.mode));
$('new-game-button').onclick = () => { chooseMode(room ? 'host' : 'local'); $('setup-dialog').showModal(); };
$('rematch-button').onclick = () => { $('result-dialog').close(); chooseMode(room ? 'host' : 'local'); $('setup-dialog').showModal(); };
$('setup-form').onsubmit = async event => {
  event.preventDefault(); if (busy) return;
  const code = $('join-code').value.toUpperCase().replace(/\s/g,'');
  if (optionsMode === 'join' && !validCode(code)) { $('setup-error').textContent = 'Enter the 10-character invitation code.'; return; }
  if ((room || state.moves.length) && !state.result) {
    $('setup-dialog').close();
    if (!await confirm('Leave this game?', room ? 'Starting a new game leaves the current table. Your opponent will be disconnected from you.' : 'Starting a new game replaces your saved game on this device.', 'Leave & start')) { $('setup-dialog').showModal(); return; }
    $('setup-dialog').showModal();
  }
  busy = true; $('start-button').disabled = true; $('setup-error').textContent = '';
  const previous = room; let pendingRoom = null;
  try {
    const settings = { white: $('white-name').value, black: $('black-name').value, control: $('time-control').value };
    if (optionsMode === 'local') {
      previous?.close(); room = null; mode = 'local'; orientation = 'w'; game = new Game(settings); chess = game.chess; lastMoves = ''; state = null;
      history.replaceState(null, '', location.pathname + location.search); update(game.snapshot()); save();
    } else {
      const nextRoom = new Room(next => { if (room === nextRoom) update(next); }, (status, message) => { if (room === nextRoom) { if (message) toast(message); if (state) renderDetails(); } });
      pendingRoom = nextRoom;
      // Retain the existing table until the new connection is successful.
      if (optionsMode === 'host') await nextRoom.create(settings);
      else await nextRoom.join(code, $('white-name').value);
      previous?.close(); room = nextRoom; mode = optionsMode; orientation = mode === 'host' ? 'w' : 'b';
      state = null; lastMoves = ''; chess = new Chess(); update(room.state); history.replaceState(null, '', '#room=' + room.code);
    }
    selected = null; buildBoard(); $('setup-dialog').close(); toast(room ? (mode === 'host' ? 'Your table is open. Invite a friend.' : 'You’re in. You play Black.') : 'The table is set. White moves first.');
  } catch (error) { pendingRoom?.close(); $('setup-error').textContent = error.message; }
  finally { busy = false; $('start-button').disabled = false; }
};
$('flip-button').onclick = () => { orientation = orientation === 'w' ? 'b' : 'w'; buildBoard(); const first = $('player-' + (orientation === 'w' ? 'b' : 'w')), second = $('player-' + orientation); $('board').parentElement.before(first); $('board').parentElement.after(second); toast('Board flipped.'); };
$('sound-button').onclick = () => { sound.enabled = !sound.enabled; if (sound.enabled) sound.play(); $('sound-button').innerHTML = '<span aria-hidden="true">♪</span> Sound ' + (sound.enabled ? 'on' : 'off'); $('sound-button').setAttribute('aria-pressed', String(sound.enabled)); };
$('undo-button').onclick = () => { if (!room && game.undo()) { selected = null; update(game.snapshot()); save(); toast('One move taken back.'); } };
$('draw-button').onclick = async () => {
  if (!canPlay()) return;
  const actor = mode === 'local' && state.offer ? (state.offer === 'w' ? 'b' : 'w') : myColor(), accepting = !!state.offer && state.offer !== actor;
  if (!await confirm(accepting ? 'Call it a draw?' : 'Offer a draw?', accepting ? `${colorName(actor)}, accept the draw and end this game?` : 'Your opponent can accept the offer or play on. Making a move clears the offer.', accepting ? 'Accept draw' : 'Offer draw')) return;
  try { if (room) await room.command({ type: 'draw' }); else { game.draw(actor); update(game.snapshot()); save(); } } catch (error) { toast(error.message); }
};
$('resign-button').onclick = async () => {
  const actor = myColor(); if (!canPlay() || !await confirm(`${colorName(actor)}, resign?`, 'Your opponent wins this game. There is always another round.', 'Resign')) return;
  try { if (room) await room.command({ type: 'resign' }); else { game.resign(actor); update(game.snapshot()); save(); } } catch (error) { toast(error.message); }
};
$('copy-button').onclick = async () => {
  const invite = new URL(location.href); invite.hash = 'room=' + room.code;
  try { await navigator.clipboard.writeText(invite.href); toast('Invitation link copied. Send it to your friend.'); }
  catch { toast('Copy this room code: ' + room.code); }
};
$('reconnect-button').onclick = async () => { if (!room) return; $('reconnect-button').disabled = true; try { await room.reconnect(); renderDetails(); } catch (error) { toast(error.message); } finally { $('reconnect-button').disabled = false; } };
$('export-button').onclick = () => {
  const result = state.result ? (state.result.winner === 'w' ? '1-0' : state.result.winner === 'b' ? '0-1' : '1/2-1/2') : '*';
  const pgn = new Chess(); for (const move of state.moves) pgn.move(move);
  pgn.header('Event', 'Chess Noir', 'Site', 'https://nipunkakkar.github.io/chess-noir/', 'White', state.names.w, 'Black', state.names.b, 'Result', result);
  const url = URL.createObjectURL(new Blob([pgn.pgn() + '\n'], { type: 'application/x-chess-pgn' }));
  const link = document.createElement('a'); link.href = url; link.download = 'chess-noir.pgn'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener('beforeunload', () => save());
restore(); buildBoard(); update(game.snapshot());
setInterval(() => { if (!room) { const previous = game.result; game.settle(); if (game.result !== previous) { update(game.snapshot()); save(); } } renderClocks(); }, 100);
setInterval(save, 2000);
const invitation = new URLSearchParams(location.hash.slice(1)).get('room')?.toUpperCase();
if (invitation) { chooseMode('join'); $('join-code').value = invitation; $('setup-dialog').showModal(); }
