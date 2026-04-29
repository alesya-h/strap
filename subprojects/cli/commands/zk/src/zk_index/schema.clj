(in-ns 'zk.index)

(defn init-db [args]
  (let [{:keys [opts]} (parse-args args) db (db-path (:db opts)) dimensions (parse-long (str (or (:dimensions opts) "384")))]
    (fs/create-dirs (fs/parent db))
    (sqlite-exec db (sql-template "
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO meta(key, value) VALUES ('schema_version', '1') ON CONFLICT(key) DO NOTHING;
INSERT INTO meta(key, value) VALUES ('dimensions', '__DIMENSIONS__') ON CONFLICT(key) DO NOTHING;
CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, author_actor TEXT NOT NULL DEFAULT 'agent', visibility TEXT NOT NULL DEFAULT 'shared', source_event_id TEXT, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS note_chunks(id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE, chunk_index INTEGER NOT NULL, text TEXT NOT NULL, embedding_model TEXT NOT NULL, dimensions INTEGER NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chunk_vectors(vec_rowid INTEGER PRIMARY KEY AUTOINCREMENT, chunk_id TEXT NOT NULL UNIQUE REFERENCES note_chunks(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS links(from_note TEXT NOT NULL, to_note TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'related', created_at TEXT NOT NULL, PRIMARY KEY(from_note, to_note, type));
CREATE TABLE IF NOT EXISTS tags(note_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY(note_id, tag));
CREATE TABLE IF NOT EXISTS aliases(note_id TEXT NOT NULL, alias TEXT NOT NULL, PRIMARY KEY(note_id, alias));
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(id UNINDEXED, title, body, tokenize = 'porter unicode61');
CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(embedding float[__DIMENSIONS__]);
" {:DIMENSIONS dimensions}))
    (json-out {:ok true :db db :dimensions dimensions :sqlite_vec_load (or (env "STRAP_ZK_SQLITE_VEC_LOAD") "vec0")})))

(defn ensure-db [db dimensions]
  (if-not (fs/exists? db)
    (binding [*out* (java.io.StringWriter.)] (init-db ["--db" db "--dimensions" (str dimensions)]))
    (let [rows (sqlite-json db "SELECT value FROM meta WHERE key = 'dimensions';")]
      (when (empty? rows) (throw (ex-info (str "Zettelkasten DB missing dimensions metadata: " db) {})))
      (let [existing (parse-long (str (:value (first rows))))]
        (when-not (= existing dimensions)
          (throw (ex-info (str "Embedding dimensions mismatch: DB has " existing ", embedding produced " dimensions) {})))))))

(defn tag-sql [id tags]
  (str/join "\n" (for [tag tags] (sql-template "INSERT INTO tags(note_id, tag) VALUES (__ID__, __TAG__);" {:ID (sql-string id) :TAG (sql-string tag)}))))

(defn alias-sql [id aliases]
  (str/join "\n" (for [alias aliases] (sql-template "INSERT INTO aliases(note_id, alias) VALUES (__ID__, __ALIAS__);" {:ID (sql-string id) :ALIAS (sql-string alias)}))))

(defn upsert-note [db id title body author tags aliases embedding]
  (let [created (now) text (str title "\n\n" body)
        script (sql-template "
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
" {:ID (sql-string id) :TITLE (sql-string title) :BODY (sql-string body) :CREATED (sql-string created)
   :AUTHOR (sql-string author) :CHUNK (sql-string (chunk-id id)) :TEXT (sql-string text)
   :MODEL (sql-string (:model embedding)) :DIMENSIONS (:dimensions embedding)
   :VECTOR (sql-string (json/generate-string (:vector embedding))) :TAGS (tag-sql id tags) :ALIASES (alias-sql id aliases)})]
    (sqlite-exec db script)))

(defn note-row [db id]
  (first (sqlite-json db (sql-template "
SELECT id, title, body, created_at, updated_at, author_actor, visibility
FROM notes
WHERE id = __ID__ AND deleted_at IS NULL;
" {:ID (sql-string id)}))))
