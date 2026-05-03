(ns zk-index.search
  (:require [babashka.fs :as fs]
            [cheshire.core :as json]
            [clojure.string :as str]
            [zk-index.core :as core]
            [zk-index.schema :as schema]))

(defn search-text-results [db query limit]
  (let [db (core/db-path db)
        q (core/fts-query query)]
    (when-not (fs/exists? db) (schema/init-db* db 384))
    (if (empty? q)
      []
      (core/sqlite-json db (core/sql-template "
SELECT n.id AS note_id, n.title, snippet(notes_fts, 2, '[', ']', ' ... ', 24) AS matched_chunk,
       bm25(notes_fts) AS rank, 1.0 / (1.0 + abs(bm25(notes_fts))) AS score,
       'text' AS source
FROM notes_fts
JOIN notes n ON n.id = notes_fts.id
WHERE notes_fts MATCH __QUERY__ AND n.deleted_at IS NULL
ORDER BY bm25(notes_fts)
LIMIT __LIMIT__;
" {:QUERY (core/sql-string q) :LIMIT limit})))))

(defn search-text [args]
  (let [{:keys [opts pos]} (core/parse-args args)
        query (str/join " " pos)
        limit (parse-long (str (or (:limit opts) "10")))]
    (core/json-out (search-text-results (:db opts) query limit))))

(defn search-vector-results [db query limit]
  (let [db (core/db-path db)
        embedding (core/embed-text query)]
    (schema/ensure-db db (:dimensions embedding))
    (core/sqlite-json db (core/sql-template "
WITH matches AS (SELECT rowid, distance FROM vec_chunks WHERE embedding MATCH __VECTOR__ ORDER BY distance LIMIT __LIMIT__)
SELECT n.id AS note_id, n.title, c.text AS matched_chunk, matches.distance,
       1.0 / (1.0 + matches.distance) AS score, 'vector' AS source
FROM matches
JOIN chunk_vectors cv ON cv.vec_rowid = matches.rowid
JOIN note_chunks c ON c.id = cv.chunk_id
JOIN notes n ON n.id = c.note_id
WHERE n.deleted_at IS NULL
ORDER BY matches.distance;
" {:VECTOR (core/sql-string (json/generate-string (:vector embedding))) :LIMIT limit}))))

(defn search-vector [args]
  (let [{:keys [opts pos]} (core/parse-args args)
        query (str/join " " pos)
        limit (parse-long (str (or (:limit opts) "10")))]
    (core/json-out (search-vector-results (:db opts) query limit))))

(defn search-hybrid-results [db query limit]
  (let [text (search-text-results db query limit)
        vector (search-vector-results db query limit)
        grouped (group-by :note_id (concat text vector))]
    (->> grouped
         (map (fn [[_ matches]] (let [best (last (sort-by #(double (or (:score %) 0)) matches))]
                                  (assoc best :sources (vec (distinct (map :source matches))) :hybrid_score (reduce + (map #(double (or (:score %) 0)) matches))))))
         (sort-by :hybrid_score >)
         (take limit))))

(defn search-hybrid [args]
  (let [{:keys [opts pos]} (core/parse-args args)
        query (str/join " " pos)
        limit (parse-long (str (or (:limit opts) "10")))]
    (core/json-out (search-hybrid-results (:db opts) query limit))))

(defn related [args]
  (let [{:keys [opts pos]} (core/parse-args args) db (core/db-path (:db opts)) id (first pos) row (schema/note-row db id)]
    (when-not row (throw (ex-info (str "No note found: " id) {})))
    (let [limit (parse-long (str (or (:limit opts) "10")))
          rows (search-vector-results db (str (:title row) "\n\n" (:body row)) (inc limit))]
      (core/json-out (take limit (remove #(= id (:note_id %)) rows))))))

(defn backlinks [args]
  (let [{:keys [opts pos]} (core/parse-args args) db (core/db-path (:db opts)) id (first pos)]
    (core/json-out (core/sqlite-json db (core/sql-template "
SELECT l.from_note, n.title AS from_title, l.to_note, l.type, l.created_at
FROM links l
JOIN notes n ON n.id = l.from_note
WHERE l.to_note = __ID__ AND n.deleted_at IS NULL
ORDER BY l.created_at DESC;
" {:ID (core/sql-string id)})))))

(defn link [args]
  (let [{:keys [opts pos]} (core/parse-args args) db (core/db-path (:db opts)) from-note (first pos) to-note (second pos) type (or (:type opts) "related") created (core/now)]
    (core/sqlite-exec db (core/sql-template "
BEGIN IMMEDIATE;
INSERT INTO links(from_note, to_note, type, created_at)
VALUES (__FROM__, __TO__, __TYPE__, __CREATED__)
ON CONFLICT(from_note, to_note, type) DO NOTHING;
COMMIT;
" {:FROM (core/sql-string from-note) :TO (core/sql-string to-note) :TYPE (core/sql-string type) :CREATED (core/sql-string created)}))
    (core/json-out {:ok true :from_note from-note :to_note to-note :type type})))

(defn reindex [args]
  (let [{:keys [opts]} (core/parse-args args) db (core/db-path (:db opts)) id (or (:id opts) "")
        where (if (empty? id) "deleted_at IS NULL" (str "id = " (core/sql-string id) " AND deleted_at IS NULL"))
        rows (core/sqlite-json db (core/sql-template "
SELECT n.id, n.title, n.body, n.author_actor,
       COALESCE((SELECT json_group_array(tag) FROM tags WHERE note_id = n.id), '[]') AS tags,
       COALESCE((SELECT json_group_array(alias) FROM aliases WHERE note_id = n.id), '[]') AS aliases
FROM notes n
WHERE __WHERE__;
" {:WHERE where}))]
    (doseq [row rows]
      (let [embedding (core/embed-text (str (:title row) "\n\n" (:body row)))]
        (schema/ensure-db db (:dimensions embedding))
        (schema/upsert-note db (:id row) (:title row) (:body row) (:author_actor row) (core/parse-list (:tags row)) (core/parse-list (:aliases row)) embedding)))
    (core/json-out {:ok true :reindexed (count rows) :db db})))
