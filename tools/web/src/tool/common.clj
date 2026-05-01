(ns tool.common
  (:require [cheshire.core :as json]))

(defn json-str [value]
  (json/generate-string value {:pretty true}))

(defn structured [output details]
  (cond
    (map? output) (merge output details)
    (empty? details) {:value output}
    :else (merge {:value output} details)))

(defn tool-result
  ([output]
    (tool-result output {}))
  ([output details]
   (let [value (structured output details)]
     {:content [{:type "text" :text (json-str value)}]
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
