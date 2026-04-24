# Modular agentic harness

`strap` is a unix-ish agent harness scaffold. The repo currently contains:

- A provider-agnostic canonical state format based on actors, events, and scopes.
- Node CLIs for state editing, provider request compilation, agent fork/fold, and pending tool execution.
- Stdio MCP servers for filesystem, process/tmux/nushell, web, and agent/context primitives.
- Executable script tools discovered from `tools/` or `STRAP_SCRIPT_TOOLS`.
- A reference analysis note in `docs/reference-tool-ux.md`.

## Quick Start

```bash
npm test
node bin/strap-state.js init \
| node bin/strap-state.js add-user "Inspect this repo" \
| tee state.json \
| node bin/strap-llm.js compile-openai --tools all
node bin/strap-mcp.js fs
```

The main harness CLIs are immutable JSON filters: state comes in on stdin and the next state goes out on stdout. Persisting is explicit with `tee`, shell redirection, or Nushell `save`.

```bash
node bin/strap-state.js init \
| node bin/strap-state.js add-user "List files in the current directory" \
| node bin/strap-llm.js complete-openai --tools all \
| node bin/strap-run-calls.js --tools all \
| tee session.json \
| node bin/strap-state.js display-last-message
```

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

## MCP Servers

Each server speaks MCP over stdio:

```bash
node mcp-servers/fs.js
node mcp-servers/process.js
node mcp-servers/web.js
node mcp-servers/agent.js
node mcp-servers/scripts.js
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

Flat `messages` states from `DESIGN.md` are still normalized on read, but new CLIs write the actor/event/scope shape.
