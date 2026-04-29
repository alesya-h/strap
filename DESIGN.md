# Strap Design

`strap` is a Linux-only, unix-ish agent harness built around ordinary files, explicit roots, provider-agnostic state, and governable command execution.

For the product vision, see [`docs/vision.md`](docs/vision.md).
For the detailed implementation architecture, see [`docs/architecture.md`](docs/architecture.md).

## Core Bet

The durable unit of extension is a filesystem command directory:

```text
command-name/
  run
  desc
  inner/
```

The public interface is:

```bash
strap <command> [args...]
```

This makes the harness inspectable and editable by both humans and agents. A project can carry promoted commands, tools, porcelain, and shared memory under `.strap/`, while user/agent-local sessions, scratch work, caches, and project-user generated capabilities live under `.strap-user/`. Each session can carry its own overlay and history under its session directory.

## Current Spine

The project should be understood as this chain:

```text
command directory
  -> manifest and docs
  -> execution profile
  -> state/tool/memory/provider effect
  -> traceable result
```

Everything else should orbit that spine.

## Roots

- `STRAP_ROOT`: installed harness code.
- `STRAP_CONFIG`: static harness config.
- `STRAP_GLOBAL`: global home-directory artifacts.
- `STRAP_PROJECT`: project-shared `.strap` artifacts that may be committed with the project.
- `STRAP_SESSION`: current session state, overlay, and history.
- `STRAP_WORK`: user/agent-local mutable `.strap-user` work state.
- `STRAP_WORKSPACE`: filesystem workspace for tools.

These roots separate code, config, mutable state, and effect targets.

## State

The canonical state format is `strap.state.v0.2`: actors, events, and scopes.

See [`docs/state-format.md`](docs/state-format.md) for the full format specification.

Provider payloads are compiled projections. Provider-managed continuation state is not canonical state.

## Language Split

- Node: provider calls, OAuth, streaming, MCP/jsmcp, filesystem/process glue.
- Nushell: editable porcelain, reference loop, JSON pipeline composition, zettelkasten SQLite orchestration.
- Babashka/Clojure: small pure-state prototype; not yet a required architectural layer.

## Isolation Direction

`strap` is flexibility-first. Restrictions should be imposed by the launch environment rather than trusted command metadata.

The intended hardening path is operational isolation:

1. run restricted work under Linux isolation such as bubblewrap;
2. mount filesystems read-only or with explicit writable overlays;
3. use restricted MCP/jsmcp profiles for restricted modes.

Command metadata is not a security boundary.
