<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# Project docs

- `docs/OVERVIEW.md` says what we are building.
- `docs/ARCHITECTURE.md` sets package boundaries and rules. Read it before adding a package, adding a dependency, or touching `sim`, `data`, `editor`, or `render`.
- `docs/ROADMAP.md` orders the work and names the current milestone.
- `docs/ADRs.md` records decisions. Changing an architecture rule needs an entry there.
- Run the `architecture-guardian` agent (`.agents/agents/architecture-guardian.md`) on changes that cross package boundaries.
- Run the `multiplayer-guardian` agent (`.agents/agents/multiplayer-guardian.md`) on changes that add a command, a mechanic, a trigger event or action, or a player or team field, or that touch the game loop, the local player, input, the HUD, or snapshots. It also checks that a match stays the same and fair across phones, tablets, and desktops. Run it over the whole workspace at the end of each milestone.
