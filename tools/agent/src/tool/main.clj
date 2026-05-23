(ns tool.main
  (:require [cheshire.core :as json]))

(defn read-json [] (json/parse-string (slurp *in*) true))
(defn write-json [value] (println (json/generate-string value {:pretty true})))

(defn ensure-strap [state]
  (assoc-in state [:actors :strap] {:kind "runtime" :self {:public "Local Strap harness."}}))

(defn append-message [state message]
  (update (ensure-strap state) :history conj message))

(defn text-result [text]
  (let [value {:text text}]
    {:content [{:type "text" :text (json/generate-string value {:pretty true})}]
     :structuredContent value}))

(defn push-context [state label]
  (append-message state {:from "strap" :kind "context" :text (str "opened context: " label)}))

(defn pop-context [state summary]
  (let [call {:id "context_summary" :tool "history.summarize" :input {} :ok true :output {:summary summary}}]
    (append-message state {:from "strap" :kind "context" :text "" :calls [call]})))

(defn run-action [action]
  (let [envelope (read-json) state (:state envelope) args (:arguments envelope)]
    (case action
      "context_push" (write-json {:state (push-context state (:label args)) :result (text-result (str "opened context: " (:label args)))})
      "context_pop" (write-json {:state (pop-context state (:summary args)) :result (text-result (:summary args))})
      (throw (ex-info (str "Unknown agent action: " action) {})))))

(defn -main [& args]
  (if-let [action (first args)] (run-action action) (write-json ["context_push" "context_pop"])))
