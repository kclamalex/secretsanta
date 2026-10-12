const COLORS = ["#e5534b", "#f5c542", "#2ea043", "#ffffff", "#58a6ff", "#ff7eb6"];

/** Fires a confetti burst from the middle of the canvas. Returns a function that stops it. */
export function confetti(canvas: HTMLCanvasElement, durationMs = 5000): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const dpr = window.devicePixelRatio || 1;
  const resize = () => {
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
  };
  resize();
  window.addEventListener("resize", resize);

  const pieces = Array.from({ length: 220 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = (4 + Math.random() * 12) * dpr;
    return {
      x: canvas.width / 2,
      y: canvas.height * 0.42,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6 * dpr,
      w: (6 + Math.random() * 6) * dpr,
      h: (10 + Math.random() * 8) * dpr,
      spin: Math.random() * Math.PI,
      vspin: (Math.random() - 0.5) * 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  });

  const start = performance.now();
  let frame = 0;
  const tick = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - durationMs * 0.6) / (durationMs * 0.4));
    for (const p of pieces) {
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + 0.25 * dpr;
      p.x += p.vx;
      p.y += p.vy;
      p.spin += p.vspin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      ctx.scale(1, Math.cos(p.spin * 2)); // flutter
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < durationMs) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
