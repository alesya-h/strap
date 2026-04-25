# jsmcp Bridge

`strap` exposes installed `jsmcp` as a normal tool group named `jsmcp`.

It shells out to:

```bash
jsmcp client
```

Override with:

```bash
STRAP_JSMCP_COMMAND=jsmcp
STRAP_JSMCP_ARGS="client --profile work"
```

## Tools

- `jsmcp_list_servers`
- `jsmcp_list_tools`
- `jsmcp_execute_code`
- `jsmcp_fetch_logs`
- `jsmcp_clear_logs`

## Example

```bash
node bin/strap-state.js init \
| node bin/strap-porcelain.js run basic request-tool jsmcp_list_servers '{}' \
| node bin/strap-run-calls.js --tools jsmcp
```

## Kagi Smoke Test

The local jsmcp YAML config includes a `kagi` server. Tested flow:

```bash
node bin/strap-state.js init \
| node bin/strap-porcelain.js run basic request-tool jsmcp_list_tools '{"server":"kagi"}' \
| node bin/strap-run-calls.js --tools jsmcp
```

Then execute a search:

```json
{
  "tool": "jsmcp_execute_code",
  "input": {
    "code": "return await kagi.kagi_search_fetch({ queries: [{ q: \"Strap agent harness immutable state\" }] })"
  }
}
```

This successfully returned Kagi search results through `strap-run-calls --tools jsmcp`.
