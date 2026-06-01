// Lichtgewicht WebAudio-geluidseffecten (geen externe bestanden).
// AudioContext wordt lui aangemaakt en moet na een user-gesture worden ontgrendeld (unlock()).

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function soundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem("quiz_sound") !== "off";
}

export function setSoundEnabled(on: boolean) {
  if (typeof window !== "undefined") localStorage.setItem("quiz_sound", on ? "on" : "off");
}

// Roep dit aan op de eerste tap (bv. join-knop) om audio op iOS te ontgrendelen.
export function unlock() {
  const c = getCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.15) {
  const c = getCtx();
  if (!c || !soundEnabled()) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function tick() { tone(880, 0, 0.06, "square", 0.08); }
export function correct() { tone(660, 0, 0.12, "triangle"); tone(990, 0.1, 0.18, "triangle"); }
export function wrong() { tone(200, 0, 0.25, "sawtooth", 0.12); }
export function fanfare() {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, "triangle", 0.16));
}
