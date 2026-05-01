(ns tool.main
  (:require [cheshire.core :as json]
            [tool.process :as tools]))

(defn read-json []
  (json/parse-string (slurp *in*) true))

(defn write-json [value]
  (println (json/generate-string value {:pretty true})))

(defn run-action [action]
  (let [envelope (read-json)
        f (get tools/tools action)]
    (when-not f
      (throw (ex-info (str "Unknown process action: " action) {})))
    (write-json {:result (f (:arguments envelope) {})})))

(defn -main [& args]
  (if-let [action (first args)]
    (run-action action)
    (write-json (sort (keys tools/tools)))))
