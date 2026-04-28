# Architecture

This document describes the current architecture of `strap` as implemented in this repository.

## System Shape

`strap` is a filesystem-discovered command harness.

```text
strap <command> [args...]
```

The runner resolves command directories, builds a standard environment, asks the authority model for an execution decision, then spawns the command's `run` file.

## Roots

| Root | Purpose | Default |
| --- | --- | --- |
| `STRAP_ROOT` | Installed harness code | repository root in development |
| `STRAP_CONFIG` | Static harness config | `config/strap` when present, otherwise XDG config |
| `STRAP_PROJECT` | Project-shared harness artifacts | nearest `.strap`, otherwise `$STRAP_WORKSPACE/.strap` |
| `STRAP_WORK` | User/agent-local mutable state | nearest `.strap-user`, otherwise `$STRAP_WORKSPACE/.strap-user` |
| `STRAP_WORKSPACE` | Filesystem workspace for tools | current working directory |

Use `strap paths` or `strap commands roots` to inspect resolution.

`strap status` reports the active roots, layers, and visible artifact overlays. `strap artifact status --paths` exposes the physical files when debugging is needed.

## Layered Artifacts

Commands, script tools, and porcelain modules share a layered artifact model:

- `user`: mutable user/agent overlay under `.strap-user`.
- `project`: shared project artifacts under `.strap`.
- `config`: static/global config artifacts.
- `root`: installed harness defaults.

The user layer shadows lower layers. `strap artifact workon <type> <name>` copies a lower-layer artifact into the user layer, `strap artifact promote <type> <name>` writes the user-layer artifact to the project layer and clears the overlay, and `strap artifact discard <type> <name>` removes the user-layer overlay.

Supported artifact types are currently `command`, `tool`, `porcelain`, `agent`, and `skill`. Zettelkasten notes use the same overlay grammar through `strap zk workon/promote/discard/status` because note identity and tombstones need note-specific handling.

## Command Discovery

Commands are searched in this order:

```text
STRAP_COMMAND_PATH
$STRAP_WORK/commands
$STRAP_PROJECT/commands
$STRAP_CONFIG/commands
$STRAP_ROOT/subprojects/cli/commands
```

The last matching name wins when commands are collected for listing, and the runner resolves from the same ordered roots so project/config commands can override built-ins.

A command directory can contain:

```text
command-name/
  run                 executable public command
  desc                help text; first line is list summary
  command.json        optional authority/metadata annotations
  spec.yaml           optional carapace completion spec
  carapace-complete   optional dynamic completion script
  compgen             optional shell completion script
  inner/              private helper scripts
  hide                hide from default command listing
  wd                  optional executable that prints command cwd
```

Inspect and validate the command surface with:

```bash
strap commands list --json
strap commands manifest auth
strap commands validate --json
```

## Agents

Agent profiles are markdown files discovered from:

```text
STRAP_AGENT_PATH
$STRAP_WORK/agents
$STRAP_PROJECT/agents
$STRAP_CONFIG/agents
$STRAP_ROOT/agents
```

Profiles support OpenCode-style frontmatter with fields like `description`, `permission`, and `color`, followed by instruction text. `strap agents apply <name>` writes the selected profile into a canonical-state actor, usually `actors.assistant`, so provider compilation uses it as the actor frame. `strap agents import-opencode ~/.config/opencode/agents` copies existing OpenCode profiles into the user overlay.

## Skills

Skills are instruction bundles discovered from:

```text
STRAP_SKILL_PATH
$STRAP_WORK/skills
$STRAP_PROJECT/skills
$STRAP_CONFIG/skills
$STRAP_ROOT/skills
```

Each skill is a directory containing `SKILL.md`, compatible with OpenCode-style skill directories. `strap skills apply <name>` attaches the skill to an actor without replacing the agent profile. Provider compilation renders applied skills as named instruction blocks after the actor's private instructions. `strap skills import-opencode ~/.config/opencode/skills` copies existing OpenCode skills into the user overlay.

## Authority Flow

Before a command runs, `bin/strap` calls `#strap/policy/authority` with:

- active policy (`STRAP_POLICY`, default `default`);
- action `execute`;
- command name;
- annotations from `command.json`.

The decision is one of:

- `allow`
- `deny`
- `sandbox`

The command receives the decision in `STRAP_AUTHORITY_DECISION`.

Path decisions for `read` and `write` classify paths as:

- `root`
- `config`
- `project`
- `work`
- `workspace`
- `outside`

Current caveat: authority is implemented at command spawn and policy-inspection boundaries first. Lower-level tool, MCP, jsmcp, provider-auth, and memory effect paths still need an authority-closure audit before the model should be treated as complete enforcement.

## Canonical State

The active state format is `strap.state.v0.2`.

See [`state-format.md`](state-format.md) for the canonical state format specification.

State is provider-agnostic and structured as:

- `actors`: known humans, agents, and harness participants;
- `root`: a tree of events and scopes;
- events: messages, tool requests, tool results, memory context, fork/fold records;
- scopes: branchable/collapsible regions that can hold summaries and hidden children.

Addressability is optional. `strap state bookmark add` attaches inline bookmarks to visible nodes by unique text match, and `strap state fold --from <bookmark> --to <bookmark>` folds a sibling range into a collapsed scope. This keeps the base state hand-editable while still giving agents stable handles when needed.

`strap state extract --from <bookmark> --to <bookmark>` emits `strap.context.v0.1` for a visible sibling range without mutating state. `strap context quote` renders that extracted context as quoted evidence so a later one-shot agent or summarizer does not treat itself as one of the participants. `strap context summarize <framing>` wraps `strap one-shot` and emits `strap.context-summary.v0.1`.

Provider request payloads are compiled projections. Provider continuation IDs or protocol-specific metadata are not the canonical state.

## Nu Plumbing

Nu is the preferred implementation surface for local structured data plumbing. The grouped module is `nu/strap/mod.nu`, imported as `use '/path/to/strap/nu/strap'` or `use strap` when `strap nu lib-dir` is in `NU_LIB_DIRS`, and exposes commands such as `strap state init`, `strap session new`, `strap agents list`, and `strap skills list`.

The stable plumbing module is `nu/plumbing.nu`; it owns pure state transforms, event/bookmark/context inspection, and higher-order combinators that accept blocks.

Examples:

```nu
use '/path/to/strap/nu/plumbing.nu' *

open state.json | with-events {|events| $events | where from == user }
open state.json | map-events {|event| { from: $event.from, text: $event.text } }
open state.json | with-extract bm_start bm_end {|ctx| $ctx.events | get text }
```

The intended boundary is: Nu owns local dataflow and orchestration; Node owns provider HTTP/streaming, OAuth, MCP/jsmcp, long-running servers, SDK-heavy integrations, and process/thread edges; Babashka is available for pure algorithms when Nu becomes awkward.

`strap nu modules`, `strap nu lib-dir`, `strap nu use-line strap`, `strap nu path plumbing`, and `strap nu use-line plumbing` expose installed module paths/import lines for agents and humans.

## Execution Loops

There are two loop surfaces:

- `strap loop`: Node loop for provider/tool orchestration.
- `strap loop-nu`: editable Nushell reference loop for strategy experimentation and unix-y readability.
- `strap one-shot`: Node one-shot runner that builds a temporary child state from optional state/context input and returns the first final assistant answer without mutating sessions.

The Node loop is the dependable runtime. The Nu loop is a reference/editable strategy surface and should not silently diverge from the behavior the project wants to preserve.

## Tools And MCP

Tool groups are exposed through `#strap/tools/registry`:

- `fs`
- `process`
- `web`
- `agent`
- `scripts`
- `jsmcp`
- `all`

Script tools are executable files discovered from:

```text
STRAP_SCRIPT_TOOLS
$STRAP_WORK/tools
$STRAP_PROJECT/tools
$STRAP_CONFIG/tools
$STRAP_ROOT/tools
```

They receive JSON on stdin and can expose a sidecar JSON schema.

Bundled stdio MCP servers live under `subprojects/mcp/servers/`. The jsmcp bridge shells out to `jsmcp client` and exposes configured MCP servers as programmable tools.

## Providers And Auth

Provider configs live in `config/strap/providers/` and describe provider, API family, endpoint, model, auth, headers, and parameters.

Current provider families:

- OpenAI public API with API-key auth.
- OpenRouter chat completions.
- Anthropic Messages.
- ChatGPT/Codex backend responses with local ChatGPT OAuth token cache.

ChatGPT OAuth is managed by:

```bash
strap auth chatgpt login
strap auth chatgpt import-codex
strap auth chatgpt refresh
strap auth chatgpt show
strap auth chatgpt logout
```

The token cache defaults to `~/.config/strap/auth/chatgpt.json`.

## Sessions, Work, And Memory

`strap work init` creates both project-shared `.strap` and user-local `.strap-user` layouts.

`strap session` stores sessions under `$STRAP_WORK/sessions/`, which defaults to `.strap-user/sessions/`, with:

- `meta.json`
- `state.json`
- `trace.jsonl`
- `provider-requests/`
- `tool-results/`

`strap session copy <name>` copies the current session into a new current session. With `--at <bookmark>`, the copied state is truncated after that visible bookmark so the conversation can continue in a different direction from a specific point.

Memory is explicit: agents and humans use `strap zk` or the `zk` script tool to search, create, and update zettelkasten notes. Session commands do not implicitly inject or write memory.

`strap zk` stores markdown notes under `.strap-user/zettel` for user/private memory or `.strap/zettel` for project-shared memory. The user layer is a transparent overlay on the project layer: user notes shadow project notes with the same id, `workon` copies a project note into the user layer, `promote` writes it back, and normal output hides physical `.strap*` paths. Inline `[[wikilinks]]` are the canonical link source; backlinks and ambiguity diagnostics are derived during normal reads/writes. SQLite/FTS/vector data under `$STRAP_WORK/zettel` is a derived cache rebuilt by `strap zk reindex` and on hybrid/vector searches.

`strap history` wraps a separate jj repo in `$STRAP_WORK`, which defaults to `.strap-user`. It tracks user-local sessions, temporary commands/tools/porcelain, private markdown memory, and other agent state without touching the project workspace history.

## Subprojects

Code is grouped by capability:

- `cli`: command runner support and built-in command directories.
- `core`: paths, canonical state, CLI I/O, agent fork/fold helpers.
- `providers`: provider request compilation, calls, streaming, auth.
- `loop`: Node model/tool loop.
- `tools`: tool registry and built-in tools.
- `mcp`: bundled stdio MCP servers.
- `jsmcp`: bridge to installed `jsmcp`.
- `porcelain`: Nushell porcelain runner.
- `zettel`: zettelkasten CLI and embedding helper.
- `sessions`: project work and session CLIs.
- `policy`: authority decision model and policy CLI.
- `state-bb`: Babashka pure-state prototype.

## Validation

Use:

```bash
npm test
strap commands validate --json
```

`npm test` runs syntax/source checks and the smoke workflow.
