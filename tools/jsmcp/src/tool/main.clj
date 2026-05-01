(ns tool.main
  (:require [cheshire.core :as json]
            [clojure.string :as str]
            [tool.jsmcp :as jsmcp]))

(defn read-json []
  (json/parse-string (slurp *in*) true))

(defn write-json [value]
  (println (json/generate-string value {:pretty true})))

(defn server-line [server]
  (str "- " (:name server) ": " (if (:ok server) "ok" (str "error: " (:error server)))))

(defn tool-line [tool]
  (str "- " (:name tool) (when (:description tool) (str ": " (:description tool)))))

(defn render-map [value]
  (str/join "\n" (map (fn [[k v]] (str "- " (name k) ": " v)) value)))

(defn render-result [value]
  (cond
    (:servers value) (str "Servers:\n" (str/join "\n" (map server-line (:servers value))))
    (:tools value) (str "Tools:\n" (str/join "\n" (map tool-line (:tools value))))
    (:result value) (str (:result value))
    (map? value) (render-map value)
    :else (str value)))

(defn result-content [value]
  [{:type "text" :text (render-result value)}])

(defn normalize-result [result]
  (let [value (or (:structuredContent result) result)]
    {:content (result-content value)
     :structuredContent value}))

(defn own-state-atom [envelope]
  (atom {:runtime {:jsmcp (or (:own_state envelope) {})}}))

(defn run-action [action]
  (let [envelope (read-json)
        state (own-state-atom envelope)
        f (get jsmcp/tools action)]
    (when-not f
      (throw (ex-info (str "Unknown jsmcp action: " action) {})))
    (try
      (write-json {:result (normalize-result (f (:arguments envelope) {:state state}))
                   :own_state (get-in @state [:runtime :jsmcp])})
      (catch Exception e
        (write-json {:error (.getMessage e)
                     :own_state (get-in @state [:runtime :jsmcp])})))))

(defn -main [& args]
  (if-let [action (first args)]
    (run-action action)
    (write-json (sort (keys jsmcp/tools)))))
