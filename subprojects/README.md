# Subprojects

`strap` is organized as a set of capability subprojects rather than one monolithic CLI.

- `cli/`: filesystem-discovered command runner and built-in command directories.
- `core/`: canonical state, path resolution, CLI I/O, layered artifact/profile/skill helpers, and agent state helpers.
- `providers/`: legacy provider JS retained until dead-code cleanup; active providers live under `cli/commands/provider-*`.
- `loop/`: legacy location; active loop lives under `cli/commands/loop`.
- `tools/`: legacy location; active schemas/execution live under `cli/commands/tools` and `cli/commands/run-calls`.
- `mcp/`: bundled stdio MCP servers.
- `jsmcp/`: legacy stdio bridge location; active jsmcp integration uses the HTTP API from `run-calls`.
- `zettel/`: markdown-source zettelkasten, derived SQLite/FTS/vector index, and embedding helper.
- `sessions/`: `.strap` project artifact and `.strap-user` local work/session CLIs.
- `state-bb/`: Babashka pure-state prototype.

Subprojects group code by capability, not implementation type. Public access should still go through `strap <command>` unless a developer is working directly on internals.
