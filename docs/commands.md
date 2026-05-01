# Command Authoring

The public extension API is a command directory.

## DEFAULT COMMAND LANGUAGE POLICY

**DEFAULT TO NUSHELL. USE BABASHKA/CLOJURE WHEN NU GETS AWKWARD. USE JAVASCRIPT ONLY WHEN THE COMMAND NEEDS AN NPM SDK, A NODE-ONLY PACKAGE, OR A NODE-SPECIFIC RUNTIME SURFACE.**

Do not choose JavaScript just because JSON objects are convenient there. Use Nu for command orchestration, JSON, REST, filesystem discovery, and process composition. Use Babashka/Clojure when the logic wants richer data transformations or local state handling. Use command-local JavaScript only for SDK/package/runtime requirements that Nu or Babashka cannot reasonably cover.

```text
my-command/
  run                 executable public command
  desc                help text; first line appears in command lists
  spec.yaml           optional carapace completion spec
  carapace-complete   optional dynamic completion script
  compgen             optional shell completion script
  inner/              private helper scripts, callable only through `strap inner`
  hide                hide from default command list while remaining callable
  wd                  optional executable that prints command cwd
```

Commands receive:

- `STRAP_ROOT`
- `STRAP_CONFIG`
- `STRAP_GLOBAL`
- `STRAP_PROJECT`
- `STRAP_SESSION` when an active session exists
- `STRAP_WORK`
- `STRAP_WORKSPACE`
- `STRAP_CMD_NAME`
- `STRAP_CMD_DIR`

Command safety is not described by command-owned metadata. Use launch profiles, sandboxing, and restricted tool/jsmcp configuration for restricted modes.

## Capsule Commands

Project and user commands are capsules. A capsule command can be replaced, removed, or rewritten in another language without changing other command internals.

A capsule command may use:

- Its own command directory through `STRAP_CMD_DIR`.
- The public Strap environment variables listed above.
- Stdin/stdout JSON protocols.
- Standard external runtimes and tools such as `nu`, `bash`, `node`, `jq`, `sqlite`, or `jj`.
- Other Strap commands through the public process boundary, for example `strap state init | strap agents apply chat-concise`.

A capsule command must not use:

- `#strap/*` imports.
- Repo-local implementation imports under `subprojects/*/src`.
- Direct execution of repo-local JS implementation entrypoints under `subprojects/*/bin`.
- Another command's private files except through `strap <command>` or `strap inner <command> <helper>`.

`strap project-check` enforces the import/direct-JS parts of this rule for project and user command overlays, excluding the `project-*` validation commands themselves.

File size is part of the capsule contract. A source file, `run` script, or helper file has a hard cap of 150 lines; prefer smaller files, usually 50-100 lines. If a file approaches the cap, split it into command-local modules under that command directory instead of adding more branches to one large script. JSON data files are exempt from this line cap because readability matters more than vertical compactness there. `strap project-check` enforces the cap for command capsules; the temporary exceptions in `.strap/config/line-cap-exceptions.txt` are existing refactor debt and should shrink over time, not grow.

JSON files should be checked in as readable, pretty-printed documents, not minified one-line blobs. If a JSON file becomes too large to read comfortably, split it by responsibility rather than squashing it.

## Public, Hidden, And Inner Commands

Use the smallest surface that matches the job:

| Surface | How to define it | How to call it | Use when |
| --- | --- | --- | --- |
| Public command | command directory with `run` and no `hide` | `strap <command>` | Humans or agents should discover and use it directly. |
| Hidden command | command directory with `run` and `hide` | `strap <command>` | It needs command identity but should not appear in the normal command list. |
| Inner helper | executable under `command/inner/` | `strap inner <command> <helper>` | It is private to one command's implementation. |

Examples:

- `strap provider` is public; `provider-chatgpt` is hidden behind `strap provider chatgpt ...`.
- `strap zk` is public; `strap inner zk index ...` is a private implementation boundary for its derived index.
- REST-only provider commands are Nu capsules. Provider commands that need richer local auth logic can use Babashka. Use a provider-local Node package only when SDKs or package dependencies are required.

Create a temporary command under the current session overlay, or under `.strap-user/commands` when no session is current:

```bash
strap commands new my-command
strap edit my-command
strap help my-command
```

List commands for humans or agents:

```bash
strap commands list
strap commands list --json
strap commands manifest zk
strap commands validate --json
```

Private helpers go in `inner/` and must be called through the runner, never by executing the file path directly:

```bash
strap inner my-command helper-name arg1 arg2
```

Run a command against a specific session without changing the convenience pointer:

```bash
strap with-session my-session -- history log
```

## Built-in Commands

| Command | Purpose |
| --- | --- |
| `agent` | Fork and fold agent state. |
| `agents` | List, show, apply, and import markdown agent profiles. |
| `artifact` | Inspect and manage layered command/tool/profile artifacts. |
| `carapace` | Install and serve shell completion integration. |
| `commands` | List, inspect, validate, and scaffold command directories. |
| `context` | Transform extracted context, including quoting and summarization. |
| `embed` | Embed text through the selected provider. |
| `edit` | Edit or create command files. |
| `history` | Manage jj-backed current-session history. |
| `llm` | Compile, call, or complete model-profile requests from canonical state. |
| `loop` | Run the Nushell model/tool loop. |
| `mcp` | Run bundled stdio MCP servers. |
| `model` | List, show, select, and fork model profiles. |
| `nu` | Inspect Nushell plumbing module paths. |
| `one-shot` | Run an agent once until its first final answer. |
| `paths` | Print resolved root/config/global/project/session/work/workspace paths. |
| `provider` | Run provider-specific operations and authentication. |
| `run-calls` | Execute pending tool calls in canonical state. |
| `sandbox` | Run a command through a bubblewrap sandbox profile. |
| `session` | Create, inspect, update, save, list, and trace user-local project sessions. |
| `skills` | List, show, apply, and import skill instruction bundles. |
| `state` | Initialize and transform canonical `strap.state.v0.2` JSON. |
| `state-bb` | Run the Babashka pure-state prototype. |
| `status` | Show roots, layers, and overlayed artifact status. |
| `work` | Initialize or inspect `.strap` project artifacts and `.strap-user` local work. |
| `zk` | Use the shared markdown-source zettelkasten with a derived SQLite/FTS/vector index. |

Run `strap help <command>` for command-local usage text.

## Layered Artifacts

Commands, tools, model profiles, agent profiles, and skill bundles can be inspected and moved through the session/user/project/global/root overlay lifecycle:

```bash
strap status
strap artifact status command
strap artifact status agent
strap artifact status skill
strap artifact status model
strap artifact workon tool json_echo
strap artifact promote tool json_echo
strap artifact promote tool json_echo --from project --to global
strap artifact discard tool json_echo
```

`workon` creates a session-layer working copy when a current session exists, otherwise a user-layer copy. `promote` moves one step down by default: session to user, user to project, project to global, and global to root. `discard` removes the session-layer copy first, then the user-layer copy.

## Agent Profiles

Agent profiles are markdown files with optional frontmatter:

```nu
strap agents list
strap agents show chat-concise
open state.json | strap agents apply chat-concise | save -f next.json
strap agents import-opencode ~/.config/opencode/agents
```

`apply` updates the selected actor, defaulting to `assistant`, with the profile description, instructions, and permission metadata.

## Skills

Skills are `skills/name/SKILL.md` instruction bundles:

```nu
strap skills list
strap skills show concise
open state.json | strap skills apply concise | save -f next.json
strap skills import-opencode ~/.config/opencode/skills
```

`apply` attaches the skill to the selected actor, defaulting to `assistant`, without replacing the active agent profile.

## Model Profiles

Model profiles are layered `models/name.json` artifacts. Runtime commands default to `--model current`.

```nu
strap model list
strap model show current
strap model use gpt-5.5-chatgpt
strap model fork current next-chatgpt --set-model-id gpt-next
```

`current.json` is a Linux symlink to the selected profile in the active overlay.

## Nushell Plumbing

The grouped Nu module lives in `nu/strap/mod.nu` and is normally imported as:

```nu
use '/path/to/strap/nu/strap'

strap state init
| strap agents apply chat-concise
| strap skills apply concise
```

If installed on `NU_LIB_DIRS`, use `use strap`.

For a development shell:

```bash
NU_LIB_DIRS="$(strap nu lib-dir)" nu
```

Nu plumbing lives in `nu/plumbing.nu` and supports block-based composition:

```nu
use '/path/to/strap/nu/plumbing.nu' *

open state.json | with-events {|events| $events | where from == user }
open state.json | map-events {|event| $event.text }
open state.json | with-extract bm_start bm_end {|ctx| $ctx.events | get text }
```

Discover installed module paths with:

```bash
strap nu modules
strap nu lib-dir
strap nu use-line strap
strap nu path plumbing
strap nu use-line plumbing
```

## Bookmark Addressability

Canonical state does not require permanent IDs on every event. When an agent needs a stable handle, it can place optional inline bookmarks on visible messages/scopes:

```bash
strap state bookmark add --text "unique substring" --label fold-start < state.json > next.json
strap state bookmark list < next.json
strap state extract --from bm_start --to bm_end < next.json > context.json
strap state fold --from bm_start --to bm_end --summary "summary" < next.json > folded.json
```

The text match must be unique. If it is ambiguous, provide a longer substring. A range is always two single-node bookmarks.

## Contract Status

The current command contract is intentionally small and file-oriented. The next milestone is to freeze a v0 contract for:

- required files and executable bits;
- manifest shape;
- validation semantics;
- completion hooks;
- `inner/` helper behavior.
