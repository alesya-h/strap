(in-ns 'zk.main)

(defn reindex-notes [& [{:keys [scope db]}]]
  (let [db-path (or (not-empty db) (default-db-path))]
    (fs/create-dirs (fs/parent db-path))
    (doseq [suffix ["" "-shm" "-wal"]] (fs/delete-if-exists (str db-path suffix)))
    (let [notes (visible-notes (or scope "all"))]
      (doseq [note notes]
        (call-index ["create"
                     "--id" (get-in note [:meta :id])
                     "--title" (get-in note [:meta :title])
                     "--body" (:body note)
                     "--tags" (json/generate-string (parse-list (get-in note [:meta :tags])))
                     "--aliases" (json/generate-string (parse-list (get-in note [:meta :aliases])))
                     "--author" (or (get-in note [:meta :author]) "agent")
                     "--db" db-path]))
      {:ok true :reindexed (count notes) :db db-path})))

(defn reindex-command [args]
  (let [{:keys [opts]} (parse-args args)]
    (json-out (reindex-notes {:scope (or (:scope opts) "all") :db (:db opts)}))))

(defn index-search [command args]
  (let [{:keys [opts pos]} (parse-args args)
        query (or (:query opts) (str/join " " pos))
        limit (or (:limit opts) "10")]
    (when (empty? query) (usage))
    (let [{:keys [db]} (reindex-notes {:scope (or (:scope opts) "all") :db (:db opts)})]
      (print (call-index [command query "--limit" limit "--db" db])))))

(defn last-text-event [state]
  (let [children (get-in state [:root :children] [])
        assistant (filter #(and (= "event" (:type %)) (= "assistant" (:from %)) (not-empty (:text %))) children)]
    (or (last assistant) (last (filter #(and (= "event" (:type %)) (not-empty (:text %))) children)))))

(defn remember-state [args]
  (let [{:keys [opts]} (parse-args args)
        raw (if-let [file (:file opts)] (slurp file) (read-stdin-if-any))
        state (parse-json raw)
        event (last-text-event state)]
    (when-not event (throw (ex-info "No text event found in state" {})))
    (let [first-line (first (str/split-lines (:text event)))
          title (or (not-empty (:title opts)) (subs first-line 0 (min 80 (count first-line))))
          id (note-id)
          file (str (fs/path (zettel-dir "user") (str (slug title) "-" (subs id 3 11) ".md")))
          timestamp (now)
          meta {:id id
                :title title
                :tags (parse-list (or (:tags opts) "session,summary"))
                :aliases []
                :author (or (:author opts) "agent")
                :scope "user"
                :created_at timestamp
                :updated_at timestamp}]
      (write-note file meta (:text event))
      (let [visible (visible-notes)] (json-out {:ok true :note (decorate-note (find-visible id visible) visible)})))))

(defn invoke-self [args]
  (run-strap-out (concat ["zk"] args)))

(defn maybe [condition values]
  (if condition values []))

(defn tool [_args]
  (let [req (parse-json (read-stdin-if-any))
        action (or (:action req) "search_hybrid")]
    (print
      (case action
        "create" (invoke-self (concat ["create" "--scope" (or (:scope req) "user")
                                        "--title" (:title req)
                                        "--body" (or (:body req) "")
                                        "--tags" (json/generate-string (or (:tags req) []))
                                        "--aliases" (json/generate-string (or (:aliases req) []))
                                        "--author" (or (:author req) "agent")]))
        "update" (invoke-self (concat ["update" (:id req)]
                                       (maybe (:title req) ["--title" (:title req)])
                                       (maybe (:body req) ["--body" (:body req)])
                                       (maybe (:tags req) ["--tags" (json/generate-string (:tags req))])
                                       (maybe (:aliases req) ["--aliases" (json/generate-string (:aliases req))])))
        "delete" (invoke-self ["delete" (:id req)])
        "list" (invoke-self (concat ["list" "--scope" (or (:scope req) "all")
                                      "--limit" (str (or (:limit req) 50))]
                                     (maybe (:tag req) ["--tag" (:tag req)])))
        "tags" (invoke-self ["tags"])
        "get" (invoke-self ["get" (:id req)])
        "search" (invoke-self ["search" (:query req)
                                "--scope" (or (:scope req) "all")
                                "--limit" (str (or (:limit req) 10))])
        "links" (invoke-self ["links" (:id req)])
        "backlinks" (invoke-self ["backlinks" (:id req)])
        "status" (invoke-self ["status"])
        "workon" (invoke-self ["workon" (:id req)])
        "promote" (invoke-self ["promote" (:id req)])
        "discard" (invoke-self ["discard" (:id req)])
        "search_hybrid" (invoke-self (concat ["search-hybrid" (:query req)
                                               "--scope" (or (:scope req) "all")
                                               "--limit" (str (or (:limit req) 10))]
                                              (maybe (:db req) ["--db" (:db req)])))
        "reindex" (invoke-self (concat ["reindex" "--scope" (or (:scope req) "all")]
                                        (maybe (:db req) ["--db" (:db req)])))
        (throw (ex-info (str "Unknown zk action: " action) {}))))))

(defn -main [& args]
  (try
    (let [command (first args) rest-args (vec (rest args))]
      (cond (nil? command) (usage) (= command "--help") (usage)
            (contains? index-commands command) (print (call-index (cons (get index-commands command) rest-args)))
            :else (case command
                    "create" (create-note rest-args) "list" (list-notes rest-args) "get" (get-note rest-args)
                    "update" (update-note rest-args) "delete" (delete-note rest-args) "tags" (list-tags rest-args)
                    "search" (search-notes rest-args) "search-text" (index-search "search-text" rest-args)
                    "search-vector" (index-search "search-vector" rest-args) "search-hybrid" (index-search "search-hybrid" rest-args)
                    "links" (show-links rest-args) "backlinks" (show-backlinks rest-args) "status" (show-status rest-args)
                    "workon" (workon-note rest-args) "promote" (promote-note rest-args) "discard" (discard-note rest-args)
                    "reindex" (reindex-command rest-args) "remember-state" (remember-state rest-args) "tool" (tool rest-args) (usage))))
    (catch Throwable error
      (binding [*out* *err*] (println (or (ex-message error) (.getMessage error))))
      (System/exit 1))))
