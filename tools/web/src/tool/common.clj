(ns tool.common
  (:require [cheshire.core :as json]))

(defn json-str [value]
  (json/generate-string value {:pretty true}))

(defn tool-result
  ([output]
   (tool-result output {}))
  ([output metadata]
   {:content [{:type "text"
               :text (if (string? output) output (json-str output))}]
    :metadata metadata}))

(defn truncate [text limit]
  (let [value (str text)]
    (if (<= (count value) limit)
      {:text value :truncated false}
      {:text (str (subs value 0 limit)
                  "\n\n[truncated "
                  (- (count value) limit)
                  " bytes]")
       :truncated true})))
