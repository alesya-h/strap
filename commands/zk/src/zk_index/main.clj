(in-ns 'zk.index)

(defn -main [& args]
  (try
    (case (first args)
      "init" (init-db (rest args))
      "create" (create-note (rest args))
      "update" (update-note (rest args))
      "delete" (delete-note (rest args))
      "list" (list-notes (rest args))
      "tags" (list-tags (rest args))
      "get" (get-note (rest args))
      "search-text" (search-text (rest args))
      "search-vector" (search-vector (rest args))
      "search-hybrid" (search-hybrid (rest args))
      "related" (related (rest args))
      "backlinks" (backlinks (rest args))
      "link" (link (rest args))
      "reindex" (reindex (rest args))
      (usage))
    (catch Throwable error
      (binding [*out* *err*]
        (println (or (ex-message error) (.getMessage error))))
      (System/exit 1))))
