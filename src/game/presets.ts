import type { Kind, KindPreset, Scene } from "./types";
import { G } from "./physics";

export const KIND_PRESETS: KindPreset[] = [
  { kind: "comet", name: "Cometa", mass: 0.9, blurb: "Ligero, se deja arrastrar" },
  { kind: "moon", name: "Luna", mass: 3.2, blurb: "Satélite compacto" },
  { kind: "planet", name: "Mundo", mass: 16, blurb: "Planeta de masa media" },
  { kind: "giant", name: "Gigante", mass: 88, blurb: "Pozo profundo" },
  { kind: "star", name: "Estrella", mass: 820, blurb: "Ancla del sistema" },
  { kind: "singularity", name: "Singularidad", mass: 2600, blurb: "Todo cae hacia ella" },
];

export const KIND_ORDER: Kind[] = KIND_PRESETS.map((p) => p.kind);

export function presetByKind(kind: Kind): KindPreset {
  return KIND_PRESETS.find((p) => p.kind === kind) ?? KIND_PRESETS[2]!;
}

function circ(_mass: number, x: number, y: number, aroundMass: number, aroundX = 0, aroundY = 0, aroundVx = 0, aroundVy = 0, sign: 1 | -1 = 1) {
  const dx = x - aroundX;
  const dy = y - aroundY;
  const r = Math.hypot(dx, dy) || 1;
  const v = Math.sqrt((G * aroundMass) / r);
  return {
    vx: aroundVx + sign * (-dy / r) * v,
    vy: aroundVy + sign * (dx / r) * v,
  };
}

const STAR_M = 900;

export const SCENES: Scene[] = [
  {
    id: "helios",
    name: "Helios",
    blurb: "Una estrella y tres mundos",
    zoom: 0.86,
    bodies: [
      { kind: "star", x: 0, y: 0, mass: STAR_M, pinned: true, tags: ["star"], hue: 40 },
      {
        kind: "planet",
        x: 168,
        y: 0,
        mass: 14,
        hue: 198,
        tags: ["inner"],
        ...circ(14, 168, 0, STAR_M),
      },
      {
        kind: "planet",
        x: 272,
        y: 0,
        mass: 58,
        hue: 28,
        tags: ["home"],
        ...circ(58, 272, 0, STAR_M),
      },
      {
        kind: "moon",
        x: 272 + 26,
        y: 0,
        mass: 2.2,
        hue: 40,
        tags: ["moon"],
        ...(() => {
          const p = circ(58, 272, 0, STAR_M);
          return circ(2.2, 298, 0, 58, 272, 0, p.vx, p.vy);
        })(),
      },
      {
        kind: "giant",
        x: 430,
        y: 0,
        mass: 70,
        hue: 36,
        tags: ["outer"],
        ...circ(70, 430, 0, STAR_M, 0, 0, 0, 0, -1),
      },
    ],
  },
  {
    id: "binary",
    name: "Binaria",
    blurb: "Dos soles en danza",
    zoom: 0.95,
    bodies: (() => {
      const m = 420;
      const sep = 180;
      const v = Math.sqrt((G * m) / (2 * sep));
      return [
        { kind: "star" as const, x: -sep / 2, y: 0, vx: 0, vy: v, mass: m, hue: 42 },
        { kind: "star" as const, x: sep / 2, y: 0, vx: 0, vy: -v, mass: m, hue: 18 },
        {
          kind: "planet" as const,
          x: 0,
          y: 300,
          mass: 12,
          hue: 210,
          ...circ(12, 0, 300, m * 2),
        },
      ];
    })(),
  },
  {
    id: "figure8",
    name: "Figura ocho",
    blurb: "Coreografía de tres cuerpos",
    zoom: 0.78,
    bodies: (() => {
      const L = 155;
      const m = 26;
      const vf = Math.sqrt((G * m) / L);
      const p1x = 0.97000436 * L;
      const p1y = -0.24308753 * L;
      const v3x = 0.93240737 * vf;
      const v3y = 0.86473146 * vf;
      return [
        { kind: "planet" as const, x: p1x, y: p1y, vx: -v3x / 2, vy: -v3y / 2, mass: m, hue: 200 },
        { kind: "planet" as const, x: -p1x, y: -p1y, vx: -v3x / 2, vy: -v3y / 2, mass: m, hue: 28 },
        { kind: "planet" as const, x: 0, y: 0, vx: v3x, vy: v3y, mass: m, hue: 48 },
      ];
    })(),
  },
  {
    id: "belt",
    name: "Cinturón",
    blurb: "Roca en órbitas cruzadas",
    zoom: 0.9,
    bodies: [
      { kind: "star", x: 0, y: 0, mass: 760, pinned: true, hue: 38, tags: ["star"] },
      ...Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2 + 0.2;
        const r = 210 + (i % 3) * 36;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        const jitter = 0.92 + (i % 4) * 0.04;
        const c = circ(1.1, x, y, 760);
        return {
          kind: "comet" as const,
          x,
          y,
          vx: c.vx * jitter,
          vy: c.vy * jitter,
          mass: 0.8 + (i % 3) * 0.15,
          hue: 200 + i * 8,
        };
      }),
    ],
  },
];

export function sceneById(id: string): Scene {
  return SCENES.find((s) => s.id === id) ?? SCENES[0]!;
}
