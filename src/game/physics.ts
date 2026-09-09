import type { Body, Kind } from "./types";

export const G = 1850;
export const SOFT = 14;
export const SOFT2 = SOFT * SOFT;
export const PHYS_DT = 1 / 120;
export const MAX_SPEED = 1400;
export const MAX_ACCEL = 22000;
export const TRAIL_CAP = 96;
export const BODY_CAP = 42;

const scratchAx = new Float64Array(BODY_CAP + 4);
const scratchAy = new Float64Array(BODY_CAP + 4);

export function radiusFromMass(mass: number, kind: Kind): number {
  if (kind === "singularity") return Math.max(7, 2.05 * Math.pow(mass, 0.27));
  if (kind === "star") return Math.max(11, 3.1 * Math.pow(mass, 0.34));
  if (kind === "comet") return Math.max(3.4, 2.7 * Math.pow(mass, 0.42));
  if (kind === "giant") return Math.max(10, 3.9 * Math.pow(mass, 0.33));
  return Math.max(4.5, 3.45 * Math.pow(mass, 0.36));
}

export function makeTrail(): Float32Array {
  return new Float32Array(TRAIL_CAP * 2);
}

export function pushTrail(b: Body, x: number, y: number) {
  const i = b.trailCursor % TRAIL_CAP;
  b.trail[i * 2] = x;
  b.trail[i * 2 + 1] = y;
  b.trailCursor++;
  if (b.trailLen < TRAIL_CAP) b.trailLen++;
}

export function computeAccel(bodies: Body[]) {
  const n = bodies.length;
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    if (!b) continue;
    b.ax = 0;
    b.ay = 0;
  }
  for (let i = 0; i < n; i++) {
    const a = bodies[i];
    if (!a) continue;
    for (let j = i + 1; j < n; j++) {
      const b = bodies[j];
      if (!b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const r2 = dx * dx + dy * dy;
      const s = r2 + SOFT2;
      const inv = 1 / (s * Math.sqrt(s));
      const f = G * inv;
      const fx = dx * f;
      const fy = dy * f;
      a.ax += fx * b.mass;
      a.ay += fy * b.mass;
      b.ax -= fx * a.mass;
      b.ay -= fy * a.mass;
    }
  }
  const maxA2 = MAX_ACCEL * MAX_ACCEL;
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    if (!b) continue;
    if (b.pinned) {
      b.ax = 0;
      b.ay = 0;
      continue;
    }
    const a2 = b.ax * b.ax + b.ay * b.ay;
    if (a2 > maxA2) {
      const k = MAX_ACCEL / Math.sqrt(a2);
      b.ax *= k;
      b.ay *= k;
    }
  }
}

export function verletStep(bodies: Body[], dt: number) {
  const n = bodies.length;
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    if (!b) continue;
    scratchAx[i] = b.ax;
    scratchAy[i] = b.ay;
    if (b.pinned) continue;
    b.x += b.vx * dt + 0.5 * b.ax * dt * dt;
    b.y += b.vy * dt + 0.5 * b.ay * dt * dt;
  }
  computeAccel(bodies);
  const maxS2 = MAX_SPEED * MAX_SPEED;
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    if (!b) continue;
    if (b.pinned) {
      b.vx = 0;
      b.vy = 0;
      continue;
    }
    b.vx += 0.5 * (scratchAx[i]! + b.ax) * dt;
    b.vy += 0.5 * (scratchAy[i]! + b.ay) * dt;
    const s2 = b.vx * b.vx + b.vy * b.vy;
    if (s2 > maxS2) {
      const k = MAX_SPEED / Math.sqrt(s2);
      b.vx *= k;
      b.vy *= k;
    }
  }
}

export function findAttractor(
  bodies: Body[],
  x: number,
  y: number,
  selfId = -1,
): Body | null {
  let best: Body | null = null;
  let bestI = 0;
  for (const b of bodies) {
    if (b.id === selfId) continue;
    const dx = x - b.x;
    const dy = y - b.y;
    const r2 = dx * dx + dy * dy + 40;
    const influence = b.mass / r2;
    if (influence > bestI) {
      bestI = influence;
      best = b;
    }
  }
  return best;
}

export function circularVelocity(
  px: number,
  py: number,
  attractor: Body,
  sign: 1 | -1,
): { vx: number; vy: number } {
  const dx = px - attractor.x;
  const dy = py - attractor.y;
  const r = Math.hypot(dx, dy) || 1;
  const v = Math.sqrt((G * attractor.mass) / r);
  return {
    vx: attractor.vx + sign * (-dy / r) * v,
    vy: attractor.vy + sign * (dx / r) * v,
  };
}

export function pickOrbitSign(
  px: number,
  py: number,
  attractor: Body,
  dragX: number,
  dragY: number,
): 1 | -1 {
  const dx = px - attractor.x;
  const dy = py - attractor.y;
  const ccwX = -dy;
  const ccwY = dx;
  const dot = ccwX * dragX + ccwY * dragY;
  if (Math.abs(dot) < 1e-6) return 1;
  return dot >= 0 ? 1 : -1;
}

export function specificEnergy(
  body: Body,
  attractor: Body,
): number {
  const dx = body.x - attractor.x;
  const dy = body.y - attractor.y;
  const r = Math.hypot(dx, dy) || 1;
  const dvx = body.vx - attractor.vx;
  const dvy = body.vy - attractor.vy;
  const ke = 0.5 * (dvx * dvx + dvy * dvy);
  const pe = (-G * attractor.mass) / r;
  return ke + pe;
}

export function isBoundTo(body: Body, attractor: Body, minR: number, maxR: number) {
  if (body.id === attractor.id) return false;
  const d = Math.hypot(body.x - attractor.x, body.y - attractor.y);
  if (d < minR || d > maxR) return false;
  return specificEnergy(body, attractor) < 0;
}

export function mergeKind(a: Body, b: Body): Kind {
  if (a.kind === "singularity" || b.kind === "singularity") return "singularity";
  const m = a.mass + b.mass;
  if (m >= 380 && (a.kind === "star" || b.kind === "star" || m >= 720)) return "star";
  return a.mass >= b.mass ? a.kind : b.kind;
}

export function mergeBodies(a: Body, b: Body, nextHue: number): Body {
  const primary = a.pinned || a.mass >= b.mass ? a : b;
  const secondary = primary === a ? b : a;
  const mass = a.mass + b.mass;
  const pinned = a.pinned || b.pinned;
  const x = pinned
    ? (a.pinned ? a.x : b.x)
    : (a.x * a.mass + b.x * b.mass) / mass;
  const y = pinned
    ? (a.pinned ? a.y : b.y)
    : (a.y * a.mass + b.y * b.mass) / mass;
  const vx = pinned ? 0 : (a.vx * a.mass + b.vx * b.mass) / mass;
  const vy = pinned ? 0 : (a.vy * a.mass + b.vy * b.mass) / mass;
  const kind = mergeKind(a, b);
  const tags = Array.from(new Set([...a.tags, ...b.tags]));
  const hue =
    a.mass >= b.mass ? a.hue : b.hue === 0 ? nextHue : b.hue;
  const child: Body = {
    id: primary.id,
    kind,
    x,
    y,
    vx,
    vy,
    ax: 0,
    ay: 0,
    prevX: x,
    prevY: y,
    mass,
    radius: radiusFromMass(mass, kind),
    hue,
    color: primary.color,
    pinned,
    tags,
    launchable: false,
    trail: makeTrail(),
    trailLen: 0,
    trailCursor: 0,
    glow: 1.4,
    pulse: 0.6,
  };
  const keep = primary.trailLen >= secondary.trailLen ? primary : secondary;
  child.trail = keep.trail;
  child.trailLen = keep.trailLen;
  child.trailCursor = keep.trailCursor;
  child.color = colorForKind(kind, hue);
  return child;
}

export function colorForKind(kind: Kind, hue: number): string {
  switch (kind) {
    case "comet":
      return `hsl(${200 + (hue % 24)}, 28%, 78%)`;
    case "moon":
      return `hsl(${32 + (hue % 18)}, 8%, ${62 + (hue % 10)}%)`;
    case "planet":
      return `hsl(${hue % 360}, 28%, 58%)`;
    case "giant":
      return `hsl(${28 + (hue % 40)}, 32%, 62%)`;
    case "star":
      return `hsl(${38 + (hue % 16)}, 54%, 78%)`;
    case "singularity":
      return `hsl(${18 + (hue % 10)}, 42%, 42%)`;
  }
}

export function collideAndMerge(
  bodies: Body[],
  onMerge: (result: Body, a: Body, b: Body) => void,
): Body[] {
  let list = bodies;
  for (let pass = 0; pass < 10; pass++) {
    let hit = false;
    const n = list.length;
    outer: for (let i = 0; i < n; i++) {
      const a = list[i];
      if (!a) continue;
      for (let j = i + 1; j < n; j++) {
        const b = list[j];
        if (!b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const r = a.radius + b.radius;
        if (dx * dx + dy * dy >= r * r * 0.92) continue;
        const merged = mergeBodies(a, b, (a.hue + b.hue) * 0.5);
        onMerge(merged, a, b);
        const next: Body[] = [];
        for (let k = 0; k < n; k++) {
          if (k === i || k === j) continue;
          const body = list[k];
          if (body) next.push(body);
        }
        next.push(merged);
        list = next;
        hit = true;
        break outer;
      }
    }
    if (!hit) break;
  }
  return list;
}

export function centerOfMass(bodies: Body[]): { x: number; y: number } {
  let m = 0;
  let x = 0;
  let y = 0;
  for (const b of bodies) {
    m += b.mass;
    x += b.x * b.mass;
    y += b.y * b.mass;
  }
  if (m <= 0) return { x: 0, y: 0 };
  return { x: x / m, y: y / m };
}

export function countBoundOrbiters(bodies: Body[]): number {
  if (bodies.length < 2) return 0;
  let star: Body | null = null;
  for (const b of bodies) {
    if (!star || b.mass > star.mass) star = b;
  }
  if (!star || star.mass < 80) return 0;
  let n = 0;
  for (const b of bodies) {
    if (b.id === star.id) continue;
    const d = Math.hypot(b.x - star.x, b.y - star.y);
    if (d < star.radius * 2.2) continue;
    if (d > 900) continue;
    if (specificEnergy(b, star) < 0) n++;
  }
  return n;
}

export interface GhostBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  pinned: boolean;
}

export function predictPath(
  bodies: Body[],
  ghost: GhostBody,
  steps = 160,
  dt = PHYS_DT * 3,
): Float32Array {
  const n = bodies.length;
  const xs = new Float64Array(n + 1);
  const ys = new Float64Array(n + 1);
  const vxs = new Float64Array(n + 1);
  const vys = new Float64Array(n + 1);
  const mass = new Float64Array(n + 1);
  const pin = new Uint8Array(n + 1);
  const rad = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const b = bodies[i]!;
    xs[i] = b.x;
    ys[i] = b.y;
    vxs[i] = b.vx;
    vys[i] = b.vy;
    mass[i] = b.mass;
    pin[i] = b.pinned ? 1 : 0;
    rad[i] = b.radius;
  }
  xs[n] = ghost.x;
  ys[n] = ghost.y;
  vxs[n] = ghost.vx;
  vys[n] = ghost.vy;
  mass[n] = ghost.mass;
  pin[n] = ghost.pinned ? 1 : 0;
  rad[n] = 4;
  const total = n + 1;
  const ax = new Float64Array(total);
  const ay = new Float64Array(total);
  const path = new Float32Array(steps * 2);
  const accel = () => {
    ax.fill(0);
    ay.fill(0);
    for (let i = 0; i < total; i++) {
      for (let j = i + 1; j < total; j++) {
        const dx = xs[j]! - xs[i]!;
        const dy = ys[j]! - ys[i]!;
        const r2 = dx * dx + dy * dy;
        const s = r2 + SOFT2;
        const inv = 1 / (s * Math.sqrt(s));
        const f = G * inv;
        const fx = dx * f;
        const fy = dy * f;
        ax[i] += fx * mass[j]!;
        ay[i] += fy * mass[j]!;
        ax[j] -= fx * mass[i]!;
        ay[j] -= fy * mass[i]!;
      }
    }
    for (let i = 0; i < total; i++) {
      if (pin[i]) {
        ax[i] = 0;
        ay[i] = 0;
      }
    }
  };
  accel();
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < total; i++) {
      if (pin[i]) continue;
      xs[i] += vxs[i]! * dt + 0.5 * ax[i]! * dt * dt;
      ys[i] += vys[i]! * dt + 0.5 * ay[i]! * dt * dt;
    }
    const oax = ax.slice();
    const oay = ay.slice();
    accel();
    for (let i = 0; i < total; i++) {
      if (pin[i]) continue;
      vxs[i] += 0.5 * (oax[i]! + ax[i]!) * dt;
      vys[i] += 0.5 * (oay[i]! + ay[i]!) * dt;
    }
    path[s * 2] = xs[n]!;
    path[s * 2 + 1] = ys[n]!;
    let crashed = false;
    for (let i = 0; i < n; i++) {
      const dx = xs[n]! - xs[i]!;
      const dy = ys[n]! - ys[i]!;
      const rr = rad[n]! + rad[i]!;
      if (dx * dx + dy * dy < rr * rr) {
        crashed = true;
        break;
      }
    }
    if (crashed) {
      return path.subarray(0, Math.max(2, s * 2));
    }
  }
  return path;
}
