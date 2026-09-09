let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfx: GainNode | null = null;
let music: GainNode | null = null;
let muted = false;
let ambientStarted = false;
let droneNodes: { osc: OscillatorNode; g: GainNode }[] = [];

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    sfx = ctx.createGain();
    music = ctx.createGain();
    sfx.gain.value = 0.28;
    music.gain.value = 0.07;
    master.gain.value = muted ? 0 : 0.9;
    sfx.connect(master);
    music.connect(master);
    master.connect(ctx.destination);
    return ctx;
  } catch {
    ctx = null;
    return null;
  }
}

export function unlockAudio() {
  const ac = ensure();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  startAmbient();
}

export function setMuted(next: boolean) {
  muted = next;
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(next ? 0 : 0.9, ctx.currentTime, 0.03);
}

export function isMuted() {
  return muted;
}

function envGain(duration: number, peak: number, attack = 0.01) {
  try {
    const ac = ensure();
    if (!ac || !sfx) return null;
    const g = ac.createGain();
    g.gain.value = 0;
    g.connect(sfx);
    const t = ac.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.linearRampToValueAtTime(0, t + duration);
    return { g, t, ac };
  } catch {
    return null;
  }
}

export function playPlace(mass: number) {
  const e = envGain(0.22, 0.12);
  if (!e) return;
  const osc = e.ac.createOscillator();
  osc.type = "sine";
  const f = 220 + Math.min(700, mass * 0.4);
  osc.frequency.setValueAtTime(f, e.t);
  osc.frequency.exponentialRampToValueAtTime(f * 0.55, e.t + 0.2);
  osc.connect(e.g);
  osc.start(e.t);
  osc.stop(e.t + 0.24);
}

export function playFlick() {
  const e = envGain(0.16, 0.09, 0.005);
  if (!e) return;
  const osc = e.ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(140 + Math.random() * 40, e.t);
  osc.frequency.exponentialRampToValueAtTime(70, e.t + 0.14);
  osc.connect(e.g);
  osc.start(e.t);
  osc.stop(e.t + 0.16);
}

export function playMerge(mass: number) {
  const e = envGain(0.45, Math.min(0.22, 0.08 + Math.log10(mass + 1) * 0.05), 0.008);
  if (!e) return;
  const osc = e.ac.createOscillator();
  osc.type = "sine";
  const f = 90 + Math.random() * 30;
  osc.frequency.setValueAtTime(f, e.t);
  osc.frequency.exponentialRampToValueAtTime(42, e.t + 0.4);
  osc.connect(e.g);
  osc.start(e.t);
  osc.stop(e.t + 0.45);

  const noiseBuf = e.ac.createBuffer(1, e.ac.sampleRate * 0.2, e.ac.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = e.ac.createBufferSource();
  src.buffer = noiseBuf;
  const ng = e.ac.createGain();
  ng.gain.value = 0.08;
  src.connect(ng);
  ng.connect(e.g);
  src.start(e.t);
}

export function playWin() {
  const e = envGain(0.9, 0.12, 0.02);
  if (!e) return;
  const freqs = [392, 494, 587];
  for (const f of freqs) {
    const osc = e.ac.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    osc.connect(e.g);
    osc.start(e.t);
    osc.stop(e.t + 0.85);
  }
}

export function playLose() {
  const e = envGain(0.55, 0.1, 0.01);
  if (!e) return;
  const osc = e.ac.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(196, e.t);
  osc.frequency.exponentialRampToValueAtTime(80, e.t + 0.5);
  osc.connect(e.g);
  osc.start(e.t);
  osc.stop(e.t + 0.55);
}

export function playUi() {
  const e = envGain(0.08, 0.05, 0.004);
  if (!e) return;
  const osc = e.ac.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 660 + Math.random() * 40;
  osc.connect(e.g);
  osc.start(e.t);
  osc.stop(e.t + 0.09);
}

function startAmbient() {
  if (ambientStarted) return;
  const ac = ensure();
  if (!ac || !music) return;
  ambientStarted = true;
  const make = (freq: number, gain: number, type: OscillatorType) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(music!);
    osc.start();
    droneNodes.push({ osc, g });
  };
  make(55, 0.45, "sine");
  make(82.4, 0.18, "sine");
  make(110.2, 0.08, "triangle");
}

export function resumeAudio() {
  if (ctx && ctx.state === "suspended") void ctx.resume();
}
