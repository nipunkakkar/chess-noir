import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, validCode } from '../network.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
test('room protocol validates seats, moves, reconnection and agreement', async () => {
  const channels = new Map(); let sequence = 0;
  globalThis.window = { ChessRelay: { connect(code, options) {
    const users = channels.get(code) || new Map(); channels.set(code, users);
    const uid = 'test-' + ++sequence, listeners = new Map();
    const emit = (name, event) => { for (const callback of listeners.get(name) || []) callback(event); };
    const client = { alias: options.as, emit, on(name, callback) { const callbacks = listeners.get(name) || []; callbacks.push(callback); listeners.set(name, callbacks); return client; },
      send(message, target) { for (const [otherId, other] of users) if (otherId !== uid && (!target || target === otherId)) queueMicrotask(() => other.emit('message', { uid, alias: options.as, message })); },
      close() { users.delete(uid); for (const other of users.values()) queueMicrotask(() => other.emit('leave', { uid })); queueMicrotask(() => emit('close')); }
    };
    users.set(uid,client);
    queueMicrotask(() => emit('join', { self:true,uid,users:[...users].map(([uid,user]) => ({ uid,alias:user.alias })) }));
    return client;
  } } };
  const host = new Room(() => {}, () => {}), guest = new Room(() => {}, () => {}), stranger = new Room(() => {}, () => {});
  try {
    await host.create({ white:'Alice',control:'rapid' }); assert.equal(validCode(host.code),true); assert.equal(host.game.paused,true);
    await guest.join(host.code,'Bob'); assert.equal(host.game.names.b,'Bob'); assert.equal(host.game.paused,false);
    await assert.rejects(stranger.join(host.code,'Third seat'), /two players/); stranger.close();
    await assert.rejects(guest.command({ type:'move',from:'e7',to:'e5' }), /turn/);
    await host.command({ type:'move',from:'e2',to:'e4' }); await flush();
    await guest.command({ type:'move',from:'e7',to:'e5' }); assert.deepEqual(host.game.chess.history(),['e4','e5']);
    await assert.rejects(guest.command({ type:'move',from:'d2',to:'d4' }), /turn/);
    guest.relay.close(); await flush(); assert.equal(host.game.paused,true);
    await guest.reconnect(); assert.equal(host.game.paused,false); assert.equal(guest.state.moves.length,2);
    // A host reconnect gets a new relay UID; the guest recognizes the seat proof.
    host.relay.close(); await flush(); assert.equal(guest.connected,false);
    await host.reconnect(); await flush(); assert.equal(guest.connected,true);
    await host.command({ type:'draw' }); await flush(); await guest.command({ type:'draw' });
    assert.equal(host.game.result.reason,'agreement');
  } finally { host.close(); guest.close(); stranger.close(); delete globalThis.window; }
});
