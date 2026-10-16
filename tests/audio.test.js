import test from 'node:test';
import assert from 'node:assert/strict';
import { Sound } from '../audio.js';

test('sounds default to enabled and remember an explicit mute', () => {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key), setItem: (key,value) => values.set(key,value) };
  try {
    const sound = new Sound(); assert.equal(sound.enabled,true);
    sound.setEnabled(false); assert.equal(new Sound().enabled,false);
    sound.setEnabled(true); assert.equal(new Sound().enabled,true);
  } finally { delete globalThis.localStorage; }
});

test('effects produce bounded audio, reuse the context, and remain silent when muted', () => {
  const scheduled = [], samples = [], params = [];
  const param = () => ({ value:0, setValueAtTime(value,at) { params.push([value,at]); }, exponentialRampToValueAtTime(value,at) { assert.ok(value > 0); params.push([value,at]); } });
  const node = () => ({ connect(other) { return other; }, start(at) { scheduled.push(['start',at]); }, stop(at) { scheduled.push(['stop',at]); } });
  let contexts = 0;
  class Context {
    constructor() { contexts++; this.currentTime=10; this.sampleRate=44100; this.destination=node(); }
    resume() { return Promise.resolve(); }
    createOscillator() { return { ...node(),frequency:param() }; }
    createGain() { return { ...node(),gain:param() }; }
    createBiquadFilter() { return { ...node(),frequency:param(),Q:param() }; }
    createBufferSource() { return node(); }
    createBuffer(channels,length) { const data=new Float32Array(length); samples.push(data); return { getChannelData:() => data }; }
  }
  globalThis.window = { AudioContext:Context };
  try {
    const sound = new Sound();
    for (const kind of ['move','capture','check','castle','promotion','end']) {
      const before = scheduled.length; sound.play(kind); assert.ok(scheduled.length > before, kind + ' emits audio');
    }
    assert.equal(contexts,1);
    assert.ok(samples.length && samples[0].some(value => Math.abs(value) > .01));
    assert.ok(samples[0].every(value => Number.isFinite(value) && Math.abs(value) <= 1));
    assert.ok(scheduled.every(([,at]) => at >= 10 && at < 11));
    assert.ok(params.every(([value,at]) => Number.isFinite(value) && Number.isFinite(at)));
    const count = scheduled.length; sound.setEnabled(false); sound.play('check'); assert.equal(scheduled.length,count);
  } finally { delete globalThis.window; }
});

test('unsupported or blocked audio never interrupts a game action', () => {
  globalThis.window = { AudioContext:class { constructor() { throw new Error('Audio blocked'); } } };
  try { const sound = new Sound(); assert.doesNotThrow(() => sound.play('check')); }
  finally { delete globalThis.window; }
});
