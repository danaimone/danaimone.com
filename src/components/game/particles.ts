import { drawPuff, smokePuffs } from "./art";
import { clamp } from "./track";
import { CHIMNEY } from "./world";

const TELEPORT_COLORS = ["#fde3cf", "#fab387", "#cba6f7", "#ffffff"];

type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; smoke?: boolean };

// Sparks and chimney smoke, in world positions. Stepped at the simulation's tick
// rate and drawn on the actors canvas.
export function createParticles(reduced: boolean) {
  const particles: Particle[] = [];
  const puffs = smokePuffs();
  let smokeAt = 0;

  return {
    burst(x: number, y: number, colors: string[], count: number, power: number) {
      if (reduced) return;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const v = power * (0.5 + Math.random() * 0.7);
        particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.6, life: 1, color: colors[i % colors.length] });
      }
    },
    beamSparks(walkerXs: number[], ground: number) {
      for (const x of walkerXs) {
        particles.push({ x: x - 8 + Math.random() * 16, y: ground - Math.random() * 70, vx: 0, vy: -1.6 - Math.random() * 2, life: 0.7, color: TELEPORT_COLORS[Math.floor(Math.random() * TELEPORT_COLORS.length)] });
      }
    },
    // Sparks fall, chimney smoke drifts.
    step(now: number, ground: number) {
      if (!reduced && now > smokeAt) {
        smokeAt = now + 110 + Math.random() * 110;
        particles.push({ x: CHIMNEY.x + Math.random() * 4, y: ground + CHIMNEY.y, vx: 0.02 + Math.random() * 0.08, vy: -(0.14 + Math.random() * 0.12), life: 1, color: "", smoke: true });
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const q = particles[i];
        q.x += q.vx;
        q.y += q.vy;
        if (q.smoke) {
          q.life -= 0.0032;
          q.vx += 0.0009;
        } else {
          q.vy += 0.12;
          q.life -= 0.02;
        }
        if (q.life <= 0) particles.splice(i, 1);
      }
    },
    draw(c: CanvasRenderingContext2D, camX: number) {
      for (const q of particles) {
        if (q.smoke) {
          drawPuff(c, puffs, q.x - camX, q.y, 1 - q.life);
          continue;
        }
        c.globalAlpha = clamp(q.life * 1.4, 0, 1);
        c.fillStyle = q.color;
        c.fillRect(Math.round(q.x - camX), Math.round(q.y), 2, 2);
      }
      c.globalAlpha = 1;
    },
  };
}

export type Particles = ReturnType<typeof createParticles>;
