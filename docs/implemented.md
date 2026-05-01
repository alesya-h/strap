# Implemented Capabilities

This document records what `strap` currently implements.

## Core Harness

- Provider-agnostic canonical state format using actors, events, and scopes: `strap.state.v0.2`.
- Filesystem-discovered `strap <command>` interface with command-local docs, completions, and inner helpers.
- Root/config/project/work/workspace path model via `STRAP_ROOT`, `STRAP_CONFIG`, `STRAP_PROJECT`, `STRAP_WORK`, and `STRAP_WORKSPACE`.
- Immutable JSON filter CLIs for state transforms and harness operations.
- Grouped `use strap`-style Nu module plus Nu-first local plumbing with closure-based event and context combinators.
- Basic scope operations for opening/collapsing context regions.
- Bookmark-based state extraction into `strap.context.v0.1`.
- Quoted context rendering with `strap context quote`.
- One-shot-backed context summarization with `strap context summarize`.
- Basic agent fork/fold commands.
- Generic layered artifact model for command, tool, model, agent, and skill artifacts.
- Markdown agent profiles as layered artifacts.
- Skill instruction bundles as layered artifacts.
- Model profiles as layered artifacts with symlinked `current.json` selection.
- `strap status` reports roots, layers, zettel status, and visible artifact overlays.
- `strap artifact workon/promote/discard/status` manages session/user/project/global/root overlays for commands, tools, models, agents, and skills.

## CLIs

- `strap`: main command runner, with commands discovered from project, config, and built-in command directories.
- `strap state`: initialize, append user/assistant messages, push/pop scopes, display last message.
- `strap llm`: compile state into model-profile requests and call configured providers.
- `strap loop`: run the Nushell model/tool loop over canonical state.
- `strap one-shot`: run a temporary child agent until its first final answer.
- `strap run-calls`: execute pending tool requests in canonical state.
- `strap agent`: fork/fold agent state.
- `strap agents`: list, show, apply, and import agent profiles.
- `strap skills`: list, show, apply, and import skill instruction bundles.
- `strap model`: list, show, select, and fork model profiles.
- `strap mcp`: run bundled stdio MCP servers.
- `strap nu`: inspect installed Nushell module paths and generated `use` lines.
- `strap artifact`: inspect and manage layered command/tool/model/agent/skill artifacts.
- `strap status`: inspect active roots, layers, and overlay status.
- `strap zk`: shared zettelkasten CLI backed by SQLite, FTS5, and sqlite-vec.
- `strap commands`: list and scaffold filesystem-discovered commands.
- `strap context`: render or quote extracted context.
- `strap provider`: run provider-specific operations and ChatGPT auth.
- `strap history`: manage jj-backed current-session state and overlay history.
- `strap work`: initialize and inspect project-shared `.strap` and user-local `.strap-user` directories.
- `strap session`: create, copy, update, show, save, list, and trace sessions.
- `strap sandbox`: run commands through bubblewrap profiles.
- `strap state-bb`: Babashka prototype for pure state transforms.

## Providers

- Provider config files describe provider, endpoint, model, auth, and parameters.
- OpenAI API-key route exists.
- OpenRouter chat completions route exists.
- Anthropic Messages route exists.
- Public OpenAI `/v1/responses` is API-key only in this harness; Codex/ChatGPT OAuth tokens are not compatible with that endpoint.
- ChatGPT/Codex-backend OAuth route works for `gpt-5.5` via `https://chatgpt.com/backend-api/codex/responses`, with tokens managed by `strap provider chatgpt auth`.
- ChatGPT subscription OAuth token also works for embeddings through `https://api.openai.com/v1/embeddings`.
- `strap provider <name>` dispatches to hidden provider implementation commands such as `provider-chatgpt`.
- REST-only provider implementations are Nushell capsules; ChatGPT is a Babashka capsule for OAuth/token logic.
- `strap embed` delegates provider-backed embeddings to `strap provider <name> embed`; the hash provider remains local and deterministic.

## Tooling

- Filesystem tools.
- Process/Nushell/tmux-oriented process tools.
- Web fetch/search-style tools.
- Agent/context tools.
- Tool group discovery from layered `tools/<group>/` artifact directories.
- Tool artifacts are grouped directories with `run`, `desc`, and action metadata in `meta.json` or `meta/<action>.json`.

## MCP And jsmcp

- Bundled stdio MCP servers for grouped Strap tools.
- MCP servers list tools through `strap tools` and execute through `strap run-calls`.
- jsmcp bridge tool group using the local jsmcp HTTP API with state-backed discovery memory.
- Bridge tools:
  - `jsmcp.list_servers`
  - `jsmcp.list_tools`
  - `jsmcp.execute_code`
  - `jsmcp.fetch_logs`
  - `jsmcp.clear_logs`
- Tested Kagi search through jsmcp.
- MCP servers use Content-Length stdio framing.

## Zettelkasten

- `strap zk` is a self-contained Babashka capsule around markdown notes and a command-private SQLite/FTS/vector index helper.
- Markdown-source notes under `.strap/zettel` and `.strap-user/zettel`.
- Transparent user overlay over project zettel notes, with `workon`, `promote`, `discard`, and `status`.
- Inline `[[wikilink]]` parsing with derived `links` and `backlinks`.
- Link diagnostics are included in normal `get`, `list`, `search`, create, and update output.
- SQLite WAL mode and 5 second busy timeout are used for the derived index.
- FTS5 text search.
- sqlite-vec vector search.
- Hybrid text/vector search.
- List, delete, tags, and search commands.
- Remember latest assistant output from a state as a note.
- Tags and aliases stored on notes.
- `search-hybrid` and `reindex` rebuild the derived SQLite FTS/vector index from markdown notes.
- Embedding providers:
  - OpenAI API key.
  - ChatGPT subscription OAuth via `strap provider chatgpt auth` token cache.
  - Deterministic local hash provider for offline tests.
  - Custom embedding command via `STRAP_ZK_EMBED_CMD`.
- Agent-facing `zk` script tool.
- Smoke-tested concurrent writes.

## Documentation

- `README.md`: current feature overview, quick start, and documentation map.
- `DESIGN.md`: concise current design summary.
- `docs/vision.md`: product thesis, principles, non-goals, and current priorities.
- `docs/architecture.md`: implementation architecture and subsystem map.
- `docs/state-format.md`: canonical `strap.state.v0.2` format specification.
- `docs/organization.md`: root/config/work organization and command-directory contract.
- `docs/commands.md`: command authoring, validation, and built-in command reference.
- `docs/providers.md`: model profile and auth notes.
- `docs/jsmcp.md`: jsmcp bridge and Kagi smoke test notes.
- `docs/zettelkasten.md`: shared semantic memory usage.
- `docs/reference-tool-ux.md`: reference harness/tool UX analysis.
- `docs/aiden-notes.md`: notes from the older Ruby self-modifying harness.
- `docs/original-vision-gaps.md`: remaining gaps and hardening work.

## Validation

- `npm test` passes.
- `strap project-check` validates MCP Node syntax and Nushell source loading.
- Smoke tests cover canonical state transforms, provider request compilation, script tools, and offline zettelkasten search.
