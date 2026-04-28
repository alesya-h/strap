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
| `STRAP_WORK` | Project-local mutable state | nearest `.strap`, otherwise `$STRAP_WORKSPACE/.strap` |
| `STRAP_WORKSPACE` | Filesystem workspace for tools | current working directory |

Use `strap paths` or `strap commands roots` to inspect resolution.

## Command Discovery

Commands are searched in this order:

```text
STRAP_COMMAND_PATH
$STRAP_WORK/commands
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

Provider request payloads are compiled projections. Provider continuation IDs or protocol-specific metadata are not the canonical state.

## Execution Loops

There are two loop surfaces:

- `strap loop`: Node loop for provider/tool orchestration.
- `strap loop-nu`: editable Nushell reference loop for strategy experimentation and unix-y readability.

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

`strap work init` creates the project-local `.strap` layout.

`strap session` stores sessions under `$STRAP_WORK/sessions/` with:

- `meta.json`
- `state.json`
- `trace.jsonl`
- `provider-requests/`
- `tool-results/`

`strap session recall <query>` searches the zettelkasten and appends visible memory context to state. `strap session remember [tags]` writes useful state into zettelkasten memory.

`strap zk` stores shared memory in SQLite with FTS5 and sqlite-vec. It supports text, vector, hybrid, related, backlinks, tags, links, create/update/delete/list, reindex, and `remember-state`.

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
