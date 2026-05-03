(ns zk-index.schema
  (:require [babashka.fs :as fs]
            [cheshire.core :as json]
            [clojure.string :as str]
            [zk-index.core :as core]))

(defn init-db* [db dimensions]
  (let [db (core/db-path db)]
    (fs/create-dirs (fs/parent db))
    (core/sqlite-exec db (core/sql-template "
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
    {:ok true
     :db db
     :dimensions dimensions
     :sqlite_vec_load (or (core/env "STRAP_ZK_SQLITE_VEC_LOAD") "vec0")}))

(defn init-db [args]
  (let [{:keys [opts]} (core/parse-args args)
        dimensions (parse-long (str (or (:dimensions opts) "384")))]
    (core/json-out (init-db* (:db opts) dimensions))))

(defn ensure-db [db dimensions]
  (if-not (fs/exists? db)
    (init-db* db dimensions)
    (let [rows (core/sqlite-json db "SELECT value FROM meta WHERE key = 'dimensions';")]
      (when (empty? rows) (throw (ex-info (str "Zettelkasten DB missing dimensions metadata: " db) {})))
      (let [existing (parse-long (str (:value (first rows))))]
        (when-not (= existing dimensions)
          (throw (ex-info (str "Embedding dimensions mismatch: DB has " existing ", embedding produced " dimensions) {})))))))

(defn tag-sql [id tags]
  (str/join "\n"
            (for [tag tags]
              (core/sql-template "INSERT INTO tags(note_id, tag) VALUES (__ID__, __TAG__);"
                                 {:ID (core/sql-string id) :TAG (core/sql-string tag)}))))

(defn alias-sql [id aliases]
  (str/join "\n"
            (for [alias aliases]
              (core/sql-template "INSERT INTO aliases(note_id, alias) VALUES (__ID__, __ALIAS__);"
                                 {:ID (core/sql-string id) :ALIAS (core/sql-string alias)}))))

(defn upsert-note [db id title body author tags aliases embedding]
  (let [created (core/now)
        text (str title "\n\n" body)
        script (core/sql-template "
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
" {:ID (core/sql-string id)
   :TITLE (core/sql-string title)
   :BODY (core/sql-string body)
   :CREATED (core/sql-string created)
   :AUTHOR (core/sql-string author)
   :CHUNK (core/sql-string (core/chunk-id id))
   :TEXT (core/sql-string text)
   :MODEL (core/sql-string (:model embedding))
   :DIMENSIONS (:dimensions embedding)
   :VECTOR (core/sql-string (json/generate-string (:vector embedding)))
   :TAGS (tag-sql id tags)
   :ALIASES (alias-sql id aliases)})]
    (core/sqlite-exec db script)))

(defn note-row [db id]
  (first (core/sqlite-json db (core/sql-template "
SELECT id, title, body, created_at, updated_at, author_actor, visibility
FROM notes
WHERE id = __ID__ AND deleted_at IS NULL;
" {:ID (core/sql-string id)}))))
