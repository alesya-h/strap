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
