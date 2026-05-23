(ns session.state)

(defn create-state []
  {:version "strap.state.v0.4" :actors {} :runtime {} :history []})

(defn normalize [state]
  (if (and (= "strap.state.v0.4" (:version state)) (vector? (:history state)))
    state
    (throw (ex-info "Expected strap.state.v0.4 state with history" {}))))

(defn append-event [state event]
  (update state :history conj event))

(defn bookmark-id [bookmark]
  (if (string? bookmark) bookmark (:id bookmark)))

(defn bookmark-ids [node]
  (->> (:bookmarks node) (map bookmark-id) (remove nil?)))

(defn truncate-children [children bookmark-id]
  (loop [out [] xs children]
    (if-not (seq xs)
      nil
      (let [node (first xs)]
        (if (some #{bookmark-id} (bookmark-ids node))
          (conj out node)
          (recur (conj out node) (rest xs)))))))

(defn truncate-after-bookmark [state bookmark-id]
  (if-let [history (truncate-children (:history state) bookmark-id)]
    (assoc state :history history)
    (throw (ex-info (str "Bookmark not found: " bookmark-id) {}))))
