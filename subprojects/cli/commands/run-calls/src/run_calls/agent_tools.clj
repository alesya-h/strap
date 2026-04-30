(ns run-calls.agent-tools
  (:require [run-calls.common :as c]
            [run-calls.state :as state]))

(defn fork-agent [args _]
  (let [parent (state/read-state (:state_path args))
        child (-> parent
                  (assoc :parent {:state_path (:state_path args) :fork_prompt (or (:prompt args) "") :created_at (str (java.time.Instant/now))})
                  (state/append-event {:from "harness" :to ["assistant"] :kind "fork" :text (or (:prompt args) "")}))]
    (state/write-state (:child_state_path args) child)
    (c/tool-result {:child_state_path (:child_state_path args)})))

(defn fold-agent [args _]
  (let [parent (state/read-state (:state_path args)) child (state/read-state (:child_state_path args))
        next (state/append-event parent {:from "harness" :to ["assistant" "user"] :kind "agent_fold" :text (str (:summary args)) :hidden {:child_state child}})]
    (state/write-state (:state_path args) next)
    (c/tool-result {:state_path (:state_path args) :folded_child_state_path (:child_state_path args)})))

(defn context-push [args _]
  (let [s (update-in (state/read-state (:state_path args)) [:root :children] conj {:type "scope" :label (str (:label args)) :status "open" :participants ["assistant" "harness"] :children []})]
    (state/write-state (:state_path args) s)
    (c/tool-result {:state_path (:state_path args) :label (:label args)})))

(defn context-pop [args _]
  (let [s (state/collapse-last-open-scope (state/read-state (:state_path args)) (str (:summary args)))]
    (state/write-state (:state_path args) s)
    (c/tool-result {:state_path (:state_path args) :summary (:summary args)})))

(defn init-state [args _]
  (spit (:state_path args) (str (c/json-str (state/create-state)) "\n"))
  (c/tool-result {:state_path (:state_path args)}))

(def tools {"agent_fork" fork-agent "agent_fold" fold-agent "context_push" context-push "context_pop" context-pop "state_init" init-state})
