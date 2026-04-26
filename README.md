# Modular agentic harness

`strap` is a unix-ish agent harness scaffold. The repo currently contains:

- A provider-agnostic canonical state format based on actors, events, and scopes.
- A filesystem-discovered `strap <command>` interface inspired by project-local `run` scripts.
- Separate harness, static config, and project work roots: `STRAP_ROOT`, `STRAP_CONFIG`, and `STRAP_WORK`.
- Subproject commands for state editing, provider request compilation, agent fork/fold, and pending tool execution.
- A git-like plumbing/porcelain split for model-authored Nu workflows.
- Stdio MCP servers for filesystem, process/tmux/nushell, web, and agent/context primitives.
- Executable script tools discovered from `tools/` or `STRAP_SCRIPT_TOOLS`.
- A shared SQLite/sqlite-vec zettelkasten CLI and script tool for agent memory.
- jsmcp bridge tools for programmable access to configured MCP servers.
- Provider config files for OpenAI, OpenRouter, Anthropic, Codex ChatGPT OAuth, and gptel ChatGPT OAuth auth.
- A reference analysis note in `docs/reference-tool-ux.md`.

## Quick Start

```bash
npm test
strap state init \
| strap state add-user "Inspect this repo" \
| tee state.json \
| strap llm compile-openai --tools all
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

Use `strap help`, `strap -a`, and `strap paths` to inspect the command surface and resolved roots. See `docs/organization.md`.

## Nushell

`nu/strap.nu` wraps the Node filters as native structured pipeline commands:

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

`strap zk` is a Nushell CLI backed by `sqlite3`, FTS5, and `sqlite-vec`. It creates notes, auto-indexes embeddings, and supports text, vector, hybrid, and related-note search.

```bash
STRAP_ZK_EMBED_PROVIDER=hash strap zk create \
  --title 'Local agent memory' \
  --body 'Agents can store and recall semantically related notes.' \
  --tags strap,memory

strap zk search-hybrid 'semantic recall'
```

The preferred command surface is also available:

```bash
STRAP_ZK_EMBED_PROVIDER=hash strap zk create \
  --title 'Local agent memory' \
  --body 'Agents can store and recall semantically related notes.' \
  --tags strap,memory

strap zk search-hybrid 'semantic recall'
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

For gpt-5.5 over ChatGPT subscription credentials from the local gptel fork:

```bash
strap state init \
| strap state add-user "Analyze this repo" \
| strap loop --provider config/strap/providers/chatgpt-gptel.json --tools all --max-turns 6 \
| tee session.json \
| strap state display-last-message
```

There is also an editable Nushell reference loop:

```bash
strap state init \
| strap state add-user "Analyze this repo" \
| strap loop-nu --provider config/strap/providers/chatgpt-gptel.json --tools all --max-turns 6 \
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
