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

// Geluidssamples (wav) uit /public/sounds — lui geladen en hergebruikt.
const samples: Record<string, HTMLAudioElement> = {};
function play(file: string, volume = 0.85) {
  if (typeof Audio === "undefined" || !soundEnabled()) return;
  let a = samples[file];
  if (!a) { a = new Audio(file); a.preload = "auto"; samples[file] = a; }
  a.volume = volume;
  try { a.currentTime = 0; } catch {}
  a.play().catch(() => {});
}

export function tick() { tone(880, 0, 0.06, "square", 0.08); }
export function correct() { play("/sounds/goud.wav"); }      // goed antwoord
export function wrong() { play("/sounds/fout.wav"); }        // fout antwoord
export function fanfare() { play("/sounds/winnaar.wav", 0.95); } // winnaar / eindscherm
