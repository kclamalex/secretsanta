/**
 * Tiny synthesized sound effects (no audio files). iOS only allows audio after a tap,
 * so call `unlock()` from the tap handler that starts the reveal.
 */
let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem("secretsanta:muted") === "1";
  } catch {
    return false;
  }
})();

/** Everything plays through one bus (with a shared reverb) so mute and stopAll reach sounds already playing. */
let bus: { gain: GainNode; reverb: ConvolverNode } | null = null;
let impulse: AudioBuffer | null = null;

export const isMuted = () => muted;
export function setMuted(value: boolean) {
  muted = value;
  if (ctx && bus) bus.gain.gain.setTargetAtTime(value ? 0 : 1, ctx.currentTime, 0.03);
  try {
    localStorage.setItem("secretsanta:muted", value ? "1" : "0");
  } catch {
    /* private mode */
  }
}

export function unlock() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
}

/** Fades out whatever is still ringing, e.g. when the reveal closes mid-animation. */
export function stopAll() {
  if (!ctx || !bus) return;
  const { gain } = bus;
  bus = null;
  gain.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
  setTimeout(() => gain.disconnect(), 400);
}

function out() {
  if (muted || !ctx) return null;
  if (!bus) {
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse ??= impulseResponse(ctx, 2.6);
    reverb.connect(gain);
    bus = { gain, reverb };
  }
  return { ac: ctx, dry: bus.gain as AudioNode, wet: bus.reverb as AudioNode };
}

/** A small room: stereo noise with a steep decaying tail. */
function impulseResponse(ac: AudioContext, seconds: number) {
  const length = Math.round(ac.sampleRate * seconds);
  const buffer = ac.createBuffer(2, length, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3.2;
  }
  return buffer;
}

function noise(ac: AudioContext, seconds: number) {
  const buffer = ac.createBuffer(1, Math.round(ac.sampleRate * seconds), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  return src;
}

/** Sends `node` to the dry bus and, at `wet` level, to the reverb. */
function route(o: NonNullable<ReturnType<typeof out>>, node: AudioNode, wet: number) {
  node.connect(o.dry);
  if (wet > 0) {
    const send = o.ac.createGain();
    send.gain.value = wet;
    node.connect(send).connect(o.wet);
  }
}

/** Low warm hum for the press-and-hold; `set(progress)` raises it a fifth as the hold completes. */
export function hum() {
  const o = out();
  if (!o) return { set(_progress: number) {}, stop(_fast?: boolean) {} };
  const { ac } = o;
  const now = ac.currentTime;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.05, now + 0.25);
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 450;
  filter.connect(gain);
  route(o, gain, 0.15);

  const voices = ([[1, "sine", 0.7], [2.003, "triangle", 0.18], [1.498, "sine", 0.2]] as const).map(([ratio, type, level]) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = 98 * ratio;
    g.gain.value = level;
    osc.connect(g).connect(filter);
    osc.start(now);
    return { osc, ratio };
  });

  let stopped = false;
  return {
    set(progress: number) {
      if (stopped) return;
      const t = ac.currentTime;
      const base = 98 * 2 ** ((progress * 7) / 12);
      for (const v of voices) v.osc.frequency.setTargetAtTime(base * v.ratio, t, 0.06);
      filter.frequency.setTargetAtTime(450 + 1600 * progress, t, 0.06);
      gain.gain.setTargetAtTime(0.05 + 0.06 * progress, t, 0.06);
    },
    stop(fast = false) {
      if (stopped) return;
      stopped = true;
      const t = ac.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.setTargetAtTime(0, t, fast ? 0.02 : 0.1);
      for (const v of voices) v.osc.stop(t + 0.8);
    },
  };
}

/** Wax snapping: two sharp filtered-noise transients over a low thump. */
export function crack() {
  const o = out();
  if (!o) return;
  const { ac } = o;
  const now = ac.currentTime;
  for (const [at, volume, freq] of [[0, 0.45, 2400], [0.018, 0.25, 3600], [0.05, 0.1, 1800]]) {
    const src = noise(ac, 0.08);
    const filter = ac.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = freq;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(volume, now + at);
    gain.gain.exponentialRampToValueAtTime(0.001, now + at + 0.05);
    src.connect(filter).connect(gain);
    route(o, gain, 0.2);
    src.start(now + at);
  }
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(48, now + 0.14);
  gain.gain.setValueAtTime(0.32, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  osc.connect(gain);
  route(o, gain, 0);
  osc.start(now);
  osc.stop(now + 0.25);
}

/** Paper unfolding: band-passed noise sweeping up, with a jittery envelope for the crinkle. */
export function rustle() {
  const o = out();
  if (!o) return;
  const { ac } = o;
  const now = ac.currentTime;
  const length = 0.6;
  const src = noise(ac, length + 0.1);
  const band = ac.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 0.9;
  band.frequency.setValueAtTime(1100, now);
  band.frequency.exponentialRampToValueAtTime(3400, now + length);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, now);
  for (let t = 0.02; t < length; t += 0.025) {
    gain.gain.linearRampToValueAtTime(0.08 * Math.sin((Math.PI * t) / length) * (0.35 + 0.65 * Math.random()), now + t);
  }
  gain.gain.linearRampToValueAtTime(0, now + length);
  src.connect(band).connect(gain);
  route(o, gain, 0.25);
  src.start(now);
}

/** A warm bell chord (E major, rolled upward) with a long tail in the reverb. */
export function chime() {
  const o = out();
  if (!o) return;
  const { ac } = o;
  const now = ac.currentTime;
  // Inharmonic partials (ratio, level, decay seconds) are what make it a bell rather than an organ.
  const partials = [[1, 1, 3.2], [2.01, 0.42, 2.2], [2.76, 0.28, 1.4], [5.4, 0.1, 0.7], [8.93, 0.04, 0.35]];
  [659.25, 830.61, 987.77, 1318.51].forEach((freq, i) => {
    const start = now + i * 0.06;
    const note = ac.createGain();
    note.gain.value = 0.032;
    route(o, note, 0.45);
    for (const [ratio, level, decay] of partials) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.frequency.value = freq * ratio;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
      osc.connect(gain).connect(note);
      osc.start(start);
      osc.stop(start + decay + 0.05);
    }
  });
}
