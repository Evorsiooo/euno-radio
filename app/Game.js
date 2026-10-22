"use client";

import { useEffect, useRef } from "react";

const ACCENT = "#00e88f";
const BG = "#0e0e0f";
const SPEED = 260; // px/s
const DWELL = 0.7; // seconds inside a portal before it opens
const PORTAL_R = 38;

export default function Game({ links }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, dpr = 1, raf = 0, last = performance.now();
    const player = { x: 0, y: 0, vx: 0, vy: 0 };
    const keys = new Set();
    let target = null; // pointer/touch target
    let portals = [];
    let trail = [];
    let navigating = false;

    function layout() {
      dpr = window.devicePixelRatio || 1;
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cy = h * 0.42;
      const spread = Math.min(w * 0.28, 260);
      portals = links.map((l, i) => ({
        ...l,
        x: w / 2 + (i - 1) * spread,
        y: cy + (i === 1 ? -h * 0.08 : h * 0.04),
        t: 0,
      }));
      if (!player.x) { player.x = w / 2; player.y = h * 0.72; }
      player.x = Math.min(Math.max(player.x, 12), w - 12);
      player.y = Math.min(Math.max(player.y, 12), h - 12);
    }

    function step(dt) {
      let dx = 0, dy = 0;
      if (keys.has("ArrowLeft") || keys.has("a")) dx -= 1;
      if (keys.has("ArrowRight") || keys.has("d")) dx += 1;
      if (keys.has("ArrowUp") || keys.has("w")) dy -= 1;
      if (keys.has("ArrowDown") || keys.has("s")) dy += 1;
      if (dx || dy) {
        target = null;
        const m = Math.hypot(dx, dy);
        dx /= m; dy /= m;
      } else if (target) {
        const tx = target.x - player.x, ty = target.y - player.y;
        const d = Math.hypot(tx, ty);
        if (d < 4) target = null;
        else { dx = tx / d; dy = ty / d; }
      }
      // ease velocity for a floaty feel
      const k = 1 - Math.exp(-10 * dt);
      player.vx += (dx * SPEED - player.vx) * k;
      player.vy += (dy * SPEED - player.vy) * k;
      player.x = Math.min(Math.max(player.x + player.vx * dt, 12), w - 12);
      player.y = Math.min(Math.max(player.y + player.vy * dt, 12), h - 12);

      trail.push({ x: player.x, y: player.y, a: 1 });
      trail = trail.filter((p) => (p.a -= dt * 2.2) > 0);

      for (const p of portals) {
        const inside = Math.hypot(player.x - p.x, player.y - p.y) < PORTAL_R;
        p.t = inside ? p.t + dt / DWELL : Math.max(0, p.t - dt * 2);
        if (p.t >= 1 && !navigating) {
          navigating = true;
          window.location.href = p.href;
        }
      }
    }

    function draw(now) {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);

      // faint dot grid
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      for (let x = 20; x < w; x += 40)
        for (let y = 20; y < h; y += 40) ctx.fillRect(x, y, 1.5, 1.5);

      for (const p of portals) {
        const pulse = 1 + Math.sin(now / 500 + p.x) * 0.04;
        ctx.strokeStyle = ACCENT;
        ctx.globalAlpha = 0.35 + p.t * 0.65;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, PORTAL_R * pulse, 0, Math.PI * 2);
        ctx.stroke();
        if (p.t > 0) {
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, PORTAL_R - 8, -Math.PI / 2, -Math.PI / 2 + p.t * Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#e8e8e8";
        ctx.font = "13px ui-monospace, Menlo, Consolas, monospace";
        ctx.textAlign = "center";
        ctx.fillText(p.label, p.x, p.y + PORTAL_R + 26);
      }

      for (const t of trail) {
        ctx.globalAlpha = t.a * 0.4;
        ctx.fillStyle = ACCENT;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 5 * t.a + 1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = ACCENT;
      ctx.shadowBlur = 18;
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    function frame(now) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      step(dt);
      draw(now);
      raf = requestAnimationFrame(frame);
    }

    const onKeyDown = (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "d", "w", "s"].includes(k)) {
        keys.add(k);
        if (k.startsWith("Arrow")) e.preventDefault();
      }
    };
    const onKeyUp = (e) => {
      keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    };
    const onPointer = (e) => {
      target = { x: e.clientX, y: e.clientY };
    };
    const onPageShow = () => { navigating = false; };

    layout();
    window.addEventListener("resize", layout);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pageshow", onPageShow);
    canvas.addEventListener("pointermove", onPointer);
    canvas.addEventListener("pointerdown", onPointer);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", layout);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pageshow", onPageShow);
      canvas.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("pointerdown", onPointer);
    };
  }, [links]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ display: "block", touchAction: "none", cursor: "crosshair" }}
    />
  );
}
