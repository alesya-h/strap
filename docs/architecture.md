# Architecture

This document describes the current architecture of `strap` as implemented in this repository.

## DEFAULT IMPLEMENTATION LANGUAGE POLICY

**DEFAULT TO NUSHELL. USE BABASHKA/CLOJURE WHEN NU GETS AWKWARD. USE JAVASCRIPT ONLY WHEN THE COMMAND NEEDS AN NPM SDK, A NODE-ONLY PACKAGE, OR A NODE-SPECIFIC RUNTIME SURFACE.**

REST calls, JSON shaping, filesystem orchestration, provider request compilation, and command plumbing should be Nu first. Rich local data logic, auth/state transformations, SQLite-style local work, or code that benefits from immutable data structures should use Babashka/Clojure. JavaScript is not the default command language; it is an escape hatch for package/runtime dependency pressure.

## System Shape

`strap` is a filesystem-discovered command harness.

```text
strap <command> [args...]
```

The runner resolves command directories, builds a standard environment, then spawns the command's `run` file.

## Roots

| Root | Purpose | Default |
| --- | --- | --- |
| `STRAP_ROOT` | Installed harness code | repository root in development |
| `STRAP_CONFIG` | Static harness config | `config/strap` when present, otherwise `$STRAP_GLOBAL` |
| `STRAP_GLOBAL` | Global home-directory artifacts | `$XDG_CONFIG_HOME/strap` |
| `STRAP_PROJECT` | Project-shared harness artifacts | nearest `.strap`, otherwise `$STRAP_WORKSPACE/.strap` |
| `STRAP_SESSION` | Active session directory | explicit env var; the root `cli` runner fills it from `$STRAP_WORK/sessions/current` only as an outer convenience |
| `STRAP_WORK` | User/agent-local mutable state | nearest `.strap-user`, otherwise `$STRAP_WORKSPACE/.strap-user` |
| `STRAP_WORKSPACE` | Filesystem workspace for tools | current working directory |

Use `strap paths` or `strap commands roots` to inspect resolution.

`strap status` reports the active roots, layers, and visible artifact overlays. `strap artifact status --paths` exposes the physical files when debugging is needed.

## Layered Artifacts

Commands and tools share a layered artifact model:

- `session`: current-session overlay under `$STRAP_SESSION/overlay`.
- `user`: mutable user/agent overlay under `.strap-user`.
- `project`: shared project artifacts under `.strap`.
- `global`: home-directory artifacts under `$STRAP_GLOBAL`.
- `root`: installed harness defaults.

The session layer shadows lower layers when a current session exists. `strap artifact workon <type> <name>` copies a lower-layer artifact into the session layer, or into the user layer if there is no current session. `strap artifact promote <type> <name>` moves one layer down by default: session to user, user to project, project to global, and global to root. `strap artifact discard <type> <name>` removes the session overlay first, then user overlay.

Supported artifact types are currently `command`, `tool`, `model`, `agent`, and `skill`. Zettelkasten notes use the same overlay grammar through `strap zk workon/promote/discard/status` because note identity and tombstones need note-specific handling.

## Command Discovery

Commands are searched in this order:

```text
STRAP_COMMAND_PATH
$STRAP_SESSION/overlay/commands
$STRAP_WORK/commands
$STRAP_PROJECT/commands
$STRAP_GLOBAL/commands
$STRAP_ROOT/commands
```

The last matching name wins when commands are collected for listing, and the runner resolves from the same ordered roots so project/global commands can override built-ins.

Project and user commands are intended to be isolated capsules. They compose with other commands through stdin/stdout and `strap <command>`, not by importing repo-local implementation modules. Some legacy built-ins still wrap shared JS modules, but new or refactored commands should be self-contained Nu, Babashka, shell, or command-local package implementations.

A command directory can contain:

```text
command-name/
  run                 executable public command
  desc                help text; first line is list summary
  spec.yaml           optional carapace completion spec
  carapace-complete   optional dynamic completion script
  compgen             optional shell completion script
  inner/              private helper scripts
  hide                hide from default command listing
  wd                  optional executable that prints command cwd
```

There are three command-surface levels:

- **Public commands** are visible in `strap commands list` and form the user/agent surface, for example `strap zk`, `strap provider`, and `strap embed`.
- **Hidden commands** have a `hide` file. They are still callable as `strap <command>`, but are omitted from the default command list. Use them for implementation commands that need command identity without becoming public UI, for example `provider-chatgpt` behind `strap provider chatgpt ...`.
- **Inner helpers** live under one command's `inner/` directory and are callable only through `strap inner <command> <helper>`. Use them only for helpers that are private to that command's implementation, such as `strap inner zk index`. Do not execute inner files directly.

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

## Isolation

The main command runner does not implement access-control rules. Restricted modes should be separate launch environments, for example `strap sandbox run --profile readonly -- ...`, restricted MCP/jsmcp profiles, or external Linux isolation tools.

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

The intended boundary is: Nu owns local dataflow, filesystem work, JSON plumbing, and REST-only command capsules; Babashka owns richer local algorithms and state/auth logic that are awkward in Nu but do not need a package ecosystem; Node is reserved for MCP and real package/runtime pressure only.

Implementation files are intentionally small. The hard cap is 150 lines per source file, command `run` script, or helper; prefer even smaller files when a command has separable concepts. Command-local modules are the escape hatch for complexity, not shared repo libraries. Existing oversized files must appear in `.strap/config/line-cap-exceptions.txt` until they are split.

`strap nu modules`, `strap nu lib-dir`, `strap nu use-line strap`, `strap nu path plumbing`, and `strap nu use-line plumbing` expose installed module paths/import lines for agents and humans.

## Execution Loops

There is one loop surface:

- `strap loop`: Nushell loop for provider/tool orchestration.
- `strap one-shot`: Nu one-shot runner that builds a temporary child state from optional state/context input and returns the first final assistant answer without mutating sessions.

The loop composes through public commands: `strap llm complete` for provider interaction and `strap run-calls` for tool execution.

## Tools And MCP

Tool schemas are exposed through `strap tools list --group <group> --json`:

- `fs`
- `process`
- `web`
- `agent`
- `jsmcp`
- `all`

Script tools are executable files discovered from:

```text
STRAP_TOOL_PATH
$STRAP_WORK/tools
$STRAP_PROJECT/tools
$STRAP_CONFIG/tools
$STRAP_ROOT/tools
```

Tool artifacts are grouped directories: `tools/<group>/run`, `tools/<group>/desc`, and either `tools/<group>/meta.json` or `tools/<group>/meta/<action>.json`. Provider-facing names are dotted, for example `fs.read_file` and `jsmcp.list_servers`. Action metadata can set `process_state` to `none` (default), `own`, or `full`; own-state tools read/write `runtime.tools.<group>` through an `own_state` envelope. Results use semantically equivalent `content` and `structuredContent`; `content` should be readable for the specific tool, and result `metadata` is not part of the contract. See `docs/tool-contract.md` for the exact envelope contract.

`strap mcp <group>` exposes Strap tools as stdio MCP servers for external MCP hosts. It lists schemas through `strap tools` and executes calls through `strap run-calls`. `strap mcp all` expands to local groups only; `jsmcp` must be requested explicitly.

The jsmcp bridge uses the local jsmcp HTTP API and exposes configured MCP servers as programmable Strap tools. It stores observed server/tool discovery in canonical state and rejects `execute_code` when cached discovery changes.

## Models, Providers, And Auth

Model profiles live in layered `models/` directories and describe model id, provider street address, API family, endpoint, auth, headers, and parameters. Runtime commands default to `--model current`, where `current.json` is a Linux symlink to the selected profile.

Model roots:

```text
STRAP_MODEL_PATH
$STRAP_WORK/models
$STRAP_PROJECT/models
$STRAP_CONFIG/models
$STRAP_ROOT/models
```

Current provider adapter families:

- OpenAI public API with API-key auth.
- OpenRouter chat completions.
- Anthropic Messages.
- ChatGPT/Codex backend responses with local ChatGPT OAuth token cache.

Provider commands are split by provider. `strap provider` is a public dispatcher. The provider implementations are hidden commands:

- `provider-openai`: Nushell REST capsule.
- `provider-openrouter`: Nushell REST capsule.
- `provider-anthropic`: Nushell REST capsule.
- `provider-chatgpt`: Babashka capsule for ChatGPT/Codex backend calls and OAuth token management.

`strap embed` is a provider-neutral facade. Local hash embeddings are implemented in `embed`; provider-backed embeddings delegate to `strap provider <name> embed`.

ChatGPT OAuth is managed by:

```bash
strap provider chatgpt auth login
strap provider chatgpt auth import-codex
strap provider chatgpt auth refresh
strap provider chatgpt auth show
strap provider chatgpt auth logout
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
- `overlay/`
- `.jj/`

`strap session copy <name>` copies the active session into a new session. With `--at <bookmark>`, the copied state is truncated after that visible bookmark so the conversation can continue in a different direction from a specific point.

Actual session-aware commands rely on `STRAP_SESSION`. The root `cli` runner reads `$STRAP_WORK/sessions/current` only when `STRAP_SESSION` is absent, then exports `STRAP_SESSION` to the command it launches. Use `strap with-session <session> -- <command>` for one-off selection without changing the pointer. In Nushell, `strap session select <session>` is `def --env` and sets `$env.STRAP_SESSION` in the current shell.

Session mutations create jj snapshots in the session directory. `strap history` operates on the current session rather than the project-user work root, and `strap history ui` launches `jjui` there.

Memory is explicit: agents and humans use `strap zk` or the `zk` script tool to search, create, and update zettelkasten notes. Session commands do not implicitly inject or write memory.

`strap zk` stores markdown notes under `.strap-user/zettel` for user/private memory or `.strap/zettel` for project-shared memory. The user layer is a transparent overlay on the project layer: user notes shadow project notes with the same id, `workon` copies a project note into the user layer, `promote` writes it back, and normal output hides physical `.strap*` paths. Inline `[[wikilinks]]` are the canonical link source; backlinks and ambiguity diagnostics are derived during normal reads/writes. SQLite/FTS/vector data under `$STRAP_WORK/zettel` is a derived cache rebuilt by `strap zk reindex` and on hybrid/vector searches.

The zettelkasten is a self-contained Babashka command capsule because markdown overlays, wikilinks, tombstones, search/index rebuilds, and tool-mode JSON handling are one conceptual subsystem. Its SQLite/FTS/vector index helper is command-private and reached through `strap inner zk index`; it is not part of the public command surface.

`strap history` wraps the current session directory as a jj repo. Project-user overlays and private memory remain under `$STRAP_WORK`, but session-local state and session overlays get per-session history without touching the project workspace history.

## Subprojects

Code is grouped by capability:

- `cli`: Babashka main command dispatcher behind `bin/strap`.
- `cli`: built-in command capsules.

## Validation

Use:

```bash
./bin/strap project-test
strap commands validate --json
```

`strap project-test` runs syntax/source checks and the smoke workflow.
