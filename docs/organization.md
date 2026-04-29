# Repository Organization

`strap` now uses explicit roots and a filesystem command surface.

## Roots

- `STRAP_ROOT`: installed harness code root. In development this is the repository root.
- `STRAP_CONFIG`: static harness config. Defaults to `config/strap` in this repo when present.
- `STRAP_GLOBAL`: global home-directory artifacts. Defaults to `$XDG_CONFIG_HOME/strap`.
- `STRAP_PROJECT`: project-shared harness artifacts. Defaults to nearest `.strap`, or `$STRAP_WORKSPACE/.strap`.
- `STRAP_SESSION`: active session directory. The outer runner fills this from `$STRAP_WORK/sessions/current` only when the env var is absent.
- `STRAP_WORK`: user/agent-local mutable work directory. Defaults to nearest `.strap-user`, or `$STRAP_WORKSPACE/.strap-user`.

`STRAP_WORKSPACE` remains the filesystem workspace that tools operate in. It defaults to the current working directory.

Inspect resolution with:

```bash
strap paths
```

## Command Surface

The preferred interface is now:

```bash
strap <command> [args...]
```

Commands are directories with this shape:

```text
command-name/
  run                 executable public command
  desc                help text; first line is the list summary
  spec.yaml           optional carapace completion spec
  carapace-complete   optional dynamic completion
  compgen             optional shell completion script
  inner/              private helper scripts
  hide                hide from default command list
  wd                  optional executable that prints command cwd
```

Resolution order lets project/user commands override built-ins:

```text
STRAP_COMMAND_PATH
$STRAP_SESSION/overlay/commands
$STRAP_WORK/commands
$STRAP_PROJECT/commands
$STRAP_GLOBAL/commands
$STRAP_ROOT/subprojects/cli/commands
```

Useful commands:

```bash
strap help
strap -a
strap commands list --json
strap commands validate --json
strap commands new my-command
strap help zk
strap command-dir zk
strap inner carapace list-commands
strap edit zk
strap edit -d zk
```

## Static Config

Checked-in default config lives under:

```text
config/strap/
  config.json
  models/
  tool-groups/
  zettel/
  commands/
  tools/
  porcelain/
```

For global home-directory overlays, use `~/.config/strap` or set `STRAP_GLOBAL`.

## Project And User Work

Project-shared artifacts live in:

```text
my-project/.strap/
  agents/
  skills/
  models/
  commands/
  tools/
  porcelain/
  zettel/
  config/
```

This directory may be committed with the project. It is where generated capabilities should be promoted when they become part of the project.

User/agent-local runtime state lives in:

```text
my-project/.strap-user/
  agents/
  skills/
  models/
  sessions/
  logs/
  cache/
  branches/
  scratch/
  commands/
  tools/
  porcelain/
  zettel/
  config/
```

This directory should be ignored by the project VCS. It is where sessions, caches, logs, private memory, and project-user generated commands/tools/porcelain belong.

Agents, skills, models, commands, tools, and porcelain use session/user/project/global/root overlays. Inspect overlays with `strap status` or `strap artifact status`, create working copies with `strap artifact workon <type> <name>`, and promote agent/skill/model/command/tool/porcelain artifacts one layer at a time with `strap artifact promote <type> <name>`. Zettel notes still use the user/project overlay through `strap zk promote <note>`.

`user/template/.strap` and `user/template/.strap-user` are checked-in templates for this split.

Initialize it in a project with:

```bash
strap work init
```

Create and update sessions with:

```nu
strap session new "task name"
strap session ask "user request"
strap session show
open state.json | strap session save
```

## Command Examples

Use:

```bash
strap state init
strap llm complete
strap loop --tools all
strap loop-nu --tools all
strap zk search-hybrid "semantic recall"
```
