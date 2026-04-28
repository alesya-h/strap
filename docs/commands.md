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
- `STRAP_PROJECT`
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

Create a user-local temporary command under `.strap-user/commands`:

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
| `artifact` | Inspect and manage layered command/tool/porcelain artifacts. |
| `auth` | Authenticate local provider credentials, currently ChatGPT OAuth. |
| `carapace` | Install and serve shell completion integration. |
| `commands` | List, inspect, validate, and scaffold command directories. |
| `edit` | Edit or create command files. |
| `history` | Manage jj-backed user-local strap history. |
| `llm` | Compile, call, or complete provider requests from canonical state. |
| `loop` | Run the Node model/tool loop. |
| `loop-nu` | Run the editable Nushell reference loop. |
| `mcp` | Run bundled stdio MCP servers. |
| `paths` | Print resolved root/config/project/work/workspace paths. |
| `policy` | List, show, and evaluate policy decisions. |
| `porcelain` | List and run model-editable Nushell porcelain modules. |
| `run-calls` | Execute pending tool calls in canonical state. |
| `sandbox` | Run a command through a bubblewrap sandbox profile. |
| `session` | Create, inspect, update, save, list, and trace user-local project sessions. |
| `state` | Initialize and transform canonical `strap.state.v0.2` JSON. |
| `state-bb` | Run the Babashka pure-state prototype. |
| `status` | Show roots, layers, and overlayed artifact status. |
| `work` | Initialize or inspect `.strap` project artifacts and `.strap-user` local work. |
| `zk` | Use the shared markdown-source zettelkasten with a derived SQLite/FTS/vector index. |

Run `strap help <command>` for command-local usage text.

## Layered Artifacts

Commands, script tools, and porcelain modules can be inspected and moved through the user/project overlay lifecycle:

```bash
strap status
strap artifact status command
strap artifact workon porcelain basic
strap artifact promote porcelain basic
strap artifact discard porcelain basic
```

`workon` creates a user-layer working copy, `promote` writes that copy into the project layer and clears the overlay, and `discard` removes the user-layer copy.

## Bookmark Addressability

Canonical state does not require permanent IDs on every event. When an agent needs a stable handle, it can place optional inline bookmarks on visible messages/scopes:

```bash
strap state bookmark add --text "unique substring" --label fold-start < state.json > next.json
strap state bookmark list < next.json
strap state fold --from bm_start --to bm_end --summary "summary" < next.json > folded.json
```

The text match must be unique. If it is ambiguous, provide a longer substring. A range is always two single-node bookmarks.

## Contract Status

The current command contract is intentionally small and file-oriented. The next hardening milestone is to freeze a v0 contract for:

- required files and executable bits;
- manifest shape;
- authority annotations;
- validation semantics;
- completion hooks;
- `inner/` helper behavior.
