(ns tool.common
  (:require [babashka.fs :as fs]
            [cheshire.core :as json]
            [clojure.string :as str]))

(defn json-str [value]
  (json/generate-string value {:pretty true}))

(defn structured [output details]
  (cond
    (map? output) (merge output details)
    (empty? details) {:value output}
    :else (merge {:value output} details)))

(defn detail [k v]
  (str "- " (name k) ": " (if (coll? v) (json-str v) v)))

(defn entry-line [entry]
  (str "- " (:path entry) " (" (:type entry) ")"))

(defn render-output [output]
  (cond
    (string? output) output
    (and (sequential? output) (every? map? output)) (str/join "\n" (map entry-line output))
    :else (json-str output)))

(defn text-content [output details]
  (let [detail-text (str/join "\n" (map (fn [[k v]] (detail k v)) details))]
    [{:type "text"
      :text (str (render-output output)
                 (when (seq details) (str "\n\nDetails:\n" detail-text)))}]))

(defn tool-result
  ([output]
    (tool-result output {}))
  ([output details]
   (let [value (structured output details)]
     {:content (text-content output details)
      :structuredContent value})))

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
