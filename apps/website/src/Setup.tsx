import { RANDOM_CHOICE, type Scenario } from "data";
import { useState, type ReactNode } from "react";
import { assignFactions, FACTIONS } from "./factions.ts";
import { Button } from "./Hud.tsx";
import { seatOnePerson, type Setup } from "./seating.ts";

/** Whether the person has anything to choose before this scenario starts. */
export function needsSetup(scenario: Scenario): boolean {
  const local = seatOnePerson(scenario).localPlayerId;
  const player = scenario.players.find(({ id }) => id === local);
  return player?.lockFaction === false || scenario.options.length > 0;
}

/**
 * Match setup for the person's seat: a faction unless the seat locks it, and
 * every option the scenario declares. It knows nothing about what an option means.
 */
export function SetupScreen(props: {
  scenario: Scenario;
  onStart: (setup: Setup) => void;
  onExit: () => void;
}) {
  const { scenario } = props;
  const local = seatOnePerson(scenario).localPlayerId;
  const locked = scenario.players.find(({ id }) => id === local)?.lockFaction ?? true;
  const [faction, setFaction] = useState(() => assignFactions(scenario)[local]);
  const [options, setOptions] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      scenario.options.map((option) => [option.id, option.default ?? option.choices[0].id]),
    ),
  );

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-[#11151a] p-4 text-white">
      <h1 className="text-lg">Match setup</h1>
      {!locked && (
        <Row label="Faction">
          {FACTIONS.map(({ id, name }) => (
            <Button key={id} pressed={faction === id} onClick={() => setFaction(id)}>
              {name}
            </Button>
          ))}
        </Row>
      )}
      {scenario.options.map((option) => (
        <Row key={option.id} label={option.name}>
          {[...option.choices, { id: RANDOM_CHOICE, name: "Random" }].map(({ id, name }) => (
            <Button
              key={id}
              pressed={options[option.id] === id}
              onClick={() => setOptions({ ...options, [option.id]: id })}
            >
              {name}
            </Button>
          ))}
        </Row>
      ))}
      <div className="flex gap-2">
        <Button onClick={props.onExit}>Back to the editor</Button>
        <Button onClick={() => props.onStart({ faction: locked ? undefined : faction, options })}>
          Start
        </Button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col items-center gap-2">
      <h2 className="text-xs tracking-wide text-white/60 uppercase">{label}</h2>
      <div className="flex flex-wrap justify-center gap-2">{children}</div>
    </section>
  );
}
