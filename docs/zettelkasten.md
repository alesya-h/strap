# Zettelkasten

`strap zk` is a shared agent/human zettelkasten. Markdown files are the source of truth; SQLite, FTS5, and `sqlite-vec` provide a derived text/vector index. The index uses the `sqlite3` CLI so NixOS sqlite extension loading works without requiring Node SQLite bindings to see `sqlite-vec`.

## Setup

By default the CLI loads sqlite-vec as `vec0`, which matches the NixOS setup tested here:

```bash
sqlite3 -cmd '.load vec0' ':memory:' 'select vec_version();'
```

If your extension has a different path or name:

```bash
export STRAP_ZK_SQLITE_VEC_LOAD=/nix/store/.../lib/vec0.so
```

The default derived index path is:

1. `STRAP_ZK_DB`, when set;
2. `$STRAP_WORK/zettel/zettel.sqlite`, when `STRAP_WORK` is set by the command runner; this defaults to `.strap-user/zettel/zettel.sqlite`;
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

Project-shared notes live under `.strap/zettel`; user/private notes live under `.strap-user/zettel`.

```bash
strap zk create --scope user --title "Local preference" --body "User prefers CLI examples." --tags user,preference
strap zk create --scope project --title "Authority model" --body "Commands receive authority decisions." --tags strap,architecture
strap zk list --scope all
strap zk search "authority"
STRAP_ZK_EMBED_PROVIDER=hash strap zk reindex --scope all
```

The markdown format uses simple frontmatter:

```markdown
---
id: "zk_..."
title: "Authority model"
tags: ["strap", "architecture"]
aliases: []
author: "agent"
scope: "project"
created_at: "2026-04-28T00:00:00.000Z"
updated_at: "2026-04-28T00:00:00.000Z"
---

Commands receive authority decisions.
```

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
  --scope user \
  --title 'Provider state is not canonical' \
  --body 'Canonical state should preserve semantic conversation state, not provider request IDs.' \
  --tags strap,providers,state

strap zk search 'canonical state'
strap zk search-hybrid 'provider leakage'
strap zk search-vector 'semantic memory retrieval'
strap zk search-text 'canonical state'
strap zk list
strap zk tags
strap zk delete zk_note_id
strap zk reindex --scope all
```

`create`, `update`, and `delete` operate on markdown files. `search-hybrid`, `search-vector`, `search-text`, and `reindex` rebuild the derived SQLite index from markdown before querying.

The lower-level SQLite index commands remain available under explicit `index-*` names for debugging, for example `strap zk index-search-hybrid "query"`.

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
