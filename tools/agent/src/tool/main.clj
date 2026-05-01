(ns tool.main
  (:require [cheshire.core :as json]))

(defn read-json []
  (json/parse-string (slurp *in*) true))

(defn write-json [value]
  (println (json/generate-string value {:pretty true})))

(defn push-scope [state label]
  (update-in state [:root :children]
             conj
             {:type "scope"
              :label label
              :status "open"
              :participants ["assistant" "harness"]
              :children []}))

(defn open-scope? [[_ node]]
  (and (= "scope" (:type node))
       (= "open" (:status node))))

(defn pop-scope [state summary]
  (let [children (get-in state [:root :children])
        match (last (filter open-scope? (map-indexed vector children)))]
    (when-not match
      (throw (ex-info "No open scope found" {})))
    (let [[idx scope] match
          collapsed (assoc scope
                           :status "collapsed"
                           :summary summary
                           :hidden {:children (:children scope)}
                           :children [])]
      (assoc-in state [:root :children idx] collapsed))))

(defn text-result [text]
  {:content [{:type "text" :text text}]})

(defn run-action [action]
  (let [envelope (read-json)
        state (:state envelope)
        args (:arguments envelope)]
    (case action
      "context_push"
      (write-json {:state (push-scope state (:label args))
                   :result (text-result (str "opened scope: " (:label args)))})
      "context_pop"
      (write-json {:state (pop-scope state (:summary args))
                   :result (text-result (:summary args))})
      (throw (ex-info (str "Unknown agent action: " action) {})))))

(defn -main [& args]
  (if-let [action (first args)]
    (run-action action)
    (write-json ["context_push" "context_pop"])))
