# Intended State Shape

This is the target direction for Strap transcript state. It is not necessarily the current implementation.

## Events

Events are ordered chat messages produced by actors.

```json
{
  "type": "event",
  "from": "user",
  "kind": "message",
  "text": "Investigate the provider streaming issue."
}
```

Model-produced messages use `from: "model"`, not `from: "assistant"`. They include `agent` when an agent profile is active.

```json
{
  "type": "event",
  "from": "model",
  "agent": "investigator-debugger",
  "kind": "message",
  "text": "The streaming issue is in the ChatGPT provider SSE path."
}
```

Harness-produced messages use `from: "harness"`.

`to` is not required for normal chat. The transcript should be understandable primarily from `from`, `agent`, `kind`, `text`, and `calls`.

## Tool Calls

Tool use is represented as a model event with `kind: "tool_request"` and a `calls` array.

```json
{
  "type": "event",
  "from": "model",
  "agent": "investigator-debugger",
  "kind": "tool_request",
  "text": "",
  "calls": [
    {
      "id": "call_123",
      "tool": "json_echo.echo",
      "input": { "value": "hello" },
      "ok": true,
      "output": {
        "content": [{ "type": "text", "text": "hello" }],
        "structuredContent": { "value": "hello" }
      }
    }
  ]
}
```

Tool results are attached to the call itself. They do not need separate visible result events.

## Forks

Forking is a tool call, not a separate fold event and not transcript surgery.

The child branch receives the same normal transcript context as the parent up to the fork. There is no special context payload.

The fork tool behaves differently depending on where it is observed:

- In the child branch, `agent.fork` returns `nil` or another minimal indication that the child is the branch meant to do the work.
- In the parent branch, `agent.fork` returns the child branch summary.

Parent-visible shape:

```json
{
  "type": "event",
  "from": "model",
  "agent": "architect",
  "kind": "tool_request",
  "text": "",
  "calls": [
    {
      "id": "fork_123",
      "tool": "agent.fork",
      "input": {
        "task": "Investigate the provider streaming issue."
      },
      "ok": true,
      "output": {
        "summary": "The child found that the ChatGPT provider buffered SSE until curl exited, then decoded the whole stream. The fix is to read SSE blocks as they arrive, emit JSONL chunk events to stderr, and still decode the accumulated stream for stdout."
      },
      "hidden": {
        "messages": [
          {
            "type": "event",
            "from": "model",
            "agent": "investigator-debugger",
            "kind": "message",
            "text": "I will inspect the ChatGPT provider SSE path."
          },
          {
            "type": "event",
            "from": "model",
            "agent": "investigator-debugger",
            "kind": "tool_request",
            "text": "",
            "calls": []
          },
          {
            "type": "event",
            "from": "model",
            "agent": "investigator-debugger",
            "kind": "message",
            "text": "The root cause is buffered SSE decoding."
          }
        ]
      }
    }
  ]
}
```

The parent model sees only the tool output summary. It does not see `hidden.messages` and does not receive paths, search refs, external handles, or other retrieval metadata. That hidden transcript exists for UI/debugging/storage only; exposing it to the model would defeat the context-saving purpose of the fork.

## Collapsing

Collapsed branch contents should be attached to the fork tool call under `hidden.messages`.

Folds should not be primary semantic events. If folds exist, they are presentation/storage mechanics over hidden branch messages, not model-visible branch representation.
