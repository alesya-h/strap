# Zettelkasten

`strap zk` is a shared agent/human zettelkasten. Markdown files are the source of truth; SQLite, FTS5, and `sqlite-vec` provide a derived text/vector index. The command is a self-contained Babashka capsule; its index helper is command-private and reached through `strap inner zk index`.

This shape is intentional. The zettelkasten is conceptually one subsystem: markdown overlays, tombstones, wikilinks, backlinks, derived SQLite/FTS/vector indexes, and the agent-facing `zk` tool all need to agree on note identity. Keeping those pieces under the `zk` command directory avoids turning implementation details into public commands or shared libraries.

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
2. the user layer's `zettel/zettel.sqlite`, which defaults to `.strap-user/zettel/zettel.sqlite`;
3. `~/.config/strap/zettel.sqlite` as a fallback.

## Embeddings

For real semantic recall, use OpenAI or OpenRouter embeddings:

```bash
export STRAP_ZK_EMBED_PROVIDER=openai
export OPENAI_API_KEY=...
export STRAP_ZK_EMBED_MODEL=text-embedding-3-small
```

```bash
export STRAP_ZK_EMBED_PROVIDER=openrouter
export OPENROUTER_API_KEY=...
```

Provider-backed embeddings are routed through `strap embed`, which delegates to `strap provider <name> embed` when that provider supports embeddings. ChatGPT subscription OAuth is not a supported embeddings API.

```bash
printf '{"texts":["semantic recall"]}' | strap embed --provider openai
printf '{"texts":["semantic recall"]}' | strap embed --provider openrouter
```

Project-shared notes live under `.strap/zettel`; user/private notes live under `.strap-user/zettel`. Normal `strap zk` output treats them as one zettelkasten: the user layer is a transparent overlay on top of the project layer, and physical `.strap*` paths are hidden unless `--paths` is requested.

```bash
strap zk create --scope user --title "Local preference" --body "User prefers CLI examples." --tags user,preference
strap zk create --scope project --title "Launch isolation" --body "Restricted modes come from the launch environment." --tags strap,architecture
strap zk list --scope all
strap zk search "isolation"
STRAP_ZK_EMBED_PROVIDER=openrouter strap zk reindex --scope all
```

The markdown format uses simple frontmatter:

```markdown
---
id: "zk_..."
title: "Launch isolation"
tags: ["strap", "architecture"]
aliases: []
author: "agent"
scope: "project"
created_at: "2026-04-28T00:00:00.000Z"
updated_at: "2026-04-28T00:00:00.000Z"
---

Restricted modes come from the launch environment.

This refines [[Provider state is not canonical]].
```

Links are inline `[[wikilinks]]`; there is no separate canonical link table. Use `[[Title]]` for ordinary links and `[[zk_id|label]]` when a link needs to survive title changes or resolve ambiguity.

You can provide your own embedding command for local integrations or test fixtures:

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
strap zk links zk_note_id
strap zk backlinks zk_note_id
strap zk workon zk_project_note_id
strap zk promote zk_project_note_id
strap zk discard zk_project_note_id
strap zk status
strap zk list
strap zk tags
strap zk delete zk_note_id
strap zk reindex --scope all
```

`create`, `update`, and `delete` operate on markdown files. `search-hybrid`, `search-vector`, `search-text`, and `reindex` rebuild the derived SQLite index from markdown before querying. Lower-level `index-*` commands are debugging adapters around the private `strap inner zk index` helper.

Do not call files under `zk/inner/` directly. Use the runner boundary so the helper receives the same command environment as the rest of Strap:

```bash
strap inner zk index search-hybrid "semantic recall"
```

Updating a project note automatically creates a user-layer working copy that shadows the project version. `workon` makes that copy explicitly, `promote` writes the user-layer copy back to the project layer, and `discard` removes the user-layer copy.

`get`, `list`, `search`, `links`, `backlinks`, and write results include link diagnostics from inline wikilinks. Ambiguous links include candidate notes and stable `[[id|label]]` suggestions so an agent can repair the source markdown during normal work.

The lower-level SQLite index commands remain available under explicit `index-*` names for debugging, for example `strap zk index-search-hybrid "query"`.

Use zettelkasten memory explicitly:

```bash
strap zk search-hybrid "repo architecture"
strap zk create --scope user --title "Repo architecture" --body "Useful local observation." --tags session,summary
```

Agents get the same memory surface through the `zk` script tool. Session commands do not implicitly recall or remember zettelkasten notes.

## Agent Tool

The grouped tool artifact `tools/zk` exposes the same store to agents through dotted tool names such as `zk.search_hybrid`, `zk.search`, and `zk.backlinks`. Example input:

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
