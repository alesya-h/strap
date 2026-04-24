# Unified Stateless LLM Harness State Format

Version: draft 0.1

## Goal

Define a single, stateless, provider-agnostic state format that:

* is easy to inspect and manipulate with `jq`
* is the actual public API of the harness
* preserves enough semantics to support OpenAI, Anthropic, Google, Bedrock, and similar providers
* keeps canonical active state and historical transcript in the same file
* supports provider-specific lowering only at model-call time
* does not rely on hidden storage, opaque runtime state, or provider-managed sessions

This format is the **source of truth**. Provider request payloads are disposable compiled projections.

---

## Design principles

### 1. One file, one state

All semantically relevant state lives in one JSON document.

### 2. Stateless by construction

Each model call is compiled from the current JSON state alone.

### 3. Active state and history both matter

Some information is best represented as current truth. Some is best represented as historical context. The format includes both.

### 4. Canonical state is semantic, not provider-shaped

The format models what the harness means, not what any vendor API happens to require.

### 5. Historical transcript must preserve model-visible context

Anything that was visible to the model at a particular point in time and matters for transcript understanding or summarization should be representable in history.

### 6. Shell-first ergonomics

The shape should be shallow, explicit, and stable enough for use from bash and `jq`.

### 7. Provider lowering is disposable

Any folding, merging, prompt synthesis, role conversion, or attachment transformation happens only when compiling a provider request.

---

## Top-level shape

```json
{
  "system": {
    "current": {}
  },
  "messages": []
}
```

---

## Top-level fields

## `system.current`

The canonical active system document.

This is the authoritative current system-level state used to compile model calls, regardless of provider.

It is declarative, not imperative.

Example:

```json
{
  "system": {
    "current": {
      "identity": "You are a Unix-harness assistant.",
      "style": "Be concise and deterministic.",
      "safety": "Do not assist with harmful actions.",
      "execution": "normal"
    }
  },
  "messages": []
}
```

### Semantics

* `system.current` is the source of truth for the active system prompt state.
* It is structured as named sections.
* Each section value is text.
* Providers never see this structure directly unless the adapter chooses to expose it.
* At model-call time, this structure is rendered into provider-compatible text or messages.

### Why structured sections exist

Structured sections allow:

* targeted updates to active state
* stable summarization
* composable prompt construction
* human-readable inspection
* `jq`-friendly editing without brittle text manipulation

Example update in `jq`:

```bash
jq '.system.current.execution = "read-only mode. do not modify files."'
```

---

## `messages`

Ordered historical transcript.

```json
{
  "messages": [
    ...
  ]
}
```

### Semantics

* `messages` is the history of conversation and model-visible contextual events.
* Order is authoritative.
* No message IDs are required.
* No session IDs are required.
* No branch IDs are required.
* Forking is represented by copying and editing the document.

---

# Message types

Messages are objects with a `role` field.

Supported roles:

* `user`
* `assistant`
* `system`

There is no separate required `tool` role in the canonical format. Tool execution results live inside assistant message call records.

---

## User message

```json
{
  "role": "user",
  "text": "Summarize this repo.",
  "attachments": [
    {"type": "application/pdf", "path": "./repo-map.pdf"}
  ]
}
```

### Fields

* `role`: must be `"user"`
* `text`: optional string
* `attachments`: optional array of attachment objects

### Semantics

Represents normal user input. May include text, attachments, or both.

---

## Assistant message

```json
{
  "role": "assistant",
  "text": "I'll inspect the files first.",
  "_currently_available_tools": [
    {
      "tool": "list_files",
      "description": "List files in a directory",
      "input_schema": {
        "type": "object",
        "properties": {
          "path": {"type": "string"}
        },
        "required": ["path"]
      }
    }
  ],
  "calls": [
    {
      "tool": "list_files",
      "input": {"path": "."},
      "ok": true,
      "output": ["README.md", "src/main.py"]
    }
  ]
}
```

### Fields

* `role`: must be `"assistant"`
* `text`: optional string
* `_currently_available_tools`: optional array
* `calls`: optional array

### Semantics

An assistant message may include:

* natural-language output
* a snapshot of the callable tool environment that was available at that step
* requested tool calls
* populated tool execution results, filled in later by the harness

### `_currently_available_tools`

This field is intentionally long, explicit, and inconvenient.

It exists to preserve the exact tool context that was available for that assistant step.

It is for:

* transcript analysis
* auditability
* replay understanding
* summarization fidelity

It is not intended to be convenient or commonly hand-authored.

Each tool definition has this shape:

```json
{
  "tool": "get_weather",
  "description": "Get weather by city",
  "input_schema": {
    "type": "object",
    "properties": {
      "city": {"type": "string"}
    },
    "required": ["city"]
  }
}
```

### `calls`

Each call represents one assistant-requested tool invocation.

Example success:

```json
{
  "tool": "get_weather",
  "input": {"city": "Sydney"},
  "ok": true,
  "output": {
    "temp_c": 24,
    "condition": "sunny"
  }
}
```

Example failure:

```json
{
  "tool": "get_weather",
  "input": {"city": "Sydney"},
  "ok": false,
  "error": "network timeout"
}
```

### Call semantics

* `tool`: tool name
* `input`: JSON value provided as input
* `ok`: boolean indicating execution success
* `output`: present when `ok == true`
* `error`: present when `ok == false`

The harness may initially create assistant messages where calls have only `tool` and `input`, then later populate `ok` and `output` or `error`.

---

## System message

System messages in `messages` are **historical model-context events**, not the source of truth for active system state.

Example:

```json
{
  "role": "system",
  "kind": "inline",
  "mode": "transient",
  "sections": {
    "execution": "Read-only mode. Do not modify files."
  }
}
```

### Fields

* `role`: must be `"system"`
* `kind`: currently `"inline"`
* `mode`: `"persistent"` or `"transient"`
* `sections`: object of named text sections

Optional:

* `text`: optional rendered or human-readable text form

Example with explicit text:

```json
{
  "role": "system",
  "kind": "inline",
  "mode": "transient",
  "sections": {
    "execution": "Read-only mode. Do not modify files."
  },
  "text": "Read-only mode. Do not modify files."
}
```

### Semantics

These system messages are part of historical transcript context.

They exist to represent system-like instructions that occurred at specific points in time and may matter for:

* transcript understanding
* summarization
* providers that support inline system/developer roles
* reproducing model-visible context

### Crucial rule

Inline historical system messages do **not** define canonical active state.

Canonical active state lives only in `system.current`.

---

# Attachments

Attachment shape:

```json
{
  "type": "image/png",
  "path": "./image.png"
}
```

Supported common examples:

```json
{"type": "image/png", "path": "./img.png"}
{"type": "application/pdf", "path": "./paper.pdf"}
{"type": "audio/wav", "path": "./sample.wav"}
{"type": "video/mp4", "path": "./clip.mp4"}
```

Optional extension if needed:

```json
{"type": "image/png", "url": "https://example.com/img.png"}
```

### Attachment semantics

* Attachments are semantic references to external files or URLs.
* The harness adapter is responsible for transforming them into provider-specific input blocks.
* Unsupported attachment types may be converted, omitted, summarized, or rejected at compile time.

---

# Canonical semantics

## 1. `system.current` is authoritative

All model calls start from `system.current`.

It answers the question:

> what is currently in force?

## 2. Inline system messages are historical context

System messages inside `messages` answer the question:

> what system-like instructions were present or relevant at this point in the transcript?

## 3. Messages are strictly ordered

The meaning of the transcript depends on message order.

## 4. Assistant tool context is historical

`_currently_available_tools` records what tools were available for that assistant step.

## 5. Calls are embedded in assistant messages

Tool invocation requests and their eventual execution results live in the assistant message that requested them.

## 6. No hidden runtime state

Anything semantically important must be visible in the file.

---

# Transient vs persistent inline system messages

Inline system messages may be:

* `persistent`
* `transient`

## Persistent inline system message

A historical system-context event that should be considered active for subsequent turns until superseded or otherwise ignored by compilation policy.

## Transient inline system message

A historical system-context event intended to affect only the next assistant generation.

### Consumption rule

A transient inline system message is consumed by the first subsequent assistant generation compiled from the transcript after that message.

It remains in history after consumption, but does not continue to affect later assistant generations.

This rule exists for deterministic replay.

---

# Rendering system state for providers

At model-call time, the harness computes the model-facing system context from:

1. `system.current`
2. any relevant inline system messages in `messages`

The adapter may combine them differently depending on provider capabilities.

## Rendering `system.current`

`system.current` is rendered into text, typically by converting named sections into a stable textual form.

Canonical example rendering:

```xml
<identity>
You are a Unix-harness assistant.
</identity>

<style>
Be concise and deterministic.
</style>

<execution>
Read-only mode. Do not modify files.
</execution>
```

The exact rendering format is an adapter detail, but it should be deterministic.

---

# Provider lowering model

The state file is canonical. Provider requests are compiled projections.

## OpenAI-like providers

If the provider supports system or developer messages, the adapter may lower:

* `system.current` into top-level system/developer messages
* relevant inline historical system messages into additional inline system/developer messages
* attachments into provider-specific content parts
* assistant `calls` into function/tool call protocol

## Anthropic-like providers

If the provider only supports top-level system prompt plus normal message history, the adapter may lower:

* `system.current` and relevant inline system context into a single top-level `system`
* historical inline system messages may be omitted from normal transcript if they are already folded into top-level system
* attachments into Anthropic content blocks
* assistant calls/results into tool use/result blocks as required

## Google-like providers

The adapter may lower:

* `system.current` into `systemInstruction`
* inline system messages into synthesized context when the API cannot represent them directly
* attachments into Gemini parts
* calls/results into function call/response parts

## Bedrock-like providers

The adapter may lower:

* `system.current` into top-level `system`
* inline system messages into system text or prefixed context as supported
* attachments into content blocks
* tool calls/results into Bedrock tool use protocol

### General rule

Unsupported distinctions may be folded into supported ones at compile time.

This loss of structure is acceptable only in the disposable provider request, never in canonical semantic state.

---

# Why active state and historical state both exist

The format intentionally keeps both:

## Active state

`system.current`

Good for:

* immediate inspection
* easy updates
* direct answers about current effective configuration
* avoiding imperative replay just to know what is active

## Historical state

`messages`

Good for:

* transcript understanding
* summarization
* auditability
* replay
* preserving temporal context

These answer different questions and should not be collapsed into one representation.

---

# Example full document

```json
{
  "system": {
    "current": {
      "identity": "You are a Unix-harness assistant.",
      "style": "Be concise and deterministic.",
      "execution": "normal"
    }
  },
  "messages": [
    {
      "role": "user",
      "text": "What's the weather in Sydney?"
    },
    {
      "role": "system",
      "kind": "inline",
      "mode": "transient",
      "sections": {
        "execution": "Read-only mode. Do not modify files."
      },
      "text": "Read-only mode. Do not modify files."
    },
    {
      "role": "assistant",
      "text": "Let me check the weather.",
      "_currently_available_tools": [
        {
          "tool": "get_weather",
          "description": "Get weather by city",
          "input_schema": {
            "type": "object",
            "properties": {
              "city": {"type": "string"}
            },
            "required": ["city"]
          }
        }
      ],
      "calls": [
        {
          "tool": "get_weather",
          "input": {"city": "Sydney"},
          "ok": true,
          "output": {
            "temp_c": 24,
            "condition": "sunny"
          }
        }
      ]
    },
    {
      "role": "assistant",
      "text": "It's 24C and sunny."
    }
  ]
}
```

---

# Intended common operations

## Update active system execution mode

```bash
jq '.system.current.execution = "read-only mode. do not modify files."'
```

## Append a transient inline system notice

```bash
jq '.messages += [{
  "role":"system",
  "kind":"inline",
  "mode":"transient",
  "sections":{"execution":"Read-only mode. Do not modify files."}
}]'
```

## Append a user message

```bash
jq '.messages += [{
  "role":"user",
  "text":"Summarize this repo."
}]'
```

## Find assistant calls

```bash
jq '[.messages[] | select(.role=="assistant") | .calls[]?]'
```

## Find failed tool executions

```bash
jq '[.messages[] | select(.role=="assistant") | .calls[]? | select(.ok == false)]'
```

## Inspect available tools for each assistant step

```bash
jq '.messages[] | select(.role=="assistant") | ._currently_available_tools // []'
```

---

# Non-goals

This format does not attempt to perfectly preserve every provider-native semantic distinction, such as:

* OpenAI `developer` vs `system`
* provider-specific reasoning token formats
* provider-specific caching hints
* provider-specific hosted tool metadata
* provider-specific safety classifications
* all multimodal block variants

Those may be simulated, folded, or ignored at compile time.

The goal is a clean semantic state model, not a lossless wire-format archive of every backend.

---

# Summary

This design intentionally separates:

* **active declarative system state** in `system.current`
* **historical model-visible context** in `messages`

It keeps transcript structure shallow and shell-friendly while preserving enough semantics to compile into multiple provider APIs.

The core idea is:

**canonical state is semantic and human-operable; provider payloads are disposable projections.**

If you want, I can turn this into a stricter JSON Schema next.

