/**
 * Canvas layer for the reveal: ambient snow in three depth layers, plus one-shot wax crumbs
 * and gold foil flakes. Everything runs off one rAF loop, which also drives `onFrame` so the
 * reveal can animate its hold and tilt without a second loop. `createAmbientSnow` reuses the
 * same snow, much quieter, behind the rest of the app.
 */
type RGB = [number, number, number];
type Flake = { x: number; y: number; size: number; speed: number; drift: number; freq: number; phase: number; alpha: number };
type Bit = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vrot: number;
  /** Rotation around the bit's own long axis; its cosine is how much of the face we see. */
  flip: number;
  vflip: number;
  phase: number;
  age: number;
  life: number;
  shades: string[];
};

export type Scene = {
  /** Slows the snow (1 = normal). Smoothed, so it can be set every frame. */
  setTimeScale: (scale: number) => void;
  /** Pointer position in -1…1; nearer snow shifts further. */
  setParallax: (x: number, y: number) => void;
  /** Wax crumbs from a point, drawn in front of everything. Client coordinates. */
  crumbs: (x: number, y: number) => void;
  /** Gold foil flakes from behind the edges of a rect. Client coordinates. */
  foil: (rect: DOMRect) => void;
  stop: () => void;
};

type LayerSpec = { count: number; size: readonly number[]; speed: readonly number[]; alpha: readonly number[]; depth: number; bokeh: boolean };
type SnowLayer = LayerSpec & { flakes: Flake[] };

// Far flakes are tiny, slow and dim; near ones are big soft bokeh at low alpha.
const LAYERS: LayerSpec[] = [
  { count: 56, size: [1.6, 3], speed: [9, 16], alpha: [0.22, 0.4], depth: 0.2, bokeh: false },
  { count: 34, size: [3, 5], speed: [18, 30], alpha: [0.3, 0.5], depth: 0.5, bokeh: false },
  { count: 12, size: [14, 28], speed: [34, 52], alpha: [0.05, 0.1], depth: 1, bokeh: true },
];

// The page background: the reveal's far and mid layers, far sparser and dimmer.
const AMBIENT: LayerSpec[] = [
  { count: 18, size: [1.4, 2.6], speed: [7, 12], alpha: [0.1, 0.22], depth: 0.2, bokeh: false },
  { count: 12, size: [2.4, 4], speed: [13, 22], alpha: [0.12, 0.24], depth: 0.5, bokeh: false },
];

const FOIL: [RGB, number][] = [
  [[217, 180, 106], 0.55],
  [[243, 220, 160], 0.25],
  [[244, 236, 220], 0.12],
  [[122, 26, 22], 0.08],
];
const WAX: RGB[] = [[122, 26, 22], [94, 18, 16], [150, 44, 36]];
const SHADES = 16;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const within = ([min, max]: readonly number[]) => rand(min, max);

/** Colors from edge-on (dark) to face-on, where the last few blow out toward white like a glint. */
function shades([r, g, b]: RGB): string[] {
  return Array.from({ length: SHADES }, (_, i) => {
    const t = i / (SHADES - 1);
    const light = 0.42 + 0.58 * t;
    const glint = t > 0.86 ? ((t - 0.86) / 0.14) * 0.6 : 0;
    const mix = (c: number) => Math.round(c * light + (255 - c * light) * glint);
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
  });
}

function sprite(stops: [number, number][]) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (const [at, a] of stops) grad.addColorStop(at, `rgba(255, 250, 240, ${a})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return c;
}

const softSprite = () => sprite([[0, 1], [0.3, 0.7], [1, 0]]);

function makeSnow(specs: LayerSpec[], density: number): SnowLayer[] {
  return specs.map((layer) => ({
    ...layer,
    flakes: Array.from({ length: Math.round(layer.count * density) }, (): Flake => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: within(layer.size),
      speed: within(layer.speed),
      drift: rand(4, 14) * (layer.depth + 0.4),
      freq: rand(0.2, 0.6),
      phase: rand(0, Math.PI * 2),
      alpha: within(layer.alpha),
    })),
  }));
}

/** Moves and draws one frame of snow. `ctx` must already be scaled to CSS pixels. */
function drawSnow(
  ctx: CanvasRenderingContext2D,
  layers: SnowLayer[],
  sprites: { soft: HTMLCanvasElement; bokeh?: HTMLCanvasElement },
  f: { dt: number; timeScale: number; clock: number; px: number; py: number; w: number; h: number },
) {
  const { dt, timeScale, clock, px, py, w, h } = f;
  for (const layer of layers) {
    const img = layer.bokeh && sprites.bokeh ? sprites.bokeh : sprites.soft;
    const ox = px * layer.depth * 16;
    const oy = py * layer.depth * 10;
    for (const fl of layer.flakes) {
      fl.y += fl.speed * dt * timeScale;
      if (fl.y > h + fl.size) {
        fl.y = -fl.size;
        fl.x = Math.random() * w;
      }
      const x = fl.x + ox + Math.sin(clock * fl.freq + fl.phase) * fl.drift;
      const wrapped = ((x % (w + 40)) + w + 40) % (w + 40) - 20;
      ctx.globalAlpha = fl.alpha;
      ctx.drawImage(img, wrapped - fl.size / 2, fl.y + oy - fl.size / 2, fl.size, fl.size);
    }
  }
}

/**
 * Quiet snow behind the whole app. One rAF loop, paused while the tab is hidden.
 * Callers skip it entirely under reduced motion. Returns a stop function.
 */
export function createAmbientSnow(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const soft = softSprite();
  const layers = makeSnow(AMBIENT, 1);
  let dpr = 1;
  let w = 0;
  let h = 0;
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  };
  resize();

  let clock = 0;
  let last = performance.now();
  let frame = 0;
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSnow(ctx, layers, { soft }, { dt, timeScale: 1, clock, px: 0, py: 0, w, h });
    frame = requestAnimationFrame(tick);
  };
  const start = () => {
    cancelAnimationFrame(frame);
    last = performance.now();
    frame = requestAnimationFrame(tick);
  };
  const onVisibility = () => (document.hidden ? cancelAnimationFrame(frame) : start());
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", onVisibility);
  if (!document.hidden) start();

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

export function createScene(
  back: HTMLCanvasElement,
  front: HTMLCanvasElement,
  { reduced, onFrame }: { reduced: boolean; onFrame?: (dtMs: number) => void },
): Scene {
  const bctx = back.getContext("2d");
  const fctx = front.getContext("2d");
  const noop: Scene = { setTimeScale() {}, setParallax() {}, crumbs() {}, foil() {}, stop() {} };
  if (!bctx || !fctx) return noop;

  const soft = softSprite();
  const bokeh = sprite([[0, 0.9], [0.6, 0.75], [0.85, 0.3], [1, 0]]);
  const foilShades = FOIL.map(([rgb, weight]) => [shades(rgb), weight] as const);
  const waxShades = WAX.map(shades);

  let dpr = 1;
  let w = 0;
  let h = 0;
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1); // 3x screens cost a lot of fill for no visible gain
    w = back.clientWidth;
    h = back.clientHeight;
    for (const c of [back, front]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    if (reduced) drawStatic();
  };

  const density = Math.min(1, Math.max(0.55, (window.innerWidth * window.innerHeight) / (1100 * 800)));
  const layers = makeSnow(LAYERS, density);

  // Reduced motion: a few faint, still dots and nothing else.
  function drawStatic() {
    bctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx!.clearRect(0, 0, w, h);
    for (const layer of layers.slice(0, 2)) {
      for (const f of layer.flakes) {
        bctx!.globalAlpha = f.alpha * 0.6;
        bctx!.drawImage(soft, (f.x % w) - f.size / 2, (f.y % h) - f.size / 2, f.size, f.size);
      }
    }
  }

  resize();
  window.addEventListener("resize", resize);
  if (reduced) {
    return {
      ...noop,
      stop() {
        window.removeEventListener("resize", resize);
      },
    };
  }

  const foil: Bit[] = [];
  const crumbs: Bit[] = [];
  let targetScale = 1;
  let timeScale = 1;
  let px = 0;
  let py = 0;
  let clock = 0;
  let last = performance.now();
  let frontDirty = false;
  let frame = 0;

  const step = (bits: Bit[], dt: number, drag: number, gravity: number, sway: number) => {
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.age += dt;
      if (b.age < 0) continue; // staggered start
      if (b.age > b.life || b.y > h + 40) {
        bits.splice(i, 1);
        continue;
      }
      const k = Math.exp(-drag * dt);
      b.vx *= k;
      b.vy = b.vy * k + gravity * dt;
      b.x += (b.vx + Math.sin(b.age * 2.2 + b.phase) * sway) * dt;
      b.y += b.vy * dt;
      b.rot += b.vrot * dt;
      b.flip += b.vflip * dt;
    }
  };

  const draw = (ctx: CanvasRenderingContext2D, bits: Bit[], shape: "quad" | "shard") => {
    for (const b of bits) {
      if (b.age < 0) continue;
      const face = Math.cos(b.flip);
      const seen = Math.max(0.08, Math.abs(face));
      // The back of a flake is a touch darker than its face, so the flip reads.
      const shade = Math.round(Math.abs(face) * (face < 0 ? 0.8 : 1) * (SHADES - 1));
      ctx.globalAlpha = Math.min(1, b.age / 0.12) * Math.min(1, (b.life - b.age) / 1.4);
      ctx.fillStyle = b.shades[shade];
      const c = Math.cos(b.rot);
      const s = Math.sin(b.rot);
      ctx.setTransform(dpr * c * seen, dpr * s * seen, -dpr * s, dpr * c, dpr * b.x, dpr * b.y);
      if (shape === "quad") {
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      } else {
        ctx.beginPath();
        ctx.moveTo(-b.w / 2, -b.h / 3);
        ctx.lineTo(b.w / 2, -b.h / 2);
        ctx.lineTo(b.w / 6, b.h / 2);
        ctx.closePath();
        ctx.fill();
      }
    }
  };

  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000); // a background tab shouldn't teleport anything
    last = now;
    onFrame?.(dt * 1000);
    timeScale += (targetScale - timeScale) * (1 - Math.exp(-dt / 0.25));
    clock += dt * timeScale;

    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, back.width, back.height);
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSnow(bctx, layers, { soft, bokeh }, { dt, timeScale, clock, px, py, w, h });

    step(foil, dt, 2.4, 150, 18);
    draw(bctx, foil, "quad");

    if (crumbs.length || frontDirty) {
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      fctx.clearRect(0, 0, front.width, front.height);
      step(crumbs, dt, 0.6, 1500, 0);
      draw(fctx, crumbs, "shard");
      frontDirty = crumbs.length > 0;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return {
    setTimeScale(scale) {
      targetScale = scale;
    },
    setParallax(x, y) {
      px = x;
      py = y;
    },
    crumbs(x, y) {
      for (let i = 0; i < 9; i++) {
        const size = rand(2.5, 5.5);
        crumbs.push({
          x: x + rand(-10, 10),
          y: y + rand(-6, 6),
          vx: rand(-170, 170),
          vy: rand(-320, -90),
          w: size,
          h: size * rand(0.7, 1.1),
          rot: rand(0, Math.PI * 2),
          vrot: rand(-14, 14),
          flip: rand(0, Math.PI),
          vflip: rand(-16, 16),
          phase: 0,
          age: 0,
          life: 1.4,
          shades: waxShades[i % waxShades.length],
        });
      }
      frontDirty = true;
    },
    foil(rect) {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const perimeter = 2 * (rect.width + rect.height);
      for (let i = 0; i < 140; i++) {
        // A point just inside the card's edge, so flakes slide out from behind it.
        let d = Math.random() * perimeter;
        let x: number;
        let y: number;
        if (d < rect.width) [x, y] = [rect.left + d, rect.top + 8];
        else if ((d -= rect.width) < rect.height) [x, y] = [rect.right - 8, rect.top + d];
        else if ((d -= rect.height) < rect.width) [x, y] = [rect.right - d, rect.bottom - 8];
        else [x, y] = [rect.left + 8, rect.bottom - (d - rect.width)];
        const dx = x - cx;
        const dy = y - cy;
        const len = Math.hypot(dx, dy) || 1;
        const speed = rand(140, 460);
        let pick = Math.random();
        const [palette] = foilShades.find(([, weight]) => (pick -= weight) < 0) ?? foilShades[0];
        const size = rand(4, 9);
        foil.push({
          x,
          y,
          vx: (dx / len) * speed + rand(-40, 40),
          vy: (dy / len) * speed * 0.8 - rand(60, 180),
          w: size,
          h: size * rand(0.35, 0.6),
          rot: rand(0, Math.PI * 2),
          vrot: rand(-3, 3),
          flip: rand(0, Math.PI * 2),
          vflip: rand(3, 9) * (Math.random() < 0.5 ? -1 : 1),
          phase: rand(0, Math.PI * 2),
          age: -rand(0, 0.35),
          life: rand(3.8, 5.6),
          shades: palette,
        });
      }
    },
    stop() {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      for (const [c, ctx] of [[back, bctx], [front, fctx]] as const) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
      }
    },
  };
}
