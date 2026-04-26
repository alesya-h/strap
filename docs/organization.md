# Repository Organization

`strap` now uses three roots and a filesystem command surface.

## Roots

- `STRAP_ROOT`: installed harness code root. In development this is the repository root.
- `STRAP_CONFIG`: static harness config. Defaults to `config/strap` in this repo when present.
- `STRAP_WORK`: mutable project work directory. Defaults to the nearest `.strap`, or `./.strap` if none exists.

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
  compgen             optional legacy completion
  inner/              private helper scripts
  hide                hide from default command list
  wd                  optional executable that prints command cwd
```

Resolution order lets project/user commands override built-ins:

```text
STRAP_COMMAND_PATH
$STRAP_WORK/commands
$STRAP_CONFIG/commands
$STRAP_ROOT/subprojects/cli/commands
```

Useful commands:

```bash
strap help
strap -a
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
  providers/
  tool-groups/
  policies/
  zettel/
  commands/
  tools/
  porcelain/
```

For a personal install, mirror this at `~/.config/strap` or set `STRAP_CONFIG`.

## Project Work

Project-local mutable state should live in:

```text
my-project/.strap/
  commands/
  sessions/
  tools/
  porcelain/
  zettel/
  logs/
  cache/
  branches/
  config/
```

`user/template/.strap` is a checked-in template for this shape.

## Compatibility

Existing commands such as `bin/strap-state.js` and `bin/strap-loop.js` still exist. The new built-in command directories call them for now.

The direction is to teach and use:

```bash
strap state init
strap llm complete --provider config/strap/providers/chatgpt-gptel.json
strap loop --provider config/strap/providers/chatgpt-gptel.json --tools all
strap loop-nu --provider config/strap/providers/chatgpt-gptel.json --tools all
strap zk search-hybrid "semantic recall"
```

instead of:

```bash
node bin/strap-state.js init
node bin/strap-loop.js ...
```
