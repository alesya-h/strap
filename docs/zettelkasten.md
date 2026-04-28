# Zettelkasten

`strap zk` is a Nushell CLI for a shared agent/human zettelkasten backed by SQLite, FTS5, and `sqlite-vec`. It uses the `sqlite3` CLI so NixOS sqlite extension loading works without requiring Node SQLite bindings to see `sqlite-vec`.

## Setup

By default the CLI loads sqlite-vec as `vec0`, which matches the NixOS setup tested here:

```bash
sqlite3 -cmd '.load vec0' ':memory:' 'select vec_version();'
```

If your extension has a different path or name:

```bash
export STRAP_ZK_SQLITE_VEC_LOAD=/nix/store/.../lib/vec0.so
```

The default DB path is:

1. `STRAP_ZK_DB`, when set;
2. `$STRAP_WORK/zettel/zettel.sqlite`, when `STRAP_WORK` is set by the command runner;
3. `~/.config/nushell/strap/zettel.sqlite` as a Nushell fallback.

## Embeddings

For real semantic recall, use OpenAI embeddings:

```bash
export STRAP_ZK_EMBED_PROVIDER=openai
export OPENAI_API_KEY=...
export STRAP_ZK_EMBED_MODEL=text-embedding-3-small
```

Or use the local ChatGPT subscription OAuth route:

```bash
export STRAP_ZK_EMBED_PROVIDER=chatgpt
export STRAP_ZK_CHATGPT_PROVIDER=config/strap/providers/chatgpt.json
```

This calls `https://api.openai.com/v1/embeddings` with the ChatGPT OAuth token and account header. Create the token with `strap auth chatgpt login` or import an existing Codex token with `strap auth chatgpt import-codex`.

For offline tests, use the deterministic hash embedding provider:

```bash
export STRAP_ZK_EMBED_PROVIDER=hash
```

You can also provide your own embedding command:

```bash
export STRAP_ZK_EMBED_CMD='my-embedder --json'
```

It receives JSON on stdin:

```json
{"texts":["text to embed"]}
```

It must output:

```json
{"model":"my-model","dimensions":384,"embeddings":[[0.1,0.2]]}
```

## CLI

```bash
strap zk create \
  --title 'Provider state is not canonical' \
  --body 'Canonical state should preserve semantic conversation state, not provider request IDs.' \
  --tags strap,providers,state

strap zk search-hybrid 'provider leakage'
strap zk search-vector 'semantic memory retrieval'
strap zk search-text 'canonical state'
strap zk related zk_note_id
strap zk backlinks zk_note_id
strap zk list
strap zk tags
strap zk delete zk_note_id
strap zk link zk_a zk_b --type refines
```

`create` and `update` embed and index automatically. The implementation avoids holding write transactions while calling embedding providers.

Remember the latest assistant message from a state:

```bash
strap session show | strap zk remember-state --tags session,summary
```

The project-local session wrapper is usually more convenient:

```bash
strap session recall "repo architecture"
strap session remember session,summary
```

`recall` writes matched memories into session state as `memory_context`; `remember` calls `zk remember-state` for the current session file.

## Agent Tool

The executable script tool `tools/zk` exposes the same store to agents through the existing `scripts` tool group. Example input:

```json
{
  "action": "search_hybrid",
  "query": "provider state leakage",
  "limit": 5
}
```

Create a note:

```json
{
  "action": "create",
  "title": "Provider state is not canonical",
  "body": "Canonical state should preserve semantic conversation state, not provider request IDs.",
  "tags": ["strap", "providers", "state"],
  "aliases": ["provider leakage", "state purity"]
}
```

## Concurrency

SQLite runs in WAL mode and commands use short transactions with a 5 second busy timeout. Multiple agents can search concurrently, while writes serialize through SQLite. Embedding calls happen before DB write transactions so slow providers do not hold locks.
