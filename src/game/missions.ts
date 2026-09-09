import type { MissionDef } from "./types";
import { G } from "./physics";

function circ(
  x: number,
  y: number,
  aroundMass: number,
  aroundX = 0,
  aroundY = 0,
  aroundVx = 0,
  aroundVy = 0,
  sign: 1 | -1 = 1,
) {
  const dx = x - aroundX;
  const dy = y - aroundY;
  const r = Math.hypot(dx, dy) || 1;
  const v = Math.sqrt((G * aroundMass) / r);
  return {
    vx: aroundVx + sign * (-dy / r) * v,
    vy: aroundVy + sign * (dx / r) * v,
  };
}

export const MISSIONS: MissionDef[] = [
  {
    id: "first-orbit",
    index: 1,
    title: "Primera órbita",
    briefing:
      "Hay un sol fijo. Coloca un mundo y mantenlo en una órbita ligada dieciséis segundos.",
    hint: "Toca a media distancia con Órbita activa. Un arrastre corto marca la tangente.",
    scene: [{ kind: "star", x: 0, y: 0, mass: 880, pinned: true, tags: ["star"], hue: 40 }],
    zoom: 1,
    budget: 1,
    allowedKinds: ["planet", "moon", "giant"],
    orbitAssist: true,
    pinAllowed: false,
    objective: {
      kind: "orbit",
      aroundTag: "star",
      duration: 16,
      minR: 95,
      maxR: 430,
    },
    timeout: 75,
  },
  {
    id: "satellite",
    index: 2,
    title: "Satélite",
    briefing:
      "El planeta ya orbita. Colócale una luna y que no se escape ni caiga durante doce segundos.",
    hint: "Acércate al planeta, no al sol. El pozo local gana si sueltas cerca.",
    scene: [
      { kind: "star", x: 0, y: 0, mass: 900, pinned: true, tags: ["star"], hue: 40 },
      {
        kind: "planet",
        x: 250,
        y: 0,
        mass: 72,
        hue: 22,
        tags: ["planet"],
        ...circ(250, 0, 900),
      },
    ],
    zoom: 1,
    budget: 1,
    allowedKinds: ["moon", "comet", "planet"],
    orbitAssist: true,
    pinAllowed: false,
    objective: { kind: "moon", planetTag: "planet", duration: 12, maxR: 88 },
    timeout: 70,
  },
  {
    id: "slingshot",
    index: 3,
    title: "Honda de Helios",
    briefing:
      "Impulsa la sonda para que roce el gigante y cruce la puerta. Una línea recta no llega.",
    hint: "Tira de la sonda hacia abajo-derecha, rozando el pozo. La gravedad dobla la trayectoria.",
    scene: [
      { kind: "giant", x: 0, y: 0, mass: 640, pinned: true, tags: ["assist"], hue: 32 },
      {
        kind: "comet",
        x: -470,
        y: 132,
        mass: 1.1,
        vx: 0,
        vy: 0,
        hue: 200,
        tags: ["probe"],
        launchable: true,
      },
    ],
    zones: [{ x: 430, y: 168, r: 62, label: "Puerta", tag: "gate" }],
    zoom: 0.82,
    budget: 0,
    allowedKinds: [],
    orbitAssist: false,
    pinAllowed: false,
    objective: { kind: "reach", bodyTag: "probe", zoneTag: "gate" },
    timeout: 45,
  },
  {
    id: "impact",
    index: 4,
    title: "Atracción fatal",
    briefing:
      "Dos errantes se cruzan y no se tocan. Coloca una sola masa para que colisionen.",
    hint: "Un pozo entre ambos, un poco desplazado, curva las dos trayectorias a la vez.",
    scene: [
      { kind: "moon", x: -260, y: -70, vx: 36, vy: 7, mass: 8, hue: 200, tags: ["a"] },
      { kind: "moon", x: 260, y: 70, vx: -36, vy: -7, mass: 8, hue: 28, tags: ["b"] },
    ],
    zoom: 0.92,
    budget: 1,
    allowedKinds: ["planet", "giant", "moon", "star"],
    orbitAssist: false,
    pinAllowed: true,
    objective: { kind: "mergeTags", a: "a", b: "b" },
    timeout: 28,
  },
  {
    id: "shield",
    index: 5,
    title: "Escudo",
    briefing:
      "Un cometa cae sobre el mundo natal. Desvíalo con un solo cuerpo y que el planeta sobreviva catorce segundos.",
    hint: "No hace falta destruirlo: un tirón lateral basta. Evita poner la masa encima de casa.",
    scene: [
      { kind: "star", x: 0, y: 0, mass: 820, pinned: true, tags: ["star"], hue: 40 },
      {
        kind: "planet",
        x: 220,
        y: 0,
        mass: 24,
        hue: 198,
        tags: ["home"],
        ...circ(220, 0, 820),
      },
      { kind: "comet", x: 520, y: -40, vx: -88, vy: 6, mass: 4.5, hue: 20, tags: ["threat"] },
    ],
    zoom: 0.88,
    budget: 1,
    allowedKinds: ["moon", "planet", "giant", "comet"],
    orbitAssist: true,
    pinAllowed: false,
    objective: { kind: "protect", homeTag: "home", duration: 14 },
    timeout: 22,
    failOnHomeMerge: true,
    homeTag: "home",
  },
  {
    id: "architect",
    index: 6,
    title: "Arquitecto",
    briefing:
      "Vacío total. Construye un sistema con una estrella y al menos dos orbitadores ligados durante veintidós segundos.",
    hint: "Fija la estrella, luego suelta mundos con Órbita. Menos masas, más estable.",
    scene: [],
    zoom: 1,
    budget: 5,
    allowedKinds: ["star", "planet", "moon", "giant", "comet"],
    orbitAssist: true,
    pinAllowed: true,
    objective: {
      kind: "system",
      minOrbiters: 2,
      duration: 22,
      requireStar: true,
    },
    timeout: 90,
  },
];

export function missionById(id: string): MissionDef | undefined {
  return MISSIONS.find((m) => m.id === id);
}
