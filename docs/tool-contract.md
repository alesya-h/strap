# Tool Contract

Tool artifacts are grouped directories under `tools/<group>/` in any layer listed by `STRAP_PATH`.

Required files:

- `run`, executable action runner
- `desc`, short human description
- `meta.json` or `meta/<action>.json`, action metadata

Provider-facing names are dotted:

```text
<group>.<action>
```

Running `tools/<group>/run` with no action prints a JSON array of action names.

Running `tools/<group>/run <action>` reads a JSON envelope from stdin and writes a JSON envelope to stdout.

`run-calls` sets:

```text
STRAP_TOOL_DIR=/absolute/path/to/tools/<group>
```

Babashka-backed tools should keep `run` as a thin launcher and put code in `src/tool/main.clj`.

## Metadata

Each action metadata object has:

```json
{
  "description": "...",
  "inputSchema": {},
  "process_state": "none"
}
```

`process_state` is one of `none`, `own`, or `full`. Missing means `none`.

`meta.json` maps action names to metadata. `meta/<action>.json` may also be used; per-action files override `meta.json`.

## Input Envelopes

For `process_state: "none"`:

```json
{
  "arguments": {}
}
```

For `process_state: "own"`:

```json
{
  "own_state": {},
  "arguments": {}
}
```

`own_state` is stored in canonical state at `runtime.tools.<group>`.

For `process_state: "full"`:

```json
{
  "state": {},
  "arguments": {}
}
```

`state` is the full canonical Strap state.

## Output Envelopes

For `none`:

```json
{
  "result": {}
}
```

For `own`:

```json
{
  "own_state": {},
  "result": {}
}
```

For `full`:

```json
{
  "state": {},
  "result": {}
}
```

A failed tool may return:

```json
{
  "error": "message"
}
```

Own-state tools may include updated `own_state` with an error.

## Result Shape

`result` must be JSON and should contain:

```json
{
  "content": [{ "type": "text", "text": "..." }],
  "structuredContent": {}
}
```

`content` and `structuredContent` must be semantically equivalent.

`content` should be readable and tool-specific. It is not a raw JSON dump unless raw JSON is the most readable form for that tool.

`structuredContent` is the machine-readable version of the same facts.

Result `metadata` is not part of the contract.
