(ns artifact.common
  (:require [babashka.fs :as fs]
            [cheshire.core :as json]
            [clojure.string :as str])
  (:import [java.nio.file Files LinkOption]))

(def named-order ["session" "user" "project" "global" "root"])
(def mutable-names #{"session" "user" "project" "global"})
(def artifact-types ["command" "tool" "agent" "skill" "model"])

(defn env [name]
  (System/getenv name))

(defn path-str [& parts]
  (str (apply fs/path parts)))

(defn maybe-path [root & parts]
  (when root
    (apply path-str root parts)))

(defn parse-layer-entry [index entry]
  (let [[left right] (str/split entry #"=" 2)
        [name path] (if right [left right] [(str "plugin-" index) left])]
    {:name name :path (str (fs/absolutize path))}))

(defn layer-list []
  (->> (str/split (or (env "STRAP_PATH") "") (re-pattern java.io.File/pathSeparator))
       (remove str/blank?)
       (map-indexed parse-layer-entry)
       vec))

(defn layers []
  (mapv :name (layer-list)))

(defn mutable-layers []
  (filterv mutable-names (layers)))

(defn directory? [file]
  (and (fs/exists? file) (fs/directory? file)))

(defn regular-file? [file]
  (Files/isRegularFile (fs/path file) (make-array LinkOption 0)))

(defn symlink? [file]
  (Files/isSymbolicLink (fs/path file)))

(defn executable? [file]
  (.canExecute (fs/file file)))

(defn json-out [value]
  (println (json/generate-string value {:pretty true})))

(defn usage []
  (binding [*out* *err*]
    (println "Usage: strap artifact <types|roots|status|workon|promote|discard> [type] [name] [--paths] [--from layer] [--to layer]"))
  (System/exit 2))

(defn unknown-type! [type]
  (throw
    (ex-info
      (str "Unknown artifact type: " type ". Expected one of: " (str/join ", " artifact-types))
      {:type type})))
