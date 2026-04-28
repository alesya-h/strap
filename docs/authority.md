# Authority Model

Every `strap <command>` execution receives an authority decision before it is spawned.

Policies live in:

```text
config/strap/policies/*.json
```

Decision inputs:

- command name
- command annotations from `command.json`
- action: `execute`, `read`, or `write`
- root classification: `root`, `config`, `work`, `workspace`, or `outside`

Inspect policy decisions:

```bash
strap policy list
strap policy show readonly
strap policy decide --policy readonly --action execute --command zk
strap policy decide --policy readonly --action write --path .strap/state.json
```

Commands receive the decision as JSON in `STRAP_AUTHORITY_DECISION`.

Sandbox execution is exposed through:

```bash
strap sandbox run --profile readonly -- command args...
```

The current sandbox implementation requires `bwrap`.

## Policy Shape

Policies are JSON files with a `rules` object. Current fields include:

```json
{
  "name": "readonly",
  "rules": {
    "execute": "sandbox",
    "destructive": "deny",
    "commands": {"allow": ["commands", "paths", "policy"]},
    "read_roots": ["root", "config", "work", "workspace"],
    "write_roots": ["work"]
  }
}
```

Command annotations from `command.json` can mark a command as:

- `readOnly`
- `destructive`
- `openWorld`

The first implemented destructive check denies commands annotated `destructive: true` when the policy sets `destructive: "deny"`.

## Current Enforcement Boundary

Authority is currently enforced before `strap <command>` and `strap inner ...` spawn an executable. `strap policy decide` also evaluates explicit `read` and `write` path decisions.

This is not yet complete end-to-end sandboxing. The following effect paths still need an authority-closure audit:

- built-in tool implementations;
- MCP server operations;
- jsmcp server/tool operations;
- provider auth token writes;
- zettelkasten writes;
- session writes;
- generated/self-modified commands and porcelain.

Until that audit is complete, treat policies as an active first-pass boundary plus documentation of intent, not as a full security guarantee.

## Readonly Goal

The intended hardening target is an end-to-end `readonly` mode that can inspect, search, recall, and explain without mutating outside allowed roots. This should include commands, tools, MCP/jsmcp, memory, auth files, and sandbox behavior.
