# Command Authoring

The public extension API is a command directory.

```text
my-command/
  run                 executable public command
  desc                help text; first line appears in command lists
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
```

Private helpers go in `inner/` and can be called with:

```bash
strap inner my-command helper-name arg1 arg2
```
