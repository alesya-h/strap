(ns run-calls.main
  (:require [babashka.process :as p]
            [clojure.string :as str]
            [run-calls.common :as c]
            [run-calls.state :as state]))

(defn take-opt [args flag default]
  (let [[before after] (split-with #(not= flag %) args)]
    (if (seq after)
      [(second after) (vec (concat before (nnext after)))]
      [default args])))

(defn strap-bin []
  (or (System/getenv "STRAP_BIN")
      (str (java.nio.file.Paths/get (c/root) (into-array String ["bin" "strap"])))))

(defn debug [kind value]
  (when (or (= "1" (System/getenv "STRAP_TOOLS_DEBUG"))
            (= "1" (System/getenv "STRAP_DEBUG")))
    (binding [*out* *err*]
      (println (c/json-str (merge {:kind kind} value))))))

(defn tool-specs [group]
  (let [result (p/shell {:out :string :err :string :continue true}
                        (strap-bin)
                        "tools"
                        "list"
                        "--group"
                        group
                        "--json"
                        "--internal")]
    (when-not (zero? (:exit result))
      (throw (ex-info (or (:err result) (:out result)) {})))
    (c/parse-json (:out result))))

(defn envelope [process-state spec args state]
  (case process-state
    "own"
    {:own_state (get-in state [:runtime :tools (keyword (:group spec))] {})
     :arguments args}
    "full"
    {:state state
     :arguments args}
    {:arguments args}))

(defn apply-state-result [state-atom full-replaced spec process-state result]
  (case process-state
    "own"
    (swap! state-atom
           assoc-in
           [:runtime :tools (keyword (:group spec))]
           (or (:own_state result) {}))
    "full"
    (when (:state result)
      (reset! full-replaced true)
      (reset! state-atom (:state result)))
    nil))

(defn run-tool [spec input state full-replaced]
  (let [mode (or (:process_state spec) "none")
        body (c/json-str (envelope mode spec input @state))
        result (p/shell {:out :string :err :string :in body :continue true}
                        (:runner spec)
                        (:action spec))]
    (when-not (zero? (:exit result))
      (throw (ex-info (str/trim (or (:err result) (:out result))) {})))
    (let [parsed (c/parse-json (:out result))]
      (apply-state-result state full-replaced spec mode parsed)
      (when (:error parsed)
        (throw (ex-info (:error parsed) {})))
      [(:result parsed) (= mode "full")])))

(defn update-call [node id f]
  (cond
    (= (:type node) "event")
    (update node :calls
            (fn [calls]
              (mapv #(if (= (:id %) id) (f %) %) (or calls []))))
    (= (:type node) "scope")
    (update node :children
            (fn [children]
              (mapv #(update-call % id f) (or children []))))
    :else
    node))

(defn successful-call [state-atom full-replaced spec call]
  (let [[output full?] (run-tool spec (or (:input call) {}) state-atom full-replaced)
        next-call (assoc call :output output :ok true)]
    (when full?
      (swap! state-atom update :root update-call (:id call) (constantly next-call)))
    next-call))

(defn execute-call [state-atom full-replaced call tools]
  (if (contains? call :ok)
    call
    (let [spec (get tools (:tool call))]
      (debug "tool_call" {:call call})
      (let [next-call (try
                        (if spec
                          (successful-call state-atom full-replaced spec call)
                          (assoc call :ok false :error (str "Unknown tool: " (:tool call))))
                        (catch Exception e
                          (assoc call :ok false :error (.getMessage e))))]
        (debug "tool_result" {:call next-call})
        next-call))))

(defn process-event [state-atom full-replaced tools event]
  (if (seq (:calls event))
    (update event :calls
            (fn [calls]
              (mapv #(execute-call state-atom full-replaced % tools) calls)))
    event))

(defn walk-node [state-atom full-replaced tools node]
  (cond
    (= (:type node) "event")
    (process-event state-atom full-replaced tools node)
    (and (= (:type node) "scope") (not= (:status node) "collapsed"))
    (update node :children
            (fn [children]
              (mapv #(walk-node state-atom full-replaced tools %) (or children []))))
    :else
    node))

(defn pending-count [s]
  (count
    (for [event (state/flatten-visible (:root s))
          call (:calls event)
          :when (not (contains? call :ok))]
      call)))

(defn -main [& argv]
  (let [[group argv] (take-opt (vec argv) "--tools" (or (first argv) "all"))
        [file _] (take-opt argv "--file" "-")
        original (state/normalize (c/read-input file))
        state-atom (atom original)
        full-replaced (atom false)
        tools (into {} (map (juxt :name identity) (tool-specs group)))]
    (let [next-root (walk-node state-atom full-replaced tools (:root @state-atom))]
      (when-not @full-replaced
        (swap! state-atom assoc :root next-root)))
    (binding [*out* *err*]
      (println (str "executed "
                    (- (pending-count original) (pending-count @state-atom))
                    " call(s)")))
    (c/write-json @state-atom)))
