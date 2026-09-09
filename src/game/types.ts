export type Kind =
  | "comet"
  | "moon"
  | "planet"
  | "giant"
  | "star"
  | "singularity";

export type Screen = "title" | "how" | "contracts" | "play";
export type Mode = "sandbox" | "mission";
export type MissionStatus = "idle" | "running" | "won" | "lost";

export interface Body {
  id: number;
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  prevX: number;
  prevY: number;
  mass: number;
  radius: number;
  hue: number;
  color: string;
  pinned: boolean;
  tags: string[];
  launchable: boolean;
  trail: Float32Array;
  trailLen: number;
  trailCursor: number;
  glow: number;
  pulse: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: "spark" | "ring" | "flash";
}

export interface Shockwave {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
}

export interface Zone {
  x: number;
  y: number;
  r: number;
  label: string;
  tag: string;
}

export interface KindPreset {
  kind: Kind;
  name: string;
  mass: number;
  blurb: string;
}

export interface SceneBody {
  kind: Kind;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  mass?: number;
  pinned?: boolean;
  tags?: string[];
  launchable?: boolean;
  hue?: number;
  circularAround?: number;
}

export interface Scene {
  id: string;
  name: string;
  blurb: string;
  zoom: number;
  bodies: SceneBody[];
}

export type Objective =
  | {
      kind: "orbit";
      aroundTag: string;
      duration: number;
      minR: number;
      maxR: number;
      bodyTag?: string;
    }
  | {
      kind: "moon";
      planetTag: string;
      duration: number;
      maxR: number;
    }
  | {
      kind: "reach";
      bodyTag: string;
      zoneTag: string;
    }
  | {
      kind: "mergeTags";
      a: string;
      b: string;
    }
  | {
      kind: "protect";
      homeTag: string;
      duration: number;
    }
  | {
      kind: "system";
      minOrbiters: number;
      duration: number;
      requireStar: boolean;
    };

export interface MissionDef {
  id: string;
  index: number;
  title: string;
  briefing: string;
  hint: string;
  scene: SceneBody[];
  zoom: number;
  zones?: Zone[];
  budget: number;
  allowedKinds: Kind[] | null;
  orbitAssist: boolean;
  pinAllowed: boolean;
  objective: Objective;
  timeout: number;
  failOnHomeMerge?: boolean;
  homeTag?: string;
}
