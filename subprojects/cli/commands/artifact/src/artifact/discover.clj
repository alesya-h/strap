(ns artifact.discover
  (:require [artifact.common :as c]
            [babashka.fs :as fs]
            [cheshire.core :as json]
            [clojure.string :as str]))

(defn files-for-directory [dir]
  (->> (file-seq (fs/file dir))
       (filter #(.isFile %))
       (map #(.getPath %))
       sort
       vec))

(defn directory-artifact [type dir layer root marker]
  (when (fs/exists? (fs/path dir marker))
    {:type type
     :name (fs/file-name dir)
     :layer layer
     :kind "directory"
     :entryName (fs/file-name dir)
     :root root
     :path (str dir)
     :files (files-for-directory dir)}))

(defn discover-command-artifacts [root layer]
  (if-not (c/directory? root)
    []
    (->> (fs/list-dir root)
         (filter fs/directory?)
         (keep #(directory-artifact "command" % layer root "run"))
         vec)))

(defn discover-skill-artifacts [root layer]
  (if-not (c/directory? root)
    []
    (->> (fs/list-dir root)
         (filter fs/directory?)
         (keep #(directory-artifact "skill" % layer root "SKILL.md"))
         vec)))

(defn sidecars-for-tool [file]
  (let [text (str file)
        candidates [(str text ".json") (str/replace text #"\.[^.]+$" ".json")]]
    (->> candidates distinct (filter fs/exists?) (map str) vec)))

(defn tool-name [file sidecars]
  (or
    (some
      (fn [sidecar]
        (try
          (:name (json/parse-string (slurp sidecar) true))
          (catch Exception _ nil)))
      sidecars)
    (-> (fs/file-name file)
        (str/replace #"\.[^.]+$" "")
        (str/replace #"[^a-zA-Z0-9_]" "_"))))

(defn discover-tool-artifacts [root layer]
  (if-not (c/directory? root)
    []
    (->> (fs/list-dir root)
         (filter c/regular-file?)
         (remove #(str/ends-with? (fs/file-name %) ".json"))
         (filter c/executable?)
         (map (fn [file]
                (let [sidecars (sidecars-for-tool file)]
                  {:type "tool"
                   :name (tool-name file sidecars)
                   :layer layer
                   :kind "file"
                   :entryName (fs/file-name file)
                   :root root
                   :path (str file)
                   :files (vec (cons (str file) sidecars))})))
         vec)))

(defn single-file-artifact [type file layer root ext]
  {:type type
   :name (str/replace (fs/file-name file) (re-pattern (str "\\" ext "$")) "")
   :layer layer
   :kind (if (c/symlink? file) "symlink" "file")
   :entryName (fs/file-name file)
   :root root
   :path (str file)
   :files [(str file)]})

(defn discover-by-extension [type root layer ext pred]
  (if-not (c/directory? root)
    []
    (->> (fs/list-dir root)
         (filter pred)
         (filter #(str/ends-with? (fs/file-name %) ext))
         (map #(single-file-artifact type % layer root ext))
         vec)))

(defn discover-porcelain-artifacts [root layer]
  (discover-by-extension "porcelain" root layer ".nu" c/regular-file?))

(defn discover-agent-artifacts [root layer]
  (discover-by-extension "agent" root layer ".md" c/regular-file?))

(defn discover-model-artifacts [root layer]
  (discover-by-extension "model" root layer ".json" #(or (c/regular-file? %) (c/symlink? %))))

(defn discover-artifacts [type root layer]
  (case type
    "command" (discover-command-artifacts root layer)
    "tool" (discover-tool-artifacts root layer)
    "porcelain" (discover-porcelain-artifacts root layer)
    "agent" (discover-agent-artifacts root layer)
    "skill" (discover-skill-artifacts root layer)
    "model" (discover-model-artifacts root layer)))
