import { create } from "zustand";
import type { Kind, MissionStatus, Mode, Screen } from "./types";
import { loadSave, writeSave } from "./save";

export interface HelionState {
  screen: Screen;
  mode: Mode;
  missionId: string | null;
  missionTitle: string;
  briefing: string;
  hint: string;
  progress: number;
  status: MissionStatus;
  failReason: string;
  kind: Kind;
  pin: boolean;
  orbitAssist: boolean;
  trails: boolean;
  paused: boolean;
  timeScale: number;
  follow: boolean;
  bodyCount: number;
  harmony: number;
  bestHarmony: number;
  budgetLeft: number;
  budgetMax: number;
  stars: number;
  completed: Record<string, number>;
  muted: boolean;
  sceneName: string;
  toast: string;
  hydrated: boolean;
  setScreen: (screen: Screen) => void;
  setKind: (kind: Kind) => void;
  toggle: <K extends "pin" | "orbitAssist" | "trails" | "paused" | "follow" | "muted">(
    key: K,
  ) => void;
  setTimeScale: (v: number) => void;
  setHud: (patch: Partial<HelionState>) => void;
  markComplete: (id: string, stars: number) => void;
  recordHarmony: (value: number) => void;
  hydrate: () => void;
}

export const useHelion = create<HelionState>((set, get) => ({
  screen: "title",
  mode: "sandbox",
  missionId: null,
  missionTitle: "",
  briefing: "",
  hint: "",
  progress: 0,
  status: "idle",
  failReason: "",
  kind: "planet",
  pin: false,
  orbitAssist: true,
  trails: true,
  paused: false,
  timeScale: 1,
  follow: false,
  bodyCount: 0,
  harmony: 0,
  bestHarmony: 0,
  budgetLeft: 0,
  budgetMax: 0,
  stars: 0,
  completed: {},
  muted: false,
  sceneName: "Helios",
  toast: "",
  hydrated: false,
  setScreen: (screen) => set({ screen }),
  setKind: (kind) => set({ kind }),
  toggle: (key) => {
    const next = !get()[key];
    set({ [key]: next } as Partial<HelionState>);
    if (key === "muted" || key === "trails" || key === "orbitAssist") {
      writeSave({
        muted: key === "muted" ? next : get().muted,
        trails: key === "trails" ? next : get().trails,
        orbitAssist: key === "orbitAssist" ? next : get().orbitAssist,
      });
    }
  },
  setTimeScale: (v) => set({ timeScale: v }),
  setHud: (patch) => set(patch),
  markComplete: (id, stars) => {
    const completed = { ...get().completed };
    completed[id] = Math.max(completed[id] ?? 0, stars);
    writeSave({ completed });
    set({ completed, stars });
  },
  recordHarmony: (value) => {
    if (value > get().bestHarmony) {
      writeSave({ bestHarmony: value });
      set({ bestHarmony: value });
    }
  },
  hydrate: () => {
    if (get().hydrated) return;
    const saved = loadSave();
    set({
      hydrated: true,
      bestHarmony: saved.bestHarmony,
      completed: saved.completed,
      muted: saved.muted,
      trails: saved.trails,
      orbitAssist: saved.orbitAssist,
    });
  },
}));
