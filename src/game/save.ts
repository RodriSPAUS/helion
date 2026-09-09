const KEY = "helion-save-v1";
const VERSION = 1;

export interface SaveData {
  version: number;
  bestHarmony: number;
  completed: Record<string, number>;
  muted: boolean;
  trails: boolean;
  orbitAssist: boolean;
}

const defaults: SaveData = {
  version: VERSION,
  bestHarmony: 0,
  completed: {},
  muted: false,
  trails: true,
  orbitAssist: true,
};

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults, completed: {} };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...defaults,
      ...parsed,
      version: VERSION,
      completed: parsed.completed ?? {},
      bestHarmony: Number(parsed.bestHarmony) || 0,
    };
  } catch {
    return { ...defaults, completed: {} };
  }
}

export function writeSave(patch: Partial<SaveData>) {
  try {
    const next = { ...loadSave(), ...patch, version: VERSION };
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {
    return { ...defaults, ...patch, completed: patch.completed ?? {} };
  }
}
