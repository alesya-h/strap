# Command Authoring

The public extension API is a command directory.

```text
my-command/
  run                 executable public command
  desc                help text; first line appears in command lists
  command.json        optional machine-readable annotations
  spec.yaml           optional carapace completion spec
  carapace-complete   optional dynamic completion script
  compgen             optional shell completion script
  inner/              private helper scripts
  hide                hide from default command list
  wd                  optional executable that prints command cwd
```

Commands receive:

- `STRAP_ROOT`
- `STRAP_CONFIG`
- `STRAP_WORK`
- `STRAP_WORKSPACE`
- `STRAP_CMD_NAME`
- `STRAP_CMD_DIR`
- `STRAP_AUTHORITY_DECISION`

`command.json` can declare authority annotations:

```json
{
  "name": "example",
  "readOnly": true,
  "destructive": false,
  "openWorld": false
}
```

Create a project-local command:

```bash
strap commands new my-command
strap edit my-command
strap help my-command
```

List commands for humans or agents:

```bash
strap commands list
strap commands list --json
strap commands manifest zk
strap commands validate --json
```

Private helpers go in `inner/` and can be called with:

```bash
strap inner my-command helper-name arg1 arg2
```

## Built-in Commands

| Command | Purpose |
| --- | --- |
| `agent` | Fork and fold agent state. |
| `auth` | Authenticate local provider credentials, currently ChatGPT OAuth. |
| `carapace` | Install and serve shell completion integration. |
| `commands` | List, inspect, validate, and scaffold command directories. |
| `edit` | Edit or create command files. |
| `llm` | Compile, call, or complete provider requests from canonical state. |
| `loop` | Run the Node model/tool loop. |
| `loop-nu` | Run the editable Nushell reference loop. |
| `mcp` | Run bundled stdio MCP servers. |
| `paths` | Print resolved root/config/work/workspace paths. |
| `policy` | List, show, and evaluate policy decisions. |
| `porcelain` | List and run model-editable Nushell porcelain modules. |
| `run-calls` | Execute pending tool calls in canonical state. |
| `sandbox` | Run a command through a bubblewrap sandbox profile. |
| `session` | Create, inspect, update, recall memory into, and remember project-local sessions. |
| `state` | Initialize and transform canonical `strap.state.v0.2` JSON. |
| `state-bb` | Run the Babashka pure-state prototype. |
| `work` | Initialize or inspect the project-local `.strap` work directory. |
| `zk` | Use the shared SQLite/FTS5/sqlite-vec zettelkasten. |

Run `strap help <command>` for command-local usage text.

## Contract Status

The current command contract is intentionally small and file-oriented. The next hardening milestone is to freeze a v0 contract for:

- required files and executable bits;
- manifest shape;
- authority annotations;
- validation semantics;
- completion hooks;
- `inner/` helper behavior.
