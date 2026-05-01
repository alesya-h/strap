# Original Vision Gaps

This document records the main pieces from the original `strap` vision that are not implemented yet, or are only partially implemented.

## Sandboxed Self-Modification

- Bubblewrap runner exists as `strap sandbox run --profile readonly -- command args...`, but integration is still shallow.
- No overlayfs/tmpfs speculative workspace runner yet.
- No per-branch least-privilege environment.
- No eBPF/seccomp/network restriction layer.
- No formal propose/test/approve/install workflow for generated capabilities.

Current state: generated porcelain can be written and run cheaply, and a basic bwrap command exists. Restricted modes should be enforced by the launch environment rather than command-owned metadata.

## Branch, Fold, And Context-Pop Semantics

- Basic fork/fold exists.
- Basic open/collapse scope exists.
- No robust branch comparison workflow.
- No automatic context compaction.
- No `context.pop` command that removes/replaces a scope while preserving summary semantics.
- Provider compilation does not yet deeply exploit collapsed scope structure.

Current state: the tree-shaped state model exists, but branch/context operations are still starter primitives.

## Deterministic Budgeting And Redaction

- No token-budget planner over canonical state.
- No deterministic pruning strategy.
- No automatic summarization strategy.
- No redaction layer for secrets or private actor state.
- No ZDR/replay-oriented proof that provider payloads contain only intended state.

Current state: provider state is kept out of canonical state, but budgeting/redaction discipline is manual.

## Provider Completeness

- OpenAI/ChatGPT is the most tested route.
- Anthropic and OpenRouter configs exist, but tool-use/result lowering needs more hardening.
- Gemini/Google provider lowering is not implemented.
- Bedrock provider lowering is not implemented.
- Attachments and multimodal input lowering are not implemented.
- Provider-specific cache/reasoning/safety metadata is not modeled beyond simple config passthrough.

Current state: enough provider support exists for working agent loops, but the original multi-provider projection vision is incomplete.

## Capsule Command Refactor

- The command model is only partially aligned with the original small, replaceable capability vision.
- Several public commands have been converted into self-contained capsules, but important commands still shell into shared Node entrypoints and libraries under `subprojects/*/src`.
- `inner/` is now reserved for command-private implementation helpers, callable only through `strap inner <command> <helper>`. It is appropriate for conceptually self-contained commands such as `zk`, not for cross-cutting families such as providers.
- Hidden commands are available through a `hide` file and should be used for implementation commands that need command identity without entering the visible command surface, for example `provider-chatgpt` behind `strap provider chatgpt ...`.

Completed slices:

- `bin/strap` is a shell exec wrapper into the Babashka `subprojects/strap-main` runner and no longer imports shared `#strap/*` libraries.
- Several root commands have Nu capsule implementations: `agent`, `agents`, `commands`, `context`, `model`, `nu`, `one-shot`, `paths`, `skills`, `state`, and `work`.
- `zk` is now a self-contained Babashka capsule over markdown notes, with a command-private Babashka SQLite/FTS/vector helper at `strap inner zk index`.
- `embed` exists as a public embedding facade. Local hash embeddings are implemented in the command; provider-backed embeddings route to `strap provider <name> embed`.
- `provider` now dispatches to hidden `provider-*` implementation commands, preserving a clean public surface while allowing provider-local command identity.
- Hidden provider commands now have provider-owned implementations: `provider-openai`, `provider-openrouter`, and `provider-anthropic` are Nushell REST capsules; `provider-chatgpt` is a Babashka capsule. The old provider and llm JS entrypoints, the provider-command library, and the bad intermediate shared runner have been removed.

Remaining slices:

1. Finish provider extraction: remove the remaining provider shared libraries after `loop` no longer imports them, and optionally turn each hidden provider directory into a formal small package if provider-specific dependencies are introduced.
2. Extract `artifact` and `status` into filesystem-oriented capsules and remove the shared artifact/status JS modules.
3. Extract `session` and `history` into capsules, preserving the existing file layout and jj-backed history behavior.
4. Extract tool execution (`run-calls` and tool registry behavior) into command/script-tool boundaries or another explicit capability surface.
5. Extract or rationalize `loop`, `llm`, `mcp`, `jsmcp`, and `porcelain` last, after provider and tool boundaries are stable.

Validation rule for each slice:

- Avoid `#strap/*` imports in capsule commands.
- Avoid direct execution of repo-local JS implementation entrypoints from commands.
- Compose through `strap <command>` or, for command-private helpers, `strap inner <command> <helper>`.
- Run `strap project-check` and `strap project-test` after each slice.

Course corrections from this refactor:

- Moving a monolith into a command directory is not enough. A capsule must have command-local ownership and readable internals, not a hidden shared runner by another name.
- `inner/` is for helpers that are private to one conceptually self-contained command. It fits `zk` because the index is an implementation detail of the zettelkasten. It does not fit providers, because each provider is its own capability with its own command identity.
- Hidden commands are the right tool for implementation commands that should remain callable through the command boundary but not appear in the normal user command surface. `provider-chatgpt` is hidden; `strap provider chatgpt ...` is public.
- REST-only providers should be implemented in Nushell by default. A provider should become a provider-local Node package only when it needs SDKs or package dependencies. ChatGPT uses Babashka because OAuth/token handling is richer local logic but still does not need a Node package.
- The command directory is the module boundary. If code needs helper files, put them under that command directory and use language-local modules. Keep code readable; capsule isolation is not an excuse for cramped scripts.
- Public facades such as `strap provider` and `strap embed` should route to provider-owned commands. They should not accumulate provider implementation logic.

## Historical Tool Context Snapshots

- Current events capture tool calls and results.
- The original design's full `_currently_available_tools` snapshot per assistant generation is not stored.
- Replay/audit can show what was called, but not exactly what tool environment was visible at each generation.

Current state: tool execution is structured, but tool-environment auditability is incomplete.

## Agent Loop Control Plane

- `strap loop` works, but remains a starter loop.
- `strap loop` has a total tool-call budget, turn limits, and finalization.
- Missing per-turn and per-session stop controls beyond basic limits.
- Missing rich trace output to stderr or structured trace state.
- Missing retry/backoff strategy.
- Missing named tool allowlist presets.
- Missing resumable loop metadata.

Current state: loops are usable for simple work, not yet a mature control plane.

## Self-Extension Provenance

- Trace helper exists, but provenance is not automatic.
- Generated porcelain/tool files are not tied to actor, source branch, validation command, or approval event by default.
- There is no durable installed-capability registry.
- There is no lifecycle distinction between temporary porcelain and approved installed capabilities.

Current state: provenance can be recorded manually, but it is not enforced or systematized.

## Zettelkasten Maturity

- No background indexer/outbox yet.
- No multi-chunk note splitting yet.
- Delete/list/tags/search commands exist.
- Inline wikilinks and backlinks exist, but graph traversal is still minimal.
- No backlink-rich result expansion beyond direct backlink/ambiguous mention reporting.
- No alias-weighted search/reranking.
- No conflict/merge story for concurrent semantic edits.
- No native MCP server for the zettelkasten.
- Memory writes are explicit through `strap zk` or the `zk` tool; there is no automatic note creation from full traces or completed tasks.

Current state: semantic memory is useful and shared, but it is an MVP.

## Human And Agent UX

- No TUI/web dashboard.
- No session browser.
- No agent run inspector.
- No convenient porcelain for common daily workflows beyond starter examples.
- No first-class packaging/install story for humans outside the repo.

Current state: the system is CLI-usable, but not polished as a daily product.

## Security And Capabilities

- Tool groups exist, but not per-agent/per-branch capabilities.
- jsmcp exposes whatever configured servers allow.
- There is no built-in access-control engine for read-only, networkless, repo-only, or memory-only agents.
- No approval boundary for high-risk tools beyond the surrounding host/client behavior.

Current state: capability separation is partly implemented, but restricted modes depend on operational isolation across tools, MCP/jsmcp, memory, auth, and self-modification.

## Persistence And Session Management

- State files are explicit JSON documents, and `strap session` provides a user-local session store under `$STRAP_WORK/sessions`.
- Session directories include `meta.json`, `state.json`, `trace.jsonl`, `provider-requests/`, `tool-results/`, `overlay/`, and session-local `.jj/` history.
- No index of sessions, branches, summaries, and zettelkasten references.
- No garbage collection/pruning story for old runs.

Current state: persistence is unix-explicit via files, `tee`, redirection, `save`, and user-local session files under `.strap-user`.

## Project/User Work Split

- `.strap` now represents project-shared harness artifacts.
- `.strap-user` now represents user/agent-local runtime state.
- `strap artifact promote` can move command/tool/porcelain/model/agent/skill overlays from session to user, user to project, project to global, and global to root, but promotion does not yet enforce diffs, provenance, validation hooks, or review.
- Basic jj-backed session history exists through `strap history`, but higher-level session branching/fold-back workflows are not built yet.
- Markdown-source zettelkasten commands exist with overlay promotion and backlinks, but there is no migration strategy, chunking model, or conflict story yet.

## Testing Gaps

- Provider-native tool-use lowering needs targeted tests.
- `strap loop` needs behavior tests for budget/stop/error cases.
- jsmcp smoke test is not in `npm test` because it depends on local config/services.
- ChatGPT subscription provider tests are manual because they depend on local auth.
- Zettelkasten has smoke tests, but not detailed schema/migration/search quality tests.

Current state: smoke coverage is good enough for scaffold confidence, not enough for hardening.
