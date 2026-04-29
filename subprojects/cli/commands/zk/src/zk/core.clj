(ns zk.main
  (:require [babashka.fs :as fs]
            [cheshire.core :as json]
            [clojure.java.io :as io]
            [clojure.java.shell :as sh]
            [clojure.string :as str]))

(def index-commands
  {"index-init" "init" "index-create" "create" "index-update" "update"
   "index-delete" "delete" "index-list" "list" "index-tags" "tags"
   "index-get" "get" "index-search-text" "search-text"
   "index-search-vector" "search-vector" "index-search-hybrid" "search-hybrid"
   "index-related" "related" "index-backlinks" "backlinks" "index-link" "link"})

(def flag-options #{"--paths"})

(defn env [name] (System/getenv name))
(defn now [] (.toString (java.time.Instant/now)))
(defn note-id [] (str "zk_" (random-uuid)))
(defn basename [file] (.getName (io/file file)))
(defn basename-no-ext [file] (str/replace (basename file) #"\.md$" ""))
(defn json-out [value] (println (json/generate-string value {:pretty true})))
(defn parse-json [text] (json/parse-string text true))

(defn usage []
  (binding [*out* *err*]
    (println "Usage: strap zk <create|list|get|update|delete|tags|search|search-text|search-vector|search-hybrid|links|backlinks|status|workon|promote|discard|reindex|remember-state|tool> [args]"))
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

(defn slug [text]
  (let [s (-> (or text "note") str/lower-case (str/replace #"[^a-z0-9]+" "-") (str/replace #"^-|-$" ""))]
    (subs (if (empty? s) "note" s) 0 (min 48 (count (if (empty? s) "note" s))))))

(defn zettel-dir [scope]
  (case scope
    "project" (str (fs/path (env "STRAP_PROJECT") "zettel"))
    "user" (str (fs/path (env "STRAP_WORK") "zettel"))
    (throw (ex-info "scope must be user or project" {:scope scope}))))

(defn default-db-path []
  (or (env "STRAP_ZK_DB") (str (fs/path (env "STRAP_WORK") "zettel" "zettel.sqlite"))))

(defn read-stdin-if-any []
  (if (System/console) "" (slurp *in*)))

(defn strap-bin []
  (if-let [root (env "STRAP_ROOT")] (str (fs/path root "bin" "strap")) "strap"))

(defn run-strap-out
  ([args] (run-strap-out args nil))
  ([args input]
   (let [cmd (concat [(strap-bin)] args)
         res (if input (apply sh/sh (concat cmd [:in input])) (apply sh/sh cmd))]
     (when-not (zero? (:exit res))
       (throw (ex-info (or (not-empty (:err res)) (not-empty (:out res)) (str "strap exited " (:exit res))) {:exit (:exit res)})))
     (:out res))))

(defn call-index [args]
  (run-strap-out (concat ["inner" "zk" "index"] args)))

(defn call-index-json [args]
  (parse-json (call-index args)))

(defn count-matches [text needle]
  (loop [from 0 total 0]
    (let [idx (str/index-of text needle from)]
      (if idx (recur (+ idx (count needle)) (inc total)) total))))

(defn excerpt [text needle]
  (let [idx (str/index-of (str/lower-case text) needle)]
    (if-not idx
      (subs text 0 (min 160 (count text)))
      (subs text (max 0 (- idx 60)) (min (count text) (+ idx (count needle) 100))))))
