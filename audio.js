export class Sound {
  constructor() { this.enabled = false; this.context = null; }
  unlock() {
    try { this.context ||= new (window.AudioContext || window.webkitAudioContext)(); this.context.resume(); } catch { /* Sound is optional. */ }
  }
  play(kind = 'move') {
    if (!this.enabled) return;
    this.unlock(); const ctx = this.context; if (!ctx) return;
    const notes = kind === 'end' ? [392, 494, 587, 784] : kind === 'check' ? [330, 440] : kind === 'capture' ? [160, 110] : [420, 620];
    notes.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain(), at = ctx.currentTime + index * .07;
      oscillator.type = kind === 'capture' ? 'triangle' : 'sine'; oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.075, at + .008); gain.gain.exponentialRampToValueAtTime(.001, at + .17);
      oscillator.connect(gain).connect(ctx.destination); oscillator.start(at); oscillator.stop(at + .2);
    });
  }
}
