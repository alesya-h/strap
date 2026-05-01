(ns tool.common
  (:require [cheshire.core :as json]))

(defn json-str [value]
  (json/generate-string value {:pretty true}))

(defn structured [output details]
  (cond
    (map? output) (merge output details)
    (empty? details) {:value output}
    :else (merge {:value output} details)))

(defn detail [k v]
  (str "- " (name k) ": " v))

(defn result-line [entry]
  (str "- " (:title entry) "\n  " (:url entry)))

(defn render-output [output]
  (cond
    (string? output) output
    (and (sequential? output) (every? map? output)) (str/join "\n" (map result-line output))
    :else (json-str output)))

(defn tool-result
  ([output]
    (tool-result output {}))
  ([output details]
   (let [value (structured output details)]
     {:content [{:type "text"
                 :text (str (render-output output)
                            (when (seq details)
                              (str "\n\nResponse details:\n"
                                   (str/join "\n" (map (fn [[k v]] (detail k v)) details)))))}]
      :structuredContent value})))

(defn truncate [text limit]
  (let [value (str text)]
    (if (<= (count value) limit)
      {:text value :truncated false}
      {:text (str (subs value 0 limit)
                  "\n\n[truncated "
                  (- (count value) limit)
                  " bytes]")
       :truncated true})))
