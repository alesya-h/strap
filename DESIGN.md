# Strap Design

`strap` is a unix-ish, multi-language agent harness. It is organized around explicit state, filesystem-discovered commands, and small composable effect adapters.

## Roots

`strap` resolves three main roots:

- `STRAP_ROOT`: installed harness code root.
- `STRAP_CONFIG`: static harness config, normally `config/strap` or `~/.config/strap`.
- `STRAP_WORK`: mutable project work directory, normally nearest `.strap`.

`STRAP_WORKSPACE` is the filesystem workspace tools operate in. It defaults to the current directory.

## Command Surface

The public interface is:

```bash
strap <command> [args...]
```

Commands are directories discovered from:

```text
STRAP_COMMAND_PATH
$STRAP_WORK/commands
$STRAP_CONFIG/commands
$STRAP_ROOT/subprojects/cli/commands
```

Command shape:

```text
command-name/
  run
  desc
  spec.yaml
  carapace-complete
  compgen
  inner/
  hide
  wd
```

The command-directory model lets humans and agents add project-specific commands without editing a central parser.

## Canonical State

The canonical state format is `strap.state.v0.2`.

```json
{
  "version": "strap.state.v0.2",
  "actors": {
    "user": {
      "kind": "human",
      "self": {"public": "The user driving the work."},
      "peers": {
        "assistant": {"contract": "Collaborate directly."}
      }
    },
    "assistant": {
      "kind": "agent",
      "self": {
        "public": "A pragmatic software agent.",
        "private": "Compile provider calls from canonical state."
      },
      "peers": {
        "user": {"contract": "Solve the task end-to-end when feasible."},
        "harness": {"contract": "Use tool calls as structured actor communication."}
      }
    }
  },
  "root": {
    "type": "scope",
    "label": "root",
    "status": "open",
    "participants": ["user", "assistant", "harness"],
    "children": []
  }
}
```

Events represent communication:

```json
{
  "type": "event",
  "from": "assistant",
  "to": ["harness"],
  "kind": "tool_request",
  "text": "I need to inspect files.",
  "calls": [
    {"tool": "glob_files", "input": {"pattern": "**/*.js"}}
  ]
}
```

Scopes represent branchable or compactable regions:

```json
{
  "type": "scope",
  "label": "explore parser rewrite",
  "status": "collapsed",
  "participants": ["assistant", "harness"],
  "summary": "Parser rewrite is feasible but needs tokenizer cleanup first.",
  "children": [],
  "hidden": {"children": []}
}
```

Provider request payloads are compiled projections. Provider-managed continuation state is not canonical state.

## Language Split

- Nu: porcelain workflows, human command composition, reference loops, sqlite CLI orchestration.
- Node: provider calls, streaming, MCP/jsmcp, SDK-heavy protocol glue.
- Babashka/Clojure: planned home for pure state/config/session/policy engines.

## Porcelain

Porcelain is model-editable Nushell workflow code. It composes stable plumbing and effect adapters.

Properties:

- cheap to write and discard
- project-local by default when useful
- runnable immediately through `strap porcelain`
- traceable through state events
- isolated later by sandbox/capability boundaries

## Self-Extension

Self-extension means adding ordinary files:

1. create a command, tool, or porcelain module
2. run it against a fork or test state
3. record provenance in state when useful
4. keep it project-local or promote it to config/built-in code

There is no hidden eval-and-persist lane.

## Safety Direction

The flexible core assumes commands and porcelain can mutate files. The safety boundary should be outside that layer:

- bubblewrap
- overlayfs/tmpfs
- least-privilege MCP/jsmcp servers
- tool-group policies
- network/process/filesystem restrictions

## Zettelkasten

The shared memory layer is `strap zk`:

- SQLite WAL
- FTS5
- sqlite-vec
- text/vector/hybrid search
- typed links
- tags and aliases
- ChatGPT/OpenAI/hash/custom embeddings

It is exposed as both a human CLI and an agent script tool.
