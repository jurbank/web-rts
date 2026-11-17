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
