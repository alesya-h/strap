# jsmcp Bridge

`strap` exposes installed `jsmcp` as a normal tool group named `jsmcp`.

It calls the local `jsmcp` HTTP API:

```bash
http://127.0.0.1:41528/api/call
```

Override with:

```bash
STRAP_JSMCP_URL=http://127.0.0.1:41528
STRAP_JSMCP_API_KEY_FILE=~/.config/jsmcp/api-key.txt
STRAP_JSMCP_API_KEY=...
STRAP_JSMCP_PROFILE=work
```

`run-calls` stores jsmcp discovery memory in canonical state under `runtime.jsmcp`. Successful `jsmcp_list_servers` and `jsmcp_list_tools` calls cache the observed server/tool surface. Before `jsmcp_execute_code`, Strap refreshes cached discovery through the HTTP API; if the observed capabilities changed, it rejects with the same cached-discovery-change message as `jsmcp client` and updates the cache for the next attempt.

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
