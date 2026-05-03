(ns zk-index.crud
  (:require [zk-index.core :as core]
            [zk-index.schema :as schema]))

(defn create-note [args]
  (let [{:keys [opts]} (core/parse-args args) db (core/db-path (:db opts)) id (or (:id opts) (core/note-id))
        title (:title opts) body (or (:body opts) "") embedding (core/embed-text (str title "\n\n" body))]
    (schema/ensure-db db (:dimensions embedding))
    (schema/upsert-note db id title body (or (:author opts) "agent") (core/parse-list (:tags opts)) (core/parse-list (:aliases opts)) embedding)
    (core/json-out {:ok true :id id :title title :db db :embedding_model (:model embedding) :dimensions (:dimensions embedding)})))

(defn update-note [args]
  (let [{:keys [opts pos]} (core/parse-args args) db (core/db-path (:db opts)) id (first pos) existing (schema/note-row db id)]
    (when-not existing (throw (ex-info (str "No note found: " id) {})))
    (let [title (or (not-empty (:title opts)) (:title existing)) body (or (not-empty (:body opts)) (:body existing)) embedding (core/embed-text (str title "\n\n" body))]
      (schema/ensure-db db (:dimensions embedding))
      (schema/upsert-note db id title body (or (:author opts) "agent") (core/parse-list (:tags opts)) (core/parse-list (:aliases opts)) embedding)
      (core/json-out {:ok true :id id :title title :db db}))))

(defn get-note [args]
  (let [{:keys [opts pos]} (core/parse-args args) db (core/db-path (:db opts)) id (first pos)
        rows (core/sqlite-json db (core/sql-template "
SELECT n.id, n.title, n.body, n.created_at, n.updated_at, n.author_actor, n.visibility,
       COALESCE((SELECT json_group_array(tag) FROM tags WHERE note_id = n.id), '[]') AS tags,
       COALESCE((SELECT json_group_array(alias) FROM aliases WHERE note_id = n.id), '[]') AS aliases
FROM notes n
WHERE n.id = __ID__ AND n.deleted_at IS NULL;
" {:ID (core/sql-string id)}))]
    (when (empty? rows) (throw (ex-info (str "No note found: " id) {})))
    (core/json-out (first rows))))

(defn list-notes [args]
  (let [{:keys [opts]} (core/parse-args args) db (core/db-path (:db opts)) limit (parse-long (str (or (:limit opts) "50"))) tag (or (:tag opts) "")
        where (if (empty? tag) "n.deleted_at IS NULL" (str "n.deleted_at IS NULL AND EXISTS (SELECT 1 FROM tags t WHERE t.note_id = n.id AND t.tag = " (core/sql-string tag) ")"))]
    (core/json-out (core/sqlite-json db (core/sql-template "
SELECT n.id, n.title, n.created_at, n.updated_at, n.author_actor,
       COALESCE((SELECT json_group_array(tag) FROM tags WHERE note_id = n.id), '[]') AS tags
FROM notes n
WHERE __WHERE__
ORDER BY n.updated_at DESC
LIMIT __LIMIT__;
" {:WHERE where :LIMIT limit})))))

(defn delete-note [args]
  (let [{:keys [opts pos]} (core/parse-args args) db (core/db-path (:db opts)) id (first pos) deleted (core/now)]
    (core/sqlite-exec db (core/sql-template "
BEGIN IMMEDIATE;
UPDATE notes SET deleted_at = __DELETED__ WHERE id = __ID__;
DELETE FROM notes_fts WHERE id = __ID__;
DELETE FROM vec_chunks WHERE rowid IN (SELECT vec_rowid FROM chunk_vectors WHERE chunk_id IN (SELECT id FROM note_chunks WHERE note_id = __ID__));
DELETE FROM chunk_vectors WHERE chunk_id IN (SELECT id FROM note_chunks WHERE note_id = __ID__);
COMMIT;
" {:ID (core/sql-string id) :DELETED (core/sql-string deleted)}))
    (core/json-out {:ok true :id id :deleted_at deleted})))

(defn list-tags [args]
  (let [{:keys [opts]} (core/parse-args args)]
    (core/json-out (core/sqlite-json (core/db-path (:db opts)) "
SELECT tag, count(*) AS notes
FROM tags
WHERE note_id IN (SELECT id FROM notes WHERE deleted_at IS NULL)
GROUP BY tag
ORDER BY notes DESC, tag ASC;
"))))
