# Subprojects

`strap` is organized as a set of capability subprojects rather than one monolithic CLI.

- `cli/`: filesystem-discovered command runner and built-in command directories.
- `core/`: canonical state, path resolution, CLI I/O, layered artifact/profile/skill helpers, and agent state helpers.
- `providers/`: provider configs, request compilation/calls, streaming, and auth.
- `loop/`: Node model/tool loop.
- `tools/`: built-in tool registry and tool implementations.
- `mcp/`: bundled stdio MCP servers.
- `jsmcp/`: bridge to installed `jsmcp client`.
- `porcelain/`: runner for model-editable Nushell porcelain modules.
- `zettel/`: markdown-source zettelkasten, derived SQLite/FTS/vector index, and embedding helper.
- `sessions/`: `.strap` project artifact and `.strap-user` local work/session CLIs.
- `policy/`: authority decision model and policy CLI.
- `state-bb/`: Babashka pure-state prototype.

Subprojects group code by capability, not implementation type. Public access should still go through `strap <command>` unless a developer is working directly on internals.
