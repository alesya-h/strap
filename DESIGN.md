# Strap Design

`strap` is a Linux-first, unix-ish agent harness built around ordinary files, explicit roots, provider-agnostic state, and governable command execution.

For the product vision, see [`docs/vision.md`](docs/vision.md).
For the detailed implementation architecture, see [`docs/architecture.md`](docs/architecture.md).

## Core Bet

The durable unit of extension is a filesystem command directory:

```text
command-name/
  run
  desc
  command.json
  inner/
```

The public interface is:

```bash
strap <command> [args...]
```

This makes the harness inspectable and editable by both humans and agents. A project can carry local commands, tools, sessions, porcelain, and memory under `.strap/` without requiring central registration.

## Current Spine

The project should be understood as this chain:

```text
command directory
  -> manifest and docs
  -> authority decision
  -> execution environment
  -> state/tool/memory/provider effect
  -> traceable result
```

Everything else should orbit that spine.

## Roots

- `STRAP_ROOT`: installed harness code.
- `STRAP_CONFIG`: static harness config.
- `STRAP_WORK`: project-local mutable `.strap` work state.
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

## Safety Direction

The current authority model makes an execution decision before `strap <command>` is spawned and exposes it as `STRAP_AUTHORITY_DECISION`. This is the correct center, but it is not yet complete end-to-end enforcement.

Near-term design work should focus on:

1. authority closure across every effect path;
2. command contract v0 freeze;
3. trustworthy readonly mode.

Do not expand the platform surface until those are hardened.
