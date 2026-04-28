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
strap state init \
| strap porcelain run basic request-tool jsmcp_list_servers '{}' \
| strap run-calls --tools jsmcp
```

## Kagi Smoke Test

The local jsmcp YAML config includes a `kagi` server. Tested flow:

```bash
strap state init \
| strap porcelain run basic request-tool jsmcp_list_tools '{"server":"kagi"}' \
| strap run-calls --tools jsmcp
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

This successfully returned Kagi search results through `strap run-calls --tools jsmcp`.

## Isolation Note

The jsmcp bridge exposes whatever configured jsmcp servers allow. Treat it as a powerful effect surface unless the run uses a restricted jsmcp profile and an isolated launch environment.
