(ns session.state)

(defn create-state []
  {:version "strap.state.v0.2"
   :actors {:user {:kind "human" :self {:public "The user driving the work."}
                   :peers {:assistant {:contract "Collaborate directly, preserve user intent, ask only when blocked."}}}
            :assistant {:kind "agent"
                        :self {:public "A pragmatic software agent operating a unix-ish harness."
                               :private "Keep provider-specific state out of canonical state; compile requests from this file."}
                        :peers {:user {:contract "Solve the task end-to-end when feasible; keep updates concise."}
                                :harness {:contract "Use tool calls as structured actor communication."}}}
            :harness {:kind "runtime" :self {:public "The local execution harness, MCP bridge, and provider adapter."}
                      :peers {:assistant {:contract "Execute approved calls, report visible output, keep retained hidden state available."}}}}
   :root {:type "scope" :label "root" :status "open" :participants ["user" "assistant" "harness"] :children []}})

(defn normalize [state]
  (if (= "scope" (get-in state [:root :type]))
    state
    (throw (ex-info "Expected strap.state.v0.2 state with root scope" {}))))

(defn append-event [state event]
  (update-in state [:root :children] conj (merge {:type "event"} event)))

(defn bookmark-id [bookmark]
  (if (string? bookmark) bookmark (:id bookmark)))

(defn bookmark-ids [node]
  (->> (:bookmarks node) (map bookmark-id) (remove nil?)))

(defn truncate-children [children bookmark-id]
  (loop [idx 0 out [] xs children]
    (if-not (seq xs)
      nil
      (let [node (first xs)]
        (cond
          (some #{bookmark-id} (bookmark-ids node))
          (conj out node)

          (and (= "scope" (:type node)) (not= "collapsed" (:status node)))
          (if-let [truncated (truncate-children (:children node []) bookmark-id)]
            (conj out (assoc node :children truncated))
            (recur (inc idx) (conj out node) (rest xs)))

          :else
          (recur (inc idx) (conj out node) (rest xs)))))))

(defn truncate-after-bookmark [state bookmark-id]
  (if-let [children (truncate-children (get-in state [:root :children]) bookmark-id)]
    (assoc-in state [:root :children] children)
    (throw (ex-info (str "Bookmark not found: " bookmark-id) {}))))
