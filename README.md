# Modular agentic harness

`strap` is a Linux-only, unix-ish agent harness scaffold. The repo currently contains:

- A provider-agnostic canonical state format based on actors, events, and scopes.
- A filesystem-discovered `strap <command>` interface inspired by project-local `run` scripts.
- Separate harness, static config, global, project, session, user-work, and workspace roots: `STRAP_ROOT`, `STRAP_CONFIG`, `STRAP_GLOBAL`, `STRAP_PROJECT`, `STRAP_SESSION`, `STRAP_WORK`, and `STRAP_WORKSPACE`.
- Subproject commands for state editing, model request compilation, agent fork/fold, and pending tool execution.
- Nu-first structured plumbing for model-authored workflows.
- Stdio MCP servers for filesystem, process/tmux/nushell, web, and agent/context primitives.
- Executable script tools discovered from overlayed session/user/project/global/root tool dirs.
- A shared markdown-source zettelkasten CLI and script tool for agent memory, with inline wikilinks and a derived SQLite/sqlite-vec index.
- A generic layered artifact model for command, tool, model, agent, and skill workon/promote/discard flows.
- Layered markdown agent profiles compatible with OpenCode-style frontmatter.
- Layered skill instruction bundles compatible with OpenCode-style `SKILL.md` directories.
- jj-backed session-local state and overlay history under each session directory.
- jsmcp bridge tools for programmable access to configured MCP servers.
- Layered model profiles for OpenAI API keys, OpenRouter, Anthropic, and ChatGPT/Codex-backend OAuth auth.
- A reference analysis note in `docs/reference-tool-ux.md`.

Start with:

- [`docs/vision.md`](docs/vision.md): product thesis, principles, non-goals, priorities.
- [`docs/architecture.md`](docs/architecture.md): current implementation architecture.
- [`docs/commands.md`](docs/commands.md): command authoring and command reference.

## Quick Start

```bash
./bin/strap project-test
strap state init \
| strap state add-user "Inspect this repo" \
| tee state.json \
| strap llm compile
strap mcp fs
```

The main harness CLIs are immutable JSON filters: state comes in on stdin and the next state goes out on stdout. Persisting is explicit with `tee`, shell redirection, or Nushell `save`.

```bash
strap state init \
| strap state add-user "List files in the current directory" \
| strap llm complete --tools all \
| strap run-calls --tools all \
| tee session.json \
| strap state display-last-message
```

Use `strap help`, `strap -a`, `strap paths`, and `strap status` to inspect the command surface, resolved roots, and active overlays. See `docs/organization.md`.

Debug command and tool execution without contaminating JSON stdout:

```bash
STRAP_COMMANDS_DEBUG=1 strap paths
STRAP_TOOLS_DEBUG=1 strap run-calls --tools all < state.json > next.json
```

`STRAP_COMMANDS_DEBUG` writes dispatched commands and arguments to stderr. `STRAP_TOOLS_DEBUG` writes tool calls and tool results to stderr.

Project-local daily workflow:

```bash
strap work init
strap session new "repo analysis"
strap session ask "Analyze this repo"
strap session show \
| strap loop --tools all --max-turns 6 \
| tee session.json \
| strap session save
```

Each active session has a session-local overlay under `overlay/` that shadows user, project, global, and root artifacts. `strap artifact workon <type> <name>` writes there while `STRAP_SESSION` is set, and `strap artifact promote <type> <name>` promotes one step at a time: session to user, user to project, project to global, and global to the Strap repo layer. Session state and session overlay changes are jj-backed in the session directory; use `strap history log`, `strap history diff`, or `strap history ui`.

Session-aware commands use `STRAP_SESSION` and fail when it is absent. Use `strap with-session <session> <command>` for one-off process commands.

See `docs/daily-use.md`, `docs/commands.md`, and `docs/architecture.md`.

Run a one-shot agent over quoted context without mutating a session:

```nu
open state.json
| to json
| ^strap state extract --from bm_a --to bm_b
| ^strap context quote
| ^strap context summarize "Summarize only architectural decisions and unresolved risks" --agent chat-concise --skill concise --tools none
| from json
```

Agent profiles are layered artifacts:

```nu
strap agents list
strap agents show chat-concise
open state.json | to json | ^strap agents apply chat-concise | save -f concise-state.json
strap agents import-opencode ~/.config/opencode/agents
```

Skill bundles layer the same way:

```nu
strap skills list
strap skills show concise
open state.json | to json | ^strap skills apply concise | save -f concise-state.json
strap skills import-opencode ~/.config/opencode/skills
```

## Nushell

Nushell remains an implementation language for many commands, but there is no grouped native `use strap` module. The supported integration boundary is the normal process surface: `strap <command>` reads JSON from stdin and writes JSON to stdout.

```nu
strap state init
| to json
| ^strap agents apply chat-concise
| from json
| to json
| ^strap skills apply concise
| from json
```

Command-local `run.nu` files are implementation modules used by their owning executable `run` scripts. They are not a public import surface.

## MCP Servers

Each server speaks MCP over stdio:

```bash
strap mcp fs
strap mcp process
strap mcp web
strap mcp agent
strap mcp json_echo
strap mcp fs,process,json_echo
```

`strap mcp all` exposes local Strap tool groups only. The `jsmcp` group is available only when explicitly requested.

## jsmcp

`strap` can call installed `jsmcp` through the `jsmcp` tool group. It uses the local jsmcp HTTP API and stores discovery memory in canonical state.

```bash
strap state init \
| strap one-shot run "List configured jsmcp servers" --tools jsmcp
```

Available bridge tools:

- `jsmcp.list_servers`
- `jsmcp.list_tools`
- `jsmcp.execute_code`
- `jsmcp.fetch_logs`
- `jsmcp.clear_logs`

The jsmcp config may be YAML or JSON. This bridge does not parse it; `jsmcp` does.

## Zettelkasten

`strap zk` stores notes as markdown under `.strap/zettel` or `.strap-user/zettel`, presented as one overlayed zettelkasten. Inline `[[wikilinks]]` provide links/backlinks, and SQLite, FTS5, and `sqlite-vec` are used as a derived index for text/vector/hybrid search.

```bash
STRAP_ZK_EMBED_PROVIDER=hash strap zk create \
  --scope user \
  --title 'Local agent memory' \
  --body 'Agents can store and recall semantically related notes.' \
  --tags strap,memory

STRAP_ZK_EMBED_PROVIDER=hash strap zk search-hybrid 'semantic recall'
strap zk backlinks 'Local agent memory'
```

Agents get the same capability through the grouped `zk.*` tools. See `docs/zettelkasten.md`.

Embeddings can use `OPENAI_API_KEY`, the deterministic hash provider, or the local ChatGPT subscription OAuth path:

```bash
STRAP_ZK_EMBED_PROVIDER=chatgpt strap zk search-hybrid 'semantic recall'
```

## Models

Model profiles are JSON files containing `model_id`, provider, auth, endpoint, and default parameters. Runtime commands default to `--model current`. Checked-in configs live in `config/strap/models/`, with `current.json` as a Linux symlink to the selected model profile.

```bash
strap model list
strap model show current

strap state init \
| strap state add-user "Say hi" \
| strap llm complete
```

See `docs/providers.md`.

For gpt-5.5 over ChatGPT subscription credentials:

```bash
strap provider chatgpt auth login

# Or, as a temporary migration path from an existing Codex login:
strap provider chatgpt auth import-codex
```

```bash
strap state init \
| strap state add-user "Analyze this repo" \
| strap loop --tools all --max-turns 6 \
| tee session.json \
| strap state display-last-message
```

## Script Tools

Executable files in `tools/` become model-callable tools. A script receives JSON input on stdin and writes stdout as the tool result.

Each tool artifact is a grouped directory with action metadata:

```text
tools/example/
  run
  desc
  meta.json
```

`meta.json` maps action names to model-facing metadata. `meta/<action>.json` is also supported.

```json
{
  "name": "say_hello",
  "description": "Say hello to a person.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": {"type": "string", "description": "Person to greet"}
    },
    "required": ["name"],
    "additionalProperties": false
  }
}
```

This keeps the `ai-say` idea of shell-authored tools, but avoids `{{arg}}` string interpolation by passing structured JSON through stdin.

## Canonical State

The active format is `strap.state.v0.2`:

```json
{
  "version": "strap.state.v0.2",
  "actors": {},
  "root": {
    "type": "scope",
    "label": "root",
    "status": "open",
    "participants": ["user", "assistant", "harness"],
    "children": []
  }
}
```

The active format is the actor/event/scope shape.

## Documentation Map

- `DESIGN.md`: concise current design summary.
- `docs/vision.md`: vision, design principles, non-goals, strategic priorities.
- `docs/architecture.md`: roots, command flow, isolation notes, state, loops, tools, providers, sessions, memory, subprojects.
- `docs/state-format.md`: canonical `strap.state.v0.2` format specification.
- `docs/organization.md`: repository, `.strap`, and `.strap-user` organization.
- `docs/commands.md`: command contract and built-in command reference.
- `docs/providers.md`: model profiles and auth modes.
- `docs/daily-use.md`: daily project-local workflow.
- `docs/zettelkasten.md`: shared memory CLI and agent tool.
- `docs/jsmcp.md`: jsmcp bridge.
- `docs/implemented.md`: implemented capability inventory.
- `docs/original-vision-gaps.md`: remaining hardening/product gaps.
