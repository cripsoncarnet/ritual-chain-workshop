"use client";

import { useEffect, useRef } from "react";

export function PlasmaCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let t = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Plasma wave nodes — slow, zero-gravity energy currents
    interface WaveNode {
      x: number; y: number;
      vx: number; vy: number;
      radius: number;
      phase: number;
      speed: number;
    }

    const nodes: WaveNode[] = Array.from({ length: 7 }, (_, i) => ({
      x: (Math.random() * 0.8 + 0.1) * window.innerWidth,
      y: (Math.random() * 0.8 + 0.1) * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.12,
      radius: 260 + Math.random() * 220,
      phase: (i / 7) * Math.PI * 2,
      speed: 0.0006 + Math.random() * 0.0006,
    }));

    // Particle trails
    interface Particle {
      x: number; y: number;
      vx: number; vy: number;
      life: number; maxLife: number;
      size: number;
    }
    const particles: Particle[] = [];

    const spawnParticle = () => {
      const edge = Math.random();
      let x: number, y: number;
      if (edge < 0.25) { x = Math.random() * canvas.width; y = canvas.height + 10; }
      else if (edge < 0.5) { x = -10; y = Math.random() * canvas.height; }
      else if (edge < 0.75) { x = canvas.width + 10; y = Math.random() * canvas.height; }
      else { x = Math.random() * canvas.width; y = -10; }

      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        life: 0,
        maxLife: 300 + Math.random() * 400,
        size: 0.6 + Math.random() * 1.2,
      });
    };

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;

      // Deep void base — deep crimson void
      ctx.fillStyle = "rgba(8,0,4,0.05)";
      ctx.fillRect(0, 0, W, H);

      t += 1;

      // Move nodes in slow organic patterns
      for (const node of nodes) {
        node.phase += node.speed;
        node.x += node.vx + Math.sin(node.phase * 1.3) * 0.15;
        node.y += node.vy + Math.cos(node.phase * 0.9) * 0.1;

        // Gentle boundary bounce
        if (node.x < -node.radius * 0.5) { node.x = W + node.radius * 0.5; }
        if (node.x > W + node.radius * 0.5) { node.x = -node.radius * 0.5; }
        if (node.y < -node.radius * 0.5) { node.y = H + node.radius * 0.5; }
        if (node.y > H + node.radius * 0.5) { node.y = -node.radius * 0.5; }

        // Gold plasma radial gradient
        const pulse = 0.85 + 0.15 * Math.sin(node.phase * 2.1);
        const alpha = 0.020 * pulse;

        const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius * pulse);
        grad.addColorStop(0, `rgba(255,215,0,${alpha})`);
        grad.addColorStop(0.25, `rgba(192,0,74,${alpha * 0.8})`);
        grad.addColorStop(0.55, `rgba(180,0,50,${alpha * 0.3})`);
        grad.addColorStop(1, "rgba(255,215,0,0)");

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * pulse, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Flowing energy streams — sinusoidal neon lines
      const streamCount = 4;
      for (let s = 0; s < streamCount; s++) {
        const offset = (s / streamCount) * H;
        const amplitude = 80 + s * 30;
        const freq = 0.006 + s * 0.002;
        const speed = 0.003 + s * 0.001;
        const alpha = 0.04 + s * 0.01;

        ctx.beginPath();
        ctx.moveTo(0, offset + H * 0.1 * s);
        for (let x = 0; x <= W; x += 4) {
          const y = offset + amplitude * Math.sin(x * freq + t * speed + s * 1.4)
            + (amplitude * 0.4) * Math.sin(x * freq * 2.1 - t * speed * 0.7 + s);
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(255,215,0,${alpha})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Subtle secondary streams (crimson-rose)
      for (let s = 0; s < 3; s++) {
        const offset = (s / 3) * H + H * 0.15;
        const amplitude = 50 + s * 20;
        const freq = 0.004 + s * 0.003;
        const speed = 0.002 + s * 0.001;

        ctx.beginPath();
        ctx.moveTo(0, offset);
        for (let x = 0; x <= W; x += 6) {
          const y = offset + amplitude * Math.cos(x * freq + t * speed + s * 2.1);
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(192,0,74,0.022)`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Spawn & draw particles
      if (t % 8 === 0 && particles.length < 60) spawnParticle();

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
          continue;
        }

        const progress = p.life / p.maxLife;
        const fadeIn = Math.min(progress * 8, 1);
        const fadeOut = Math.max(1 - (progress - 0.8) * 5, 0);
        const alpha = fadeIn * fadeOut * 0.7;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        // alternating gold and crimson particles
        const isGold = Math.floor(p.life / 50) % 2 === 0;
        ctx.fillStyle = isGold
          ? `rgba(255,215,0,${alpha})`
          : `rgba(192,0,74,${alpha * 0.8})`;
        ctx.fill();

        // Tiny trail
        ctx.beginPath();
        ctx.arc(p.x - p.vx * 6, p.y - p.vy * 6, p.size * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,215,0,${alpha * 0.3})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    // Initial dark crimson fill
    ctx.fillStyle = "#080004";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      id="plasma-canvas"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
