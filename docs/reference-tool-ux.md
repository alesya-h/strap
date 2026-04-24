# Reference Tool UX Notes

I reviewed Claude Code, Codex, OpenCode, pi-mono, and forgecode for model-facing tool UX.

## Converged Patterns

The useful common shape is a declarative tool contract:

```json
{
  "name": "read_file",
  "description": "Read a file with line-numbered pagination",
  "inputSchema": { "type": "object", "properties": {} },
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "openWorldHint": false
  }
}
```

Adopted here:

- Small Unix-like primitives beat one giant shell: `read_file`, `glob_files`, `grep_files`, `edit_file`, `write_file`, `shell`.
- Mutating operations are separate and explicit; `write_file` requires `overwrite=true` for existing files.
- Search tools wrap `rg` semantics because that is what agents already learn well.
- Shell takes `workdir`, `timeout_ms`, `max_output_bytes`, and `description` for auditability.
- Dynamic and external tools should be namespaced rather than blended into core names.
- Tool execution returns content plus metadata; large output is truncated before model exposure.
- Bubblewrap is a runtime option for read-only filesystem execution, not a prompt-only promise.

Deferred for later:

- Interactive permission prompts and persistent policy rules.
- Tool-search/deferred exposure once the tool count is high enough to justify it.
- Persistent process sessions and stdin continuation.
- LSP, browser automation, and external service toolsets.

## Format Implications

The shared ChatGPT format discussion changes the state direction from a flat message log to a nested actor/event/scope model:

- Actors are first-class: user, assistant, harness, subagents, editors, interpreters, remote agents.
- Events are actor-to-actor communication: `from`, `to`, `kind`, `text`, `calls`, `results`.
- Tool calls are structured communication, not a unique role.
- Scopes represent branchable or compactable regions.
- Collapsed scopes expose `summary` and retain the full subtree under `hidden`.
- Provider requests remain compiled projections, never canonical state.
