import type { Scenario } from "data";
import { useState } from "react";
import { Editor } from "./Editor.tsx";
import { Play } from "./Play.tsx";

export function App() {
  /** A validated copy of the document while a playtest runs (E3). */
  const [playing, setPlaying] = useState<Scenario | null>(null);

  return playing === null ? (
    <Editor onPlaytest={setPlaying} />
  ) : (
    <Play scenario={playing} onExit={() => setPlaying(null)} />
  );
}
