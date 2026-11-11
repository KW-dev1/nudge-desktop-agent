/**
 * Play the short two-note chime for a new alert. Synthesized with Web Audio,
 * so there is no sound file to ship or load.
 */
export function playChime(): void {
  try {
    const ctx = new AudioContext();
    const notes: [frequency: number, delay: number][] = [
      [880, 0],
      [1174.66, 0.13],
    ];
    for (const [frequency, delay] of notes) {
      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      // Fast attack, soft exponential tail: a bell-like ping, not a beep.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.6);
    }
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    // No audio device. The popup still shows; the sound is a nice-to-have.
  }
}
