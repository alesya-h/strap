# Canonical State Format

This document specifies the current canonical `strap` state format.

Current version: `strap.state.v0.2`.

## Purpose

Canonical state is the provider-agnostic source of truth for an agent session. It records actors, visible events, collapsible scopes, tool requests, tool results, memory context, and harness trace events.

Provider request payloads are compiled from canonical state. Provider-specific continuation IDs and response metadata may be recorded for audit, but they are not the canonical state model.

## Top-level object

```json
{
  "version": "strap.state.v0.2",
  "actors": {},
  "root": {
    "type": "scope",
    "label": "root",
    "status": "open",
    "participants": ["user", "assistant", "harness"],
    "children": []
  }
}
```

Fields:

| Field | Type | Required | Purpose |
| --- | --- | --- | --- |
| `version` | string | yes | Format identifier. Current value is `strap.state.v0.2`. |
| `actors` | object | yes | Actor definitions keyed by actor id. |
| `root` | scope | yes | Root scope containing events and nested scopes. |

`normalizeState` currently requires `root.type === "scope"`; older flat-message formats are not accepted.

## Actors

Actors describe humans, agents, and runtime participants.

```json
{
  "assistant": {
    "kind": "agent",
    "self": {
      "public": "A pragmatic software agent operating a unix-ish harness.",
      "private": "Keep provider-specific state out of canonical state; compile requests from this file."
    },
    "peers": {
      "user": {
        "contract": "Solve the task end-to-end when feasible; keep updates concise."
      }
    }
  }
}
```

Fields:

| Field | Type | Required | Purpose |
| --- | --- | --- | --- |
| `kind` | string | no | Actor class, such as `human`, `agent`, or `runtime`. |
| `self.public` | string | no | Visible self-description. |
| `self.private` | string | no | Private/instructional self-description used when compiling actor frame. |
| `peers` | object | no | Relationship metadata keyed by peer actor id. |
| `peers.*.public` | string | no | Visible description of peer relationship. |
| `peers.*.inferred` | string | no | Inferred relationship notes. |
| `peers.*.contract` | string | no | Behavioral contract toward that peer. |

Agent profiles applied by `strap agents apply <name>` may also set `agent`, `agent_profile`, and `permission` on an actor. The actor's `self.private` field receives the profile instruction body, so provider compilation includes it in the actor frame. Skills applied by `strap skills apply <name>` set `skills`, `skill_profiles`, and `skill_instructions`; provider compilation renders each applied skill as a named instruction block without replacing the agent profile.

When compiling provider requests, the selected actor frame is rendered into provider instructions/system content.

## Scope nodes

Scopes group events and other scopes.

```json
{
  "type": "scope",
  "label": "repo scan",
  "status": "open",
  "participants": ["assistant", "harness"],
  "children": []
}
```

Fields:

| Field | Type | Required | Purpose |
| --- | --- | --- | --- |
| `type` | string | yes | Must be `scope`. |
| `label` | string | yes | Human-readable scope name. |
| `status` | string | yes | `open` or `collapsed`. |
| `participants` | string[] | no | Actors involved in the scope. |
| `children` | array | yes for open scopes | Child events and scopes. |
| `summary` | string | for collapsed scopes | Replacement summary when hidden children are not shown. |
| `hidden.children` | array | no | Original children preserved after collapse. |

When a scope is collapsed, `flattenVisible` emits a synthetic harness summary event instead of its children:

```json
{
  "type": "event",
  "from": "harness",
  "to": ["assistant", "harness"],
  "kind": "summary",
  "text": "Summary text"
}
```

## Event nodes

Events record communication among actors.

```json
{
  "type": "event",
  "from": "user",
  "to": ["assistant"],
  "kind": "message",
  "text": "Analyze this repo."
}
```

Fields:

| Field | Type | Required | Purpose |
| --- | --- | --- | --- |
| `type` | string | yes | Must be `event`. Added automatically by `appendEvent`. |
| `from` | string | yes | Sender actor id. |
| `to` | string[] | no | Recipient actor ids. If absent, renderers treat it as `all`. |
| `kind` | string | no | Event kind. Defaults semantically to `message`. |
| `text` | string | no | Human-readable event body. |
| `calls` | array | no | Pending or completed tool calls requested by the assistant. |
| `results` | array | no | Optional result records. Current tool execution stores results on `calls[*]`. |
| `provider` | object | no | Provider response metadata for audit/debugging. |
| `hidden` | object | no | Non-rendered attached data, such as folded child state. |
| `bookmarks` | array | no | Optional inline addressability markers. |
| custom fields | any | no | Event kinds may add fields, such as `memories`. |

## Bookmarks

Bookmarks are optional inline attributes on event and scope nodes. They provide stable addressability only where an agent or human asks for it, without requiring permanent IDs on every message.

```json
{
  "type": "event",
  "from": "user",
  "to": ["assistant"],
  "kind": "message",
  "text": "Can agents fold this range?",
  "bookmarks": [
    {
      "id": "bm_te6nvs_b573",
      "label": "fold-start",
      "created_by": "assistant",
      "created_at": "2026-04-28T12:00:00.000Z"
    }
  ]
}
```

Bookmark IDs are generated as a short time-plus-random string. The current CLI shape is:

```bash
strap state bookmark add --text "unique substring" --label fold-start < state.json > next.json
strap state bookmark list < state.json
strap state bookmark remove bm_te6nvs_b573 < state.json > next.json
strap state show bm_te6nvs_b573 < state.json
strap state locate --text "unique substring" < state.json
```

`bookmark add` finds a unique visible text match and attaches the bookmark to that node. If the text is missing or ambiguous, the command fails and the caller should provide a longer substring.

Ranges are represented as two bookmarks:

```bash
strap state fold \
  --from bm_start \
  --to bm_end \
  --summary "Messages in this range established the folding API." \
  < state.json > next.json
```

Folding replaces sibling nodes between the two bookmarks with a collapsed scope and preserves the original nodes under `hidden.children`. Bookmarks inside the folded range remain attached to their original nodes inside `hidden.children`.

By default, folding refuses bookmarks that are already inside collapsed hidden children. This avoids accidental surgery inside compressed history.

## Extracted Context

`strap state extract --from <bookmark> --to <bookmark>` emits a context object without mutating state:

```json
{
  "version": "strap.context.v0.1",
  "source": {
    "state_version": "strap.state.v0.2",
    "from": "bm_start",
    "to": "bm_end"
  },
  "nodes": [],
  "events": []
}
```

`nodes` preserves the selected state nodes. `events` is the visible flattened event stream for those nodes. `strap context quote` converts this into `strap.quoted-context.v0.1`, marking the conversation as evidence rather than active dialogue history. `strap context summarize <framing>` consumes either context form and emits `strap.context-summary.v0.1` with `framing`, `summary`, `source`, and the underlying one-shot result.

## Standard event kinds

Current code uses these event kinds:

| Kind | Typical sender | Purpose |
| --- | --- | --- |
| `message` | `user` or `assistant` | Ordinary user/assistant communication. |
| `tool_request` | `assistant` | Assistant requested tool calls. |
| `summary` | `harness` | Synthetic visible replacement for collapsed scope. |
| `fork` | `harness` | Created a child/forked agent state. |
| `agent_fold` | `harness` | Folded a child state summary into parent state. |
| `memory_context` | `harness` | Visible zettelkasten context from explicit memory/tool operations. |
| `tool_budget_exhausted` | `harness` | Loop budget exhausted; assistant should answer without more tools. |

Other porcelain or commands may add additional `kind` values. They should keep the same event shape.

## Tool calls

Tool calls live on an event's `calls` array.

```json
{
  "id": "call_123",
  "tool": "glob_files",
  "input": {"pattern": "**/*.js"},
  "provider": {
    "type": "function_call",
    "id": "fc_123",
    "call_id": "call_123"
  }
}
```

Fields before execution:

| Field | Type | Required | Purpose |
| --- | --- | --- | --- |
| `id` | string | no | Provider or harness call id. |
| `tool` | string | yes | Tool name in the selected tool group. |
| `input` | object | no | Tool input object. Defaults to `{}`. |
| `provider` | object | no | Provider-specific call metadata. |

Fields after execution:

| Field | Type | Purpose |
| --- | --- | --- |
| `ok` | boolean | Whether execution succeeded. |
| `output` | any | Tool result when `ok: true`. |
| `error` | string | Error message when `ok: false`. |

`run-calls` and `loop` skip calls where `ok` is already set.

## Memory Tool Results

Zettelkasten memory should enter state through explicit tool calls/results or explicit user-provided context. A memory result can be represented as an ordinary event when a harness or tool wrapper needs visible context:

```json
{
  "type": "event",
  "from": "harness",
  "to": ["assistant"],
  "kind": "memory_context",
  "text": "Relevant zettelkasten memories for: repo architecture",
  "memories": []
}
```

The `memories` field may contain JSON results from `strap zk search-hybrid`, but there is no session command that injects this implicitly.

## Provider metadata

Provider response metadata may be attached to events for audit/debugging:

```json
{
  "provider": {
    "name": "openai.responses",
    "id": "resp_...",
    "model": "gpt-5.1",
    "usage": {}
  }
}
```

This metadata should not be required to continue a canonical session. State should remain replayable and provider-agnostic where possible.

## Rendering rules

Visible provider input is produced by `flattenVisible(root)`:

1. events are included as-is;
2. open scopes recursively include children;
3. collapsed scopes become one harness `summary` event;
4. hidden children are not rendered.

Events are rendered as:

```text
[from -> to1,to2; kind]
text
<calls>
...
</calls>
<results>
...
</results>
```

For chat-style providers, events from the selected actor are assistant messages; all other visible events are user messages.

For OpenAI Responses-style providers, visible events are concatenated into `input`, and the selected actor frame becomes `instructions`.

## Mutation rules

Commands should treat state as immutable stdin/stdout data unless explicitly documented otherwise.

Common transforms:

```bash
strap state init
strap state add-user "text" < state.json > next.json
strap state add-assistant "text" < state.json > next.json
strap state push "scope label" < state.json > next.json
strap state pop "summary" < state.json > next.json
strap state bookmark add --text "unique substring" --label fold-start < state.json > next.json
strap state fold --from bm_start --to bm_end --summary "summary" < state.json > next.json
```

Session commands intentionally write the current session file under `$STRAP_WORK/sessions`.

## Compatibility

`strap.state.v0.2` is the only accepted canonical format in current code. Older flat message lists are not normalized.

If the format changes, add a new version string and an explicit migration command rather than silently accepting incompatible shapes.
