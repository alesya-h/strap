(in-ns 'zk.main)

(defn workon-note [args]
  (let [{:keys [opts pos]} (parse-args args) note (find-visible (or (first pos) (:id opts)) (visible-notes))]
    (ensure-user-overlay note)
    (let [visible (visible-notes) updated (find-visible (get-in note [:meta :id]) visible)]
      (json-out {:ok true :note (decorate-note updated visible {:include-paths (:paths opts)})}))))

(defn promote-note [args]
  (let [{:keys [opts pos]} (parse-args args) id (or (first pos) (:id opts)) notes (all-notes) user (find-in-layer id "user" notes)]
    (when-not user (throw (ex-info (str "No user overlay note found: " id) {})))
    (let [project (some #(when (and (= "project" (:layer %)) (= (get-in % [:meta :id]) (get-in user [:meta :id]))) %) notes)]
      (if (deleted? user)
        (do (when project (fs/delete-if-exists (:file project))) (fs/delete-if-exists (:file user)) (json-out {:ok true :id (get-in user [:meta :id]) :promoted "delete"}))
        (let [target (or (:file project) (project-file-for user)) meta (assoc (dissoc (:meta user) :deleted) :scope "project")]
          (write-note target meta (:body user))
          (fs/delete-if-exists (:file user))
          (let [visible (visible-notes) promoted (find-visible (get-in user [:meta :id]) visible)]
            (json-out {:ok true :promoted true :note (decorate-note promoted visible {:include-paths (:paths opts)})})))))))

(defn discard-note [args]
  (let [{:keys [opts pos]} (parse-args args) id (or (first pos) (:id opts)) user (find-in-layer id "user" (all-notes))]
    (when-not user (throw (ex-info (str "No user overlay note found: " id) {})))
    (fs/delete-if-exists (:file user))
    (json-out {:ok true :id (get-in user [:meta :id]) :discarded true})))
