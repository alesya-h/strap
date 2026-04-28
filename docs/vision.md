# Vision

`strap` is a Linux-first, unix-ish agent harness for local, inspectable, self-modifying work.

The core idea is simple:

> A project should be able to carry its own agent operating layer: commands, memory, sessions, tools, policy, and editable workflows, all visible as ordinary files.

`strap` is not trying to be a hidden agent platform. It is trying to be a small operating substrate that humans and agents can inspect, modify, test, and discard using familiar filesystem and shell practices.

## Product Thesis

Agents are easier to trust when their capabilities are ordinary artifacts:

- a command is a directory with a `run` script and docs;
- a session is a JSON state file plus a trace;
- memory is a SQLite database with explicit commands;
- auth is a local token file managed by an auth command;
- policy is a config file and an authority decision;
- self-modification means editing files, not persisting hidden eval.

The harness should make those artifacts legible and governable.

## Design Principles

### Prefer filesystem contracts over registries

The primary extension API is a command directory discovered from project, config, and built-in roots. A command can be copied, edited, validated, hidden, documented, or overridden without changing a central parser.

### Keep roots explicit

`STRAP_ROOT`, `STRAP_CONFIG`, `STRAP_WORK`, and `STRAP_WORKSPACE` separate installed harness code, static config, mutable project-local state, and the filesystem workspace where tools operate.

This makes mutability and authority discussable.

### Keep state provider-agnostic

Canonical state stores actors, events, scopes, tool requests, and tool results. Provider payloads are projections, not the source of truth.

### Put authority at the boundary

Commands and effect surfaces should be able to explain why an action was allowed, denied, or sandboxed. The current authority model is a first pass; hardening it across all effect paths is the top architectural priority.

### Make memory explicit

Memory is useful only when it is inspectable and attributable. `strap session recall` injects zettelkasten results as a visible `memory_context` event, and `strap session remember` records session state through an explicit command.

### Use languages by role

- Node: provider calls, OAuth, streaming, MCP/jsmcp, process and filesystem integration.
- Nushell: editable porcelain, reference loops, JSON pipelines, and SQLite CLI orchestration.
- Babashka/Clojure: currently a small pure-state prototype, not a required platform layer.

## Non-goals For Now

- Plugin marketplace or remote command registry.
- Web UI or dashboard.
- More provider integrations before authority and command contracts are hardened.
- Hidden self-extension mechanisms.
- Treating ChatGPT OAuth as the product center; it is just one provider auth path.
- Treating the current policy/sandbox layer as complete security.

## Current Strategic Priority

The project should continue, but harden before expanding:

1. Close authority gaps across every meaningful effect path.
2. Freeze the command contract v0.
3. Make `readonly` mode a real end-to-end promise.

Everything else should orbit this center:

```text
commands are discoverable capabilities
manifests make them legible
tools/sandbox enforce the decision
traces explain what happened
```
