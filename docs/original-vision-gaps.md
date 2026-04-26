# Original Vision Gaps

This document records the main pieces from the original `strap` vision that are not implemented yet, or are only partially implemented.

## Sandboxed Self-Modification

- No bubblewrap runner yet.
- No overlayfs/tmpfs speculative workspace runner yet.
- No per-branch least-privilege environment.
- No eBPF/seccomp/network policy layer.
- No formal propose/test/approve/install workflow for generated capabilities.

Current state: porcelain can be written and run cheaply, but it runs with the caller's ambient authority.

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
- No deterministic pruning policy.
- No automatic summarization policy.
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

## Historical Tool Context Snapshots

- Current events capture tool calls and results.
- The original design's full `_currently_available_tools` snapshot per assistant generation is not stored.
- Replay/audit can show what was called, but not exactly what tool environment was visible at each generation.

Current state: tool execution is structured, but tool-environment auditability is incomplete.

## Agent Loop Control Plane

- `strap loop` works, but remains a starter loop.
- Missing total tool-call budgets.
- Missing per-turn and per-session stop policy controls beyond basic limits.
- Missing rich trace output to stderr or structured trace state.
- Missing retry/backoff policy.
- Missing named tool allowlist presets.
- Missing resumable loop metadata.

Current state: loops are usable for simple work, not yet a mature control plane.

## Self-Extension Provenance

- Trace helper exists, but provenance is not automatic.
- Generated porcelain/tool files are not tied to actor, source branch, validation command, or approval event by default.
- There is no durable installed-capability registry.
- There is no policy distinguishing temporary porcelain from approved installed capabilities.

Current state: provenance can be recorded manually, but it is not enforced or systematized.

## Zettelkasten Maturity

- No background indexer/outbox yet.
- No multi-chunk note splitting yet.
- No delete/list commands yet.
- No graph traversal commands beyond simple typed links and related search.
- No backlink-rich result expansion.
- No alias-weighted search/reranking.
- No conflict/merge policy for concurrent semantic edits.
- No native MCP server for the zettelkasten.
- No automatic note creation from agent traces or completed tasks.

Current state: semantic memory is useful and shared, but it is an MVP.

## Human And Agent UX

- No TUI/web dashboard.
- No session browser.
- No agent run inspector.
- No convenient porcelain for common daily workflows beyond starter examples.
- No first-class packaging/install story for humans outside the repo.

Current state: the system is CLI-usable, but not polished as a daily product.

## Security And Capability Policy

- Tool groups exist, but not per-agent/per-branch capabilities.
- jsmcp exposes whatever configured servers allow.
- No policy engine for read-only, networkless, repo-only, or memory-only agents.
- No approval boundary for high-risk tools beyond the surrounding host/client behavior.

Current state: capability separation is architectural intent, not fully implemented policy.

## Persistence And Session Management

- State files are explicit JSON documents, but there is no higher-level session store.
- No automatic run directory layout.
- No index of sessions, branches, summaries, and zettelkasten references.
- No garbage collection/pruning story for old runs.

Current state: persistence is unix-explicit via files, `tee`, redirection, and `save`.

## Testing Gaps

- Provider-native tool-use lowering needs targeted tests.
- `strap loop` needs behavior tests for budget/stop/error cases.
- jsmcp smoke test is not in `npm test` because it depends on local config/services.
- ChatGPT subscription provider tests are manual because they depend on local auth.
- Zettelkasten has smoke tests, but not detailed schema/migration/search quality tests.

Current state: smoke coverage is good enough for scaffold confidence, not enough for hardening.
