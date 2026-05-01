# Vision

`strap` is a Linux-only, unix-ish agent harness for local, inspectable, self-modifying work.

The core idea is simple:

> A project should be able to carry its own agent operating layer: commands, memory, sessions, tools, launch profiles, and editable workflows, all visible as ordinary files.

`strap` is not trying to be a hidden agent platform. It is trying to be a small operating substrate that humans and agents can inspect, modify, test, and discard using familiar filesystem and shell practices.

## Product Thesis

Agents are easier to trust when their capabilities are ordinary artifacts:

- a command is a directory with a `run` script and docs;
- a session is a JSON state file plus a trace;
- memory is a SQLite database with explicit commands;
- auth is a local token file managed by an auth command;
- restricted modes are launch environments, not trusted command claims;
- self-modification means editing files, not persisting hidden eval.

The harness should make those artifacts legible and governable.

## Design Principles

### Prefer filesystem contracts over registries

The primary extension API is a command directory discovered from project, config, and built-in roots. A command can be copied, edited, validated, hidden, documented, or overridden without changing a central parser.

### Keep roots explicit

`STRAP_ROOT`, `STRAP_CONFIG`, `STRAP_GLOBAL`, `STRAP_PROJECT`, `STRAP_SESSION`, `STRAP_WORK`, and `STRAP_WORKSPACE` separate installed harness code, static config, global artifacts, project-shared artifacts, current-session state, user/agent-local mutable state, and the filesystem workspace where tools operate.

This makes mutability and operational isolation discussable.

### Keep state provider-agnostic

Canonical state stores actors, events, scopes, tool requests, and tool results. Provider payloads are projections, not the source of truth.

### Put isolation outside the artifact

Commands should not be trusted to describe whether they are safe. Restricted modes should come from the outside: Linux isolation, read-only mounts, controlled writable overlays, and restricted MCP/jsmcp profiles.

### Make memory explicit

Memory is useful only when it is inspectable and attributable. Agents should use `strap zk` or the `zk` tool explicitly to search, create, and update memory; session commands should not hide memory reads or writes.

### Use languages by role

- Nu: command orchestration, REST/JSON plumbing, reference loops, and SQLite CLI orchestration.
- Babashka/Clojure: richer local data, auth, state, and router logic that gets awkward in Nu.
- Node: MCP and real package/runtime pressure only.

## Non-goals For Now

- Plugin marketplace or remote command registry.
- Web UI or dashboard.
- Treating command metadata as a security boundary.
- Hidden self-extension mechanisms.
- Treating ChatGPT OAuth as the product center; it is just one provider auth path.
- Treating the current sandbox layer as complete security.

## Current Strategic Priority

The project should optimize for flexible, inspectable self-modification while keeping future isolation paths straightforward:

1. Keep command/tool/workflow artifacts ordinary files.
2. Freeze the small command contract v0.
3. Make restricted launch profiles operational rather than metadata-based.

Everything else should orbit this center:

```text
commands are discoverable capabilities
roots and traces make them legible
isolation profiles constrain ambient filesystem and process power
traces explain what happened
```
