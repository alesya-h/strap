(ns zk.index
  (:require [babashka.fs :as fs]
            [cheshire.core :as json]
            [clojure.java.shell :as sh]
            [clojure.string :as str]))

(def flag-options #{})

(defn env [name]
  (System/getenv name))

(defn now []
  (.toString (java.time.Instant/now)))

(defn note-id []
  (str "zk_" (random-uuid)))

(defn chunk-id [id]
  (str id ":0"))

(defn json-out [value]
  (println (json/generate-string value)))

(defn parse-json [text]
  (json/parse-string text true))

(defn usage []
  (binding [*out* *err*]
    (println "Usage: strap inner zk index <init|create|update|delete|list|tags|get|search-text|search-vector|search-hybrid|related|backlinks|link|reindex> [args]"))
  (System/exit 2))

(defn parse-args [args]
  (loop [xs (seq args) opts {} pos []]
    (if-not xs
      {:opts opts :pos pos}
      (let [x (first xs)]
        (if (str/starts-with? x "--")
          (let [k (keyword (subs x 2)) y (second xs)]
            (if (or (contains? flag-options x) (nil? y) (str/starts-with? y "--"))
              (recur (next xs) (assoc opts k true) pos)
              (recur (nnext xs) (assoc opts k y) pos)))
          (recur (next xs) opts (conj pos x)))))))

(defn parse-list [value]
  (cond
    (nil? value) []
    (vector? value) value
    (sequential? value) (vec value)
    :else (let [text (str/trim (str value))]
            (cond
              (empty? text) []
              (str/starts-with? text "[") (vec (json/parse-string text))
              :else (->> (str/split text #",") (map str/trim) (remove empty?) vec)))))

(defn default-db []
  (or (env "STRAP_ZK_DB")
      (when-let [work (env "STRAP_WORK")] (str (fs/path work "zettel" "zettel.sqlite")))
      (str (fs/path (System/getProperty "user.home") ".config" "strap" "zettel.sqlite"))))

(defn db-path [db]
  (or (not-empty db) (default-db)))

(defn sql-string [value]
  (str "'" (str/replace (str (or value "")) "'" "''") "'"))
(defn sql-template [template values]
  (reduce-kv (fn [out k v] (str/replace out (str "__" (name k) "__") (str v))) template values))

(defn vec-load-prefix []
  (let [load (or (env "STRAP_ZK_SQLITE_VEC_LOAD") "vec0")]
    (if (or (empty? load) (= load "none")) "" (str ".load " load "\n"))))

(defn run-command [args input]
  (let [res (apply sh/sh (concat args [:in input]))]
    (when-not (zero? (:exit res))
      (throw (ex-info (or (not-empty (:err res)) (not-empty (:out res)) (str (first args) " exited " (:exit res))) {:exit (:exit res)})))
    (:out res)))

(defn sqlite-exec [db script]
  (run-command ["sqlite3" db] (str (vec-load-prefix) ".timeout 5000\n" script)))

(defn sqlite-json [db script]
  (let [out (run-command ["sqlite3" "-json" db] (str (vec-load-prefix) ".timeout 5000\n" script))]
    (if (empty? (str/trim out)) [] (parse-json out))))

(defn fts-query [query]
  (let [terms (->> (str/split (str/lower-case query) #"\s+") (map #(str/replace % #"[^\p{L}\p{N}_-]" "")) (remove empty?))]
    (str/join " OR " (map #(str "\"" (str/replace % "\"" "\"\"") "\"") terms))))

(defn strap-bin []
  (if-let [root (env "STRAP_ROOT")] (str (fs/path root "bin" "strap")) "strap"))

(defn run-strap [args input]
  (run-command (concat [(strap-bin)] args) input))

(defn embed-text [text]
  (let [input (json/generate-string {:texts [text]})
        out (if-let [cmd (not-empty (env "STRAP_ZK_EMBED_CMD"))]
              (run-command ["sh" "-c" cmd] input)
              (run-strap ["embed" "--provider" (or (env "STRAP_ZK_EMBED_PROVIDER") "chatgpt")] input))
        parsed (parse-json out)]
    {:model (:model parsed) :dimensions (:dimensions parsed) :vector (first (:embeddings parsed))}))
