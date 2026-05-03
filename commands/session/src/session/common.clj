(ns session.common
  (:require [babashka.fs :as fs]
            [babashka.process :as process]
            [cheshire.core :as json]
            [clojure.string :as str]))

(defn env [name]
  (System/getenv name))

(defn json-out [value]
  (println (json/generate-string value {:pretty true})))

(defn parse-json [text]
  (json/parse-string text true))

(defn now []
  (.toString (java.time.Instant/now)))

(defn stamp []
  (str/replace (now) #"[:.]" "-"))

(defn slug [text]
  (let [cleaned (-> (str (or text "session")) str/lower-case (str/replace #"[^a-z0-9]+" "-") (str/replace #"^-|-$" ""))]
    (subs (if (str/blank? cleaned) "session" cleaned) 0 (min 48 (count (if (str/blank? cleaned) "session" cleaned))))))

(defn sessions-root []
  (let [root (fs/path (env "STRAP_WORK") "sessions")]
    (fs/create-dirs root)
    (str root)))

(declare current-dir)
(defn state-path
  ([dir] (str (fs/path dir "state.json")))
  ([] (state-path (current-dir))))

(defn trace-path
  ([dir] (str (fs/path dir "trace.jsonl")))
  ([] (trace-path (current-dir))))

(defn current-dir []
  (let [dir (env "STRAP_SESSION")]
    (when (str/blank? (str dir))
      (throw (ex-info "No active session. Set STRAP_SESSION, run `strap session new <name>`, or use `strap with-session <session> <command>`." {})))
    (str (fs/absolutize dir))))

(defn record-trace [dir event]
  (spit (trace-path dir) (str (json/generate-string (merge {:at (now)} event)) "\n") :append true))

(defn ensure-ignore [dir]
  (let [file (fs/path dir ".gitignore")]
    (when-not (fs/exists? file)
      (spit (str file) "/provider-requests/tmp/\n/tool-results/tmp/\n"))))

(defn run-jj [dir args]
  (let [result (apply process/shell {:out :string :err :string :continue true :dir dir} "jj" args)]
    (when-not (zero? (:exit result))
      (throw (ex-info (or (not-empty (:err result)) (not-empty (:out result)) (str "jj exited " (:exit result))) {})))
    (:out result)))

(defn snapshot-history [dir message]
  (ensure-ignore dir)
  (when-not (fs/exists? (fs/path dir ".jj"))
    (run-jj dir ["git" "init" "--no-colocate" "."]))
  (run-jj dir ["describe" "-m" message])
  (run-jj dir ["new"]))

(defn read-meta [dir]
  (let [file (fs/path dir "meta.json")]
    (if (fs/exists? file) (parse-json (slurp (str file))) {})))

(defn read-title [dir]
  (or (:title (read-meta dir)) (fs/file-name dir)))

(defn take-option [xs flag default]
  (let [values (vec xs)
        idx (.indexOf values flag)]
    (if (= -1 idx)
      {:value default :args values}
      {:value (get values (inc idx) default)
       :args (vec (concat (subvec values 0 idx) (subvec values (min (count values) (+ idx 2)))))})))
