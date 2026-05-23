(ns run-calls.state
  (:require [run-calls.common :as c]))

(defn normalize [state]
  (if (and (= "strap.state.v0.4" (:version state)) (vector? (:history state)))
    state
    (throw (ex-info "Expected strap.state.v0.4 state with history" {}))))

(defn flatten-visible [state]
  (:history state))

(defn append-event [state event]
  (update state :history conj event))

(defn create-state []
  {:version "strap.state.v0.4" :actors {} :runtime {} :history []})

(defn read-state [file]
  (normalize (c/parse-json (slurp file))))

(defn write-state [file state]
  (spit file (str (c/json-str (normalize state)) "\n")))

(defn collapse-last-open-scope [state summary]
  (append-event state {:from "strap" :kind "note" :text summary}))
