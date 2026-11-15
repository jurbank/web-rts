# web-rts

A browser RTS with a scenario editor. Players build maps and game modes, playtest them, and play them on desktop or phone.

Start with the docs:

- [docs/OVERVIEW.md](docs/OVERVIEW.md) says what we are building.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) sets package boundaries and rules.
- [docs/ROADMAP.md](docs/ROADMAP.md) orders the work and names the current milestone.
- [docs/ADRs.md](docs/ADRs.md) records decisions.

## Packages

- `packages/data`: scenario and content schemas.
- `packages/sim`: the headless, deterministic simulation.
- `packages/render`: draws snapshots with Three.js. Camera and picking.
- `apps/website`: the app. The game loop, input, and wiring.

## Development

The repo uses [Vite+](https://viteplus.dev/guide/). Install it, then:

```bash
vp install
```

```bash
vp check
```

```bash
vp test
```

```bash
vp run dev
```
