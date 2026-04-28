# Modular agentic harness

`strap` is a Linux-first, unix-ish agent harness scaffold. The repo currently contains:

- A provider-agnostic canonical state format based on actors, events, and scopes.
- A filesystem-discovered `strap <command>` interface inspired by project-local `run` scripts.
- Separate harness, static config, project, user-work, and workspace roots: `STRAP_ROOT`, `STRAP_CONFIG`, `STRAP_PROJECT`, `STRAP_WORK`, and `STRAP_WORKSPACE`.
- Subproject commands for state editing, provider request compilation, agent fork/fold, and pending tool execution.
- Nu-first structured plumbing with a git-like plumbing/porcelain split for model-authored workflows.
- Stdio MCP servers for filesystem, process/tmux/nushell, web, and agent/context primitives.
- Executable script tools discovered from overlayed user/project/config/root tool dirs.
- A shared markdown-source zettelkasten CLI and script tool for agent memory, with inline wikilinks and a derived SQLite/sqlite-vec index.
- A generic layered artifact model for command, tool, and porcelain workon/promote/discard flows.
- Layered markdown agent profiles compatible with OpenCode-style frontmatter.
- Layered skill instruction bundles compatible with OpenCode-style `SKILL.md` directories.
- jj-backed user-local state history under `.strap-user`.
- jsmcp bridge tools for programmable access to configured MCP servers.
- Provider config files for OpenAI API keys, OpenRouter, Anthropic, and ChatGPT/Codex-backend OAuth auth.
- A reference analysis note in `docs/reference-tool-ux.md`.

Start with:

- [`docs/vision.md`](docs/vision.md): product thesis, principles, non-goals, priorities.
- [`docs/architecture.md`](docs/architecture.md): current implementation architecture.
- [`docs/commands.md`](docs/commands.md): command authoring and command reference.
- [`docs/authority.md`](docs/authority.md): policy/authority model and current limits.

## Quick Start

```bash
npm test
strap state init \
| strap state add-user "Inspect this repo" \
| tee state.json \
| strap llm compile-openai
strap mcp fs
```

The main harness CLIs are immutable JSON filters: state comes in on stdin and the next state goes out on stdout. Persisting is explicit with `tee`, shell redirection, or Nushell `save`.

```bash
strap state init \
| strap state add-user "List files in the current directory" \
| strap llm complete-openai --tools all \
| strap run-calls --tools all \
| tee session.json \
| strap state display-last-message
```

Use `strap help`, `strap -a`, `strap paths`, and `strap status` to inspect the command surface, resolved roots, and active overlays. See `docs/organization.md`.

Project-local daily workflow:

```bash
strap work init
strap session new "repo analysis"
strap session ask "Analyze this repo"
strap session show \
| strap loop-nu --provider config/strap/providers/chatgpt.json --tools all --max-turns 6 \
| tee session.json \
| strap session save
```

See `docs/daily-use.md`, `docs/commands.md`, `docs/authority.md`, and `docs/architecture.md`.

Run a one-shot agent over quoted context without mutating a session:

```nu
open state.json
| strap state extract --from bm_a --to bm_b
| strap context quote
| strap context summarize "Summarize only architectural decisions and unresolved risks" --agent chat-concise --skill concise --provider config/strap/providers/chatgpt.json --tools none
```

Agent profiles are layered artifacts:

```nu
strap agents list
strap agents show chat-concise
open state.json | strap agents apply chat-concise | save -f concise-state.json
strap agents import-opencode ~/.config/opencode/agents
```

Skill bundles layer the same way:

```nu
strap skills list
strap skills show concise
open state.json | strap skills apply concise | save -f concise-state.json
strap skills import-opencode ~/.config/opencode/skills
```

## Nushell

Use the grouped Nu module for the normal Nu-facing surface:

```nu
use '/path/to/strap/nu/strap'

strap state init
| strap agents apply chat-concise
| strap skills apply concise
```

If the module is installed on `NU_LIB_DIR`, the import can be shortened:

```nu
use strap
```

For development shells, expose it with:

```bash
NU_LIB_DIRS="$(strap nu lib-dir)" nu
```

`nu/plumbing.nu` is the preferred local data plumbing layer. It provides pure state transforms plus closure-based combinators; Node remains the adapter layer for provider, OAuth, MCP, jsmcp, and other protocol edges.

```nu
use '/path/to/strap/nu/plumbing.nu' *

open state.json
| with-events {|events| $events | where from == user }
```

```nu
open state.json
| with-extract bm_start bm_end {|ctx|
    $ctx.events | get text
  }
```

`strap nu modules` prints the installed Nu modules, `strap nu lib-dir` prints the directory to add to `NU_LIB_DIRS`, `strap nu use-line strap` prints the grouped module import, `strap nu path plumbing` prints the plumbing module path, and `strap nu use-line plumbing` prints a plumbing-only import line.

`nu/strap.nu` wraps the Node filters as native structured pipeline commands when an effectful adapter is needed:

```nu
use nu/strap.nu *

init
| add-user "List files in the current directory"
| complete-openai --tools all
| process-tools --tools all
| tee { save -f session.json }
| display-last-message
```

## Self-Modifying Porcelain

Porcelain modules in `porcelain/*.nu` are meant to be cheap for a model to write, rewrite, fork, and discard. The stable substrate lives in `nu/plumbing.nu` and the Node filter CLIs.

```bash
strap porcelain list
strap artifact workon porcelain basic
strap artifact promote porcelain basic

strap state init \
| strap porcelain run basic ask "List files" \
| strap porcelain run basic scope "repo scan"
```

See `docs/self-modifying-porcelain.md` for the design.

## MCP Servers

Each server speaks MCP over stdio:

```bash
node subprojects/mcp/servers/fs.js
node subprojects/mcp/servers/process.js
node subprojects/mcp/servers/web.js
node subprojects/mcp/servers/agent.js
node subprojects/mcp/servers/scripts.js
```

## jsmcp

`strap` can call installed `jsmcp` through the `jsmcp` tool group. By default it runs `jsmcp client`, matching the OpenCode config in `~/.config/opencode/opencode.jsonc`.

```bash
strap state init \
| strap porcelain run basic request-tool jsmcp_list_servers '{}' \
| strap run-calls --tools jsmcp
```

Available bridge tools:

- `jsmcp_list_servers`
- `jsmcp_list_tools`
- `jsmcp_execute_code`
- `jsmcp_fetch_logs`
- `jsmcp_clear_logs`

The jsmcp config may be YAML or JSON. This bridge does not parse it; `jsmcp` does.

## Zettelkasten

`strap zk` stores notes as markdown under `.strap/zettel` or `.strap-user/zettel`, presented as one overlayed zettelkasten. Inline `[[wikilinks]]` provide links/backlinks, and SQLite, FTS5, and `sqlite-vec` are used as a derived index for text/vector/hybrid search.

```bash
STRAP_ZK_EMBED_PROVIDER=hash strap zk create \
  --scope user \
  --title 'Local agent memory' \
  --body 'Agents can store and recall semantically related notes.' \
  --tags strap,memory

strap zk search-hybrid 'semantic recall'
strap zk backlinks 'Local agent memory'
```

Agents get the same capability through the `zk` script tool in the `scripts` tool group. See `docs/zettelkasten.md`.

Embeddings can use `OPENAI_API_KEY`, the deterministic hash provider, or the local ChatGPT subscription OAuth path:

```bash
STRAP_ZK_EMBED_PROVIDER=chatgpt strap zk search-hybrid 'semantic recall'
```

## Providers

Provider configs are JSON files containing provider, auth, endpoint, and model. Checked-in configs live in `config/strap/providers/`.

```bash
strap state init \
| strap state add-user "Say hi" \
| strap llm complete --provider config/strap/providers/openai-api-key.json
```

See `docs/providers.md`.

For gpt-5.5 over ChatGPT subscription credentials:

```bash
strap auth chatgpt login

# Or, as a temporary migration path from an existing Codex login:
strap auth chatgpt import-codex
```

```bash
strap state init \
| strap state add-user "Analyze this repo" \
| strap loop --provider config/strap/providers/chatgpt.json --tools all --max-turns 6 \
| tee session.json \
| strap state display-last-message
```

There is also an editable Nushell reference loop:

```bash
strap state init \
| strap state add-user "Analyze this repo" \
| strap loop-nu --provider config/strap/providers/chatgpt.json --tools all --max-turns 6 \
| tee session.json \
| strap state display-last-message
```

## Script Tools

Executable files in `tools/` become model-callable tools. A script receives JSON input on stdin and writes stdout as the tool result.

Add a sidecar JSON file, either `tools/name.json` or `tools/name.sh.json`, to define model-facing metadata:

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
  },
  "readOnly": true
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
- `docs/architecture.md`: roots, command flow, authority, state, loops, tools, providers, sessions, memory, subprojects.
- `docs/state-format.md`: canonical `strap.state.v0.2` format specification.
- `docs/organization.md`: repository, `.strap`, and `.strap-user` organization.
- `docs/commands.md`: command contract and built-in command reference.
- `docs/authority.md`: policy decisions, sandbox notes, and current enforcement caveats.
- `docs/providers.md`: provider config and auth modes.
- `docs/daily-use.md`: daily project-local workflow.
- `docs/zettelkasten.md`: shared memory CLI and agent tool.
- `docs/jsmcp.md`: jsmcp bridge.
- `docs/self-modifying-porcelain.md`: editable Nu porcelain model.
- `docs/implemented.md`: implemented capability inventory.
- `docs/original-vision-gaps.md`: remaining hardening/product gaps.
