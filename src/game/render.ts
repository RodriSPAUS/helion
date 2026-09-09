import type { Body, Kind, Particle, Shockwave, Zone } from "./types";
import { TRAIL_CAP } from "./physics";

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  shakeX: number;
  shakeY: number;
}

export interface Ghost {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  kind: Kind;
  path: Float32Array | null;
  attractorX?: number;
  attractorY?: number;
  attractorR?: number;
}

function hash(x: number, y: number) {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cam: Camera,
  bodies: Body[],
  particles: Particle[],
  waves: Shockwave[],
  zones: Zone[],
  ghost: Ghost | null,
  trailsOn: boolean,
  time: number,
  alpha: number,
  vignette = true,
  dpr = 1,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#07080c";
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2 + cam.shakeX;
  const cy = h / 2 + cam.shakeY;
  const z = cam.zoom;

  drawNebula(ctx, w, h, cam, time);
  drawStars(ctx, w, h, cam, time);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(z, z);
  ctx.translate(-cam.x, -cam.y);

  for (const zone of zones) drawZone(ctx, zone, time);
  if (ghost?.attractorR && ghost.attractorR > 0) {
    drawOrbitGuide(ctx, ghost);
  }
  if (trailsOn) {
    for (const b of bodies) drawTrail(ctx, b);
  }
  if (ghost?.path) drawPath(ctx, ghost.path, ghost.color);
  for (const wave of waves) drawWave(ctx, wave);
  for (const p of particles) {
    if (p.kind !== "ring") drawParticle(ctx, p);
  }
  for (const b of bodies) {
    const x = b.prevX + (b.x - b.prevX) * alpha;
    const y = b.prevY + (b.y - b.prevY) * alpha;
    drawBody(ctx, b, x, y, time, bodies);
  }
  for (const p of particles) {
    if (p.kind === "ring") drawParticle(ctx, p);
  }
  if (ghost) drawGhost(ctx, ghost);

  ctx.restore();

  if (vignette) {
    const g = ctx.createRadialGradient(w * 0.5, h * 0.48, Math.min(w, h) * 0.2, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    g.addColorStop(0, "rgba(7,8,12,0)");
    g.addColorStop(1, "rgba(7,8,12,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawNebula(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cam: Camera,
  time: number,
) {
  const gx = w * 0.42 - cam.x * cam.zoom * 0.04;
  const gy = h * 0.38 - cam.y * cam.zoom * 0.04;
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 0.55);
  g.addColorStop(0, "rgba(28, 36, 48, 0.22)");
  g.addColorStop(0.55, "rgba(14, 18, 26, 0.08)");
  g.addColorStop(1, "rgba(7,8,12,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const g2 = ctx.createRadialGradient(
    w * 0.72 + Math.sin(time * 0.03) * 20,
    h * 0.7,
    0,
    w * 0.72,
    h * 0.7,
    Math.max(w, h) * 0.4,
  );
  g2.addColorStop(0, "rgba(22, 28, 36, 0.16)");
  g2.addColorStop(1, "rgba(7,8,12,0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cam: Camera,
  time: number,
) {
  const z = Math.max(0.2, cam.zoom || 1);
  const cell = 90;
  const worldLeft = cam.x - w / (2 * z);
  const worldTop = cam.y - h / (2 * z);
  const worldRight = cam.x + w / (2 * z);
  const worldBottom = cam.y + h / (2 * z);
  const minI = Math.floor(worldLeft / cell) - 1;
  const maxI = Math.min(minI + 90, Math.ceil(worldRight / cell) + 1);
  const minJ = Math.floor(worldTop / cell) - 1;
  const maxJ = Math.min(minJ + 90, Math.ceil(worldBottom / cell) + 1);
  ctx.save();
  ctx.translate(w / 2 + cam.shakeX, h / 2 + cam.shakeY);
  ctx.scale(z, z);
  ctx.translate(-cam.x, -cam.y);
  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      const n = hash(i, j);
      if (n > 0.14) continue;
      const x = i * cell + n * cell * 0.8;
      const y = j * cell + hash(j, i) * cell * 0.8;
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(time * (0.4 + n) + n * 12));
      const s = 0.5 + n * 1.6;
      ctx.fillStyle = `rgba(232,234,239,${0.18 + tw * 0.55})`;
      ctx.beginPath();
      ctx.arc(x, y, s / z, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawTrail(ctx: CanvasRenderingContext2D, b: Body) {
  if (b.trailLen < 2) return;
  ctx.save();
  ctx.strokeStyle = b.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const cap = TRAIL_CAP;
  const start = b.trailCursor - b.trailLen;
  ctx.beginPath();
  let first = true;
  for (let i = 0; i < b.trailLen; i++) {
    const idx = ((start + i) % cap + cap) % cap;
    const x = b.trail[idx * 2]!;
    const y = b.trail[idx * 2 + 1]!;
    if (first) {
      ctx.moveTo(x, y);
      first = false;
    } else ctx.lineTo(x, y);
  }
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = Math.max(1.1, b.radius * 0.18);
  ctx.stroke();
  ctx.beginPath();
  first = true;
  const tail = Math.max(2, Math.floor(b.trailLen * 0.28));
  for (let i = b.trailLen - tail; i < b.trailLen; i++) {
    const idx = ((start + i) % cap + cap) % cap;
    const x = b.trail[idx * 2]!;
    const y = b.trail[idx * 2 + 1]!;
    if (first) {
      ctx.moveTo(x, y);
      first = false;
    } else ctx.lineTo(x, y);
  }
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(1.4, b.radius * 0.22);
  ctx.stroke();
  ctx.restore();
}

function drawPath(ctx: CanvasRenderingContext2D, path: Float32Array, color: string) {
  if (path.length < 4) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.setLineDash([5, 7]);
  ctx.lineWidth = 1.35;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(path[0]!, path[1]!);
  const n = path.length / 2;
  for (let i = 1; i < n; i++) {
    if (i % 2 === 0) ctx.lineTo(path[i * 2]!, path[i * 2 + 1]!);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  const last = n - 1;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(path[last * 2]!, path[last * 2 + 1]!, 2.4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawOrbitGuide(ctx: CanvasRenderingContext2D, ghost: Ghost) {
  if (!ghost.attractorR) return;
  ctx.save();
  ctx.strokeStyle = "rgba(155,180,200,0.28)";
  ctx.setLineDash([3, 8]);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(ghost.attractorX ?? 0, ghost.attractorY ?? 0, ghost.attractorR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawZone(ctx: CanvasRenderingContext2D, zone: Zone, time: number) {
  ctx.save();
  const pulse = 0.55 + 0.45 * Math.sin(time * 2.2);
  ctx.strokeStyle = `rgba(155,180,200,${0.35 + pulse * 0.25})`;
  ctx.setLineDash([6, 8]);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.08 + pulse * 0.04;
  ctx.fillStyle = "#9bb4c8";
  ctx.beginPath();
  ctx.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = "#9bb4c8";
  ctx.font = "500 11px Figtree, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(zone.label, zone.x, zone.y - zone.r - 8);
  ctx.restore();
}

function drawWave(ctx: CanvasRenderingContext2D, w: Shockwave) {
  const t = 1 - w.life;
  ctx.save();
  ctx.strokeStyle = `rgba(232,234,239,${0.35 * w.life})`;
  ctx.lineWidth = 2.2 * w.life;
  ctx.beginPath();
  ctx.arc(w.x, w.y, w.maxR * t, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  const t = p.life / p.maxLife;
  ctx.save();
  if (p.kind === "ring") {
    ctx.strokeStyle = p.color;
    ctx.globalAlpha = t * 0.5;
    ctx.lineWidth = 2 * t;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (1 - t) * 2.4, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.globalAlpha = t;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.4 + t * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function lightDir(b: Body, bodies: Body[]): { lx: number; ly: number } {
  let lx = -0.4;
  let ly = -0.55;
  let best = 0;
  for (const o of bodies) {
    if (o.id === b.id) continue;
    if (o.kind !== "star" && o.mass < 300) continue;
    const dx = o.x - b.x;
    const dy = o.y - b.y;
    const d2 = dx * dx + dy * dy;
    const inf = o.mass / (d2 + 80);
    if (inf > best) {
      best = inf;
      const d = Math.sqrt(d2) || 1;
      lx = dx / d;
      ly = dy / d;
    }
  }
  return { lx, ly };
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  b: Body,
  x: number,
  y: number,
  time: number,
  bodies: Body[],
) {
  const r = b.radius;
  const glow = r * (b.kind === "star" ? 4.2 : b.kind === "singularity" ? 3.4 : 2.1) * (1 + b.glow * 0.25);
  ctx.save();
  ctx.translate(x, y);

  const halo = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, glow);
  if (b.kind === "star") {
    halo.addColorStop(0, "rgba(242, 220, 170, 0.55)");
    halo.addColorStop(0.35, "rgba(210, 170, 110, 0.16)");
    halo.addColorStop(1, "rgba(210, 170, 110, 0)");
  } else if (b.kind === "singularity") {
    halo.addColorStop(0, "rgba(180, 110, 70, 0.28)");
    halo.addColorStop(0.45, "rgba(120, 70, 40, 0.1)");
    halo.addColorStop(1, "rgba(0,0,0,0)");
  } else {
    halo.addColorStop(0, "rgba(180, 200, 220, 0.12)");
    halo.addColorStop(1, "rgba(180, 200, 220, 0)");
  }
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, glow, 0, Math.PI * 2);
  ctx.fill();

  if (b.kind === "singularity") {
    drawSingularity(ctx, r, time);
  } else if (b.kind === "star") {
    drawStar(ctx, r, b.color, time);
  } else {
    const { lx, ly } = lightDir(b, bodies);
    const g = ctx.createRadialGradient(-r * 0.38 * lx, -r * 0.38 * ly, r * 0.08, 0, 0, r);
    g.addColorStop(0, tint(b.color, 38));
    g.addColorStop(0.45, b.color);
    g.addColorStop(1, shade(b.color, 42));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    if (b.kind === "giant") {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = shade(b.color, 20);
      ctx.lineWidth = r * 0.18;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.05, r * 0.38, 0.18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = r * 0.08;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.22, r * 0.95, r * 0.22, 0.18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.strokeStyle = "rgba(232,234,239,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (b.pinned) {
    ctx.strokeStyle = "rgba(155,180,200,0.55)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function drawStar(ctx: CanvasRenderingContext2D, r: number, color: string, time: number) {
  const pulse = 1 + 0.04 * Math.sin(time * 2.4);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * pulse);
  g.addColorStop(0, "#fffaf0");
  g.addColorStop(0.35, color);
  g.addColorStop(1, shade(color, 30));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = "#fff7e6";
  ctx.lineWidth = 1;
  const rays = 4;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI + time * 0.05;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
    ctx.lineTo(Math.cos(a) * r * 2.6, Math.sin(a) * r * 2.6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSingularity(ctx: CanvasRenderingContext2D, r: number, time: number) {
  ctx.save();
  ctx.rotate(time * 0.35);
  ctx.strokeStyle = "rgba(196, 132, 86, 0.55)";
  ctx.lineWidth = r * 0.38;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 2.1, r * 0.72, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(232, 190, 140, 0.35)";
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.55, r * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#05060a";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(232,234,239,0.25)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2);
  ctx.stroke();
}

function drawGhost(ctx: CanvasRenderingContext2D, ghost: Ghost) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = ghost.color;
  ctx.beginPath();
  ctx.arc(ghost.x, ghost.y, ghost.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(232,234,239,0.7)";
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  const spd = Math.hypot(ghost.vx, ghost.vy);
  if (spd > 2) {
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = "#e8eaef";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(ghost.x, ghost.y);
    const sx = ghost.x + ghost.vx * 0.55;
    const sy = ghost.y + ghost.vy * 0.55;
    ctx.lineTo(sx, sy);
    ctx.stroke();
    const ang = Math.atan2(ghost.vy, ghost.vx);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - Math.cos(ang - 0.4) * 9, sy - Math.sin(ang - 0.4) * 9);
    ctx.lineTo(sx - Math.cos(ang + 0.4) * 9, sy - Math.sin(ang + 0.4) * 9);
    ctx.closePath();
    ctx.fillStyle = "#e8eaef";
    ctx.fill();
  }
  ctx.restore();
}

function tint(hsl: string, add: number) {
  const m = /hsl\((\d+\.?\d*),\s*(\d+\.?\d*)%,\s*(\d+\.?\d*)%\)/.exec(hsl);
  if (!m) return "#f2f3f5";
  const l = Math.min(92, Number(m[3]) + add * 0.4);
  return `hsl(${m[1]}, ${m[2]}%, ${l}%)`;
}

function shade(hsl: string, sub: number) {
  const m = /hsl\((\d+\.?\d*),\s*(\d+\.?\d*)%,\s*(\d+\.?\d*)%\)/.exec(hsl);
  if (!m) return "#1a1d22";
  const l = Math.max(8, Number(m[3]) - sub * 0.45);
  return `hsl(${m[1]}, ${m[2]}%, ${l}%)`;
}
