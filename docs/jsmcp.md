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

`run-calls` stores jsmcp discovery memory in canonical state under `runtime.tools.jsmcp`. Successful `jsmcp.list_servers` and `jsmcp.list_tools` calls cache the observed server/tool surface. Before `jsmcp.execute_code`, Strap refreshes cached discovery through the HTTP API; if the observed capabilities changed, it rejects with the same cached-discovery-change message as `jsmcp client` and updates the cache for the next attempt.

## Tools

- `jsmcp.list_servers`
- `jsmcp.list_tools`
- `jsmcp.execute_code`
- `jsmcp.fetch_logs`
- `jsmcp.clear_logs`

## Example

Ask a model to call `jsmcp.list_servers`, then execute pending calls with:

```bash
strap run-calls --tools jsmcp < state-with-jsmcp-call.json
```

## Kagi Smoke Test

The local jsmcp YAML config includes a `kagi` server. Tested flow:

Ask a model to call `jsmcp.list_tools` with `{"server":"kagi"}`, then run `strap run-calls --tools jsmcp`.

Then execute a search:

```json
{
  "tool": "jsmcp.execute_code",
  "input": {
    "code": "return await kagi.kagi_summarizer({ url: \"https://example.com\" })"
  }
}
```

This successfully returned Kagi search results through `strap run-calls --tools jsmcp`.

## Isolation Note

The jsmcp bridge exposes whatever configured jsmcp servers allow. Treat it as a powerful effect surface unless the run uses a restricted jsmcp profile and an isolated launch environment.
