(ns session.files
  (:require [babashka.fs :as fs]
            [cheshire.core :as json]
            [session.common :as c]
            [session.state :as state]))

(defn write-json-file [file value]
  (spit (str file) (str (json/generate-string value {:pretty true}) "\n")))

(defn read-state [dir]
  (state/normalize (c/parse-json (slurp (c/state-path dir)))))

(defn write-state [dir value]
  (write-json-file (c/state-path dir) (state/normalize value)))

(defn create-session [title]
  (let [dir (str (fs/path (c/sessions-root) (str (c/stamp) "-" (c/slug title))))]
    (fs/create-dirs dir)
    (fs/create-dirs (fs/path dir "provider-requests"))
    (fs/create-dirs (fs/path dir "tool-results"))
    (write-json-file (fs/path dir "meta.json") {:title title :created_at (c/now)})
    (write-state dir (state/create-state))
    (spit (c/trace-path dir) "")
    dir))

(defn copy-file [source target]
  (fs/create-dirs (fs/parent target))
  (fs/copy source target {:replace-existing true})
  (fs/set-posix-file-permissions target (fs/posix-file-permissions source)))

(defn copy-dir [source target]
  (fs/create-dirs target)
  (doseq [entry (fs/list-dir source)]
    (when-not (= ".jj" (fs/file-name entry))
      (let [to (fs/path target (fs/file-name entry))]
        (cond
          (fs/directory? entry) (copy-dir entry to)
          (fs/regular-file? entry) (copy-file entry to))))))

(defn copy-session [source title at]
  (let [dir (str (fs/path (c/sessions-root) (str (c/stamp) "-" (c/slug title))))]
    (copy-dir source dir)
    (write-json-file (fs/path dir "meta.json") (cond-> (merge (c/read-meta dir) {:title title :created_at (c/now) :copied_from source}) at (assoc :copied_at at)))
    (when at
      (write-state dir (state/truncate-after-bookmark (read-state dir) at)))
    dir))

(defn resolve-session [selector]
  (let [direct (fs/absolutize selector)]
    (cond
      (and (fs/exists? direct) (fs/directory? direct)) (str direct)
      :else
      (let [root (c/sessions-root) exact (fs/path root selector)]
        (cond
          (and (fs/exists? exact) (fs/directory? exact)) (str exact)
          :else
          (let [matches (->> (fs/list-dir root) (filter fs/directory?) (filter #(clojure.string/includes? (fs/file-name %) selector)) (map str) vec)]
            (case (count matches)
              0 (throw (ex-info (str "Session not found: " selector) {}))
              1 (first matches)
              (throw (ex-info (str "Ambiguous session: " selector) {})))))))))
