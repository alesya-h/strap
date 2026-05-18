# Repository Organization

`strap` now uses a unified artifact layer path and a filesystem command surface.

## Layers

- `STRAP_PATH`: colon-separated artifact layer roots. Entries may be unnamed paths or `name=/path` entries.
- `STRAP_WORKSPACE`: filesystem workspace that tools operate in. It defaults to the current working directory.

When `STRAP_PATH` is absent, the runner resolves implicit named layers in this order when available:

```text
session=<active session>/overlay
user=<nearest .strap-user>
project=<nearest .strap>
global=$XDG_CONFIG_HOME/strap
root=<installed strap root>
```

When `STRAP_PATH` is set, its entries are used first and missing implicit named layers are appended. The root layer is therefore available without listing it explicitly. An unnamed entry is a plugin layer; a named entry such as `project=/tmp/project-layer` gives the layer a stable role.

Inspect resolution with:

```bash
strap layers
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
  inner/              private helper scripts, callable only through `strap inner`
  hide                hide from default command list while remaining callable
  wd                  optional executable that prints command cwd
```

Use public commands for the user/agent surface, hidden commands for implementation commands that still need command identity, and `inner/` only for helpers private to one command. For example, `strap provider` is public while `provider-chatgpt` is hidden; `strap zk` is public while `strap inner zk index ...` is private implementation plumbing.

Resolution order follows `STRAP_PATH`: leftmost layer wins, and root is the implicit fallback. Every layer has the same artifact subdirectories:

```text
commands/
tools/
agents/
skills/
models/
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
strap commands list --all
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
```

For global home-directory overlays, use `~/.config/strap` or include `global=/path` in `STRAP_PATH`.

## Project And User Work

Project-shared artifacts live in:

```text
my-project/.strap/
  agents/
  skills/
  models/
  commands/
  tools/
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
  zettel/
  config/
```

This directory should be ignored by the project VCS. It is where sessions, caches, logs, private memory, and project-user generated commands/tools belong.

Agents, skills, models, commands, and tools use session/user/project/global/root overlays. Inspect overlays with `strap status` or `strap artifact status`, create working copies with `strap artifact workon <type> <name>`, and promote agent/skill/model/command/tool artifacts one layer at a time with `strap artifact promote <type> <name>`. Zettel notes still use the user/project overlay through `strap zk promote <note>`.

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
open state.json | to json | ^strap session save
```

## Command Examples

Use:

```bash
strap state init
strap llm complete
strap loop --tools all
strap zk search-hybrid "semantic recall"
```
