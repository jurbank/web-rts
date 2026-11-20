# ADRS live here.

They should be short and timestamped.

Periodically trim this file. Older ADRS should be compact.

## 2026-11-14 Three.js from the start, no 2D engine

The simulation is the priority and the first view of it is deliberately minimal. We render with Three.js from day one: a top-down orthographic camera, a flat plane, placeholder boxes. Phaser and plain Canvas 2D were considered for a throwaway 2D phase. Either would be deleted whole when 3D arrived, along with its camera and picking code. Starting in Three.js costs about a day more and nothing gets rewritten. Debug drawing uses a 2D canvas overlay.

## 2026-11-14 Restricted floats in sim, not fixed point

`sim` uses plain JS doubles. JS requires IEEE 754 doubles with no fused or extended-precision operations, so `+ - * /` and `Math.sqrt` give the same bits on every engine. Everything else goes through sim's own math module (S4). Fixed point was considered. It gives determinism by construction and ports to a non-JS server, but every multiply and divide goes through helpers and overflow needs care. The cost of floats is that one stray `Math.sin` breaks determinism silently, so the guardian and the determinism tests have to catch it. Revisit if an authoritative server in another language is chosen.

## 2026-11-14 30 Hz tick

`step` advances one thirtieth of a second. With interpolation an order shows within about 66 ms. 20 Hz saves a third of the sim cost on phones but feels about 100 ms behind. 60 Hz doubles the cost and leaves little room for large armies on an iPhone. The rate is one constant in `sim` (S1). Scenario data states speeds and durations in seconds so the rate can change without rewriting content (C7).

## 2026-11-14 Remove `packages/utils`, keep `apps/website`

`packages/utils` was the starter placeholder and nothing imported it. It is deleted. `apps/website` keeps its name, which the architecture document already uses, and its starter content is replaced when milestone 3 builds the app.

## 2026-11-14 S4 allows the exactly specified Math functions

S4 named only `+ - * /` and `Math.sqrt`. The sim math module needs `Math.floor` for range reduction and `Math.abs`. ECMAScript specifies `floor`, `ceil`, `trunc`, `round`, `abs`, `sign`, `min`, and `max` exactly, so they cannot differ between engines. S4 now lists them. The transcendental functions stay banned.

## 2026-11-15 Tilted perspective camera from the start

Replaces the orthographic top-down camera in the Three.js entry above. A perspective camera pitched about 55 degrees costs the same code, and pan, zoom, ground picking, and box select are written once against the projection the game will ship with. Positions stay ground-plane coordinates (S9), so `sim` is unaffected.

## 2026-11-15 Snapshots are copies

`takeSnapshot` in `sim` returns a new plain object with readonly types (S8). `step` mutates the world in place and interpolation needs the previous tick, so a view over the live world would not work. The copy holds only what consumers draw. Revisit if profiles show the copy cost.

## 2026-11-15 One entity table, capabilities from data

`sim` keeps units, buildings, resource nodes, and obstacles in one table. A definition says what an entity can do through optional fields: `speed`, `weapon`, `gatherer`, `resource`, `produces`, `builds`. Anything without `speed` blocks movement. Separate tables per kind were considered and would need a new table for every new kind a scenario invents (C6).

## 2026-11-15 The ai runs inside step

Each ai player thinks every 30 ticks inside `step` and its commands enter the same queue as a human's (S2). It reads the world and never writes it. Running it in the app was considered. That would put its decisions outside the save, the hash, and a replay.

## 2026-11-15 Grid navigation, no unit collision yet

Paths come from A* on a grid of unit cells built from everything that does not move, then straightened. Units do not push each other apart. A group move spreads its targets so units do not stack. Unit avoidance waits until battles are large enough to need it.

## 2026-11-15 The scenario format is not frozen

`FORMAT_VERSION` stays 1 and fields change without migrations while the only scenarios are fixtures in this repo. The format freezes when milestone 5 lets users save scenarios. From then on every schema change bumps the version and ships a migration with a fixture (C3).

## 2026-11-15 S4 allows `%` and integer bit operators

The grid navigation and the entity lookup use `%`, `>>`, and `>>>`. The language specifies them exactly, so they are safe for determinism. S4 now lists them.

## 2026-11-15 Scenario logic is trigger data that agents write

End users get no scripting language for now. Scenario logic is trigger records validated by Zod (C4, C5). Agents write them today, and a visual trigger editor later reads and writes the same records. Validation errors give an agent exact paths to fix, and the data stays serializable, hashable, and safe without a sandbox. A mechanic triggers cannot express lands as a TypeScript mechanism in `sim` with data fields that turn it on (C6), not as code inside a scenario. A text scripting language was considered. It needs a deterministic interpreter with a step budget inside `step`. Revisit only if triggers plus a small expression language prove too limited.

## 2026-11-15 Trigger actions run inside step

C5 said scripting goes through S2. Trigger actions such as spawning units, granting resources, and setting variables are things no player command can do. They are part of the scenario, not input, so `sim` runs them inside `step` like any other system. Commands stay the only input (S2). C5 now says so.

## 2026-11-15 Genre fixtures test the scenario logic

Four fixture scenarios check that `sim` holds mechanisms and not one game: standard RTS, tower defense, MOBA, and auto chess. Each is data only and plays start to finish in a headless test. A mechanism (waves, regions, modifiers, abilities, phases) is added when a fixture needs it, not before. The order is tower defense, then MOBA, then auto chess, from the smallest addition to the largest.

## 2026-11-15 Terrain comes from an external editor

Terrain meshes are made in a separate terrain editor and imported. This project's editor does not sculpt or paint terrain. A scenario references the terrain asset and carries the grids `sim` needs, such as pathing, and heights if gameplay ever depends on them. `sim` never reads the mesh (D3, S9), and `render` draws it. The import format and how the pathing grid is derived from the mesh are open (C8).

## 2026-11-15 The scenario format is frozen at version 1

The editor saves scenarios to the user's browser, so the format freezes as the earlier entry said it would. Version 1 is the schema as of this date, including the optional player `start` point added for the editor. Every later schema change bumps `FORMAT_VERSION` and ships a migration with a fixture (C3).

## 2026-11-15 The editor document is an immutable scenario

The document is a `Scenario` value and every operation returns a new one plus its inverse (E1, E2). History is two stacks of inverses. Immutability makes a drag preview and a dirty check a reference comparison and lets React read the document without copying it. Placements have no ids, so operations address them by index and a batch that removes several goes highest first. Stable placement ids were considered and wait until something outside the editor needs to refer to a placement, such as a trigger.

## 2026-11-15 A start point is where a player's view begins

A player may carry a `start` point. The game centers that player's camera there and falls back to something they own. It spawns nothing. Scenarios place every starting unit explicitly, so a start point that created a base would be a second way to say the same thing.

## 2026-11-15 The app holds the one document, and opening replaces it

`editor` is stateless, so something has to hold the current `History`. The app's session does, as a single reference React subscribes to. It is not a Zustand store and nothing copies it. U4 now says so. Opening a saved scenario and creating a new map replace the document and reset the history. They are not operations (E2), because there is no earlier document to undo back to. Map size has no operation yet, so resizing means starting a new map.

## 2026-11-15 A new world has one entity per placement, in order

The editor viewport draws a tick-zero world and maps each entity back to its placement by position. `createWorld` therefore guarantees one entity per placement in placement order, and a `sim` test holds it. When triggers spawn entities at tick zero or the editor needs to name a placement elsewhere, placements get stable ids and this goes away.

## 2026-11-16 Format 2 moves victory into triggers

`victory` is gone. A scenario carries `variables`, `timers`, `regions`, `waypoints`, `paths`, and `triggers`, all defaulting to empty. The migration from version 1 turns the old condition into one trigger with id `victory`: on a death, if the dead entity's owner has none of the listed definitions left (or nothing, for `destroyAll`), defeat them. The editor's victory control reads and writes that trigger and shows "Custom trigger" when it says anything else. A blank map keeps only that trigger, since others may name the old map's regions and waypoints. Two behaviors changed. `destroyAll` used to count only entities with health and now counts everything a player owns, so an owned entity that cannot be damaged keeps its owner in the game. And a player who starts with nothing is no longer defeated on the first tick, because no death fires the trigger.

## 2026-11-16 How triggers run

A trigger is one event, conditions that must all hold, and actions run in order. `sim` runs them after deaths are removed and before the end check. Events fire in a fixed order: start, deaths, region entries, timers, then the tick. Each event runs the matching triggers in scenario order, and later triggers see what earlier ones changed. `died` and `entered` events carry a triggering entity, which data names as `$triggering`. It cannot collide with an id, and validation rejects it on other events. Entities placed inside a region never entered it. `remove` is not a death, so it fires no `died` triggers. Every reference is validated with its exact path so an agent can fix it. Values are plain numbers. Expressions wait until a fixture needs them. The `tick` event is for checking conditions every tick and acting when they first hold. An action that repeats every tick happens at a rate set by the tick rate, which C7 forbids content to depend on, so repeating work uses a timer.

## 2026-11-16 Triggers defeat players, `sim` ends the game

`defeat` and `win` are actions. The rule that the game ends when one player is left standing, or none, stays in `sim` as a mechanism, and C6 now says so. `win` defeats everyone else and ends the game, which also covers a scenario with one player. A player with controller `none` has no ai, and `sim` drops commands from it. The app never seats the local player as a `none` player while another seat exists. Only triggers act for it, as the creeps do in tower defense.

## 2026-11-16 Tower defense needs no wave mechanism

Waves, spawning, leaks, bounties, lives, and survive-N-waves victory are all trigger data in the fixture: two repeating timers, three variables, a region, and a path. The only additions to `sim` are the `path` order that walks waypoints in sequence and the `none` controller. A wave spawner mechanism was considered and is not needed yet.

## 2026-11-16 Labelled variables show in the HUD

A variable may carry a `label`. The snapshot copies the variables, and the HUD shows each labelled one next to resources, in scenario order. That is enough for tower defense lives and waves. Richer HUD elements driven by data wait for auto chess. The field joins format 2 before any format 2 file has been saved, so it needs no version bump. The app draws a scenario's paths and regions over the ground in play and in the editor, and the editor also marks waypoints. They are overlays the app builds from the scenario (R1). Skirmish and tower defense ship as examples in the editor's Load menu and go through the same load as a saved file.

## 2026-11-16 One operation shape for every list, and edits that would not load are refused

Operations were one type per list and action. With definitions, waypoints, paths, and regions now editable, they are `add`, `remove`, and `set` on a named list, plus `batch`. E2 holds as before. Deleting or renaming can leave a reference that names nothing, and the editor view builds a world from the document on every change, so the app's session refuses any edit whose result fails the `data` schema and shows the schema's messages. That makes the schema the one place that knows what refers to what. Renaming a waypoint, path, or region rewrites the paths and triggers that name it. A definition's id cannot be edited, since its `name` is what people see. The renderer was built for a scenario whose definitions and players never change, so it now has `setContent`, which the editor view calls when either list changes. Editing a definition changes every placement of it, and per-instance overrides wait for a format change. The definition editor covers only fields that have survived two genres. Gathering fields and what the MOBA adds come later.

## 2026-11-16 Format 3 adds what a MOBA needs, all optional

A player may name a `team`. A definition may carry `experience`, `levels`, `respawn`, and `abilities`. Nothing existing changes meaning, so the migration from version 2 only raises the number, and `skirmish-v2.json` checks that a version 2 file loads to the same result. The version still goes up, as C3 requires once users have saved files. The editor's definition panel does not edit the new fields yet.

## 2026-11-16 The MOBA is five mechanisms and some triggers

Creep waves and victory are trigger data, as in tower defense. Five things could not be said with triggers and are mechanisms in `sim`, each usable outside a MOBA.

- Teams. Players on one team do not fight and cannot be ordered to. The lane creeps, towers, and ancient belong to a `none` player on the hero's team, so a human sees allies they cannot command. `win` defeats every other team, and the game ends when one team is left. The winner is the first player of that team still standing.
- Levels. A death gives its `experience` in full to every enemy with levels inside that enemy's `levels.range`. There is no split and no last-hit rule yet. A neutral death gives experience to every team in range. Each level applies the definition's `perLevel` modifiers once.
- Modifiers. A stat is the definition's number, plus the level gains, plus whatever abilities left on the entity. Only `maxHealth`, `speed`, and `damage` can be modified, and only by adding.
- Abilities. A `cast` command uses one by id. One that targets the caster applies at once. One that targets an enemy becomes an order that walks into range first, then leaves the caster attacking. Effects are damage and timed modifiers. Point targets and areas wait for a fixture that needs them.
- Respawn. A dead entity with `respawn` waits in `world.respawns` and returns at the spot it first appeared, with the same id, its level, and full health. It still fires `died` when it dies. While it waits it is not in the world, so a trigger that counts a player's entities does not count it. Only something with health may respawn.

Armed units walking a path now fight enemies they see and then resume the path, giving up on a target that leaves their sight. Tower defense creeps are unarmed and behave as before. The ai casts any ready ability at an enemy in range, and a self ability while attacking. It does not retreat. Gold bounties and items are not built.

## 2026-11-16 Multiplayer targets twelve humans, and a guardian watches for gaps

The size to plan for is six against six, all human, on any mix of phones, tablets, and desktops in one match. The match must be the same on each device and fair to each. The model is still open and nothing gets built for it yet. The multiplayer-guardian agent reviews changes for single-player assumptions that would be costly to undo, and sorts them by that cost. It runs on changes to commands, mechanics, triggers, players and teams, the loop, and snapshots, and over the whole workspace at the end of each milestone. It holds code to both models until one is chosen.

## 2026-11-17 A shop is ability costs, lasting effects, and a nearby requirement

The MOBA gets gold and a shop with no shop mechanism in `sim` (C6). The StarCraft 2 editor has no shop object either. There a shop is abilities with costs, behaviors, and requirements, and the same parts make fountains and upgrades. Format 4 adds four optional fields, each usable outside a MOBA.

- Bounty. A definition may carry `bounty`. When it dies, the player who dealt the last damage gains that many resources, if that player is an enemy. Weapons and damage effects record the dealing player on the target. A last hit by a `none` player's creep or tower pays a player nobody spends for, so heroes compete for last hits. Hits on one tick land together, though entities act in id order. A unit that is ready and in reach, or that gets there that tick, still fires at a target that died earlier in the tick. A draw from the world's seeded generator picks among the players who hit on the killing tick, one chance each and a neutral hitter counting as one, so a tie never goes by placement. `seedRandom` mixes the seed first, since small seeds start Xorshift on small values and the first draw would always pick the first player. Split credit and assists wait. Tower defense keeps its trigger bounty, which names one defender, until a fixture has two. A `$killer` reference in triggers was considered and waits until a trigger needs one.
- Ability cost. An ability may carry `cost` in resources. `cast` is refused when the player cannot pay. The cost is paid when the effects land, the moment the cooldown starts, and a cast that reaches its target without the money ends its order. Paying when the command arrives was considered. It would charge for a cast that never lands.
- Lasting modifiers. A `modify` effect without `seconds` lasts for the entity's life and through respawn. Respawn clears only timed modifiers. Buying twice stacks. A limit on how often an ability can be used waits for a fixture.
- Nearby requirement. An ability may carry `near`, with `definitionIds` and a `range` measured edge to edge. It can be used only while an entity of those definitions on the caster's team is that near, checked when the command arrives and again when the effects land. A shop is a placed building, and the purchases are abilities on the hero, because the shop belongs to a `none` player nobody can command. The same field makes a healing fountain. It matches only the caster's team, so a shop anyone can use or a capture point held by another team waits for a field that says whose entities count.

Passive income needs nothing new: a repeating timer and `grantResources`. The MOBA fixture places a shop by each ancient, gives the hero a few stat purchases, puts bounties on creeps, towers, and heroes, and pays income on a timer. The HUD shows a unit's abilities as buttons with their cost and greys the ones `sim` would refuse. The snapshot carries that answer for each ability as `abilityUsable`, so every device greys the same buttons without reading the world. The ai uses a costed self ability whenever it can, not only while attacking, so an ai hero shops when it respawns at its base.

Not decided here: inventories, items that can be dropped or sold or that carry abilities, more than one resource type, and the auto chess shop that rolls offers each round. The auto chess shop spends the same resources under the same refusal rule. The version goes to 4. The migration only raises the number, and `moba-v3.json` checks that a version 3 file loads to the same result.

## 2026-11-17 Auto chess is offers, merging, selections, and command rules

Round phases, lives, gold per round, and who lost a round are trigger data: a `phase` variable, a planning timer and a combat timer, and `count` conditions. Format 5 adds four mechanisms to `sim`, each usable outside auto chess, and some trigger actions. Everything is optional.

- Offers. A definition may carry `offers`, with `definitionIds` and a `count`. A roll fills that many slots on the entity with draws from the world's seeded generator, with replacement and one chance each. A `produce` command may name what a slot holds, at the definition's cost and through the same queue as training. It may also name the `slot`, and is then refused unless that slot still holds it, so a repeated tap on a slow link, or a tap made before a reroll lands, buys nothing. The HUD always names the slot. Without one, buying empties the first slot that holds it, and a definition the building also `produces` is trained and leaves the slots alone. The `rollOffers` action rolls every matching entity, and the `rollOffers` effect rolls the one it lands on, so a reroll is a costed ability on the shop. A pool shared by every player, odds by tier, and locking the shop wait.
- Merging. A definition may carry `merge`, with a `count` and an `into` definition. Once per tick, after triggers, in one pass over the entities, a player who owns `count` finished entities of it loses the lowest-id ones and gains one `into` where the first stood. Merges repeat until none applies, so three merged units can merge again. A merge is not a death and fires no `died` triggers. Tiers are separate definitions rather than levels, so each tier's numbers are edited like any unit's.
- Selections. The actions `modify`, `walk`, `setHome`, `returnHome`, and `rollOffers` act on every entity matching `playerId`, `definitionIds`, and `entity`, which may only be `$triggering`. `modify` leaves a modifier as an ability effect would, so a synergy is a `count` condition and a timed `modify`. `walk` gives a path order, so armies fight what they meet on the way. `setHome` makes where an entity stands the place it returns to. `returnHome` brings matching entities there at full health, with orders, cooldowns, and timed modifiers cleared, and brings back the ones of them waiting to respawn. A `respawn` without `seconds` waits for that. `stopTimer` stops a timer. A `region` filter on selections and counts waits for a bench.
- Command rules. A scenario may carry `commandRules`. Each lists command types, or all of them, and conditions. A command of a listed type is refused where it is applied, at its target tick, unless every condition holds. That limits commands by phase. Rules see variables and counts but not the commanding player, so a rule for one player waits. The snapshot carries `refusedCommands`, so every device greys the same buttons. Command type names are now part of the format. `data` owns the list, and a type check in `sim` holds `Command["type"]` to exactly that list. Adding a command type is a schema change under C3, with a version bump and a migration that only raises the number. A rule with no list refuses every command type the running version has, including ones added after the file was saved.

A timer may carry a `label`, and the HUD shows a running one as seconds left beside the labelled variables. The HUD shows the local player's first entity with offers as a shop that is always on screen, with its untargeted abilities such as reroll, since buying is the whole of planning and should take one tap on a phone without first finding the shop on the board. The snapshot carries each entity's offers and each timer's seconds left. The ai buys offers the way it trains.

The fixture seats two players on halves of one arena with three lives each. Combat starts with `setHome` and a `walk` for each side and ends when one side has no units or the combat timer runs out, and `returnHome` restores both boards. A unit that enters the middle during planning is sent home by a trigger on `$triggering`, so nobody starts a fight before combat. One arena for every pairing of a larger lobby, a bench and a board limit, selling, and damage by surviving units wait.

Left open for later decisions:

- Per-seat scope. The fixture writes lives, bonds, round results, and income once per seat, since a selection names one player or everyone. At twelve seats that copying becomes the pattern agents follow. A `team` filter, per-player variables, or a trigger that runs once per seat would remove it, and needs its own entry before more per-seat content is written.
- One random stream. Offers draw from the world's one generator, so one seat's reroll shifts every other seat's next roll, and under lockstep a client can compute its next roll. Keep one stream or split one per player when the multiplayer model is chosen.
- Late commands. A rule is checked at the command's target tick, so a buy sent in the last moments of planning is refused. Under lockstep that delay is the same for every seat. Under a server that stamps arrival, a slow link loses part of every planning phase. Settle it with the input delay.
- Ties. Same-tick commands apply in seat order. That is harmless while each shop is private and decides who gets the last copy once a shared pool exists. A seeded draw like the one for last hits would settle it. The version goes to 5. The migration only raises the number, and `moba-v4.json` checks that a version 4 file loads to the same result.

## 2026-11-17 Milestone 7 follows StarCraft 2 for orders and upgrades, and filters snapshots for fog

Generals and the StarCraft 2 editor agree on fog and differ on the rest. Generals queues little more than move waypoints, and its upgrades are modules on an object that react to an upgrade flag. StarCraft 2 gives each unit a queue any command can join, makes attack-move the attack ability aimed at a point, and makes an upgrade a per-player list of changes to data, gated by requirements. We follow StarCraft 2 for orders and upgrades. An upgrade for a single unit already works as a costed self ability with a lasting `modify` (format 4).

- Orders. `entity.order` becomes a queue. Commands that order units may carry `queued`, which adds to the queue instead of replacing it. Auto-acquire puts an attack at the front, and losing the target goes back to what was next, so the attack order's `resume` goes away. Attack-move is an `attack` with a point. `patrol`, `stop`, and `hold` are new command types, so the format version goes up (C3). Hold acquires and fires but never moves.
- Control groups stay in the app as UI state (U4), and commands keep naming their units. Both reference games send selection through the network to keep commands small. Names are simpler, replay plainly, and say nothing about the device. Revisit if command size at twelve players shows up in measurements.
- Touch. Shift and the A key would make queueing and attack-move desktop privileges. The command card gets an attack mode, a queue toggle that stays on until turned off, and control group buttons (U2).
- Veterancy is the MOBA's `levels`. An option says whether a kill's experience goes to every enemy near or to the killer, read from `lastHit`.
- Upgrades. A player holds a level for each upgrade. An upgrade's modifiers apply to the player's entities whose definition or tags match, and `statOf` adds them, so units made later have them. Research goes through the production queue. Requirements name upgrades or entities a player must have. Tags also give weapons something to name for bonus damage later.
- Fog. Visibility is computed in `sim`, since targeting, the ai, and triggers depend on it. What a team sees now is rebuilt each tick from positions and stays out of the save and the hash. What it has explored and the buildings it last saw are world state. `sight` is its own field, separate from the weapon's acquire range. Fog is off unless a scenario turns it on, so existing scenarios do not change.
- Per-viewer snapshots. `takeSnapshot` takes a viewer and leaves out what that viewer cannot see, including events and other players' resources. A null viewer sees everything, for replays and spectators. Under lockstep every client still holds the whole world, as in both reference games, so a client could cheat. Under a server the filter runs before sending and it cannot. Either way the renderer and HUD can only draw what the player may know. S8 gets a line saying so when this lands.

Left open for later decisions:

- Whether vision is shared by team or by an alliance setting that triggers can change.
- How much the ai may see. Fair vision is the default to beat. A full-vision option is the honest way to make a harder ai.
- One format version for the milestone or one per step.
- Line of sight from height, which waits for terrain import (C8), and detection and cloaking.

## 2026-11-17 What the milestone 6 multiplayer audit settled

The audit found no single-player assumption that blocks either model. It found five gaps in the format, the command shape, and world state that get more expensive once milestone 7 adds commands and per-viewer snapshots.

- Session commands. Commands are now orders, which `COMMAND_TYPES` lists and command rules may refuse, or session commands, which are about a player's place in the match and which rules never see. `concede` is the first. It defeats the player, and the team plays on. A rule with no list refuses every order type. Session types are not in the format's list, so adding one is not a format change. A lobby will submit `concede` for a player who leaves. A defeated player's entities stay and fight on their own, and nobody commands them. Giving them to teammates waits for shared control. A team whose people and ai seats are all defeated is defeated whole, unmanned seats included, so a match does not run on for a base nobody plays. A team of `none` seats alone, such as creeps, still stands. Results are by team, so a player defeated or conceded early shares the team's win. The HUD asks for a second tap before conceding, and tells a defeated player whether the team plays on. Who may send a command for which seat is the transport's job and goes in the model ADR. A lobby should concede for a dropped player only after a grace period or after handing the seat to the ai, since nothing undoes a defeat and a phone that loses signal for a moment should not lose its seat.
- Seats. A scenario's `controller` says what sits in a seat when nobody else does. `human` is a seat open to a person. `createWorld` takes who sits where, and a `none` seat stays `none`. Ai settings on a human seat mean the ai plays it when no person takes it. The editor adds them only when a seat is set to AI or its "AI plays if nobody takes it" box is ticked. A seat a lobby can close, as well as open or fill, would need a field and a format change. Until a lobby exists the app seats one person in the first open seat, or the first seat anyone commands, and gives the ai every other open seat that carries ai settings. That changes two playtests: a second human seat with ai settings now plays instead of standing still, and a person in a scenario with no open seat replaces that seat's ai instead of sharing it. The app draws a new seed for each game. The editor adds and removes players and sets teams. Removing a player is refused while anything names it, as other references are.
- The outcome names a team. `outcome.winningTeam` and the `ended` event replace a winner id, which could name a `none` seat or a player already defeated. `win` ends the game for the named player's team. Results for each player come from `defeated`. No saved worlds exist outside tests, so nothing migrates (open decision 2).
- Commands wait outside the world. The world no longer holds commands for later ticks, so an early command on one client and not another cannot make their hashes differ, and a stranger cannot fill every save. `step` takes one tick's commands and applies them in seat order, then the order each player sent them. It drops one stamped for a later tick and applies one stamped for an earlier tick, which tests and a single device rely on. `CommandQueue` in `sim` holds commands until their tick. It refuses a late command, one more than ten seconds ahead of the tick it is given, and more than 32 commands from one player on one tick. The tick it is given is the match's, which on one device is the local world's. A device catching up must measure from the match or hand commands straight to `step`. The app ignores refusals for now, and the session layer must report them. A command names at most 1000 units, without repeats. The ai's commands join the tick's inside `step` and are normalized like everyone else's. Sequence numbers wait for the model ADR. S2 now says commands wait outside the world and how the ai's join, and C6 says a concession also defeats a player.
- Variables and timers are public. Every viewer will see every variable and timer until the per-seat scope decision (auto chess ADR) also gives each an audience.

Left for later, in the roadmap: the tick cost of large armies in twelve seats, the owner-only fields of a visible enemy (with fog), the phone camera and HUD width, catching up after a hidden page, and a twelve-seat determinism fixture checked in WebKit.

## 2026-11-17 Orders are a queue, and touch gets the same controls as keys

The first milestone 7 step, as the milestone 7 entry planned.

- An entity holds `orders`. The first is carried out, and finishing it starts the next. A command that orders units may carry `queued`, which adds after the orders already there. Without it the new order replaces them. `stop` empties them. A queue holds at most 16 orders, and nothing queues behind a hold or a patrol, which last until replaced and so would hold orders that never start. A patrol visits at most 16 points. A queued `build` still places the building and takes its cost at once, and only the walk waits. Paying when the builder arrives was considered, and would let a spot be taken in the meantime.
- `attack` takes a target or a point. A point gives an `attackMove` order, which walks there and fights what it sees. An unarmed unit just walks. A plain `move` ignores enemies, as in StarCraft 2.
- `patrol` loops between where the order starts and its point. A queued patrol after another adds a point to that loop. `hold` never moves and fires at what is in weapon range. It also only looks that far. Patrol and hold last until replaced.
- Armed entities pick their own target when idle, walking a path, attack-moving, patrolling, or holding. The target goes on the front of the queue, and the order under it carries on once it is gone. One picked over another order is dropped when it leaves sight, as path walkers did before. One picked while idle is chased, as before. This replaces the attack order's `resume`. After a cast lands, the caster attacks that target only when nothing else is queued.
- Format 6 adds `patrol`, `hold`, and `stop` to the command types. The migration adds all three to a command rule that refused `move`, and `patrol` to one that refused `attack` without `move`, so rules keep meaning what they meant. An attack-move is an `attack`, so a rule that refuses `attack` refuses it. It also moves, so `sim` refuses it while `move` is refused, and a targeted attack stays allowed. A separate rule name for attack-move was considered and would be one more type for authors to list. `auto-chess-v5.json` checks that a version 5 file loads to the same result.
- The snapshot carries each entity's `waypoints`, the points of its move, attack-move, and patrol orders, and the renderer draws them for selected units. That shows a phone player that queueing worked. With fog these become owner-only, like the other fields the milestone 6 audit named.
- The app keeps control groups 1 to 9 (U4). The HUD offers Attack, Patrol, Hold, Stop, a Queue toggle that stays on until turned off, a button for each group, and New group. Set group shows every number, and tapping one puts the selection there, so touch can set any group as Ctrl with a digit does. Keys map to the same named shortcuts the buttons send (U1, U2): A, P, H, S, Shift to queue while held, a digit to select a group, and Ctrl with a digit to set one. While queueing, by Shift or the toggle, attack and patrol mode stay on, so each further point is one tap on either device.

Left open:

- Auto-acquire now also scans for every attack-moving, patrolling, and holding unit, which widens the tick cost the milestone 6 audit measured. A spatial grid keeps results the same. Staggering the scans would change outcomes, so it has to be chosen before replays are kept.
- A player's commands for one tick apply in the order sent, which now decides the order of queued waypoints. The model ADR must require ordered delivery for each seat or give commands a sequence number.
- Browsers on Windows and Linux may keep Ctrl with a digit for switching tabs, which a page cannot stop. Set group covers it on every device. Another key may be needed.
- Centering the camera on a group, a formation that keeps its shape on queued points, and the width of the group buttons on a small phone.

## 2026-11-17 Veterancy is levels with killer credit

Generals gives a kill's experience to the unit that made it, and its levels add damage and health. The StarCraft 2 editor does the same with a veterancy behavior. The MOBA's `levels` already hold thresholds and what each level adds, so veterancy is one field on them, in format 7.

- `levels.credit` says who earns a death's experience. `nearby`, the default, is the MOBA's rule: every enemy with these levels within `range`. `killer` gives it to the one entity that dealt the last damage, wherever it stands. `range` is needed only for nearby credit. Each earner's own levels decide, so heroes and veterans can share a map.
- `lastHit` now records the entities that dealt damage on the last tick anything did, beside their players. When several hit on the killing tick, a draw from the world's seeded generator picks one among those still alive, one chance each, as the bounty does among players. The draw happens only when one of them could earn, so a scenario without killer credit draws as before. One that cannot earn, such as a tower without levels, can still be drawn, and then nobody earns. A killer that died on the same tick earns nothing. Only nearby credit looks at every entity on a death, since killer credit already knows its earner.
- The skirmish example gives soldiers three ranks at 40, 80, and 160 experience, each adding 2 damage and 15 health, and puts experience on workers, soldiers, barracks, and the headquarters.
- The renderer draws a chevron for each level gained, up to three, over anything above level 1. The HUD already names the level of a selected unit.
- The migration from version 6 only raises the number. `skirmish-v6.json` checks that a version 6 file loads to the same result.

Gold and experience are separate draws. Gold gives each player one chance and experience gives each entity one, so allies who share a kill can split them, and a player with more units hitting has a better chance at the experience. Credit comes from weapon cooldowns, not from when a command arrives, so a faster connection wins none of it. That stops being true if a scenario puts killer credit on damage aimed by a command, such as an ability, and the model ADR should note it beside input delay.

Triggers and abilities reach experience as the StarCraft 2 editor's do, and these join format 7, which no saved file uses yet:

- A `leveled` event fires when an entity gains a level, with that entity as `$triggering`, and may name the `level` reached. It fires after deaths and before region entries. Level-ups that trigger actions cause wait in the world's `levelUps` and fire on the next tick, before that tick's own. Firing them the same tick was tried, and a trigger that spawns a unit and promotes it on every level-up kept a tick from ever ending, on every device at once. Waiting a tick bounds each tick's trigger work with no limit to tune, and no other trigger event can cause itself, so this is the only chain to bound. An entity that leveled and then left the world before its event fires, fires none.
- A `grantExperience` action gives each selected entity with levels an amount, and an `experience` ability effect gives it to what the ability lands on. Either can bring several levels at once.
- The definition panel edits a definition's experience, switches levels on and off, and edits credit, share range, thresholds, and the damage, health, and speed each level adds. A switched-on definition starts with three ranks of veterancy.

Not built: names for ranks, healing at the top rank as Generals' heroic units do, starting at a rank from an upgrade or a building (waits for upgrades), split credit and assists, and modifiers that multiply.

## 2026-11-17 Upgrades are research a player owns, with tags, modifiers, and requirements

The StarCraft 2 shape from the milestone 7 entry, narrower: an upgrade changes stats through the modifiers `sim` already has, not any field of any definition. Format 8.

- A scenario lists `upgrades`. Each has a name, a cost and research time for each level, a number of `levels`, the definitions or `tags` it applies to, `modifiers` applied once for each level, and `requires`. A player holds a level for every upgrade, in scenario order. `statOf` adds the owner's upgrades after levels and entity modifiers, so units made later have them too.
- A building lists what it `researches`. The `research` command is a new command type. It pays when research starts, as training does, and waits in the building's production queue, one level per item. Levels waiting in any of the player's queues count toward the limit, so two buildings cannot research past it. A building that dies loses its research and the cost, as with training. Cancelling and refunds wait.
- `requires` on a definition gates training and building it. On an ability it gates casting and is part of `abilityUsable`. On an upgrade it gates research. A requirement is an upgrade at a level, or a count of finished entities of some definitions. Each is checked where the command applies. Units already made stay when a requirement is lost. The snapshot gives each player's upgrade levels and `locked`, the definitions and upgrades whose requirements they do not meet, so every device greys the same buttons.
- Definitions carry `tags` and `armor`. Modifiers can change `range`, `cooldown`, and `armor` as well as health, speed, and damage, and may `multiply` as well as add. Every add counts first, then every multiply. Armor comes off each weapon hit, down to half a point. Ability damage ignores it, as StarCraft 2 spells do. An entity looks for targets at least as far as its weapon reaches, so a range upgrade lengthens both.
- The migration from version 7 adds `research` to a command rule that refused `produce`, since both spend at a building. `skirmish-v7.json` checks that a version 7 file loads to the same result.
- The skirmish example makes workers and soldiers `infantry`, and the barracks researches Infantry Weapons (three levels of 2 damage) and Infantry Armor (two levels of 1 armor, after Weapons 1).
- The ai, once it has as many armed units as its attack size, researches the first affordable upgrade it can at an idle building before training more. It skips units and buildings it cannot have yet. The HUD offers Research with the next level, says when an upgrade is done, and names research in a building's queue.

Not built: editing upgrades in the editor, costs that rise with each level, starting at a veterancy rank from an upgrade, bonus damage against tags (counters), and `sight`, which arrives with fog. A Generals-style upgrade for one unit stays a costed ability with a lasting `modify`.

Requirements and upgrades belong to one player, as in StarCraft 2, so an ally's barracks unlocks nothing. Shared tech would be an optional field on a requirement later, with no migration. A snapshot counts each player's finished entities once and checks every requirement against that count, so `locked` and `abilityUsable` cost one pass over the world, not one per entity.

Left for the fog step: `locked` and `researched` events go only to their owner, since an `owns` requirement turns them into scouting. Whether other players' upgrade levels are public or shown only with a visible unit, as StarCraft 2 does, is decided there too. `statOf` checks every upgrade against an entity's definition on each call. Working that out once per definition when the world is made would keep results the same, and waits for a profile that shows the need.

## 2026-11-17 Fog uses shared team sight and owner-private orders

Format 9 adds the scenario's `fogOfWar` switch and each definition's `sight` in ground units. Earlier scenarios migrate with fog off. Finished owned entities contribute their effective sight, including levels, research and temporary modifiers. A team always sees its own entities. Sight uses a flat grid with cells about one unit wide on ordinary maps and at most 128 rows or columns on large maps. A sight disk includes cells whose centers it covers and the observer's own cell. Units and buildings are spotted by their center cell.

Teams retain explored cells and the identity, owner and position of each enemy building they saw. An empty site clears that sighting when scouted again. Decisions use the last completed tick's sight. Trigger conditions see movement and actions that preceded them. Current sight is derived again on load. Active reveals, exploration and building memory are saved and hashed.

A `reveal` action takes a `playerId`, `region`, and duration in `seconds`. The player's team sees the cells overlapping the region. Overlapping reveals combine, and refreshing the same region keeps the later expiry. A `visible` condition takes a `viewer` player and the usual optional entity, owner and definition filters. It holds when that team sees any matching live entity. For example, a trigger can reveal a gate to one player and a later trigger can ask whether their ally sees a tower.

With fog enabled, allies share sightings and each seat keeps its own resources, upgrades, affordability, cooldowns, production, offers and orders private. Variables, timers, match results and scenario command restrictions remain public. In player snapshots, research, production, merge and death notifications go to the owner. Completion, respawn and level notifications require a visible live entity. The authoritative tick still supplies all events to scenario logic. Spectators and the editor can request the complete view.

A targeted order must name a visible entity when it applies, and an attack or cast ends when the target leaves team sight. Point orders can enter unexplored ground. Building placement requires sight over the site and its clearance, so a placement attempt gives no information about a hidden blocker. The AI uses the same rule and sends an idle army toward a remembered hostile building or unexplored terrain. The renderer shades unseen terrain and marks remembered buildings with a dashed footprint. Picking uses live entities in the player's snapshot.

## 2026-11-18 Factions are their own sets, apart from themes

A theme is the look of a map: its lighting, ground, and civic buildings. A faction is the complete look of one side's buildings and units, and it never refers to a theme or another faction, the way a race in a classic RTS keeps its look on every tileset. A first try made factions variations within a theme. The theme's neon accents, matte atlas material, and grime rules then leaked into a faction meant to be glossy, white, and spotless. A faction lives in `docs/factions/<faction>.md`, and its sources, atlas, and exports sit under `factions/<faction>/`. Its atlas carries its own roughness and metallic map, and its reviews render both day and night, since it can stand on any map. Factions no longer share a role's accent or cue across factions. Players tell factions apart by shape, as each faction's file sets them. Separate atlases also keep a faction's cards from resizing a theme's atlas, which would force every theme source to be refreshed.

## 2026-11-19 Model skills split by rig, and vehicles name their parts

Art skills split by how a model moves, not by what it shows. `blender-rts-models` makes rigid models, structures and vehicles, which share the set atlas, the export checks, and the game-camera review. Models with a skeleton, such as infantry, animals, monsters, and walking mechs, will get their own skill once an ADR picks how the game animates crowds of them. Effects will get their own too, since they are mostly `render` code. A vehicle's GLB is a hierarchy: the hull at the root, each moving part a child mesh named in kebab-case with its origin on its pivot, and empties such as `muzzle` as sockets. It carries no animation, so `render` turns parts by name from the snapshot. Faces that show the owner use a material named `team`, which `render` multiplies by the player's color. Sources and exports sit under `<kind>/<set>/`.

## 2026-11-19 Creatures play baked vertex frames on the GPU

Infantry, animals, monsters, aliens, and walking mechs need skeletal motion, and a match may hold over a thousand units on a phone. Three.js draws each `SkinnedMesh` with its own draw call and poses its skeleton on the CPU every frame, which a phone cannot afford for a crowd. So creatures are animated in Blender with an ordinary armature and actions, and the export bakes each clip into vertex frames: every vertex's position and normal, sampled at a fixed rate. `render` draws each creature type as instances, and a vertex shader reads each instance's frame, so a crowd costs a few draw calls and almost no CPU.

- Clips. Every creature has `idle`, `move`, `attack`, and `die`, and may add `gather`, `cast`, and `build`. They bake at 20 frames a second, and the shader blends neighboring frames, so playback is smooth at any display rate. A change of clip blends over 0.15 seconds by sampling both.
- One GLB per creature, as for structures and vehicles. It carries the mesh in its first idle pose, the set's atlas, and the baked frames as binary data, with clip names, frame ranges, and rate in its extras. A vertex attribute `_VERTEX` names the baked vertex each glTF vertex plays, since the exporter splits and reorders vertices. The `move` clip records its `stride`, the ground one cycle covers, so `render` plays it at the unit's speed without sliding feet. The `blender-rts-creatures` skill's pipeline holds the exact layout. Skeletal models sit in two kinds: `infantry`, a side's foot units, and `creatures`, wildlife and monsters that are not a side's soldiers. Sockets such as `muzzle` or a hand bake to a transform per frame, so effects attach without reading back from the GPU.
- Size. A 500-vertex creature with 100 baked frames takes about 0.8 MB on the GPU, with positions and normals in half floats. Vertex and frame counts get budgets once a real phone is measured.
- Team color is the `team` material, as on vehicles. Under instancing it becomes a per-instance color, so a creature type costs one draw call per material, not one per player.
- A walking mech is both: legs and hips baked, and an upper body that turns on its own as a named rigid part, as on a vehicle.
- Picking stays on the entity's radius, not the animated mesh, so an instance in mid-stride is as easy to tap as one standing still. A dying view is never pickable or selected (R4).
- Clip, part, and socket names are a contract between the export and `render`. `data` and `sim` never name them. Projectiles and muzzle positions are visual only, and damage timing stays in `sim`.

Animation is view state, chosen from snapshots, so it follows R1 and R2. Rebuilding `render` restarts clips and changes no outcome.

- `render` plays `die` on a `died` event, `attack` on a `fired` event, and `move` while the interpolated position changes. Otherwise it plays the order's clip, such as `gather`, where the viewer's snapshot shows the order, or `idle`, since the fog ADR keeps orders private to their owner. Each entity's clip phase is offset by its id, so a crowd does not march in step.
- Facing stays out of `sim`. `render` turns a unit along its motion, toward its target when it fires, and otherwise holds the last facing. A turn rate would be a gameplay rule and would need `sim`.
- An attack clip releases within its first 0.1 seconds, since `render` learns of a shot one tick before drawing it. A longer wind-up would need `sim` to announce a shot ahead of time without exposing weapon cooldowns to other seats, which the fog ADR keeps private.
- Every device plays the same clips from the same snapshots, so a phone shows every attack and death a desktop does. A device that must save work draws fewer vertices at far zoom, never fewer clips. `render` keys a clip by entity id and tick, and a later snapshot overrides an event's clip, so an event that arrives twice or not at all, as under prediction, does no harm. After a catch-up, such as a phone returning from a hidden tab, every device skips effects older than one clip by the same rule. No device class skips more.

This needs two changes to `sim`'s events, which effects need too. Each gets a headless test that filters it for every viewer with fog on.

- A `fired` event with the attacker, the weapon, and its target entity or point. It drives the attack clip, a turret's aim, muzzle flashes, and projectiles. Under fog, a viewer gets the attacker and weapon only if they see the attacker, and the target only if they see it. When the attacker is hidden, the event carries only the impact on the target, with no origin outside the viewer's sight. When the target is hidden, it carries only the direction of fire.
- `died` carries the entity's position and names no killer. It goes to its owner, and to any viewer whose team sees that position on the tick it dies, by the same sight that filters the snapshot. A remembered building that dies out of sight announces nothing. This replaces the owner-only death notification in the fog ADR of 2026-11-17, under which an enemy's unit would vanish instead of falling. The same position rule covers `fired` when the attacker dies in the same tick. `render` keeps a dying view after the entity leaves the snapshot until its clip ends.

Considered:

- A `SkinnedMesh` with an `AnimationMixer` per unit. It is the simplest to author and blends freely, but costs a draw call and a CPU skeleton per unit. It may return for a handful of heroes.
- Rigid-segment puppets, with limbs as separate rigid parts posed in code. They are cheap and share the vehicle path, but animals and monsters look stiff, and every limb costs a matrix per unit per frame on the CPU.
- Bone matrices baked into a texture and skinned in the shader. This takes less memory for dense meshes and blends clips more cleanly, but needs a harder shader and bake. Revisit it if creatures outgrow the vertex budget.

Left open:

- The vertex and frame budgets, set against a real phone.
- Whether structures and vehicles move to instancing in the same change as the shared set atlases the roadmap plans.
- A turn rate and weapon wind-ups, if gameplay wants them in `sim`.

## 2026-11-19 Provisional triangle budgets by kind, checked at export

Budgets come from the busiest view on a phone, not from each model alone: a 6v6 zoomed out with about 300 infantry, 60 vehicles, and 80 buildings. Splitting about 620,000 triangles by how many copies of each kind that view holds gives infantry and creatures 1,000, vehicles 2,000, structures 2,500, and heroes 4,000, since only a few take the field. A creature also bakes at most 100 frames over its clips, which with its vertex count sets its GPU memory. Both export helpers report a model's share and fail over budget. `--over-budget` with a reason lets one through on purpose and records why. The first infantry came in at 1,600 to 2,400 triangles, more than any building, though hundreds of them share the screen. These numbers are guesses. A stress scene on a real iPhone, once `render` loads models, replaces them, and the roadmap records the measured budgets as `docs/ARCHITECTURE.md` asks. Texture memory is the larger risk today and is the roadmap's slim-GLB item, not part of this budget.

## 2026-11-19 Faction buildings show their owner, and each set ships one atlas

Trying the models in the MOBA showed three gaps in the art pipeline. Faction buildings carried no team color, so two players on one faction could not tell whose base was whose. Each faction now gives its buildings one team-colored element, in a form its file sets, using the same `team` material as vehicles and infantry. Advanced utopian lays a band on the roof. Cyber samurai flies two war banners at the gate. Toxic industrial hangs its banners in the team color. The structure export fails without it. Theme buildings stay neutral, since they belong to the map.

A set's exports had drifted onto different atlases. Units were exported after a repaint and buildings before it, so the game held two copies of each faction's atlas. The export copies the atlas bytes as they are, so comparing an export's images with the files on disk is exact. A new `audit` command lists stale exports, and `refresh` refits every source of a set after a repaint. Each export also names the stale exports in its own set.

Sources recorded their footprint under five different property names. Now each records one `radius`, and the export writes it into the GLB scene's extras. `render` shrinks a model built for a larger radius to fit a smaller definition, so a 5-unit HQ can stand in as a MOBA ancient of radius 2. The export also joins a structure's meshes, so a building is one draw call per material, whether or not its source was joined by hand.

## 2026-11-19 Players pick factions, and definitions name a look

Scenarios stay art-agnostic. A scenario never names a faction or a model. Format 10 adds one optional field to a definition, `look`: a kind of look, such as `soldier`, `tank`, `hq`, `tower`, or `hero`, that every faction draws its own way. Older scenarios migrate unchanged and draw as boxes until their definitions get a look.

A faction is chosen per seat at match setup, like who sits where. It travels with the seats, so every device draws every side the same way. A player who isn't a seat, such as the MOBA's `redBase`, which owns towers, takes the faction of the first seated player on its team, or else its team's default. Team defaults go through the catalog in team order, so the editor and AI-only sides still get distinct factions. Factions change only looks, since rules and rosters come from game data, so the choice stays out of `sim` and world state. The world save carries the seats but not the factions, so whatever restores a match, such as a rejoin, a late join, or a replay, keeps the resolved factions map beside the save. A pick the catalog doesn't know is dropped, and its team takes a default. If factions ever change rosters, the choice moves into the scenario's players and the world.

The app holds the catalog: each faction's models by look type. A faction with no model for a look draws a box. A faction may stand in an existing model for a look it has no art for yet, such as a supply depot as its MOBA shop, until that art exists. A scenario may later set a default faction or limit the factions allowed. Neither is needed yet.

## 2026-11-19 Scenarios declare setup options, and seats can lock their faction

A MOBA player picks a hero, not a faction. Warcraft III's DotA turned off race picking with the editor's fixed player settings and sold heroes in taverns. The StarCraft II editor has no hero system either. A map declares lobby attributes, players set them before the match, and triggers read them at start. We follow StarCraft. One general setup mechanism serves heroes, game modes, starting resources, and map variants in any genre, so nothing in `sim` or the editor knows about heroes.

Format 11 adds three optional fields:

- `options` on the scenario. Each option has an `id`, a `name`, a `scope`, `choices` as `{ id, name }`, and a `default`. The scope is `player`, one choice per seat, or `match`, one choice for everyone. The default is a choice id or `random`. An option's choices are its own ids. When it feeds a placement, they must be definition ids, and validation checks that.
- `definitionFrom` on a placement. It names an option, and the placement's owner's choice of that option is the definition it starts as. The MOBA's hero placements become `{ "definitionFrom": "hero", "playerId": "red", ... }` with no per-seat triggers, which keeps clear of the per-seat scope gap from 2026-11-17. A placement still names a `definitionId`, which stands in only when no choice exists, such as in a save from before options. The editor's preview builds a world with no setup, so it shows each option's default.
- `lockFaction` on a player, like StarCraft's per-slot lock. A locked seat takes its team's default faction. The MOBAs lock every seat, and skirmish locks none.

One trigger condition reads choices: `{ type: "option", option, playerId?, choice }`. It holds when that player's choice, or the match's, equals `choice`. A `spawn` may take `definitionFrom` in place of `definitionId` when a mode needs heroes later in the match.

Choices are match setup, like seats. They travel with the seats into `createWorld`, which checks them against the scenario. It fills a missing choice from the option's default and resolves `random` from the world's seeded generator. It stores the result in world state, so saves, hashes, rejoins, and replays carry it. Random choices draw from a stream of their own, derived from the seed, so a seat's `random` never shifts the match's later rolls. `sim` takes any valid choice for any seat. The setup decides who may set what: an ai seat gets the default, a seat's pick is accepted only from that seat, and `match` options come from the host. Whoever sets the seed also decides every random choice, so the multiplayer ADR has to settle who draws the seed. Picks may repeat, so two players can play the same hero. A rule that makes picks unique belongs in `resolveChoices`, not the setup screen. Choices are public in every snapshot, as a hero is once it spawns. A blind pick is left for later.

The setup screen is generic. It shows the local seat's faction if unlocked, every `player` option for that seat, and `match` options for the host, each as a row of large buttons, the same on a phone. It knows nothing about heroes. The editor's Setup options panel edits options, their choices, and their defaults. Each player has a checkbox that locks its faction. A selected placement's "Starts as" offers only the options whose choices are all definition ids. Triggers that read options are still written as data, like every trigger. The MOBAs lock both sides' factions and offer a pool of three heroes. The heroes share the `hero` look until hero art exists. Hero art belongs to no faction, so it will need looks that every faction shares.

Considered:

- Taverns, as in DotA: offers that list every hero, a one-hero limit, and a command rule that closes the pick. They need only small additions to existing mechanisms and remain possible as an in-match mode, but picking is slower, especially by touch, and the ai needs buying logic for it.
- Trigger-made dialogs, as StarCraft maps use. They are the most general option, but a UI built from trigger data is far more than the project needs.
- A hero-pick field in the MOBA format. This is a genre feature, which C6 rules out.

## 2026-11-19 Effects are render recipes, and sim announces shots

Gun shots, explosions, lasers, tesla arcs, and missile thrust are drawing, so they live in `render` and follow R1 and R2. The rule for what goes in `sim` is whether it can change an outcome. When a shot lands, whether it can miss, travel time, splash, and chaining change who lives, so each is a `sim` mechanism with its own ADR when gameplay wants it. A flash, a beam's glow, a lightning bolt's shape, a trail, smoke, and where a missile is drawn in flight never are. Today every hit lands the tick its weapon fires. A slow projectile, such as a missile or a shell, waits for travel time in `sim`, since otherwise a target's health drops before the missile arrives. The cheap form is a list of pending hits in world state, each with its attacker, target, damage, and ticks left, with `render` drawing the flight between.

`sim` now announces what effects and clips need, as the creatures ADR asked:

- `fired` has `from`, the attacker's id, definition, owner, and position, and `to`, the target's id, owner, and position. Under fog a viewer gets `from` only if it sees the attacker and `to` only if it sees the target. A viewer that sees the attacker but not the target gets `direction` in place of `to`, rounded to 1/16 of a turn. At weapon ranges of 6 to 8 a step is a few units wide, so bearings from several shooters cannot pinpoint the target. Finer steps, such as 1/64, came within a unit's radius. One that sees neither gets nothing. Shots with no `from` come after the rest of the tick's events, by target id, so their order says nothing of the hidden attackers' ids. An attacker or target that died this tick is judged by where it stood, through the same sight rule as `seesEntity`, so detection will cover both.
- `died` carries the position. It goes to the dead entity's team and to any viewer whose team sees that position. The creatures ADR said its owner. Its team is right, because allies always see each other's units, which would otherwise vanish instead of falling.
- The game loop keeps each tick's events with the tick, and the frame hands each tick to `render` with `receive(tick, events)`. Before, a frame that stepped two ticks lost the first tick's events. `render` ignores a tick at or below the newest it has received, so a tick passed again, as after a rewind under prediction, starts nothing twice. A corrected tick that carries a shot the first delivery lacked is not drawn, which the multiplayer ADR revisits if prediction arrives. After a catch-up the loop drops ticks more than a second older than the newest, the same rule on every device. Effects seed their randomness from the tick and entity, so every device spawns a shot's parts the same. How they move afterward follows each device's frame rate, which changes nothing a player learns. Two rules keep a slow phone's picture equal to a fast desktop's. A frame that catches up on several ticks starts each one's effects as far along as they would be had it drawn every tick, and effects advance by up to a quarter second a frame, the loop's own cap. A part shorter than a frame, such as a muzzle flash on a phone at 15 frames a second, still draws once.

`render` plays the attack clip on `fired` and turns the unit toward its target, in place of guessing a swing from the weapon's cooldown.

How effects are built:

- Instanced building blocks: sprite particles, beams, ground decals, and procedural meshes for fireballs and debris. A lightning arc is a run of beam segments whose bends move 20 times a second from the shot's seed, and a missile's trail is smoke laid along its path as it passes, so neither needs a draw call of its own. All effects of a batch share a draw call. Fireballs are meshes, since a big explosion of stacked transparent quads shades each pixel many times, which is the classic way effects ruin a phone's frame rate.
- A recipe is a plain object of emitters on those blocks, anchored to a socket such as `muzzle` or `exhaust`, the target, a point, or the path between. Textures are one small generated sprite sheet and noise in the shader. Randomness is seeded by entity id and tick, so a rebuilt renderer or a replay draws the same.
- Every device draws every shot, impact, and death. Only decoration scales with device and zoom: smoke, trail length, and spark count. StarCraft II's low settings made battles easier to read, and a phone seat must not be a better or worse view of the fight. Decoration never covers a unit's body on any device, so more smoke on a desktop cannot hide what a phone shows, and one faction's smoke cannot hide its enemies. Smoke and scorch draw right after the ground and before every model, so models always draw over them. Each block has a fixed budget, the same on every device. When one is full, decoration gives way first: smoke, scorch, debris, sparks, and ground light. A shot's flash, tracer, or beam and an explosion's fireball keep their place. Arcs draw after the other core parts, since each bend takes a beam slot, so one team's lightning can never stop another's tracers from drawing. Sheets count slots as well as parts. A fireball is 320 triangles, and 128 may live at once.
- An effect reads only what every seat sees. A plume on a working stack comes from fields every seat has, such as `built`, never from production, which fog keeps private to its owner.
- Effects are chosen in the editor through kinds of effect, as models are through `look`. A weapon will name a kind of shot, such as `bullet`, `laser`, `flame`, `missile`, `shell`, or `arc`, and each faction draws each kind its own way, so a scenario still names no art (C6). A faction without a recipe for a kind uses the generic one of that kind. Format 12 adds it as an optional `weapon.shot`, and the editor's Shot field offers the generic kinds: `bullet`, `laser`, `flame`, `missile`, `lightning`, and `melee`. A missile flies for about 0.2 seconds, since its hit lands the tick it fires, until `sim` holds hits in flight. Lightning strikes its one target, until a chain mechanism in `sim` lets it jump. A weapon with none plays `melee` within 1.5 units and `bullet` beyond. `render` works out the kind, then asks the app for the owner's style, their faction, and plays `<faction>/<kind>` from the recipes the app passes, or the generic recipe of the kind. Faction recipes live in the app beside the faction catalog, since a faction's look is app presentation and `render` knows no factions. Each faction redraws the generic recipes block by block with a style, so a new generic kind arrives in every faction's colors at once. A kind that no recipe knows, such as a death's name, a misspelling, or a name every object has, plays the generic shot for the weapon's range, the same on every client. A shot whose attacker the viewer cannot see carries no kind, since a kind would name the hidden weapon and, through its recipe, its faction. Its impact draws generic.
- An effects gallery in the app, at `#effects` and behind the editor's Effects button, plays each recipe on loop through the same events and renderer as a match, for each faction's models, with zoom, slow motion, and draw call, triangle, and particle counts. It is how effects are reviewed, and the editor's picker will preview from it. A night view comes when themes light the renderer.
- The `rts-effects` skill makes and tunes effects, and the `effects-reviewer` agent judges them. They came after the first recipes, so they describe a pipeline that exists. The skill's capture script drives headless Chrome over its debugging protocol with no new dependency, and calls the gallery's `renderEffectSheet`, which steps a fixed clock, so a sheet is the same every run. A sheet shows four moments after the event at desktop and phone pixel size, with the effect's peak parts, draw calls, and triangles.

Left open:

- Travel time, splash, and chaining, each an ADR of its own when gameplay asks. Pending hits become snapshot data, so the travel-time ADR also gives them the `fired` fog rule: no origin outside the viewer's sight, and a flight drawn only where the viewer sees it.
- Whether a shot carries its owner's team color, which helps tell whose missile it is in a 6v6 but competes with faction palettes. With it, a floor for how bright and big a style may make a shot's core parts, its flash, tracer, beam, and hit, so no faction's fire is harder for its opponents to read. Until then the effects reviewer judges it.
- Whether validation should refuse a `weapon.shot` that names no kind, which today plays the generic shot for the weapon's range.
- Budgets for live particles and beams, measured on a real phone. Particles allocate their vectors as they spawn, so a pool may be needed if a phone shows collection pauses in a big fight.
