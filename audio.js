// Original wooden taps and attention cues synthesized locally with Web Audio.
export class Sound {
  constructor() {
    this.enabled = true; this.context = null; this.noise = null;
    try { this.enabled = localStorage.getItem('chess-noir-sound') !== 'off'; } catch { /* Storage is optional. */ }
  }
  setEnabled(value) {
    this.enabled = value;
    try { localStorage.setItem('chess-noir-sound', value ? 'on' : 'off'); } catch { /* Storage is optional. */ }
  }
  unlock() {
    if (!this.enabled) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      this.context ||= new Audio();
      this.context.resume()?.catch(() => {});
    } catch { /* Audio availability never blocks play. */ }
  }
  tone(at, frequency, duration, volume, endFrequency = frequency, type = 'sine') {
    const ctx = this.context, oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + .003);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain).connect(ctx.destination); oscillator.start(at); oscillator.stop(at + duration + .01);
  }
  tap(at, heavy = false) {
    const ctx = this.context;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .06), ctx.sampleRate);
      const samples = this.noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = this.noise; filter.type = 'bandpass'; filter.frequency.value = heavy ? 1550 : 2350; filter.Q.value = .65;
    gain.gain.setValueAtTime(heavy ? .38 : .29, at); gain.gain.exponentialRampToValueAtTime(.0001, at + .037);
    source.connect(filter).connect(gain).connect(ctx.destination); source.start(at); source.stop(at + .055);
    // Fixed, short resonances give a dry wooden clack without a pitch-slide beep.
    this.tone(at, heavy ? 290 : 480, .043, heavy ? .16 : .11);
    this.tone(at + .001, heavy ? 720 : 1180, .024, .055);
    this.tone(at, heavy ? 1430 : 2260, .012, .035);
  }
  play(kind = 'move') {
    if (!this.enabled) return;
    this.unlock(); const ctx = this.context; if (!ctx) return;
    try {
      const at = ctx.currentTime + .005;
      if (kind === 'end') {
        [392,494,587].forEach((note,index) => this.tone(at + index * .1,note,.25,.065,note,'triangle'));
      } else {
        this.tap(at, kind === 'capture');
        if (kind === 'capture') this.tap(at + .045);
        if (kind === 'castle') this.tap(at + .095);
        if (kind === 'check') {
          this.tone(at + .075,660,.14,.065,630,'triangle');
          this.tone(at + .2,880,.2,.055,830,'triangle');
        }
        if (kind === 'promotion') {
          this.tone(at + .09,660,.18,.055,660,'triangle');
          this.tone(at + .19,990,.23,.05,990,'triangle');
        }
      }
    } catch { /* Blocked or unavailable audio must not interrupt a move. */ }
  }
}
