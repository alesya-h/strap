#!/usr/bin/env nu

def strap-root [] {
  $env.STRAP_ROOT? | default (pwd)
}

def default-db [] {
  if ($env.STRAP_ZK_DB? | is-not-empty) {
    $env.STRAP_ZK_DB
  } else if ($env.STRAP_WORK? | is-not-empty) {
    [$env.STRAP_WORK zettel zettel.sqlite] | path join
  } else {
    [($nu.default-config-dir) strap zettel.sqlite] | path join
  }
}

def db-path [db: string] {
  if ($db | is-empty) { default-db } else { $db }
}

def sql-string [value: any] {
  let escaped = ($value | default "" | into string | str replace -a "'" "''")
  $"'($escaped)'"
}

def sql-template [template: string, values: record] {
  mut out = $template
  for item in ($values | transpose key value) {
    $out = ($out | str replace -a $"__($item.key)__" ($item.value | into string))
  }
  $out
}

def vec-load-prefix [] {
  let load = ($env.STRAP_ZK_SQLITE_VEC_LOAD? | default "vec0")
  if ($load == "" or $load == "none") { "" } else { $".load ($load)\n" }
}

def sqlite-exec [db: string, script: string] {
  let full = $"(vec-load-prefix).timeout 5000\n($script)"
  $full | ^sqlite3 $db
}

def sqlite-json [db: string, script: string] {
  let full = $"(vec-load-prefix).timeout 5000\n($script)"
  let out = ($full | ^sqlite3 -json $db)
  if (($out | str trim) == "") { [] } else { $out | from json }
}

def now-str [] { date now | into string }

def note-id [] { $"zk_(random uuid)" }

def chunk-id [note_id: string] { $"($note_id):0" }

def fts-query [query: string] {
  let terms = ($query | str downcase | split words | each { |term| $term | str replace --regex -a '[^\p{L}\p{N}_-]' '' } | where {|term| $term != "" })
  if (($terms | length) == 0) { "" } else { $terms | each { |term| ['"' ($term | str replace -a '"' '""') '"'] | str join "" } | str join " OR " }
}

def parse-list [value: any] {
  let kind = ($value | describe)
  if ($kind | str starts-with "list") { return $value }
  let text = ($value | default "" | into string | str trim)
  if ($text | is-empty) { return [] }
  if ($text | str starts-with "[") { return ($text | from json) }
  $text | split row "," | each { |item| $item | str trim } | where {|item| $item != "" }
}

def embed-text [text: string] {
  if ($env.STRAP_ZK_EMBED_CMD? | is-not-empty) {
    let out = ({ texts: [$text] } | to json | ^sh -c $env.STRAP_ZK_EMBED_CMD)
    let parsed = ($out | from json)
    { model: $parsed.model, dimensions: $parsed.dimensions, vector: ($parsed.embeddings | first) }
  } else {
    let helper = ([ (strap-root) subprojects zettel bin embed.js ] | path join)
    let out = ({ texts: [$text] } | to json | ^node $helper)
    let parsed = ($out | from json)
    { model: $parsed.model, dimensions: $parsed.dimensions, vector: ($parsed.embeddings | first) }
  }
}

def ensure-db [db: string, dimensions: int] {
  if not ($db | path exists) {
    main init --db $db --dimensions $dimensions | ignore
    return
  }
  let rows = (sqlite-json $db "SELECT value FROM meta WHERE key = 'dimensions';")
  if (($rows | length) == 0) { error make { msg: $"Zettelkasten DB missing dimensions metadata: ($db)" } }
  let existing = (($rows | first).value | into int)
  if ($existing != $dimensions) {
    error make { msg: $"Embedding dimensions mismatch: DB has ($existing), embedding produced ($dimensions)" }
  }
}

def upsert-note [db: string, id: string, title: string, body: string, author: string, tags: list<string>, aliases: list<string>, embedding: record] {
  let created = (now-str)
  let id_sql = (sql-string $id)
  let title_sql = (sql-string $title)
  let body_sql = (sql-string $body)
  let created_sql = (sql-string $created)
  let author_sql = (sql-string $author)
  let chunk_sql = (sql-string (chunk-id $id))
  let vector = ($embedding.vector | to json --raw)
  let vector_sql = (sql-string $vector)
  let text = $"($title)\n\n($body)"
  let text_sql = (sql-string $text)
  let model_sql = (sql-string $embedding.model)
  let tag_sql = ($tags | each { |tag|
    let tag_value = (sql-string $tag)
    sql-template "INSERT INTO tags(note_id, tag) VALUES (__ID__, __TAG__);" { ID: $id_sql, TAG: $tag_value }
  } | str join "\n")
  let alias_sql = ($aliases | each { |alias|
    let alias_value = (sql-string $alias)
    sql-template "INSERT INTO aliases(note_id, alias) VALUES (__ID__, __ALIAS__);" { ID: $id_sql, ALIAS: $alias_value }
  } | str join "\n")
  let script = (sql-template "
BEGIN IMMEDIATE;
INSERT INTO notes(id, title, body, created_at, updated_at, author_actor, visibility, deleted_at)
VALUES (__ID__, __TITLE__, __BODY__, __CREATED__, __CREATED__, __AUTHOR__, 'shared', NULL)
ON CONFLICT(id) DO UPDATE SET title = excluded.title, body = excluded.body, updated_at = excluded.updated_at, author_actor = excluded.author_actor, deleted_at = NULL;
DELETE FROM notes_fts WHERE id = __ID__;
INSERT INTO notes_fts(id, title, body) VALUES (__ID__, __TITLE__, __BODY__);
DELETE FROM vec_chunks WHERE rowid IN (SELECT vec_rowid FROM chunk_vectors WHERE chunk_id IN (SELECT id FROM note_chunks WHERE note_id = __ID__));
DELETE FROM chunk_vectors WHERE chunk_id IN (SELECT id FROM note_chunks WHERE note_id = __ID__);
DELETE FROM note_chunks WHERE note_id = __ID__;
DELETE FROM tags WHERE note_id = __ID__;
DELETE FROM aliases WHERE note_id = __ID__;
INSERT INTO note_chunks(id, note_id, chunk_index, text, embedding_model, dimensions, updated_at)
VALUES (__CHUNK__, __ID__, 0, __TEXT__, __MODEL__, __DIMENSIONS__, __CREATED__);
INSERT INTO chunk_vectors(chunk_id) VALUES (__CHUNK__);
INSERT INTO vec_chunks(rowid, embedding) VALUES (last_insert_rowid(), __VECTOR__);
__TAGS__
__ALIASES__
COMMIT;
" { ID: $id_sql, TITLE: $title_sql, BODY: $body_sql, CREATED: $created_sql, AUTHOR: $author_sql, CHUNK: $chunk_sql, TEXT: $text_sql, MODEL: $model_sql, DIMENSIONS: $embedding.dimensions, VECTOR: $vector_sql, TAGS: $tag_sql, ALIASES: $alias_sql })
  sqlite-exec $db $script | ignore
}

def note-row [db: string, id: string] {
  let id_sql = (sql-string $id)
  let rows = (sqlite-json $db (sql-template "
SELECT id, title, body, created_at, updated_at, author_actor, visibility
FROM notes
WHERE id = __ID__ AND deleted_at IS NULL;
" { ID: $id_sql }))
  if (($rows | length) == 0) { null } else { $rows | first }
}

def state-last-text-event [state: record] {
  let assistant = ($state.root.children? | default [] | where type == event and from == assistant and text != "")
  if (($assistant | length) > 0) { return ($assistant | last) }
  let events = ($state.root.children? | default [] | where type == event and text != "")
  if (($events | length) == 0) { null } else { $events | last }
}

export def main [] {
  print "strap zk: use init, create, update, delete, list, tags, get, search-text, search-vector, search-hybrid, related, backlinks, link, reindex, remember-state, or tool"
}

export def "main init" [--db: string = "", --dimensions: int = 384] {
  let dbp = (db-path $db)
  mkdir ($dbp | path dirname)
  let script = (sql-template "
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO meta(key, value) VALUES ('schema_version', '1') ON CONFLICT(key) DO NOTHING;
INSERT INTO meta(key, value) VALUES ('dimensions', '__DIMENSIONS__') ON CONFLICT(key) DO NOTHING;
CREATE TABLE IF NOT EXISTS notes(
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  author_actor TEXT NOT NULL DEFAULT 'agent',
  visibility TEXT NOT NULL DEFAULT 'shared',
  source_event_id TEXT,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS note_chunks(
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chunk_vectors(
  vec_rowid INTEGER PRIMARY KEY AUTOINCREMENT,
  chunk_id TEXT NOT NULL UNIQUE REFERENCES note_chunks(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS links(
  from_note TEXT NOT NULL,
  to_note TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'related',
  created_at TEXT NOT NULL,
  PRIMARY KEY(from_note, to_note, type)
);
CREATE TABLE IF NOT EXISTS tags(note_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY(note_id, tag));
CREATE TABLE IF NOT EXISTS aliases(note_id TEXT NOT NULL, alias TEXT NOT NULL, PRIMARY KEY(note_id, alias));
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(id UNINDEXED, title, body, tokenize = 'porter unicode61');
CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(embedding float[__DIMENSIONS__]);
" { DIMENSIONS: $dimensions })
  sqlite-exec $dbp $script | ignore
  { ok: true, db: $dbp, dimensions: $dimensions, sqlite_vec_load: ($env.STRAP_ZK_SQLITE_VEC_LOAD? | default "vec0") } | to json
}

export def "main create" [--db: string = "", --title: string, --body: string, --tags: string = "", --aliases: string = "", --author: string = "agent", --id: string = ""] {
  let dbp = (db-path $db)
  let idv = (if ($id | is-empty) { note-id } else { $id })
  let embedding = (embed-text $"($title)\n\n($body)")
  ensure-db $dbp $embedding.dimensions
  upsert-note $dbp $idv $title $body $author (parse-list $tags) (parse-list $aliases) $embedding
  { ok: true, id: $idv, title: $title, db: $dbp, embedding_model: $embedding.model, dimensions: $embedding.dimensions } | to json
}

export def "main update" [id: string, --db: string = "", --title: string = "", --body: string = "", --tags: string = "", --aliases: string = "", --author: string = "agent"] {
  let dbp = (db-path $db)
  let existing = (note-row $dbp $id)
  if ($existing == null) { error make { msg: $"No note found: ($id)" } }
  let titlev = (if ($title | is-empty) { $existing.title } else { $title })
  let bodyv = (if ($body | is-empty) { $existing.body } else { $body })
  let embedding = (embed-text $"($titlev)\n\n($bodyv)")
  ensure-db $dbp $embedding.dimensions
  upsert-note $dbp $id $titlev $bodyv $author (parse-list $tags) (parse-list $aliases) $embedding
  { ok: true, id: $id, title: $titlev, db: $dbp } | to json
}

export def "main get" [id: string, --db: string = ""] {
  let dbp = (db-path $db)
  let id_sql = (sql-string $id)
  let rows = (sqlite-json $dbp (sql-template "
SELECT n.id, n.title, n.body, n.created_at, n.updated_at, n.author_actor, n.visibility,
       COALESCE((SELECT json_group_array(tag) FROM tags WHERE note_id = n.id), '[]') AS tags,
       COALESCE((SELECT json_group_array(alias) FROM aliases WHERE note_id = n.id), '[]') AS aliases
FROM notes n
WHERE n.id = __ID__ AND n.deleted_at IS NULL;
" { ID: $id_sql }))
  if (($rows | length) == 0) { error make { msg: $"No note found: ($id)" } }
  $rows | first | to json
}

export def "main list" [--db: string = "", --limit: int = 50, --tag: string = ""] {
  let dbp = (db-path $db)
  let tag_sql = (sql-string $tag)
  let where = (if ($tag | is-empty) { "n.deleted_at IS NULL" } else { $"n.deleted_at IS NULL AND EXISTS \(SELECT 1 FROM tags t WHERE t.note_id = n.id AND t.tag = ($tag_sql)\)" })
  sqlite-json $dbp (sql-template "
SELECT n.id, n.title, n.created_at, n.updated_at, n.author_actor,
       COALESCE((SELECT json_group_array(tag) FROM tags WHERE note_id = n.id), '[]') AS tags
FROM notes n
WHERE __WHERE__
ORDER BY n.updated_at DESC
LIMIT __LIMIT__;
" { WHERE: $where, LIMIT: $limit }) | to json
}

export def "main delete" [id: string, --db: string = ""] {
  let dbp = (db-path $db)
  let id_sql = (sql-string $id)
  let deleted_sql = (sql-string (now-str))
  sqlite-exec $dbp (sql-template "
BEGIN IMMEDIATE;
UPDATE notes SET deleted_at = __DELETED__ WHERE id = __ID__;
DELETE FROM notes_fts WHERE id = __ID__;
DELETE FROM vec_chunks WHERE rowid IN (SELECT vec_rowid FROM chunk_vectors WHERE chunk_id IN (SELECT id FROM note_chunks WHERE note_id = __ID__));
DELETE FROM chunk_vectors WHERE chunk_id IN (SELECT id FROM note_chunks WHERE note_id = __ID__);
COMMIT;
" { ID: $id_sql, DELETED: $deleted_sql }) | ignore
  { ok: true, id: $id, deleted_at: (now-str) } | to json
}

export def "main tags" [--db: string = ""] {
  let dbp = (db-path $db)
  sqlite-json $dbp "
SELECT tag, count(*) AS notes
FROM tags
WHERE note_id IN (SELECT id FROM notes WHERE deleted_at IS NULL)
GROUP BY tag
ORDER BY notes DESC, tag ASC;
" | to json
}

export def "main search-text" [query: string, --db: string = "", --limit: int = 10] {
  let dbp = (db-path $db)
  if not ($dbp | path exists) { main init --db $dbp --dimensions 384 | ignore }
  let q = (fts-query $query)
  if ($q | is-empty) { [] | to json; return }
  let q_sql = (sql-string $q)
  sqlite-json $dbp (sql-template "
SELECT n.id AS note_id, n.title, snippet(notes_fts, 2, '[', ']', ' ... ', 24) AS matched_chunk,
       bm25(notes_fts) AS rank, 1.0 / (1.0 + abs(bm25(notes_fts))) AS score,
       'text' AS source
FROM notes_fts
JOIN notes n ON n.id = notes_fts.id
WHERE notes_fts MATCH __QUERY__ AND n.deleted_at IS NULL
ORDER BY bm25(notes_fts)
LIMIT __LIMIT__;
" { QUERY: $q_sql, LIMIT: $limit }) | to json
}

export def "main search-vector" [query: string, --db: string = "", --limit: int = 10] {
  let dbp = (db-path $db)
  let embedding = (embed-text $query)
  ensure-db $dbp $embedding.dimensions
  let vector = ($embedding.vector | to json --raw)
  let vector_sql = (sql-string $vector)
  sqlite-json $dbp (sql-template "
WITH matches AS (
  SELECT rowid, distance
  FROM vec_chunks
  WHERE embedding MATCH __VECTOR__
  ORDER BY distance
  LIMIT __LIMIT__
)
SELECT n.id AS note_id, n.title, c.text AS matched_chunk, matches.distance,
       1.0 / (1.0 + matches.distance) AS score, 'vector' AS source
FROM matches
JOIN chunk_vectors cv ON cv.vec_rowid = matches.rowid
JOIN note_chunks c ON c.id = cv.chunk_id
JOIN notes n ON n.id = c.note_id
WHERE n.deleted_at IS NULL
ORDER BY matches.distance;
" { VECTOR: $vector_sql, LIMIT: $limit }) | to json
}

export def "main search-hybrid" [query: string, --db: string = "", --limit: int = 10] {
  let vector = (main search-vector $query --db $db --limit $limit | from json | upsert source {|_| "vector" })
  let text = (main search-text $query --db $db --limit $limit | from json | upsert source {|_| "text" })
  ($text | append $vector | group-by note_id | transpose note_id matches | each { |row|
    let best = ($row.matches | sort-by score | reverse | first)
    $best | merge { sources: ($row.matches | get source | uniq), hybrid_score: ($row.matches | get score | math sum) }
  } | sort-by hybrid_score | reverse | first $limit) | to json
}

export def "main related" [id: string, --db: string = "", --limit: int = 10] {
  let dbp = (db-path $db)
  let row = (note-row $dbp $id)
  if ($row == null) { error make { msg: $"No note found: ($id)" } }
  main search-vector $"($row.title)\n\n($row.body)" --db $dbp --limit ($limit + 1) | from json | where note_id != $id | first $limit | to json
}

export def "main backlinks" [id: string, --db: string = ""] {
  let dbp = (db-path $db)
  let id_sql = (sql-string $id)
  sqlite-json $dbp (sql-template "
SELECT l.from_note, n.title AS from_title, l.to_note, l.type, l.created_at
FROM links l
JOIN notes n ON n.id = l.from_note
WHERE l.to_note = __ID__ AND n.deleted_at IS NULL
ORDER BY l.created_at DESC;
" { ID: $id_sql }) | to json
}

export def "main link" [from_note: string, to_note: string, --type: string = "related", --db: string = ""] {
  let dbp = (db-path $db)
  let created = (now-str)
  let from_sql = (sql-string $from_note)
  let to_sql = (sql-string $to_note)
  let type_sql = (sql-string $type)
  let created_sql = (sql-string $created)
  sqlite-exec $dbp (sql-template "
BEGIN IMMEDIATE;
INSERT INTO links(from_note, to_note, type, created_at)
VALUES (__FROM__, __TO__, __TYPE__, __CREATED__)
ON CONFLICT(from_note, to_note, type) DO NOTHING;
COMMIT;
" { FROM: $from_sql, TO: $to_sql, TYPE: $type_sql, CREATED: $created_sql }) | ignore
  { ok: true, from_note: $from_note, to_note: $to_note, type: $type } | to json
}

export def "main reindex" [--db: string = "", --id: string = ""] {
  let dbp = (db-path $db)
  let id_sql = (sql-string $id)
  let where = (if ($id | is-empty) { "deleted_at IS NULL" } else { ["id = " $id_sql " AND deleted_at IS NULL"] | str join "" })
  let rows = (sqlite-json $dbp (sql-template "
SELECT n.id, n.title, n.body, n.author_actor,
       COALESCE((SELECT json_group_array(tag) FROM tags WHERE note_id = n.id), '[]') AS tags,
       COALESCE((SELECT json_group_array(alias) FROM aliases WHERE note_id = n.id), '[]') AS aliases
FROM notes n
WHERE __WHERE__;
" { WHERE: $where }))
  for row in $rows {
    let embedding = (embed-text $"($row.title)\n\n($row.body)")
    ensure-db $dbp $embedding.dimensions
    upsert-note $dbp $row.id $row.title $row.body $row.author_actor (parse-list $row.tags) (parse-list $row.aliases) $embedding
  }
  { ok: true, reindexed: ($rows | length), db: $dbp } | to json
}

export def "main remember-state" [--db: string = "", --title: string = "", --tags: string = "session,summary", --author: string = "agent", --file: string = ""] {
  let raw = (if not ($file | is-empty) { open $file --raw } else if (($in | describe) == "nothing") { ^cat } else { $in })
  let state = (if (($raw | describe) | str starts-with "record") { $raw } else { $raw | into string | from json })
  let event = (state-last-text-event $state)
  if ($event == null) { error make { msg: "No text event found in state" } }
  let titlev = (if ($title | is-empty) { ($event.text | lines | first | str substring 0..80) } else { $title })
  main create --db $db --title $titlev --body $event.text --tags $tags --author $author
}

export def "main tool" [] {
  let input_kind = ($in | describe)
  let req = if ($input_kind | str starts-with "record") {
    $in
  } else if ($input_kind | str starts-with "table") {
    $in | first
  } else if ($input_kind == "nothing") {
    ^cat | from json
  } else {
    $in | into string | from json
  }
  let action = ($req.action? | default "search_hybrid")
  let db = ($req.db? | default "")
  match $action {
    "init" => { main init --db $db --dimensions ($req.dimensions? | default 384) }
    "create" => { main create --db $db --title $req.title --body $req.body --tags (($req.tags? | default []) | to json --raw) --aliases (($req.aliases? | default []) | to json --raw) --author ($req.author? | default "agent") }
    "update" => { main update $req.id --db $db --title ($req.title? | default "") --body ($req.body? | default "") --tags (($req.tags? | default []) | to json --raw) --aliases (($req.aliases? | default []) | to json --raw) --author ($req.author? | default "agent") }
    "delete" => { main delete $req.id --db $db }
    "list" => { main list --db $db --limit ($req.limit? | default 50) --tag ($req.tag? | default "") }
    "tags" => { main tags --db $db }
    "get" => { main get $req.id --db $db }
    "search_text" => { main search-text $req.query --db $db --limit ($req.limit? | default 10) }
    "search_vector" => { main search-vector $req.query --db $db --limit ($req.limit? | default 10) }
    "search_hybrid" => { main search-hybrid $req.query --db $db --limit ($req.limit? | default 10) }
    "related" => { main related $req.id --db $db --limit ($req.limit? | default 10) }
    "backlinks" => { main backlinks $req.id --db $db }
    "link" => { main link $req.from_note $req.to_note --type ($req.type? | default "related") --db $db }
    "reindex" => { main reindex --db $db --id ($req.id? | default "") }
    _ => { error make { msg: $"Unknown zk action: ($action)" } }
  }
}
