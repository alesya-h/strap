(ns strap.state
  (:require [cheshire.core :as json]
            [clojure.string :as str]))

(defn create-state []
  {:version "strap.state.v0.2"
   :actors {:user {:kind "human"
                   :self {:public "The user driving the work."}
                   :peers {:assistant {:contract "Collaborate directly, preserve user intent, ask only when blocked."}}}
            :assistant {:kind "agent"
                        :self {:public "A pragmatic software agent operating a unix-ish harness."
                               :private "Keep provider-specific state out of canonical state; compile requests from this file."}
                        :peers {:user {:contract "Solve the task end-to-end when feasible; keep updates concise."}
                                :harness {:contract "Use tool calls as structured actor communication."}}}
            :harness {:kind "runtime"
                      :self {:public "The local execution harness, MCP bridge, and provider adapter."}
                      :peers {:assistant {:contract "Execute approved calls, report visible output, keep retained hidden state available."}}}}
   :root {:type "scope"
          :label "root"
          :status "open"
          :participants ["user" "assistant" "harness"]
          :children []}})

(defn append-event [state event]
  (update-in state [:root :children] conj (assoc event :type "event")))

(defn add-user [state text]
  (append-event state {:from "user" :to ["assistant"] :kind "message" :text text}))

(defn read-json []
  (json/parse-string (slurp *in*) true))

(defn write-json [value]
  (println (json/generate-string value {:pretty true})))

(defn usage []
  (binding [*out* *err*]
    (println "Usage: strap state-bb <init|add-user> [text]"))
  (System/exit 2))

(defn -main [& args]
  (case (first args)
    "--help" (usage)
    "init" (write-json (create-state))
    "add-user" (write-json (add-user (read-json) (str/join " " (rest args))))
    (usage)))
