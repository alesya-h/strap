# Launch Policy And Isolation

`strap` is flexibility-first. Command safety is not governed by command-owned metadata such as `readOnly`, `destructive`, or `openWorld`.

Restricted modes should be operational:

- run the command under Linux isolation, such as `bubblewrap`;
- mount filesystems read-only or with explicit writable overlays;
- use restricted MCP/jsmcp profiles;
- pass only the environment and credentials that mode should have.

## Policy Files

Policies live in:

```text
config/strap/policies/*.json
```

The current policy engine is a small launch-profile helper. Decision inputs are:

- command name;
- action: `execute`, `read`, or `write`;
- root classification for path decisions: `root`, `config`, `project`, `work`, `workspace`, or `outside`.

Inspect decisions:

```bash
strap policy list
strap policy show readonly
strap policy decide --policy readonly --action execute --command zk
strap policy decide --policy readonly --action write --path .strap-user/state.json
```

Commands receive the decision as JSON in `STRAP_AUTHORITY_DECISION`, but the decision is not a security boundary by itself.

## Sandbox Execution

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
    "commands": {"allow": ["commands", "paths", "policy"]},
    "read_roots": ["root", "config", "project", "work", "workspace"],
    "write_roots": ["work"]
  }
}
```

## Current Boundary

The current policy layer can classify command execution and explicit path read/write decisions. It does not inspect or trust command manifests for effect claims.

Readonly or restricted operation should be treated as real only when the surrounding launch environment enforces it. Tool implementations, MCP servers, jsmcp servers, provider auth, zettelkasten writes, session writes, and self-modified porcelain are powerful unless the process environment constrains them.
