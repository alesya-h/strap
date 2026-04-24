# Modular agentic harness

`strap` is a unix-ish agent harness scaffold. The repo currently contains:

- A provider-agnostic canonical state format based on actors, events, and scopes.
- Node CLIs for state editing, provider request compilation, agent fork/fold, and pending tool execution.
- Stdio MCP servers for filesystem, process/tmux/nushell, web, and agent/context primitives.
- A reference analysis note in `docs/reference-tool-ux.md`.

## Quick Start

```bash
npm test
node bin/strap-state.js init state.json
node bin/strap-state.js add-user state.json "Inspect this repo"
node bin/strap-llm.js compile-openai state.json --tools all
node bin/strap-mcp.js fs
```

## MCP Servers

Each server speaks MCP over stdio:

```bash
node mcp-servers/fs.js
node mcp-servers/process.js
node mcp-servers/web.js
node mcp-servers/agent.js
```

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
