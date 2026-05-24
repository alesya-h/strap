# Canonical State Format

This document specifies the canonical Strap state format.

## Core Shape

State has actor metadata plus a linear visible transcript. It does not encode recipients or special scope/container items. Tree-shaped material, such as folded ranges or child-agent transcripts, is attached to the relevant tool-call event under `hidden.messages`.

```json
{
  "version": "strap.state.v0.4",
  "actors": {},
  "runtime": {},
  "history": []
}
```

`actors` is a flat map keyed by actor id. Actor kind is metadata, not a top-level schema axis.

```json
{
  "actors": {
    "alesya": {
      "kind": "human",
      "self": {
        "public": "My name is Alesya. I'm autistic; please be precise and reduce sycophancy."
      },
      "peers": {
        "coding-agent": "Please ask before doing anything risky."
      }
    },
    "coding-agent": {
      "kind": "model",
      "self": {
        "public": "Software engineering agent for driving implementation.",
        "private": "I try to keep files under 150 lines and functions under 7 lines. I write tests. I prefer immutable plain data."
      },
      "peers": {
        "alesya": "Prefers when I use jsmcp."
      }
    },
    "strap": {
      "kind": "runtime",
      "self": {
        "public": "Local command, provider, and tool execution harness."
      }
    }
  },
  "runtime": {
    "active_model": "coding-agent"
  }
}
```

`kind` is used by provider compilers and UI. For example, an API adapter may map `kind: "model"` to provider `role: "assistant"`, and render other visible actors as user/context input.

## History Items

A history item is one actor-authored message/action appended to the shared transcript.

```json
{
  "from": "alesya",
  "text": "Please inspect the provider code."
}
```

Model-produced messages use the actual model actor id in `from`, not a generic `model` role.

```json
{
  "from": "coding-agent",
  "text": "I will inspect the provider state compiler."
}
```

There is no `to`. Sending work to the harness is a tool call. Branching, targeted work, subagents, and private context are represented through fork/subagent tools rather than transcript recipients.

History items may contain any combination of:

- `from`: required actor id;
- `text`: optional human-readable message text;
- `calls`: optional tool calls authored by that actor;
- `attachments`: optional message attachments;
- `hidden`: optional storage/debug data not exposed by default;
- `kind`: optional, but valid only for runtime-authored items.

`type` is not needed because everything in `history` is a message/action item.

## Runtime Items

`kind` is reserved for runtime actors such as `strap`. Normal human/model messages should not need it.

```json
{
  "from": "strap",
  "kind": "checkpoint",
  "text": "State saved after provider inspection."
}
```

Validation rule:

```text
if history[i].kind exists:
  actors[history[i].from].kind must be "runtime"
```

## Tool Calls

Tool calls are allowed on any actor's history item. This means humans and models can use the same tool surface.

```json
{
  "from": "alesya",
  "text": "Run the project tests.",
  "calls": [
    {
      "id": "call_1",
      "tool": "process.shell",
      "input": {
        "command": "./bin/strap project-test"
      },
      "ok": true,
      "output": {
        "content": [{ "type": "text", "text": "tests passed" }],
        "structuredContent": { "exit_code": 0 }
      }
    }
  ]
}
```

Tool results are attached to the call itself. They do not need separate visible result messages.

## Forks And Subagents

Forking is a tool call, not transcript surgery and not a special event kind.

The parent-visible result is a summary. The child transcript is retained for UI/debug/storage under `hidden.messages` and is not exposed to the parent model by default.

```json
{
  "from": "coding-agent",
  "text": "",
  "calls": [
    {
      "id": "fork_1",
      "tool": "agent.fork",
      "input": {
        "agent": "reviewer-agent",
        "task": "Review the provider state compiler."
      },
      "ok": true,
      "output": {
        "summary": "Reviewer found that provider roles should be derived from actor kind."
      },
      "hidden": {
        "messages": [
          {
            "from": "reviewer-agent",
            "text": "I will review the provider state compiler."
          },
          {
            "from": "reviewer-agent",
            "text": "The compiler should map actor kind=model to assistant role."
          }
        ]
      }
    }
  ]
}
```

A subagent tool can use memory or avoid memory depending on its input contract. That distinction belongs to the tool, not the transcript shape.

## Summarization And Compaction

Summaries are tool call results. There is no `kind: "summary"` for normal history.

A summarization tool can return a summary and absorb part of the prior transcript into `hidden.messages`.

```json
{
  "from": "coding-agent",
  "text": "",
  "calls": [
    {
      "id": "compact_1",
      "tool": "history.summarize",
      "input": {
        "start": 0,
        "end": 3
      },
      "ok": true,
      "output": {
        "summary": "Alesya asked for a simpler state model. The agreed shape is flat actors plus linear visible history, no scope containers and no recipients."
      },
      "hidden": {
        "messages": [
          { "from": "alesya", "text": "..." },
          { "from": "coding-agent", "text": "..." }
        ]
      }
    }
  ]
}
```

The model sees the summary through the tool result. Hidden absorbed history exists for UI/debug/storage only.

## Complete Example

```json
{
  "version": "strap.state.v0.4",
  "actors": {
    "alesya": {
      "kind": "human",
      "self": {
        "public": "My name is Alesya. I'm autistic; please be precise and reduce sycophancy."
      }
    },
    "coding-agent": {
      "kind": "model",
      "self": {
        "private": "Software engineering agent for implementation."
      }
    },
    "strap": {
      "kind": "runtime",
      "self": {
        "public": "Local harness."
      }
    }
  },
  "runtime": {
    "active_model": "coding-agent"
  },
  "history": [
    {
      "from": "alesya",
      "text": "Please inspect the provider code."
    },
    {
      "from": "coding-agent",
      "text": "",
      "calls": [
        {
          "id": "call_1",
          "tool": "fs.read_file",
          "input": {
            "path": "commands/provider-openai/lib/state.nu"
          },
          "ok": true,
          "output": {
            "content": [{ "type": "text", "text": "..." }],
            "structuredContent": {
              "path": "commands/provider-openai/lib/state.nu"
            }
          }
        }
      ]
    },
    {
      "from": "coding-agent",
      "text": "The provider code maps transcript events into API-specific roles."
    },
    {
      "from": "strap",
      "kind": "checkpoint",
      "text": "State saved after provider inspection."
    }
  ]
}
```
