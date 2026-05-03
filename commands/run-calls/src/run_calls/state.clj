(ns run-calls.state
  (:require [run-calls.common :as c]))

(defn normalize [state]
  (if (= "scope" (get-in state [:root :type]))
    state
    (throw (ex-info "Expected strap.state.v0.2 state with root scope" {}))))

(defn flatten-visible
  ([node] (flatten-visible node []))
  ([node output]
   (cond
     (nil? node) output
     (= (:type node) "event") (conj output node)
     (not= (:type node) "scope") output
     (= (:status node) "collapsed")
     (conj output {:type "event" :from "harness" :to (or (:participants node) [])
                   :kind "summary" :text (or (:summary node) (str "[collapsed scope: " (:label node) "]"))})
     :else (reduce (fn [acc child] (flatten-visible child acc)) output (or (:children node) [])))))

(defn append-event [state event]
  (update-in state [:root :children] conj (merge {:type "event"} event)))

(defn create-state []
  {:version "strap.state.v0.2" :actors {}
   :root {:type "scope" :label "root" :status "open" :participants [] :children []}})

(defn read-state [file]
  (normalize (c/parse-json (slurp file))))

(defn write-state [file state]
  (spit file (str (c/json-str (normalize state)) "\n")))

(defn collapse-last-open-scope [state summary]
  (let [children (get-in state [:root :children])
        indexed (map-indexed vector children)
        [idx scope] (last (filter #(and (= "scope" (:type (second %))) (= "open" (:status (second %)))) indexed))]
    (when-not scope (throw (ex-info "No open scope found" {})))
    (assoc-in state [:root :children idx]
              (assoc scope :status "collapsed" :summary summary :hidden {:children (:children scope)} :children []))))
