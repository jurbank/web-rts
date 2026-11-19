import { SHOT_KINDS, type RenderStats } from "render";
import { useCallback, useEffect, useRef, useState } from "react";
import { FACTIONS } from "./factions.ts";
import { mountGallery, renderEffectSheet, SUBJECTS, type GallerySettings } from "./gallery.ts";
import { Button } from "./Hud.tsx";
import { Viewport } from "./Viewport.tsx";

declare global {
  interface Window {
    /** For the effects skill's capture script, which reads sheets from a headless browser. */
    renderEffectSheet?: typeof renderEffectSheet;
  }
}

const ZOOM_STEP = 1.4;
const SLOW = 0.15;

/** Plays each effect on loop for a faction and a subject, to review it as players will see it. */
export function EffectsGallery({ onExit }: { onExit: () => void }) {
  const [settings, setSettings] = useState<GallerySettings>({
    faction: FACTIONS[0].id,
    kind: "shot",
    effect: SHOT_KINDS[0],
    subject: "soldier",
    speed: 1,
  });
  const [stats, setStats] = useState<RenderStats | null>(null);
  const gallery = useRef<ReturnType<typeof mountGallery> | null>(null);
  const update = (change: Partial<GallerySettings>) => setSettings({ ...settings, ...change });

  useEffect(() => {
    window.renderEffectSheet = renderEffectSheet;
    return () => {
      delete window.renderEffectSheet;
    };
  }, []);

  const mount = useCallback(
    (elements: Parameters<typeof mountGallery>[0]) => {
      const mounted = mountGallery(elements, settings, setStats);
      gallery.current = mounted;
      return () => {
        mounted.dispose();
        gallery.current = null;
      };
    },
    [settings],
  );

  const row = "pointer-events-auto flex flex-wrap items-center gap-2";
  const label = "w-16 text-xs text-white/60 uppercase";
  return (
    <>
      <Viewport mount={mount} />
      <div className="pointer-events-none fixed inset-0 flex flex-col justify-between gap-2 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-sm text-white">
        <div className="flex flex-col gap-2">
          <div className={row}>
            <span className={label}>Faction</span>
            {FACTIONS.map((faction) => (
              <Button
                key={faction.id}
                pressed={settings.faction === faction.id}
                onClick={() => update({ faction: faction.id })}
              >
                {faction.name}
              </Button>
            ))}
          </div>
          <div className={row}>
            <span className={label}>Shot</span>
            {SHOT_KINDS.map((effect) => (
              <Button
                key={effect}
                pressed={settings.kind === "shot" && settings.effect === effect}
                onClick={() => update({ kind: "shot", effect })}
              >
                {effect}
              </Button>
            ))}
          </div>
          <div className={row}>
            <span className={label}>Death</span>
            <Button pressed={settings.kind === "death"} onClick={() => update({ kind: "death" })}>
              by size
            </Button>
          </div>
          <div className={row}>
            <span className={label}>Subject</span>
            {SUBJECTS.map((subject) => (
              <Button
                key={subject}
                pressed={settings.subject === subject}
                onClick={() => update({ subject })}
              >
                {subject}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="rounded-lg bg-slate-900/85 px-3 py-2 font-mono text-xs" aria-live="off">
            {stats === null
              ? "…"
              : `${stats.drawCalls} draws · ${stats.triangles.toLocaleString()} tris · ${stats.particles} parts`}
          </div>
          <div className="pointer-events-auto flex gap-2">
            <Button
              pressed={settings.speed < 1}
              onClick={() => update({ speed: settings.speed < 1 ? 1 : SLOW })}
            >
              Slow
            </Button>
            <Button onClick={() => gallery.current?.zoom(1 / ZOOM_STEP)}>Closer</Button>
            <Button onClick={() => gallery.current?.zoom(ZOOM_STEP)}>Farther</Button>
            <Button onClick={onExit}>Editor</Button>
          </div>
        </div>
      </div>
    </>
  );
}
