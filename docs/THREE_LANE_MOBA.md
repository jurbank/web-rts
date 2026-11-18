# Three-lane MOBA playtest

In the editor, choose **Load… → Three-lane MOBA → Playtest**. You control the red Vanguard in the southwest. Select it beside the armory to buy Boots with your starting 100 resources. Follow a wave, use Bolt on enemy units, and destroy the blue Core in the northeast. The opposing hero uses the same abilities and can respawn. Fog starts off so an author can watch all three lanes.

Each team has one tower per lane. Every 14 seconds a Footguard and a Longbow leave each of the six lane entrances. Mid crosses the center of the map. Top turns at the northwest corner and bottom at the southeast corner. Losing the last tower sends an enemy siege ram down mid with each subsequent wave. A core is vulnerable from the start.

## What worked

- In the desktop browser, moving the shared `midCross` waypoint changed both mid routes. Undo restored its original X coordinate of 36. Redo, Save, Load, Playtest, and returning to the editor preserved the edited value of 37 in a named copy.
- The editor's **Destroy all of… Core** rule works with one core in each hero seat. Creeps and towers belong to allied, uncommanded seats. Destroying both cores in one tick produces a draw.
- In the seed-1 headless solo playtest, the first mid engagement started around 23 seconds. Both outer lanes fought at their own bends around 29 seconds. An idle red hero lost its core at 1:58. A scripted red mid push with Boots and Bolt defeated the same blue AI at 1:34. Timing is specific to these command streams.

## Gaps found while authoring

| Observation                                                                                                                                                                                              | Effect on this map                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Blocked waypoints pass validation.** Moving `topBend` to (15, 17), the center of a Grove, still enabled Playtest. The pathfinder stops at the closest reachable cell and the path order advances.      | A route can look valid in the editor while creeps miss a turn. Drawing the actual walkable route or flagging an obstructed waypoint would catch this before a match.       |
| **Wave logic is opaque in the editor.** The victory panel reports “5 more triggers.” Inspecting their actions and the wave interval requires opening the JSON.                                           | A read-only list of timers and actions would explain when the next wave spawns and what unlocks a ram.                                                                     |
| **Each direction needs its own path.** The path inspector supports appending and removing waypoints.                                                                                                     | Inserting a new bend into both directions requires rebuilding the tails of two lists. An insert-at-position control or reversible path would simplify this edit.           |
| **The bot attacks nearby enemies without a lane objective.** In an early two-AI run, both cores still had full health at ten minutes. The last tower had fallen five minutes earlier.                    | The final scenario rewards clearing towers with siege rams. The same seed and seats then finished by core destruction at 2:45.                                             |
| **A development hot reload can reset the active document during play.** After the bundled scenario file changed on disk, returning to the editor showed Skirmish units under the saved MOBA copy's name. | Saving at that point could overwrite the wrong map. Reloading the named copy restored it. With the files stable, the normal edit and playtest loop preserved the document. |
| **Undoing all edits leaves the document marked dirty.** Moving a waypoint and undoing both coordinate edits restored the original values and left the Save asterisk visible.                             | Switching examples can ask an author to discard changes after they already reverted them.                                                                                  |

The browser checks used a desktop viewport. Mobile input and performance still need a real-device playtest.
