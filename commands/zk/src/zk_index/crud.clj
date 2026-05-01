(in-ns 'zk.index)

(defn create-note [args]
  (let [{:keys [opts]} (parse-args args) db (db-path (:db opts)) id (or (:id opts) (note-id))
        title (:title opts) body (or (:body opts) "") embedding (embed-text (str title "\n\n" body))]
    (ensure-db db (:dimensions embedding))
    (upsert-note db id title body (or (:author opts) "agent") (parse-list (:tags opts)) (parse-list (:aliases opts)) embedding)
    (json-out {:ok true :id id :title title :db db :embedding_model (:model embedding) :dimensions (:dimensions embedding)})))

(defn update-note [args]
  (let [{:keys [opts pos]} (parse-args args) db (db-path (:db opts)) id (first pos) existing (note-row db id)]
    (when-not existing (throw (ex-info (str "No note found: " id) {})))
    (let [title (or (not-empty (:title opts)) (:title existing)) body (or (not-empty (:body opts)) (:body existing)) embedding (embed-text (str title "\n\n" body))]
      (ensure-db db (:dimensions embedding))
      (upsert-note db id title body (or (:author opts) "agent") (parse-list (:tags opts)) (parse-list (:aliases opts)) embedding)
      (json-out {:ok true :id id :title title :db db}))))

(defn get-note [args]
  (let [{:keys [opts pos]} (parse-args args) db (db-path (:db opts)) id (first pos)
        rows (sqlite-json db (sql-template "
SELECT n.id, n.title, n.body, n.created_at, n.updated_at, n.author_actor, n.visibility,
       COALESCE((SELECT json_group_array(tag) FROM tags WHERE note_id = n.id), '[]') AS tags,
       COALESCE((SELECT json_group_array(alias) FROM aliases WHERE note_id = n.id), '[]') AS aliases
FROM notes n
WHERE n.id = __ID__ AND n.deleted_at IS NULL;
" {:ID (sql-string id)}))]
    (when (empty? rows) (throw (ex-info (str "No note found: " id) {})))
    (json-out (first rows))))

(defn list-notes [args]
  (let [{:keys [opts]} (parse-args args) db (db-path (:db opts)) limit (parse-long (str (or (:limit opts) "50"))) tag (or (:tag opts) "")
        where (if (empty? tag) "n.deleted_at IS NULL" (str "n.deleted_at IS NULL AND EXISTS (SELECT 1 FROM tags t WHERE t.note_id = n.id AND t.tag = " (sql-string tag) ")"))]
    (json-out (sqlite-json db (sql-template "
SELECT n.id, n.title, n.created_at, n.updated_at, n.author_actor,
       COALESCE((SELECT json_group_array(tag) FROM tags WHERE note_id = n.id), '[]') AS tags
FROM notes n
WHERE __WHERE__
ORDER BY n.updated_at DESC
LIMIT __LIMIT__;
" {:WHERE where :LIMIT limit})))))

(defn delete-note [args]
  (let [{:keys [opts pos]} (parse-args args) db (db-path (:db opts)) id (first pos) deleted (now)]
    (sqlite-exec db (sql-template "
BEGIN IMMEDIATE;
UPDATE notes SET deleted_at = __DELETED__ WHERE id = __ID__;
DELETE FROM notes_fts WHERE id = __ID__;
DELETE FROM vec_chunks WHERE rowid IN (SELECT vec_rowid FROM chunk_vectors WHERE chunk_id IN (SELECT id FROM note_chunks WHERE note_id = __ID__));
DELETE FROM chunk_vectors WHERE chunk_id IN (SELECT id FROM note_chunks WHERE note_id = __ID__);
COMMIT;
" {:ID (sql-string id) :DELETED (sql-string deleted)}))
    (json-out {:ok true :id id :deleted_at deleted})))

(defn list-tags [args]
  (let [{:keys [opts]} (parse-args args)]
    (json-out (sqlite-json (db-path (:db opts)) "
SELECT tag, count(*) AS notes
FROM tags
WHERE note_id IN (SELECT id FROM notes WHERE deleted_at IS NULL)
GROUP BY tag
ORDER BY notes DESC, tag ASC;
"))))
