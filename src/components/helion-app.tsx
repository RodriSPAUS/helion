import { useEffect, useRef, type RefObject } from "react";
import {
  CircleDot,
  Crosshair,
  FastForward,
  HelpCircle,
  Orbit,
  Pause,
  Pin,
  Play,
  RotateCcw,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { HelionEngine } from "@/game/engine";
import { MISSIONS } from "@/game/missions";
import { KIND_PRESETS, SCENES } from "@/game/presets";
import { setMuted, unlockAudio } from "@/game/audio";
import { useHelion } from "@/game/store";
import { cn } from "@/lib/cn";
import type { Kind } from "@/game/types";

export function HelionApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<HelionEngine | null>(null);
  const screen = useHelion((s) => s.screen);
  const muted = useHelion((s) => s.muted);

  useEffect(() => {
    useHelion.getState().hydrate();
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const engine = new HelionEngine(canvas);
      engineRef.current = engine;
      return () => engine.destroy();
    } catch (err) {
      console.error("Helion no pudo iniciar el lienzo", err);
      return;
    }
  }, []);

  useEffect(() => {
    setMuted(muted);
  }, [muted]);

  const startSandbox = (sceneId = "helios") => {
    unlockAudio();
    engineRef.current?.loadScene(sceneId);
    useHelion.getState().setHud({ paused: false, timeScale: 1, follow: false });
    useHelion.getState().setScreen("play");
  };

  const startMission = (id: string) => {
    unlockAudio();
    engineRef.current?.startMission(id);
    useHelion.getState().setScreen("play");
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ touchAction: "none" }}
      />
      {screen === "title" && (
        <TitleScreen
          onPlay={() => startSandbox("helios")}
          onContracts={() => useHelion.getState().setScreen("contracts")}
          onHow={() => useHelion.getState().setScreen("how")}
        />
      )}
      {screen === "how" && (
        <HowScreen
          onBack={() => useHelion.getState().setScreen("title")}
          onPlay={() => startSandbox("helios")}
        />
      )}
      {screen === "contracts" && (
        <ContractsScreen
          onBack={() => useHelion.getState().setScreen("title")}
          onPick={startMission}
        />
      )}
      {screen === "play" && (
        <PlayHud
          engine={engineRef}
          onMenu={() => {
            useHelion.getState().setScreen("title");
            engineRef.current?.loadScene("helios");
          }}
          onScene={startSandbox}
          onRetry={() => {
            const id = useHelion.getState().missionId;
            if (id) startMission(id);
            else engineRef.current?.clear();
          }}
          onNext={() => {
            const id = useHelion.getState().missionId;
            const i = MISSIONS.findIndex((m) => m.id === id);
            const next = MISSIONS[i + 1];
            if (next) startMission(next.id);
            else {
              useHelion.getState().setScreen("contracts");
              engineRef.current?.loadScene("helios");
            }
          }}
        />
      )}
    </div>
  );
}

function TitleScreen({
  onPlay,
  onContracts,
  onHow,
}: {
  onPlay: () => void;
  onContracts: () => void;
  onHow: () => void;
}) {
  const best = useHelion((s) => s.bestHarmony);
  const completed = useHelion((s) => s.completed);
  const done = Object.keys(completed).length;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between px-5 pt-6 pb-24 sm:px-10 sm:pt-8 sm:pb-16">
      <header className="pointer-events-auto flex items-center justify-between">
        <p className="text-xs tracking-[0.28em] text-muted uppercase">Simulador orbital</p>
        <button
          type="button"
          onClick={onHow}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted transition-opacity duration-150 hover:text-fg"
          aria-label="Cómo jugar"
        >
          <HelpCircle className="size-4" />
        </button>
      </header>

      <div className="pointer-events-auto max-w-xl">
        <h1 className="font-display text-5xl leading-none tracking-[-0.03em] text-fg sm:text-7xl">
          Helion
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted sm:text-base">
          Arrastra masas al vacío, impúlsalas y deja que la gravedad escriba la
          coreografía. Colisionan, se fusionan, orbitan.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onPlay}
            className="inline-flex h-12 items-center justify-center rounded-[20px] bg-fg px-6 text-sm font-medium text-accent-fg transition-transform duration-150 hover:opacity-95 active:scale-[0.98]"
          >
            Entrar al taller
          </button>
          <button
            type="button"
            onClick={onContracts}
            className="inline-flex h-12 items-center justify-center rounded-[20px] border border-border-strong px-6 text-sm font-medium text-fg transition-opacity duration-150 hover:bg-surface"
          >
            Contratos
          </button>
        </div>
        <p className="mt-5 text-xs tabular-nums text-subtle">
          Armonía máxima {best} · Contratos {done}/{MISSIONS.length}
        </p>
      </div>
    </div>
  );
}

function HowScreen({ onBack, onPlay }: { onBack: () => void; onPlay: () => void }) {
  const steps = [
    {
      t: "Colocar",
      d: "Elige una masa y arrastra en el vacío. El vector es el impulso; un toque corto circulariza si Órbita está activa.",
    },
    {
      t: "Fijar",
      d: "Una estrella anclada sostiene el sistema. Sin ancla, todo danza alrededor del centro de masa.",
    },
    {
      t: "Colisionar",
      d: "Si se tocan, fusionan masa y momento. Las estelas recuerdan el camino.",
    },
    {
      t: "Jugar",
      d: "En Contratos hay objetivos: órbitas, hondas, impactos, rescates. En el taller, la Armonía crece con cada mundo ligado.",
    },
  ];
  return (
    <div className="absolute inset-0 flex items-end justify-center bg-bg/40 px-4 pb-6 sm:items-center">
      <div className="helion-panel w-full max-w-lg rounded-xl p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.22em] text-muted uppercase">Manual</p>
            <h2 className="font-display mt-1 text-2xl tracking-[-0.03em]">Cómo se mueve el cielo</h2>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border text-muted"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
        </div>
        <ol className="mt-5 space-y-4">
          {steps.map((s, i) => (
            <li key={s.t} className="flex gap-3">
              <span className="mt-0.5 w-6 shrink-0 text-xs tabular-nums text-subtle">0{i + 1}</span>
              <div>
                <p className="text-sm font-medium text-fg">{s.t}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={onPlay}
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-lg bg-fg text-sm font-medium text-accent-fg"
        >
          Probar en el taller
        </button>
      </div>
    </div>
  );
}

function ContractsScreen({
  onBack,
  onPick,
}: {
  onBack: () => void;
  onPick: (id: string) => void;
}) {
  const completed = useHelion((s) => s.completed);
  return (
    <div className="absolute inset-0 flex flex-col bg-bg/30 px-4 py-5 sm:px-8">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between">
        <div>
          <p className="text-xs tracking-[0.22em] text-muted uppercase">Campaña</p>
          <h2 className="font-display mt-1 text-3xl tracking-[-0.03em]">Contratos</h2>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-11 items-center rounded-md border border-border px-4 text-sm text-muted"
        >
          Volver
        </button>
      </div>
      <div className="mx-auto mt-5 grid w-full max-w-2xl gap-2 overflow-y-auto pb-8">
        {MISSIONS.map((m) => {
          const stars = completed[m.id] ?? 0;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onPick(m.id)}
              className="helion-panel rounded-lg p-4 text-left transition-transform duration-150 hover:border-border-strong active:scale-[0.995]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-fg">
                  <span className="mr-2 text-subtle tabular-nums">0{m.index}</span>
                  {m.title}
                </p>
                <Stars n={stars} />
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted">{m.briefing}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-1" aria-label={`${n} de 3`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "size-1.5 rounded-full",
            i < n ? "bg-accent" : "bg-border-strong",
          )}
        />
      ))}
    </span>
  );
}

function PlayHud({
  engine,
  onMenu,
  onScene,
  onRetry,
  onNext,
}: {
  engine: RefObject<HelionEngine | null>;
  onMenu: () => void;
  onScene: (id: string) => void;
  onRetry: () => void;
  onNext: () => void;
}) {
  const mode = useHelion((s) => s.mode);
  const title = useHelion((s) => (s.mode === "mission" ? s.missionTitle : s.sceneName));
  const briefing = useHelion((s) => s.briefing);
  const hint = useHelion((s) => s.hint);
  const progress = useHelion((s) => s.progress);
  const status = useHelion((s) => s.status);
  const failReason = useHelion((s) => s.failReason);
  const kind = useHelion((s) => s.kind);
  const pin = useHelion((s) => s.pin);
  const orbitAssist = useHelion((s) => s.orbitAssist);
  const trails = useHelion((s) => s.trails);
  const paused = useHelion((s) => s.paused);
  const timeScale = useHelion((s) => s.timeScale);
  const follow = useHelion((s) => s.follow);
  const harmony = useHelion((s) => s.harmony);
  const best = useHelion((s) => s.bestHarmony);
  const budgetLeft = useHelion((s) => s.budgetLeft);
  const budgetMax = useHelion((s) => s.budgetMax);
  const muted = useHelion((s) => s.muted);
  const stars = useHelion((s) => s.stars);
  const missionId = useHelion((s) => s.missionId);
  const mission = MISSIONS.find((m) => m.id === missionId);
  const allowed = mission?.allowedKinds ?? null;

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onMenu}
            className="helion-chip inline-flex h-10 items-center rounded-md px-3 text-sm"
          >
            Salir
          </button>
          {mode === "sandbox" ? (
            <div className="flex min-w-0 gap-1 overflow-x-auto">
              {SCENES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onScene(s.id)}
                  className="helion-chip h-10 shrink-0 rounded-md px-3 text-xs"
                  data-active={title === s.name}
                >
                  {s.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="helion-panel rounded-md px-3 py-2">
              <p className="text-xs tracking-[0.18em] text-subtle uppercase">Contrato</p>
              <p className="text-sm font-medium">{title}</p>
            </div>
          )}
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          {mode === "sandbox" && (
            <div className="helion-panel rounded-md px-3 py-2">
              <p className="text-xs tracking-[0.18em] text-subtle uppercase">Armonía</p>
              <p className="text-sm font-medium tabular-nums">
                {harmony}
                <span className="ml-2 text-subtle">máx {best}</span>
              </p>
            </div>
          )}
          {mode === "mission" && (
            <div className="helion-panel rounded-md px-3 py-2">
              <p className="text-xs tracking-[0.18em] text-subtle uppercase">Masas</p>
              <p className="text-sm font-medium tabular-nums">
                {budgetLeft}/{budgetMax}
              </p>
            </div>
          )}
        </div>
      </div>

      {mode === "mission" && status === "running" && (
        <div className="pointer-events-none absolute inset-x-0 top-[4.6rem] flex justify-center px-3 sm:top-20">
          <div className="helion-panel max-w-lg rounded-md px-4 py-3">
            <p className="text-sm text-fg">{briefing}</p>
            <p className="mt-1 text-xs text-muted">{hint}</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-accent transition-[width] duration-200"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {paused && status !== "won" && status !== "lost" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="helion-panel rounded-md px-4 py-2 text-sm tracking-[0.2em] text-muted uppercase">
            Pausa
          </p>
        </div>
      )}

      {(status === "won" || status === "lost") && (
        <div className="absolute inset-0 flex items-end justify-center bg-bg/35 px-4 pb-28 sm:items-center sm:pb-0">
          <div className="helion-panel w-full max-w-sm rounded-xl p-5">
            <p className="text-xs tracking-[0.22em] text-muted uppercase">
              {status === "won" ? "Contrato cumplido" : "Fallo"}
            </p>
            <h3 className="font-display mt-1 text-2xl tracking-[-0.03em]">
              {status === "won" ? title : "La danza se rompió"}
            </h3>
            {status === "won" ? (
              <p className="mt-2 text-sm text-muted">
                Estabilidad alcanzada. <Stars n={stars} />
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted">{failReason}</p>
            )}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-md border border-border text-sm"
              >
                Reintentar
              </button>
              {status === "won" ? (
                <button
                  type="button"
                  onClick={onNext}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-md bg-fg text-sm font-medium text-accent-fg"
                >
                  Siguiente
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onMenu}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-md bg-fg text-sm font-medium text-accent-fg"
                >
                  Salir
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
        <div className="pointer-events-auto mx-auto max-w-4xl">
          <div className="helion-panel flex items-center gap-1 overflow-x-auto rounded-xl p-1.5">
            {KIND_PRESETS.map((p) => {
              const disabled = allowed ? allowed.length > 0 && !allowed.includes(p.kind) : false;
              const locked = !!allowed && allowed.length === 0;
              return (
                <button
                  key={p.kind}
                  type="button"
                  disabled={disabled || locked}
                  onClick={() => useHelion.getState().setKind(p.kind)}
                  className="helion-chip flex h-10 shrink-0 items-center gap-2 rounded-md px-2.5 text-xs disabled:opacity-35"
                  data-active={kind === p.kind && !locked}
                  title={p.blurb}
                >
                  <KindDot kind={p.kind} />
                  {p.name}
                </button>
              );
            })}
            <span className="mx-1 h-6 w-px shrink-0 bg-border" />
            <Tool
              label="Fijar"
              active={pin}
              onClick={() => useHelion.getState().toggle("pin")}
              icon={<Pin className="size-3.5" />}
            />
            <Tool
              label="Órbita"
              active={orbitAssist}
              onClick={() => useHelion.getState().toggle("orbitAssist")}
              icon={<Orbit className="size-3.5" />}
            />
            <Tool
              label="Estelas"
              active={trails}
              onClick={() => useHelion.getState().toggle("trails")}
              icon={<CircleDot className="size-3.5" />}
            />
            <Tool
              label="Seguir"
              active={follow}
              onClick={() => useHelion.getState().toggle("follow")}
              icon={<Crosshair className="size-3.5" />}
            />
            <Tool
              label={paused ? "Reanudar" : "Pausa"}
              active={paused}
              onClick={() => useHelion.getState().toggle("paused")}
              icon={paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            />
            <label className="helion-chip flex h-10 shrink-0 items-center gap-2 rounded-md px-2.5 text-xs">
              <FastForward className="size-3.5" />
              <span className="tabular-nums">{timeScale.toFixed(2).replace(/\.00$/, "")}×</span>
              <input
                type="range"
                min={0.25}
                max={4}
                step={0.25}
                value={timeScale}
                onChange={(e) => useHelion.getState().setTimeScale(Number(e.target.value))}
                className="h-1 w-16 accent-[var(--color-accent)] sm:w-20"
                aria-label="Escala de tiempo"
              />
            </label>
            <button
              type="button"
              onClick={() => engine.current?.clear()}
              className="helion-chip inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-2.5 text-xs"
            >
              {mode === "mission" ? <RotateCcw className="size-3.5" /> : <Trash2 className="size-3.5" />}
              {mode === "mission" ? "Reiniciar" : "Borrar"}
            </button>
            <button
              type="button"
              onClick={() => useHelion.getState().toggle("muted")}
              className="helion-chip inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
              aria-label={muted ? "Activar sonido" : "Silenciar"}
            >
              {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Tool({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      aria-label={label}
      title={label}
      className="helion-chip inline-flex h-10 items-center gap-2 rounded-md px-2.5 text-xs"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function KindDot({ kind }: { kind: Kind }) {
  const map: Record<Kind, string> = {
    comet: "#c5d4e0",
    moon: "#b4b0a6",
    planet: "#7f9aa8",
    giant: "#c4a882",
    star: "#ead9a8",
    singularity: "#3a2a22",
  };
  return (
    <span
      className="size-2 rounded-full"
      style={{ backgroundColor: map[kind] }}
    />
  );
}
