import type { Body, Kind, MissionDef, Particle, SceneBody, Shockwave, Zone } from "./types";
import {
  BODY_CAP,
  PHYS_DT,
  centerOfMass,
  circularVelocity,
  collideAndMerge,
  colorForKind,
  computeAccel,
  countBoundOrbiters,
  findAttractor,
  isBoundTo,
  makeTrail,
  pickOrbitSign,
  predictPath,
  pushTrail,
  radiusFromMass,
  verletStep,
} from "./physics";
import { presetByKind, sceneById } from "./presets";
import { missionById } from "./missions";
import { playFlick, playLose, playMerge, playPlace, playWin, resumeAudio } from "./audio";
import { useHelion } from "./store";
import { drawFrame, type Camera, type Ghost } from "./render";

const CIRC_THRESH_PX = 16;
const FLICK = 2.15;
const ESCAPE_R = 2200;

interface DragState {
  pointerId: number;
  mode: "place" | "impulse" | "pan";
  startX: number;
  startY: number;
  x: number;
  y: number;
  bodyId?: number;
}

export class HelionEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  bodies: Body[] = [];
  particles: Particle[] = [];
  waves: Shockwave[] = [];
  zones: Zone[] = [];
  cam: Camera = { x: 0, y: 0, zoom: 1, shakeX: 0, shakeY: 0 };
  trauma = 0;
  acc = 0;
  simTime = 0;
  trailTick = 0;
  raf = 0;
  lastT = 0;
  nextId = 1;
  nextHue = 18;
  freeze = 0;
  running = false;
  interactive = false;
  mission: MissionDef | null = null;
  objectiveTime = 0;
  harmonyAcc = 0;
  placed = 0;
  dpr = 1;
  width = 1;
  height = 1;
  drag: DragState | null = null;
  panPointers = new Map<number, { x: number; y: number }>();
  ghost: Ghost | null = null;
  keys = new Set<string>();
  observer: ResizeObserver | null = null;
  onKey: (e: KeyboardEvent) => void;
  onKeyUp: (e: KeyboardEvent) => void;
  onVis: () => void;
  titleDrift = 0;
  hitstop = 0;
  hudAcc = 0;
  lastProgress = -1;
  pendingPlay = false;
  lastHeliosReload = 0;
  onWinPointer: (e: PointerEvent) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx =
      canvas.getContext("2d", { alpha: false, desynchronized: true }) ??
      canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D no disponible");
    this.ctx = ctx;
    this.onKey = (e) => this.handleKey(e, true);
    this.onKeyUp = (e) => this.handleKey(e, false);
    this.onVis = () => {
      if (document.hidden) this.keys.clear();
      else resumeAudio();
    };
    this.onWinPointer = (e: PointerEvent) => {
      if (this.drag && this.drag.pointerId === e.pointerId) this.onPointerUp(e);
    };
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("pointerup", this.onWinPointer);
    window.addEventListener("pointercancel", this.onWinPointer);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.endDrag();
    });
    document.addEventListener("visibilitychange", this.onVis);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    this.loadScene("helios");
    this.running = true;
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("pointerup", this.onWinPointer);
    window.removeEventListener("pointercancel", this.onWinPointer);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("visibilitychange", this.onVis);
  }

  endDrag() {
    if (!this.drag) return;
    try {
      this.canvas.releasePointerCapture(this.drag.pointerId);
    } catch {
      /* already released */
    }
    this.drag = null;
    this.ghost = null;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const bw = Math.floor(w * dpr);
    const bh = Math.floor(h * dpr);
    if (w === this.width && h === this.height && dpr === this.dpr && this.canvas.width === bw && this.canvas.height === bh) {
      return;
    }
    this.dpr = dpr;
    this.width = w;
    this.height = h;
    this.canvas.width = bw;
    this.canvas.height = bh;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  screenToWorld(sx: number, sy: number) {
    const z = this.cam.zoom || 1;
    return {
      x: (sx - this.width / 2) / z + this.cam.x,
      y: (sy - this.height / 2) / z + this.cam.y,
    };
  }

  worldToScreen(wx: number, wy: number) {
    const z = this.cam.zoom || 1;
    return {
      x: (wx - this.cam.x) * z + this.width / 2,
      y: (wy - this.cam.y) * z + this.height / 2,
    };
  }

  eventToLocal(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  spawnFromSpec(spec: SceneBody): Body {
    const preset = presetByKind(spec.kind);
    const mass = spec.mass ?? preset.mass;
    const hue = spec.hue ?? this.nextHue++;
    const b: Body = {
      id: this.nextId++,
      kind: spec.kind,
      x: spec.x,
      y: spec.y,
      vx: spec.vx ?? 0,
      vy: spec.vy ?? 0,
      ax: 0,
      ay: 0,
      prevX: spec.x,
      prevY: spec.y,
      mass,
      radius: radiusFromMass(mass, spec.kind),
      hue,
      color: colorForKind(spec.kind, hue),
      pinned: !!spec.pinned,
      tags: spec.tags ? [...spec.tags] : [],
      launchable: !!spec.launchable,
      trail: makeTrail(),
      trailLen: 0,
      trailCursor: 0,
      glow: 0,
      pulse: 0,
    };
    return b;
  }

  loadScene(id: string) {
    const scene = sceneById(id);
    this.mission = null;
    this.zones = [];
    this.bodies = scene.bodies.map((s) => this.spawnFromSpec(s));
    this.particles = [];
    this.waves = [];
    this.cam.x = 0;
    this.cam.y = -36;
    this.cam.zoom = scene.zoom;
    this.simTime = 0;
    this.objectiveTime = 0;
    this.harmonyAcc = 0;
    this.placed = 0;
    this.acc = 0;
    computeAccel(this.bodies);
    useHelion.getState().setHud({
      mode: "sandbox",
      missionId: null,
      missionTitle: "",
      briefing: "",
      hint: "Arrastra para crear un mundo. Un toque corto circulariza.",
      status: "idle",
      progress: 0,
      failReason: "",
      harmony: 0,
      budgetLeft: 0,
      budgetMax: 0,
      sceneName: scene.name,
      bodyCount: this.bodies.length,
      pin: false,
      paused: false,
    });
  }

  startMission(id: string) {
    const def = missionById(id);
    if (!def) return;
    this.mission = def;
    this.zones = def.zones ? def.zones.map((z) => ({ ...z })) : [];
    this.bodies = def.scene.map((s) => this.spawnFromSpec(s));
    this.particles = [];
    this.waves = [];
    this.cam.x = 0;
    this.cam.y = -28;
    this.cam.zoom = def.zoom;
    this.simTime = 0;
    this.objectiveTime = 0;
    this.harmonyAcc = 0;
    this.placed = 0;
    this.acc = 0;
    computeAccel(this.bodies);
    const allowed = def.allowedKinds;
    const kind =
      allowed && allowed.length > 0
        ? allowed.includes(useHelion.getState().kind)
          ? useHelion.getState().kind
          : allowed[0]!
        : useHelion.getState().kind;
    useHelion.getState().setHud({
      mode: "mission",
      missionId: def.id,
      missionTitle: def.title,
      briefing: def.briefing,
      hint: def.hint,
      status: "running",
      progress: 0,
      failReason: "",
      harmony: 0,
      budgetLeft: def.budget,
      budgetMax: def.budget,
      sceneName: def.title,
      bodyCount: this.bodies.length,
      orbitAssist: def.orbitAssist,
      pin: false,
      paused: false,
      timeScale: 1,
      kind,
      stars: 0,
    });
  }

  clear() {
    if (this.mission) {
      this.startMission(this.mission.id);
      return;
    }
    this.bodies = [];
    this.particles = [];
    this.waves = [];
    this.zones = [];
    this.harmonyAcc = 0;
    this.placed = 0;
    useHelion.getState().setHud({
      bodyCount: 0,
      harmony: 0,
      progress: 0,
      toast: "Tablero vacío",
    });
  }

  pickBody(x: number, y: number): Body | null {
    let best: Body | null = null;
    let bestD = Infinity;
    for (const b of this.bodies) {
      const d = Math.hypot(b.x - x, b.y - y);
      const hit = Math.max(14 / this.cam.zoom, b.radius * 1.35);
      if (d <= hit && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  onPointerDown = (e: PointerEvent) => {
    const ui = useHelion.getState();
    if (ui.screen === "title") {
      this.interactive = true;
      this.pendingPlay = true;
    }
    if (!this.interactive) return;
    const local = this.eventToLocal(e);
    this.panPointers.set(e.pointerId, local);
    if (this.panPointers.size === 2) {
      this.drag = { pointerId: e.pointerId, mode: "pan", startX: local.x, startY: local.y, x: local.x, y: local.y };
      this.ghost = null;
      return;
    }
    if (e.button === 1) {
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic / lost capture */
      }
      this.drag = { pointerId: e.pointerId, mode: "pan", startX: local.x, startY: local.y, x: local.x, y: local.y };
      return;
    }
    if (e.button !== 0) return;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic / lost capture */
    }
    const world = this.screenToWorld(local.x, local.y);
    const hit = this.pickBody(world.x, world.y);
    const st = useHelion.getState();
    if (hit && (hit.launchable || (st.paused && !hit.pinned))) {
      this.drag = {
        pointerId: e.pointerId,
        mode: "impulse",
        startX: world.x,
        startY: world.y,
        x: world.x,
        y: world.y,
        bodyId: hit.id,
      };
      this.updateGhostFromDrag();
      return;
    }
    if (st.mode === "mission" && st.budgetLeft <= 0) {
      if (hit?.launchable) {
        this.drag = {
          pointerId: e.pointerId,
          mode: "impulse",
          startX: world.x,
          startY: world.y,
          x: world.x,
          y: world.y,
          bodyId: hit.id,
        };
        this.updateGhostFromDrag();
      }
      return;
    }
    if (st.mode === "mission") {
      const allowed = this.mission?.allowedKinds;
      if (allowed && allowed.length === 0) return;
    }
    this.drag = {
      pointerId: e.pointerId,
      mode: "place",
      startX: world.x,
      startY: world.y,
      x: world.x,
      y: world.y,
    };
    this.updateGhostFromDrag();
  };

  onPointerMove = (e: PointerEvent) => {
    const local = this.eventToLocal(e);
    if (this.panPointers.has(e.pointerId)) this.panPointers.set(e.pointerId, local);
    if (this.panPointers.size === 2) {
      this.handlePinch();
      return;
    }
    if (!this.drag || this.drag.pointerId !== e.pointerId) return;
    if (this.drag.mode === "pan") {
      const z = this.cam.zoom || 1;
      this.cam.x -= (local.x - this.drag.x) / z;
      this.cam.y -= (local.y - this.drag.y) / z;
      this.drag.x = local.x;
      this.drag.y = local.y;
      return;
    }
    const world = this.screenToWorld(local.x, local.y);
    this.drag.x = world.x;
    this.drag.y = world.y;
    this.updateGhostFromDrag();
  };

  onPointerUp = (e: PointerEvent) => {
    this.panPointers.delete(e.pointerId);
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    if (this.pendingPlay) {
      this.pendingPlay = false;
      const ui = useHelion.getState();
      ui.setHud({ paused: false });
      ui.setScreen("play");
    }
    if (!this.drag || this.drag.pointerId !== e.pointerId) {
      if (this.panPointers.size < 2 && this.drag?.mode === "pan") this.drag = null;
      return;
    }
    const drag = this.drag;
    this.drag = null;
    if (drag.mode === "pan") {
      this.ghost = null;
      return;
    }
    const local = this.eventToLocal(e);
    const world = this.screenToWorld(local.x, local.y);
    drag.x = world.x;
    drag.y = world.y;
    if (drag.mode === "impulse") {
      this.applyImpulse(drag);
      this.ghost = null;
      return;
    }
    this.placeFromDrag(drag);
    this.ghost = null;
  };

  handlePinch() {
    const pts = [...this.panPointers.values()];
    if (pts.length < 2) return;
    const a = pts[0]!;
    const b = pts[1]!;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const prev = (this as unknown as { _pinch?: { dist: number; midX: number; midY: number } })._pinch;
    if (prev && prev.dist > 8) {
      const factor = dist / prev.dist;
      this.zoomAt(mid.x, mid.y, factor);
      const z = this.cam.zoom || 1;
      this.cam.x -= (mid.x - prev.midX) / z;
      this.cam.y -= (mid.y - prev.midY) / z;
    }
    (this as unknown as { _pinch?: { dist: number; midX: number; midY: number } })._pinch = {
      dist,
      midX: mid.x,
      midY: mid.y,
    };
  }

  onWheel = (e: WheelEvent) => {
    if (!this.interactive) return;
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    this.zoomAt(sx, sy, factor);
  };

  zoomAt(sx: number, sy: number, factor: number) {
    const before = this.screenToWorld(sx, sy);
    this.cam.zoom = Math.min(3.4, Math.max(0.22, this.cam.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
  }

  velocityFromDrag(drag: DragState, mass: number, kind: Kind, pinned: boolean) {
    const dx = drag.x - drag.startX;
    const dy = drag.y - drag.startY;
    const screenDist = Math.hypot(dx, dy) * (this.cam.zoom || 1);
    const st = useHelion.getState();
    const assist = st.orbitAssist && (this.mission ? this.mission.orbitAssist : true);
    if (pinned) return { vx: 0, vy: 0, attractor: null as Body | null };
    const attractor = findAttractor(this.bodies, drag.startX, drag.startY);
    if (assist && screenDist < CIRC_THRESH_PX && attractor && attractor.mass > mass * 2.2) {
      const sign = pickOrbitSign(drag.startX, drag.startY, attractor, dx, dy);
      const v = circularVelocity(drag.startX, drag.startY, attractor, sign);
      return { vx: v.vx, vy: v.vy, attractor };
    }
    if (screenDist < CIRC_THRESH_PX) return { vx: 0, vy: 0, attractor };
    return { vx: dx * FLICK, vy: dy * FLICK, attractor };
  }

  updateGhostFromDrag() {
    const drag = this.drag;
    if (!drag || drag.mode === "pan") {
      this.ghost = null;
      return;
    }
    const st = useHelion.getState();
    if (drag.mode === "impulse") {
      const body = this.bodies.find((b) => b.id === drag.bodyId);
      if (!body) return;
      const { vx, vy, attractor } = this.velocityFromDrag(drag, body.mass, body.kind, body.pinned);
      const path = predictPath(this.bodies.filter((b) => b.id !== body.id), {
        x: body.x,
        y: body.y,
        vx,
        vy,
        mass: body.mass,
        pinned: body.pinned,
      });
      this.ghost = {
        x: body.x,
        y: body.y,
        vx,
        vy,
        radius: body.radius,
        color: body.color,
        kind: body.kind,
        path,
        attractorX: attractor?.x,
        attractorY: attractor?.y,
        attractorR: attractor ? Math.hypot(body.x - attractor.x, body.y - attractor.y) : 0,
      };
      return;
    }
    const kind = st.kind;
    const preset = presetByKind(kind);
    const pinned = st.pin;
    const click =
      Math.hypot(drag.x - drag.startX, drag.y - drag.startY) * (this.cam.zoom || 1) < CIRC_THRESH_PX;
    const gx = click ? drag.x : drag.startX;
    const gy = click ? drag.y : drag.startY;
    const vDrag = click ? { ...drag, startX: gx, startY: gy } : drag;
    const { vx, vy, attractor } = this.velocityFromDrag(vDrag, preset.mass, kind, pinned);
    const radius = radiusFromMass(preset.mass, kind);
    const path = pinned
      ? null
      : predictPath(this.bodies, {
          x: gx,
          y: gy,
          vx,
          vy,
          mass: preset.mass,
          pinned,
        });
    this.ghost = {
      x: gx,
      y: gy,
      vx,
      vy,
      radius,
      color: colorForKind(kind, this.nextHue),
      kind,
      path,
      attractorX: attractor?.x,
      attractorY: attractor?.y,
      attractorR: attractor ? Math.hypot(gx - attractor.x, gy - attractor.y) : 0,
    };
  }

  placeFromDrag(drag: DragState) {
    const st = useHelion.getState();
    if (this.bodies.length >= BODY_CAP) return;
    if (st.mode === "mission") {
      if (st.budgetLeft <= 0) return;
      const allowed = this.mission?.allowedKinds;
      if (allowed && allowed.length > 0 && !allowed.includes(st.kind)) return;
    }
    const kind = st.kind;
    const preset = presetByKind(kind);
    const pinned = st.pin && (st.mode !== "mission" || !!this.mission?.pinAllowed);
    const click =
      Math.hypot(drag.x - drag.startX, drag.y - drag.startY) * (this.cam.zoom || 1) < CIRC_THRESH_PX;
    const x = click ? drag.x : drag.startX;
    const y = click ? drag.y : drag.startY;
    const vDrag = click ? { ...drag, startX: x, startY: y } : drag;
    const { vx, vy } = this.velocityFromDrag(vDrag, preset.mass, kind, pinned);
    const spec: SceneBody = {
      kind,
      x,
      y,
      vx,
      vy,
      mass: preset.mass,
      pinned,
      hue: this.nextHue++,
    };
    const body = this.spawnFromSpec(spec);
    this.bodies.push(body);
    this.placed++;
    computeAccel(this.bodies);
    playPlace(body.mass);
    if (st.mode === "mission") {
      useHelion.getState().setHud({ budgetLeft: st.budgetLeft - 1, bodyCount: this.bodies.length });
    } else {
      useHelion.getState().setHud({ bodyCount: this.bodies.length });
    }
  }

  applyImpulse(drag: DragState) {
    const body = this.bodies.find((b) => b.id === drag.bodyId);
    if (!body || body.pinned) return;
    const { vx, vy } = this.velocityFromDrag(drag, body.mass, body.kind, false);
    const st = useHelion.getState();
    if (st.paused) {
      body.x = drag.x;
      body.y = drag.y;
      body.prevX = body.x;
      body.prevY = body.y;
    } else {
      body.vx = vx;
      body.vy = vy;
      body.launchable = false;
      playFlick();
    }
  }

  handleKey(e: KeyboardEvent, down: boolean) {
    if (e.code === "Space") e.preventDefault();
    if (down) this.keys.add(e.code);
    else {
      this.keys.delete(e.code);
      return;
    }
    if (e.repeat) return;
    if (!this.interactive && e.code !== "Escape") return;
    const st = useHelion.getState();
    if (e.code === "Space") st.toggle("paused");
    if (e.code === "KeyT") st.toggle("trails");
    if (e.code === "KeyF") st.toggle("follow");
    if (e.code === "KeyO") st.toggle("orbitAssist");
    if (e.code === "KeyP") st.toggle("pin");
    if (e.code === "KeyC") this.clear();
    if (e.code === "Digit1") st.setKind("comet");
    if (e.code === "Digit2") st.setKind("moon");
    if (e.code === "Digit3") st.setKind("planet");
    if (e.code === "Digit4") st.setKind("giant");
    if (e.code === "Digit5") st.setKind("star");
    if (e.code === "Digit6") st.setKind("singularity");
    if (e.code === "BracketLeft") st.setTimeScale(Math.max(0.25, st.timeScale * 0.5));
    if (e.code === "BracketRight") st.setTimeScale(Math.min(4, st.timeScale * 2));
    if (e.code === "Escape") {
      useHelion.getState().setScreen("title");
      this.interactive = false;
      if (st.mode === "mission") this.loadScene("helios");
    }
  }

  burst(x: number, y: number, color: string, mass: number) {
    const n = Math.min(28, 10 + Math.log10(mass + 1) * 8);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 12 + Math.random() * 90;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.45 + Math.random() * 0.4,
        maxLife: 0.85,
        size: 1.2 + Math.random() * 2.4,
        color,
        kind: "spark",
      });
    }
    this.waves.push({ x, y, r: 4, maxR: 18 + Math.min(80, Math.log10(mass + 1) * 28), life: 1 });
    this.trauma = Math.min(1, this.trauma + Math.min(0.7, 0.12 + Math.log10(mass + 1) * 0.12));
    if (mass > 40) this.hitstop = 0.045;
  }

  stepPhysics(dt: number) {
    for (const b of this.bodies) {
      b.prevX = b.x;
      b.prevY = b.y;
    }
    verletStep(this.bodies, dt);
    this.bodies = collideAndMerge(this.bodies, (result, a, b) => {
      this.burst(result.x, result.y, result.color, result.mass);
      playMerge(result.mass);
      if (this.mission?.failOnHomeMerge && this.mission.homeTag) {
        const home = this.mission.homeTag;
        const homeHit =
          (a.tags.includes(home) && !b.tags.includes(home)) ||
          (b.tags.includes(home) && !a.tags.includes(home));
        if (homeHit) this.fail("El mundo natal no sobrevivió.");
      }
    });
    this.trailTick++;
    if (this.trailTick % 3 === 0) {
      for (const b of this.bodies) pushTrail(b, b.x, b.y);
    }
    this.bodies = this.bodies.filter((b) => {
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.mass)) return false;
      return Math.hypot(b.x, b.y) < ESCAPE_R;
    });
  }

  fail(reason: string) {
    const st = useHelion.getState();
    if (st.status !== "running") return;
    playLose();
    useHelion.getState().setHud({ status: "lost", failReason: reason, progress: 0 });
  }

  win() {
    const st = useHelion.getState();
    if (st.status !== "running" || !this.mission) return;
    playWin();
    const leftover = st.budgetLeft;
    const timeFactor = Math.max(0, 1 - this.simTime / this.mission.timeout);
    let stars = 1;
    if (leftover >= 1 || timeFactor > 0.35) stars = 2;
    if (leftover >= 1 && timeFactor > 0.25 && this.placed <= this.mission.budget) stars = 3;
    if (this.mission.budget === 0) stars = this.simTime < this.mission.timeout * 0.45 ? 3 : 2;
    useHelion.getState().markComplete(this.mission.id, stars);
    useHelion.getState().setHud({ status: "won", progress: 1, stars });
    this.trauma = Math.min(1, this.trauma + 0.25);
  }

  evaluateMission(dt: number) {
    const st = useHelion.getState();
    if (!this.mission || st.status !== "running") return;
    if (this.simTime > this.mission.timeout) {
      this.fail("Se acabó el tiempo.");
      return;
    }
    const obj = this.mission.objective;
    let holding = false;
    let progress = 0;

    if (obj.kind === "orbit") {
      const star = this.bodies.find((b) => b.tags.includes(obj.aroundTag));
      const extra = this.bodies.filter((b) => star && b.id !== star.id);
      const target = obj.bodyTag
        ? extra.find((b) => b.tags.includes(obj.bodyTag!))
        : extra[0];
      if (star && target && isBoundTo(target, star, obj.minR, obj.maxR)) {
        holding = true;
        this.objectiveTime += dt;
        progress = this.objectiveTime / obj.duration;
      } else {
        this.objectiveTime = Math.max(0, this.objectiveTime - dt * 0.6);
        progress = this.objectiveTime / obj.duration;
      }
    } else if (obj.kind === "moon") {
      const planet = this.bodies.find((b) => b.tags.includes(obj.planetTag));
      const moons = this.bodies.filter((b) => planet && b.id !== planet.id && !b.tags.includes("star"));
      let ok = false;
      if (planet) {
        for (const m of moons) {
          if (m.tags.includes("star") || m.kind === "star") continue;
          const d = Math.hypot(m.x - planet.x, m.y - planet.y);
          if (d < obj.maxR && isBoundTo(m, planet, planet.radius + m.radius + 2, obj.maxR)) {
            ok = true;
            break;
          }
        }
      }
      if (ok) {
        holding = true;
        this.objectiveTime += dt;
      } else this.objectiveTime = Math.max(0, this.objectiveTime - dt * 0.5);
      progress = this.objectiveTime / obj.duration;
    } else if (obj.kind === "reach") {
      const body = this.bodies.find((b) => b.tags.includes(obj.bodyTag));
      const zone = this.zones.find((z) => z.tag === obj.zoneTag);
      if (body && zone) {
        const d = Math.hypot(body.x - zone.x, body.y - zone.y);
        progress = Math.max(0, 1 - d / 900);
        if (d < zone.r) {
          this.win();
          return;
        }
      }
    } else if (obj.kind === "mergeTags") {
      const hit = this.bodies.some((b) => b.tags.includes(obj.a) && b.tags.includes(obj.b));
      if (hit) {
        this.win();
        return;
      }
      progress = Math.min(0.85, this.simTime / this.mission.timeout);
    } else if (obj.kind === "protect") {
      const home = this.bodies.find((b) => b.tags.includes(obj.homeTag));
      if (!home) {
        this.fail("El mundo natal se perdió.");
        return;
      }
      this.objectiveTime += dt;
      progress = this.objectiveTime / obj.duration;
      holding = true;
    } else if (obj.kind === "system") {
      const hasStar = this.bodies.some((b) => b.kind === "star" || b.mass >= 400);
      const orbiters = countBoundOrbiters(this.bodies);
      if ((!obj.requireStar || hasStar) && orbiters >= obj.minOrbiters) {
        holding = true;
        this.objectiveTime += dt;
      } else this.objectiveTime = Math.max(0, this.objectiveTime - dt * 0.35);
      progress = this.objectiveTime / obj.duration;
    }

    const duration = "duration" in obj ? obj.duration : undefined;
    if (holding && duration !== undefined && this.objectiveTime >= duration) {
      this.win();
      return;
    }
    this.hudAcc += dt;
    if (this.hudAcc > 0.08 || Math.abs(progress - this.lastProgress) > 0.04) {
      this.hudAcc = 0;
      this.lastProgress = progress;
      useHelion.getState().setHud({
        progress: Math.max(0, Math.min(1, progress)),
        bodyCount: this.bodies.length,
      });
    }
  }

  stepHarmony(dt: number) {
    const st = useHelion.getState();
    if (st.mode !== "sandbox") return;
    const n = countBoundOrbiters(this.bodies);
    if (n > 0) this.harmonyAcc += dt * n * (1 + n * 0.15);
    const value = Math.floor(this.harmonyAcc);
    if (value !== st.harmony) {
      useHelion.getState().setHud({ harmony: value });
      useHelion.getState().recordHarmony(value);
    }
  }

  loop = (now: number) => {
    if (!this.running) return;
    try {
      this.tick(now);
    } catch (err) {
      console.error("Helion frame", err);
      this.drag = null;
      this.ghost = null;
      this.acc = 0;
    }
    if (this.running) this.raf = requestAnimationFrame(this.loop);
  };

  tick(now: number) {
    const raw = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    const st = useHelion.getState();
    this.interactive = st.screen === "play" || this.pendingPlay;

    if (st.screen === "title" || st.screen === "how" || st.screen === "contracts") {
      this.titleDrift += raw;
      this.cam.x = Math.sin(this.titleDrift * 0.07) * 18;
      this.cam.y = Math.cos(this.titleDrift * 0.05) * 10;
      if (st.screen === "title" && this.bodies.length < 2 && now - this.lastHeliosReload > 2500) {
        this.lastHeliosReload = now;
        this.loadScene("helios");
      }
    }

    const panSpeed = 280 / this.cam.zoom;
    if (this.interactive) {
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) this.cam.x -= panSpeed * raw;
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) this.cam.x += panSpeed * raw;
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) this.cam.y -= panSpeed * raw;
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) this.cam.y += panSpeed * raw;
    }

    this.hitstop = Math.max(0, this.hitstop - raw);
    const paused = st.paused || st.status === "won" || st.status === "lost" || this.hitstop > 0;
    const scale = paused ? 0 : st.timeScale;
    this.acc += raw * scale;
    const maxSteps = 28;
    let steps = 0;
    while (this.acc >= PHYS_DT && steps < maxSteps) {
      this.stepPhysics(PHYS_DT);
      this.simTime += PHYS_DT;
      this.evaluateMission(PHYS_DT);
      this.stepHarmony(PHYS_DT);
      this.acc -= PHYS_DT;
      steps++;
    }
    const alpha = paused ? 1 : this.acc / PHYS_DT;

    for (const p of this.particles) {
      p.x += p.vx * raw;
      p.y += p.vy * raw;
      p.life -= raw;
      p.vx *= 0.98;
      p.vy *= 0.98;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const w of this.waves) w.life -= raw * 1.4;
    this.waves = this.waves.filter((w) => w.life > 0);
    for (const b of this.bodies) {
      b.glow = Math.max(0, b.glow - raw * 1.8);
      b.pulse = Math.max(0, b.pulse - raw);
    }

    this.trauma = Math.max(0, this.trauma - raw * 1.6);
    const shake = this.trauma * this.trauma;
    this.cam.shakeX = (Math.random() * 2 - 1) * shake * 10;
    this.cam.shakeY = (Math.random() * 2 - 1) * shake * 10;

    if (st.follow && this.bodies.length) {
      const com = centerOfMass(this.bodies);
      const k = 1 - Math.exp(-3.2 * raw);
      this.cam.x += (com.x - this.cam.x) * k;
      this.cam.y += (com.y - this.cam.y) * k;
    }

    if (this.drag && this.interactive) this.updateGhostFromDrag();

    drawFrame(
      this.ctx,
      this.width,
      this.height,
      this.cam,
      this.bodies,
      this.particles,
      this.waves,
      this.zones,
      this.interactive ? this.ghost : null,
      st.trails,
      this.simTime,
      alpha,
      true,
      this.dpr,
    );

    const g = globalThis as unknown as { __helion?: Record<string, unknown> };
    g.__helion = {
      bodyCount: this.bodies.length,
      paused: st.paused,
      harmony: st.harmony,
      screen: st.screen,
      status: st.status,
      missionId: st.missionId,
      progress: st.progress,
      dpr: this.dpr,
      size: { w: this.width, h: this.height },
      lastScreen: this.bodies.length
        ? this.worldToScreen(this.bodies[this.bodies.length - 1]!.x, this.bodies[this.bodies.length - 1]!.y)
        : null,
      spawn: (x = 190, y = 40) => {
        this.placeFromDrag({
          pointerId: 0,
          mode: "place",
          startX: x,
          startY: y,
          x: x + 6,
          y,
        });
        return this.bodies.length;
      },
      clear: () => this.clear(),
    };
  }
}
