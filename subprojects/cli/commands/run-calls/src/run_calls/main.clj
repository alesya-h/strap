(ns run-calls.main
  (:require [babashka.process :as p]
            [clojure.string :as str]
            [run-calls.common :as c]
            [run-calls.state :as state]))

(defn take-opt [args flag default]
  (let [[before after] (split-with #(not= flag %) args)]
    (if (seq after) [(second after) (vec (concat before (nnext after)))] [default args])))

(defn strap-bin [] (or (System/getenv "STRAP_BIN") (str (java.nio.file.Paths/get (c/root) (into-array String ["bin" "strap"])))))

(defn debug [kind value]
  (when (or (= "1" (System/getenv "STRAP_TOOLS_DEBUG")) (= "1" (System/getenv "STRAP_DEBUG")))
    (binding [*out* *err*] (println (c/json-str (merge {:kind kind} value))))))

(defn tool-specs [group]
  (let [r (p/shell {:out :string :err :string :continue true} (strap-bin) "tools" "list" "--group" group "--json" "--internal")]
    (when-not (zero? (:exit r)) (throw (ex-info (or (:err r) (:out r)) {})))
    (c/parse-json (:out r))))

(defn envelope [process-state spec args state]
  (case process-state
    "own" {:own_state (get-in state [:runtime :tools (keyword (:group spec))] {}) :arguments args}
    "full" {:state state :arguments args}
    {:arguments args}))

(defn apply-state-result [state-atom full-replaced spec process-state result]
  (case process-state
    "own" (swap! state-atom assoc-in [:runtime :tools (keyword (:group spec))] (or (:own_state result) {}))
    "full" (when (:state result) (reset! full-replaced true) (reset! state-atom (:state result)))
    nil))

(defn run-tool [spec input state full-replaced]
  (let [mode (or (:process_state spec) "none")
        body (c/json-str (envelope mode spec input @state))
        r (p/shell {:out :string :err :string :in body :continue true} (:runner spec) (:action spec))]
    (when-not (zero? (:exit r)) (throw (ex-info (str/trim (or (:err r) (:out r))) {})))
    (let [result (c/parse-json (:out r))]
      (apply-state-result state full-replaced spec mode result)
      (when (:error result) (throw (ex-info (:error result) {})))
      [(:result result) (= mode "full")])))

(defn update-call [node id f]
  (cond
    (= (:type node) "event") (update node :calls #(mapv (fn [call] (if (= (:id call) id) (f call) call)) (or % [])))
    (= (:type node) "scope") (update node :children #(mapv (fn [child] (update-call child id f)) (or % [])))
    :else node))

(defn execute-call [state-atom full-replaced event call tools]
  (if (contains? call :ok)
    call
    (let [spec (get tools (:tool call))]
      (debug "tool_call" {:call call})
      (let [next-call (try
                        (if spec
                          (let [[output full?] (run-tool spec (or (:input call) {}) state-atom full-replaced)
                                next (assoc call :output output :ok true)]
                            (when full? (swap! state-atom update :root update-call (:id call) (constantly next)))
                            next)
                          (assoc call :ok false :error (str "Unknown tool: " (:tool call))))
                        (catch Exception e
                          (assoc call :ok false :error (.getMessage e))))]
        (debug "tool_result" {:call next-call})
        next-call))))

(defn process-event [state-atom full-replaced tools event]
  (if (seq (:calls event)) (assoc event :calls (mapv #(execute-call state-atom full-replaced event % tools) (:calls event))) event))

(defn walk-node [state-atom full-replaced tools node]
  (cond
    (= (:type node) "event") (process-event state-atom full-replaced tools node)
    (and (= (:type node) "scope") (not= (:status node) "collapsed")) (update node :children #(mapv (fn [child] (walk-node state-atom full-replaced tools child)) (or % [])))
    :else node))

(defn pending-count [s]
  (count (for [e (state/flatten-visible (:root s)) c (:calls e) :when (not (contains? c :ok))] c)))

(defn -main [& argv]
  (let [[group argv] (take-opt (vec argv) "--tools" (or (first argv) "all"))
        [file _] (take-opt argv "--file" "-")
        original (state/normalize (c/read-input file))
        state-atom (atom original)
        full-replaced (atom false)
        tools (into {} (map (juxt :name identity) (tool-specs group)))]
    (let [next-root (walk-node state-atom full-replaced tools (:root @state-atom))]
      (when-not @full-replaced (swap! state-atom assoc :root next-root)))
    (binding [*out* *err*] (println (str "executed " (- (pending-count original) (pending-count @state-atom)) " call(s)")))
    (c/write-json @state-atom)))
