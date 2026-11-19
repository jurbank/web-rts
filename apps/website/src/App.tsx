import type { Scenario } from "data";
import { useEffect, useState } from "react";
import { Editor } from "./Editor.tsx";
import { EffectsGallery } from "./EffectsGallery.tsx";
import { Play } from "./Play.tsx";

const GALLERY = "#effects";

export function App() {
  /** A validated copy of the document while a playtest runs (E3). */
  const [playing, setPlaying] = useState<Scenario | null>(null);
  const [gallery, setGallery] = useState(() => location.hash === GALLERY);

  useEffect(() => {
    const follow = () => setGallery(location.hash === GALLERY);
    addEventListener("hashchange", follow);
    return () => removeEventListener("hashchange", follow);
  }, []);

  if (gallery) return <EffectsGallery onExit={() => (location.hash = "")} />;
  return playing === null ? (
    <Editor onPlaytest={setPlaying} onEffects={() => (location.hash = GALLERY)} />
  ) : (
    <Play scenario={playing} onExit={() => setPlaying(null)} />
  );
}
