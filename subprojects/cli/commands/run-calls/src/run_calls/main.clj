(ns run-calls.main
  (:require [run-calls.common :as c]
            [run-calls.registry :as registry]
            [run-calls.state :as state]))

(defn take-opt [args flag default]
  (let [[before after] (split-with #(not= flag %) args)]
    (if (seq after)
      [(second after) (vec (concat before (nnext after)))]
      [default args])))

(defn debug [kind value]
  (when (or (= "1" (System/getenv "STRAP_TOOLS_DEBUG")) (= "1" (System/getenv "STRAP_DEBUG")))
    (binding [*out* *err*] (println (c/json-str (merge {:kind kind} value))))))

(defn execute-call [state-atom event call tools]
  (if (contains? call :ok)
    call
    (let [tool (tools (:tool call))]
      (debug "tool_call" {:call call})
      (let [next-call (try
                        (if tool
                          (assoc call :output (tool (or (:input call) {}) {:state state-atom :event event :call call}) :ok true)
                          (assoc call :ok false :error (str "Unknown tool: " (:tool call))))
                        (catch Exception e
                          (assoc call :ok false :error (.getMessage e))))]
        (debug "tool_result" {:call next-call})
        next-call))))

(defn process-event [state-atom tools event]
  (if (seq (:calls event))
    (assoc event :calls (mapv #(execute-call state-atom event % tools) (:calls event)))
    event))

(defn walk-node [state-atom tools node]
  (cond
    (= (:type node) "event") (process-event state-atom tools node)
    (and (= (:type node) "scope") (not= (:status node) "collapsed"))
    (update node :children #(mapv (fn [child] (walk-node state-atom tools child)) (or % [])))
    :else node))

(defn executed-count [before after]
  (let [pending (fn [s] (for [e (state/flatten-visible (:root s)) c (:calls e) :when (not (contains? c :ok))] c))]
    (- (count (pending before)) (count (pending after)))))

(defn -main [& argv]
  (let [[group argv] (take-opt (vec argv) "--tools" (or (first argv) "all"))
        [file _] (take-opt argv "--file" "-")
        original (state/normalize (c/read-input file))
        state-atom (atom original)
        tools (registry/tools group)]
    (swap! state-atom assoc :root (walk-node state-atom tools (:root @state-atom)))
    (binding [*out* *err*] (println (str "executed " (executed-count original @state-atom) " call(s)")))
    (c/write-json @state-atom)))
