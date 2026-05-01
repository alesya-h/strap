(in-ns 'zk.index)

(defn search-text [args]
  (let [{:keys [opts pos]} (parse-args args) db (db-path (:db opts)) query (str/join " " pos) limit (parse-long (str (or (:limit opts) "10"))) q (fts-query query)]
    (when-not (fs/exists? db) (binding [*out* (java.io.StringWriter.)] (init-db ["--db" db "--dimensions" "384"])))
    (if (empty? q)
      (json-out [])
      (json-out (sqlite-json db (sql-template "
SELECT n.id AS note_id, n.title, snippet(notes_fts, 2, '[', ']', ' ... ', 24) AS matched_chunk,
       bm25(notes_fts) AS rank, 1.0 / (1.0 + abs(bm25(notes_fts))) AS score,
       'text' AS source
FROM notes_fts
JOIN notes n ON n.id = notes_fts.id
WHERE notes_fts MATCH __QUERY__ AND n.deleted_at IS NULL
ORDER BY bm25(notes_fts)
LIMIT __LIMIT__;
" {:QUERY (sql-string q) :LIMIT limit}))))))

(defn search-vector [args]
  (let [{:keys [opts pos]} (parse-args args) db (db-path (:db opts)) query (str/join " " pos) limit (parse-long (str (or (:limit opts) "10"))) embedding (embed-text query)]
    (ensure-db db (:dimensions embedding))
    (json-out (sqlite-json db (sql-template "
WITH matches AS (SELECT rowid, distance FROM vec_chunks WHERE embedding MATCH __VECTOR__ ORDER BY distance LIMIT __LIMIT__)
SELECT n.id AS note_id, n.title, c.text AS matched_chunk, matches.distance,
       1.0 / (1.0 + matches.distance) AS score, 'vector' AS source
FROM matches
JOIN chunk_vectors cv ON cv.vec_rowid = matches.rowid
JOIN note_chunks c ON c.id = cv.chunk_id
JOIN notes n ON n.id = c.note_id
WHERE n.deleted_at IS NULL
ORDER BY matches.distance;
" {:VECTOR (sql-string (json/generate-string (:vector embedding))) :LIMIT limit})))))

(defn search-hybrid [args]
  (let [{:keys [opts pos]} (parse-args args) query (str/join " " pos) limit (parse-long (str (or (:limit opts) "10")))
        pass [query "--db" (or (:db opts) "") "--limit" (str limit)] text (parse-json (with-out-str (search-text pass)))
        vector (parse-json (with-out-str (search-vector pass))) grouped (group-by :note_id (concat text vector))
        results (->> grouped
                     (map (fn [[_ matches]] (let [best (last (sort-by #(double (or (:score %) 0)) matches))]
                                              (assoc best :sources (vec (distinct (map :source matches))) :hybrid_score (reduce + (map #(double (or (:score %) 0)) matches))))))
                     (sort-by :hybrid_score >) (take limit))]
    (json-out results)))

(defn related [args]
  (let [{:keys [opts pos]} (parse-args args) db (db-path (:db opts)) id (first pos) row (note-row db id)]
    (when-not row (throw (ex-info (str "No note found: " id) {})))
    (let [limit (parse-long (str (or (:limit opts) "10")))
          rows (parse-json (with-out-str (search-vector [(str (:title row) "\n\n" (:body row)) "--db" db "--limit" (str (inc limit))])))]
      (json-out (take limit (remove #(= id (:note_id %)) rows))))))

(defn backlinks [args]
  (let [{:keys [opts pos]} (parse-args args) db (db-path (:db opts)) id (first pos)]
    (json-out (sqlite-json db (sql-template "
SELECT l.from_note, n.title AS from_title, l.to_note, l.type, l.created_at
FROM links l
JOIN notes n ON n.id = l.from_note
WHERE l.to_note = __ID__ AND n.deleted_at IS NULL
ORDER BY l.created_at DESC;
" {:ID (sql-string id)})))))

(defn link [args]
  (let [{:keys [opts pos]} (parse-args args) db (db-path (:db opts)) from-note (first pos) to-note (second pos) type (or (:type opts) "related") created (now)]
    (sqlite-exec db (sql-template "
BEGIN IMMEDIATE;
INSERT INTO links(from_note, to_note, type, created_at)
VALUES (__FROM__, __TO__, __TYPE__, __CREATED__)
ON CONFLICT(from_note, to_note, type) DO NOTHING;
COMMIT;
" {:FROM (sql-string from-note) :TO (sql-string to-note) :TYPE (sql-string type) :CREATED (sql-string created)}))
    (json-out {:ok true :from_note from-note :to_note to-note :type type})))

(defn reindex [args]
  (let [{:keys [opts]} (parse-args args) db (db-path (:db opts)) id (or (:id opts) "")
        where (if (empty? id) "deleted_at IS NULL" (str "id = " (sql-string id) " AND deleted_at IS NULL"))
        rows (sqlite-json db (sql-template "
SELECT n.id, n.title, n.body, n.author_actor,
       COALESCE((SELECT json_group_array(tag) FROM tags WHERE note_id = n.id), '[]') AS tags,
       COALESCE((SELECT json_group_array(alias) FROM aliases WHERE note_id = n.id), '[]') AS aliases
FROM notes n
WHERE __WHERE__;
" {:WHERE where}))]
    (doseq [row rows]
      (let [embedding (embed-text (str (:title row) "\n\n" (:body row)))]
        (ensure-db db (:dimensions embedding))
        (upsert-note db (:id row) (:title row) (:body row) (:author_actor row) (parse-list (:tags row)) (parse-list (:aliases row)) embedding)))
    (json-out {:ok true :reindexed (count rows) :db db})))
