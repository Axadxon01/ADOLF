"use strict";
// ADOLF yadrosi: canvas'da chizilgan animatsion HUD halqalari. Holatlar: idle, listening, thinking, speaking.
(function () {
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TARGET = {
    idle: { color: [54, 230, 255], speed: 0.25 },
    listening: { color: [90, 255, 200], speed: 0.6 },
    thinking: { color: [255, 184, 77], speed: 1.7 },
    speaking: { color: [54, 230, 255], speed: 0.9 },
  };
  const lerp = (a, b, k) => a + (b - a) * k;

  window.createOrb = function (canvas) {
    const ctx = canvas.getContext("2d");
    let state = "idle";
    let color = TARGET.idle.color.slice();
    let speed = TARGET.idle.speed;
    let angle = 0;
    let last = performance.now();
    let w = 0, h = 0, dpr = 1;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener("resize", resize);
    resize();

    const rgba = (a) => `rgba(${color[0] | 0},${color[1] | 0},${color[2] | 0},${a})`;

    function draw(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const tgt = TARGET[state];
      const k = 1 - Math.pow(0.001, dt);
      for (let i = 0; i < 3; i++) color[i] = lerp(color[i], tgt.color[i], k);
      speed = lerp(speed, reduce ? tgt.speed * 0.2 : tgt.speed, k);
      angle += dt * speed;

      let pulse = 0;
      if (state === "idle") pulse = 0.03 * Math.sin(t * 1.2);
      else if (state === "listening") pulse = 0.06 * Math.sin(t * 3.2);
      else if (state === "thinking") pulse = 0.04 * Math.sin(t * 6);
      else pulse = 0.09 * Math.abs(Math.sin(t * 7) + 0.5 * Math.sin(t * 11.3)) / 1.5;
      if (reduce) pulse *= 0.3;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w / 2, h / 2);
      const R = Math.min(w, h) / 2 * 0.96;
      ctx.lineCap = "butt";
      ctx.shadowColor = rgba(0.9);
      ctx.shadowBlur = 10;

      // tashqi ingichka halqa
      ctx.strokeStyle = rgba(0.35);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();

      // darajalar (ticks)
      ctx.save();
      ctx.rotate(angle * 0.2);
      for (let i = 0; i < 72; i++) {
        const major = i % 6 === 0;
        const a = (i / 72) * Math.PI * 2;
        const r1 = R * (major ? 0.87 : 0.9), r2 = R * 0.94;
        ctx.strokeStyle = rgba(major ? 0.85 : 0.4);
        ctx.lineWidth = major ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        ctx.stroke();
      }
      ctx.restore();

      // uchta yoy
      ctx.save();
      ctx.rotate(-angle * 0.7);
      ctx.strokeStyle = rgba(0.9);
      ctx.lineWidth = Math.max(2, R * 0.025);
      for (let i = 0; i < 3; i++) {
        const a0 = (i / 3) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(0, 0, R * 0.76, a0, a0 + Math.PI * 0.42); ctx.stroke();
      }
      ctx.restore();

      // nuqtali halqa
      ctx.save();
      ctx.rotate(angle * 1.1);
      ctx.setLineDash([2, 9]);
      ctx.strokeStyle = rgba(0.7);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.62, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      // reaktor segmentlari
      ctx.save();
      ctx.rotate(angle * 0.45);
      ctx.lineWidth = R * 0.07;
      ctx.strokeStyle = rgba(0.75);
      const rr = R * (0.44 + pulse * 0.5);
      for (let i = 0; i < 10; i++) {
        const a0 = (i / 10) * Math.PI * 2 + 0.06;
        ctx.beginPath(); ctx.arc(0, 0, rr, a0, a0 + Math.PI * 2 / 10 - 0.12); ctx.stroke();
      }
      ctx.restore();

      // tinglash to'lqinlari
      if (state === "listening") {
        for (let i = 0; i < 3; i++) {
          const p = ((t * 0.7 + i / 3) % 1);
          ctx.strokeStyle = rgba(0.5 * (1 - p));
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, R * (0.3 + p * 0.55), 0, Math.PI * 2); ctx.stroke();
        }
      }

      // o'ylash: aylanuvchi nuqtalar
      if (state === "thinking") {
        ctx.fillStyle = rgba(1);
        for (let i = 0; i < 4; i++) {
          const a = angle * 2.2 + (i / 4) * Math.PI * 2;
          ctx.beginPath(); ctx.arc(Math.cos(a) * R * 0.52, Math.sin(a) * R * 0.52, R * 0.025, 0, Math.PI * 2); ctx.fill();
        }
      }

      // gapirish: tebranuvchi halqa
      if (state === "speaking") {
        ctx.strokeStyle = rgba(0.95);
        ctx.lineWidth = 2;
        ctx.beginPath();
        const N = 96;
        for (let i = 0; i <= N; i++) {
          const a = (i / N) * Math.PI * 2;
          const amp = R * 0.035 * (0.4 + Math.abs(Math.sin(t * 9 + i * 0.7) * Math.sin(t * 5.3 + i * 0.31)) * (1 + pulse * 6));
          const r = R * 0.3 + amp;
          const x = Math.cos(a) * r, y = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // yadro
      ctx.shadowBlur = 0;
      const core = R * (0.26 + pulse);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, core * 2.2);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.18, rgba(0.95));
      g.addColorStop(0.55, rgba(0.22));
      g.addColorStop(1, rgba(0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, core * 2.2, 0, Math.PI * 2); ctx.fill();

      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);

    return { setState(s) { if (TARGET[s]) state = s; } };
  };
})();
