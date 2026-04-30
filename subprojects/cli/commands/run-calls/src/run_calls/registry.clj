(ns run-calls.registry
  (:require [run-calls.agent-tools :as agent]
            [run-calls.fs-tools :as fs]
            [run-calls.jsmcp :as jsmcp]
            [run-calls.process-tools :as process]
            [run-calls.scripts :as scripts]
            [run-calls.web-tools :as web]))

(defn tools [group]
  (let [groups {"fs" fs/tools
                "process" process/tools
                "web" web/tools
                "agent" agent/tools
                "scripts" (scripts/tools)
                "jsmcp" jsmcp/tools}]
    (cond
      (= group "all") (apply merge (vals groups))
      (groups group) (groups group)
      :else (throw (ex-info (str "Unknown tool group: " group) {})))))
