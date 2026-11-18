# Render review

The builder of an asset tends to approve it, so a fresh reviewer judges it. Start the `structure-reviewer` agent (`.agents/agents/structure-reviewer.md`). It holds the questions and the report format, can only read, and reads everything it needs in one turn. Where the environment has no agent types but can start a subagent, give a fresh subagent that file's text as its instructions. That costs about four times as much, because a general-purpose subagent carries every tool. Where neither is possible, answer its questions yourself and show the sheets to the user.

## Give the reviewer

Keep the prompt short. The agent already knows the sheet layout and the questions.

- The paths of the review sheets under `art/staging/renders/structures/<themes|factions>/<set>/`, rendered with `--with` naming the closest neighbors. For a faction, both the day sheet `<asset-id>-review.png` and the night sheet `<asset-id>-night-review.png`.
- The set, so it reads `docs/themes/<theme>.md` or `docs/factions/<faction>.md`. Review buildings from one set per call.
- Each building's type and its export summary line.
- Deliberate choices it should not reverse, such as avoiding a protected emblem.

Review a whole batch in one call, up to four buildings. Do not send the inspiration screenshots, the skill, or the pipeline.

## Rounds

Fix what the reviewer marks serious, export, render, and review again. Send only the buildings whose shape or main colors changed. Run at most two rounds per batch. After the second, fix the cheap minor points, check the sheets yourself, and hand any open points to the user. A ship verdict hands the asset to the user. It does not approve copying it into the game.
