(ns session.state)

(defn create-state []
  {:version "strap.state.v0.3"
   :actors {:humans {} :agents {} :runtimes {}}
   :root {:type "scope" :label "root" :status "open" :participants [] :children []}})

(defn normalize [state]
  (if (and (= "strap.state.v0.3" (:version state))
           (= "scope" (get-in state [:root :type])))
    state
    (throw (ex-info "Expected strap.state.v0.3 state with root scope" {}))))

(defn append-event [state event]
  (update-in state [:root :children] conj (merge {:type "event"} event)))

(defn bookmark-id [bookmark]
  (if (string? bookmark) bookmark (:id bookmark)))

(defn bookmark-ids [node]
  (->> (:bookmarks node) (map bookmark-id) (remove nil?)))

(defn truncate-children [children bookmark-id]
  (loop [out [] xs children]
    (if-not (seq xs)
      nil
      (let [node (first xs)]
        (cond
          (some #{bookmark-id} (bookmark-ids node))
          (conj out node)

          (and (= "scope" (:type node)) (not= "collapsed" (:status node)))
          (if-let [truncated (truncate-children (:children node []) bookmark-id)]
            (conj out (assoc node :children truncated))
            (recur (conj out node) (rest xs)))

          :else
          (recur (conj out node) (rest xs)))))))

(defn truncate-after-bookmark [state bookmark-id]
  (if-let [children (truncate-children (get-in state [:root :children]) bookmark-id)]
    (assoc-in state [:root :children] children)
    (throw (ex-info (str "Bookmark not found: " bookmark-id) {}))))
