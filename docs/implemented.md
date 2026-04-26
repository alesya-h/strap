# Implemented Capabilities

This document records what `strap` currently implements.

## Core Harness

- Provider-agnostic canonical state format using actors, events, and scopes: `strap.state.v0.2`.
- Filesystem-discovered `strap <command>` interface with command-local docs, completions, and inner helpers.
- Root/config/work path model via `STRAP_ROOT`, `STRAP_CONFIG`, and `STRAP_WORK`.
- Immutable JSON filter CLIs for state transforms and harness operations.
- Basic scope operations for opening/collapsing context regions.
- Basic agent fork/fold commands.

## CLIs

- `strap`: main command runner, with commands discovered from project, config, and built-in command directories.
- `strap state`: initialize, append user/assistant messages, push/pop scopes, display last message.
- `strap llm`: compile state into provider requests and call configured providers.
- `strap loop`: run model/tool loops over canonical state.
- `strap loop-nu`: run the editable Nushell reference loop through the command runner.
- `strap run-calls`: execute pending tool requests in canonical state.
- `strap agent`: fork/fold agent state.
- `strap mcp`: run bundled stdio MCP servers.
- `strap porcelain`: discover and run Nushell porcelain modules.
- `strap zk`: shared zettelkasten CLI backed by SQLite, FTS5, and sqlite-vec.
- `strap commands`: list and scaffold filesystem-discovered commands.
- `strap work`: initialize and inspect project-local `.strap` work directories.
- `strap session`: create, update, show, save, list, and trace sessions.
- `strap policy`: list and inspect static policy configs.
- `strap sandbox`: run commands through bubblewrap profiles.
- `strap state-bb`: Babashka prototype for pure state transforms.

## Providers

- Provider config files describe provider, endpoint, model, auth, and parameters.
- OpenAI API-key route exists.
- OpenRouter chat completions route exists.
- Anthropic Messages route exists.
- Codex-style ChatGPT OAuth auth loading exists, but direct public `/v1/responses` is blocked by missing scopes.
- gptel ChatGPT OAuth route works for `gpt-5.5` via `https://chatgpt.com/backend-api/codex/responses`.
- ChatGPT subscription OAuth token also works for embeddings through `https://api.openai.com/v1/embeddings`.

## Tooling

- Filesystem tools.
- Process/Nushell/tmux-oriented process tools.
- Web fetch/search-style tools.
- Agent/context tools.
- Script tool discovery from `tools/` and `STRAP_SCRIPT_TOOLS`.
- Script tools receive JSON on stdin and expose model-facing sidecar JSON schemas.

## MCP And jsmcp

- Bundled stdio MCP servers for filesystem, process, web, agent, and scripts.
- jsmcp bridge tool group using installed `jsmcp client`.
- Bridge tools:
  - `jsmcp_list_servers`
  - `jsmcp_list_tools`
  - `jsmcp_execute_code`
  - `jsmcp_fetch_logs`
  - `jsmcp_clear_logs`
- Tested Kagi search through jsmcp.
- MCP stdio client uses newline-delimited JSON framing for this environment.

## Porcelain

- Stable Nushell plumbing in `nu/plumbing.nu`.
- Ergonomic Nushell wrappers in `nu/strap.nu`.
- Starter porcelain modules in `porcelain/`.
- Porcelain is path/name-discovered, not centrally registered.
- Porcelain can be run immediately as immutable state filters.
- Basic trace/provenance helper exists in starter porcelain.

## Zettelkasten

- `strap zk` is a Nushell CLI around the `sqlite3` CLI, so NixOS sqlite extension loading works.
- SQLite WAL mode and 5 second busy timeout are used for multi-agent concurrency.
- FTS5 text search.
- sqlite-vec vector search.
- Hybrid text/vector search.
- Related-note search.
- List, delete, tags, and backlink commands.
- Remember latest assistant output from a state as a note.
- Typed links between notes.
- Tags and aliases stored on notes.
- Automatic synchronous indexing on create/update.
- Embedding providers:
  - OpenAI API key.
  - ChatGPT subscription OAuth via gptel provider config.
  - Deterministic local hash provider for offline tests.
  - Custom embedding command via `STRAP_ZK_EMBED_CMD`.
- Agent-facing `zk` script tool.
- Smoke-tested concurrent writes.

## Documentation

- `README.md`: current feature overview and usage examples.
- `DESIGN.md`: canonical state and original design direction.
- `docs/organization.md`: root/config/work organization and command-directory contract.
- `docs/providers.md`: provider config and auth notes.
- `docs/jsmcp.md`: jsmcp bridge and Kagi smoke test notes.
- `docs/self-modifying-porcelain.md`: porcelain/plumbing self-modification model.
- `docs/zettelkasten.md`: shared semantic memory usage.
- `docs/reference-tool-ux.md`: reference harness/tool UX analysis.
- `docs/aiden-notes.md`: notes from the older Ruby self-modifying harness.

## Validation

- `npm test` passes.
- `npm run check` validates Node syntax and Nushell source loading.
- Smoke tests cover canonical state transforms, provider request compilation, script tools, porcelain, and offline zettelkasten search.
