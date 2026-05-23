# Canonical State Format

Current version: `strap.state.v0.3`.

Canonical state is the provider-agnostic source of truth for an agent session. Provider payloads are compiled projections; provider continuation IDs are not canonical state.

## Top-level object

```json
{
  "version": "strap.state.v0.3",
  "actors": {
    "humans": {},
    "agents": {},
    "runtimes": {}
  },
  "root": {
    "type": "scope",
    "label": "root",
    "status": "open",
    "participants": [],
    "children": []
  }
}
```

`strap state init` intentionally emits empty actor groups. Projects or sessions can add local human/agent facts explicitly.

## Actors

Actors are grouped by kind instead of overloaded with transcript roles:

```json
{
  "actors": {
    "humans": {
      "alesya": {
        "self": {
          "public": "My name is Alesya. I'm autistic; be precise and reduce sycophancy."
        },
        "peers": {
          "coding-agent": "Please ask before doing anything risky."
        }
      }
    },
    "agents": {
      "coding-agent": {
        "self": {
          "public": "Software engineering agent for driving implementation.",
          "private": "Keep files under 150 lines. Write tests. Prefer immutable plain data."
        },
        "peers": {
          "alesya": "Prefers when I use jsmcp."
        }
      }
    },
    "runtimes": {}
  },
  "runtime": {
    "active_agent": "coding-agent"
  }
}
```

`self.public` is visible identity. `self.private` is model instruction material for agents. `peers` values may be strings or records with `contract`.

`strap agents apply <name>` writes to `actors.agents.<name>` and sets `runtime.active_agent`. `strap skills apply <name>` attaches skill fields to the active agent.

## Events

Events are ordered transcript messages produced by broad roles:

```json
{
  "type": "event",
  "from": "user",
  "kind": "message",
  "text": "Investigate the provider streaming issue."
}
```

Model-produced events use `from: "model"`, never `from: "assistant"`. When an active agent is known, model events include `agent`:

```json
{
  "type": "event",
  "from": "model",
  "agent": "coding-agent",
  "kind": "message",
  "text": "The issue is in the SSE decoder."
}
```

Harness events use `from: "harness"`. `to` is optional and not required for normal chat.

## Tool calls

Tool use is a model event with `kind: "tool_request"` and `calls`:

```json
{
  "type": "event",
  "from": "model",
  "agent": "coding-agent",
  "kind": "tool_request",
  "text": "",
  "calls": [
    {
      "id": "call_123",
      "tool": "json_echo.echo",
      "input": {"value": "hello"},
      "ok": true,
      "output": {
        "content": [{"type": "text", "text": "hello"}],
        "structuredContent": {"value": "hello"}
      }
    }
  ]
}
```

Tool results are attached to the call. Separate visible tool-result events are not required. `run-calls` skips calls where `ok` is already present.

## Scopes and collapsing

Scopes are storage/presentation structure:

```json
{
  "type": "scope",
  "label": "repo scan",
  "status": "open",
  "children": []
}
```

Collapsed scopes expose a harness summary while retaining hidden children:

```json
{
  "type": "scope",
  "label": "old context",
  "status": "collapsed",
  "summary": "Earlier context established the provider split.",
  "children": [],
  "hidden": {"children": []}
}
```

Provider compilation renders collapsed scopes as summary events and does not expose hidden children.

## Forks

Forking is represented as an `agent.fork` tool call, not as separate semantic fork/fold transcript events. Parent-visible state stores only the summary in the call output. The child transcript is retained for UI/debug/storage under `hidden.messages`:

```json
{
  "type": "event",
  "from": "model",
  "agent": "coding-agent",
  "kind": "tool_request",
  "text": "",
  "calls": [
    {
      "id": "fork_123",
      "tool": "agent.fork",
      "input": {"task": "Investigate the provider streaming issue."},
      "ok": true,
      "output": {"summary": "The child found buffered SSE decoding."},
      "hidden": {"messages": []}
    }
  ]
}
```

The parent model sees only the tool output summary.

## Bookmarks and extracted context

Bookmarks are optional inline addressability markers on events or scopes. They are created only when needed:

```bash
strap state bookmark add --text "unique substring" --label start < state.json > marked.json
strap state extract --from bm_start --to bm_end < marked.json > context.json
```

Extracted context remains `strap.context.v0.1`; its `source.state_version` is `strap.state.v0.3`. `strap context quote` returns a normal `strap.state.v0.3` state.

## Provider rendering

Provider adapters map canonical `from: "model"` events to provider assistant roles. All other visible events are rendered as user/input context unless the provider has a more specific native item type. The active agent frame from `actors.agents[runtime.active_agent]` becomes provider instructions/system content.

## Compatibility

`strap.state.v0.3` is the only canonical state format for this project. There are no legacy state fallbacks.
