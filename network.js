import { Game, cleanName } from './game.js';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const validCode = code => /^[A-HJ-NP-Z2-9]{10}$/.test(code);
export function newCode() { return [...crypto.getRandomValues(new Uint8Array(10))].map(byte => alphabet[byte & 31]).join(''); }
function identity(code) {
  const key = 'chess-noir-seat-' + code;
  try { const saved = JSON.parse(sessionStorage.getItem(key)); if (saved?.id && saved?.secret) return saved; } catch { /* Optional storage. */ }
  const value = { id: crypto.randomUUID(), secret: crypto.randomUUID() + crypto.randomUUID() };
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* This seat lasts for the current tab. */ }
  return value;
}

export class Room {
  constructor(onState, onStatus) {
    this.onState = onState; this.onStatus = onStatus; this.connected = false; this.guestUid = null;
    this.requests = new Map(); this.disposed = false; this.host = false; this.ready = false;
  }
  async create(options) {
    this.host = true; this.code = newCode(); this.identity = identity(this.code); this.name = options.white;
    this.game = new Game(options); this.game.pause(true);
    await this.open();
    this.broadcast();
    this.heartbeat = setInterval(() => { if (this.connected) this.broadcast(); }, 2000);
  }
  async join(code, name) {
    if (!validCode(code)) throw new Error('Enter the 10-character invitation code.');
    this.code = code; this.name = cleanName(name, 'Black'); this.identity = identity(code);
    await this.open();
    await this.request({ kind: 'join', identity: this.identity, name: this.name });
  }
  send(data, uid) {
    if (!this.connected || this.disposed) throw new Error('The room is disconnected. Reconnect to continue.');
    this.relay.send({ ...data, code: this.code }, uid);
  }
  async open() {
    if (!window.ChessRelay) throw new Error('The room service could not load. Same-device play is still available.');
    const relay = window.ChessRelay.connect('nipun-chess-noir-v1-' + this.code, { as: this.host ? 'white-host' : 'black-guest', announce: true, list: true });
    this.relay = relay;
    return new Promise((resolve, reject) => {
      let opened = false;
      const timer = setTimeout(() => { reject(new Error('The room service did not respond. Please try again.')); relay.close(); }, 18000);
      relay.on('join', event => {
        if (this.relay !== relay || this.disposed || !event.self) return;
        opened = true; clearTimeout(timer); this.connected = true; this.uid = event.uid;
        const hosts = (event.users || []).filter(user => user.uid !== this.uid && user.alias === 'white-host');
        if (this.host && hosts.length) { reject(new Error('Room code already in use. Create another room.')); return; }
        if (!this.host) {
          if (hosts.length !== 1) { reject(new Error('Room not found. Check the code and keep the host’s tab open.')); return; }
          this.hostUid = hosts[0].uid;
        } else if (this.guestUid && !(event.users || []).some(user => user.uid === this.guestUid)) {
          this.guestUid = null; this.game.pause(true);
        }
        if (this.host && this.guestUid && this.guestSeat) this.send({ kind: 'host-return', proof: this.guestSeat.secret }, this.guestUid);
        this.onStatus('connected'); resolve();
      });
      relay.on('message', event => { if (this.relay === relay && !this.disposed) this.receive(event); });
      relay.on('leave', event => {
        if (this.relay !== relay || this.disposed) return;
        if (this.host && event.uid === this.guestUid) {
          this.guestUid = null; this.game.pause(true); this.broadcast(); this.onStatus('waiting');
        } else if (!this.host && event.uid === this.hostUid) { this.connected = false; this.onStatus('lost'); }
      });
      relay.on('error', event => {
        const error = new Error(String(event.message || 'Room service unavailable. Try again.'));
        if (!opened) { clearTimeout(timer); reject(error); } else this.onStatus('error', error.message);
      });
      relay.on('close', () => {
        clearTimeout(timer); if (this.relay !== relay || this.disposed) return;
        this.connected = false;
        if (this.host) { this.game.pause(true); this.broadcast(); }
        for (const pending of this.requests.values()) pending.reject(new Error('Room connection lost. Reconnect to continue.'));
        this.requests.clear(); this.onStatus('lost'); reject(new Error('The room connection was closed.'));
      });
    });
  }
  request(data) {
    return new Promise((resolve, reject) => {
      const request = crypto.randomUUID();
      const timer = setTimeout(() => { this.requests.delete(request); reject(new Error('The host did not respond. Reconnect to the room.')); }, 12000);
      this.requests.set(request, { resolve: () => { clearTimeout(timer); resolve(); }, reject: error => { clearTimeout(timer); reject(error); } });
      try { this.send({ ...data, request }, this.hostUid); } catch (error) { clearTimeout(timer); this.requests.delete(request); reject(error); }
    });
  }
  receive(event) {
    const data = event.message, uid = event.uid;
    if (!uid || !data || typeof data !== 'object' || data.code !== this.code || JSON.stringify(data).length > 100000) return;
    if (this.host) {
      try {
        if (data.kind === 'join') {
          const seat = data.identity;
          if (!seat || typeof seat.id !== 'string' || seat.id.length > 80 || typeof seat.secret !== 'string' || seat.secret.length < 50 || seat.secret.length > 100) throw new Error('Invalid player session. Reload and try again.');
          if (seat.id === this.identity.id) throw new Error('This is the host’s seat. Open the invite in a separate browser.');
          if (this.guestSeat && (this.guestSeat.id !== seat.id || this.guestSeat.secret !== seat.secret)) throw new Error('This table already has two players.');
          if (this.guestUid && this.guestUid !== uid) this.send({ kind: 'closed', message: 'Your seat was reconnected in another tab.' }, this.guestUid);
          this.guestSeat = seat; this.guestUid = uid; this.game.names.b = cleanName(data.name, 'Black');
          this.ready = true; this.game.pause(false); this.broadcast(); this.send({ kind: 'ack', request: data.request }, uid);
        } else if (data.kind === 'command') {
          if (uid !== this.guestUid) throw new Error('Join this table first.');
          this.apply('b', data.command); this.broadcast(); this.send({ kind: 'ack', request: data.request }, uid);
        }
      } catch (error) { this.send({ kind: 'error', request: data.request, message: error.message }, uid); }
    } else {
      if (data.kind === 'host-return' && event.alias === 'white-host' && data.proof === this.identity.secret) {
        this.hostUid = uid; this.connected = true;
        this.request({ kind: 'join', identity: this.identity, name: this.name }).catch(error => this.onStatus('error', error.message)); return;
      }
      if (uid !== this.hostUid) return;
      if (data.kind === 'state') {
        this.ready = true; this.state = data.state; this.onState(data.state);
      } else if (data.kind === 'ack' || data.kind === 'error') {
        const pending = this.requests.get(data.request); if (!pending) return;
        data.kind === 'ack' ? pending.resolve() : pending.reject(new Error(String(data.message || 'Action rejected.'))); this.requests.delete(data.request);
      } else if (data.kind === 'closed') { this.close(); this.onStatus('error', data.message); }
    }
  }
  apply(color, command) {
    if (!command || typeof command !== 'object') throw new Error('Invalid action.');
    if (!this.guestUid || !this.connected) throw new Error('Wait for both players to connect.');
    if (command.version !== this.game.version) throw new Error('The table changed. Please try again.');
    if (command.type === 'move') this.game.move(color, command.from, command.to, command.promotion);
    else if (command.type === 'resign') this.game.resign(color);
    else if (command.type === 'draw') this.game.draw(color);
    else if (command.type === 'decline') { if (this.game.offer && this.game.offer !== color) { this.game.offer = null; this.game.version++; } }
    else throw new Error('Unknown action.');
  }
  async command(command) {
    if (this.host) { this.apply('w', { ...command, version: this.game.version }); this.broadcast(); }
    else await this.request({ kind: 'command', command: { ...command, version: this.state?.version } });
  }
  broadcast() {
    const state = { ...this.game.snapshot(), online: true, ready: this.ready, guestConnected: !!this.guestUid, code: this.code };
    this.state = state; this.onState(state);
    if (this.guestUid && this.connected) this.send({ kind: 'state', state }, this.guestUid);
  }
  async reconnect() {
    if (this.disposed) throw new Error('This room has closed. Create a new room.');
    const old = this.relay; this.relay = null; this.connected = false; old?.close();
    await this.open();
    if (this.host) { if (this.guestUid) this.game.pause(false); this.broadcast(); }
    else await this.request({ kind: 'join', identity: this.identity, name: this.name });
  }
  close() {
    this.disposed = true; this.connected = false; clearInterval(this.heartbeat); this.relay?.close();
    for (const pending of this.requests.values()) pending.reject(new Error('The room was closed.')); this.requests.clear();
  }
}
