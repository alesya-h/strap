(ns tool.common
  (:require [babashka.fs :as fs]
            [cheshire.core :as json]
            [clojure.string :as str]))

(defn json-str [value]
  (json/generate-string value {:pretty true}))

(defn tool-result
  ([output]
   (tool-result output {}))
  ([output metadata]
   {:content [{:type "text"
               :text (if (string? output) output (json-str output))}]
    :metadata metadata}))

(defn env [k default]
  (or (System/getenv k) default))

(defn workspace []
  (str (fs/absolutize (env "STRAP_WORKSPACE" (System/getProperty "user.dir")))))

(defn resolve-workspace [input]
  (let [base (fs/absolutize (workspace))
        resolved (fs/absolutize (fs/path base (or input ".")))
        rel (str (fs/relativize base resolved))]
    (when (and (not= "1" (System/getenv "STRAP_ALLOW_OUTSIDE_WORKSPACE"))
               (or (str/starts-with? rel "..") (fs/absolute? rel)))
      (throw (ex-info (str "Path is outside workspace: " input) {})))
    (str resolved)))

(defn display-path [file]
  (let [base (fs/absolutize (workspace))
        rel (str (fs/relativize base (fs/absolutize file)))]
    (if (str/starts-with? rel "..") (str file) rel)))
