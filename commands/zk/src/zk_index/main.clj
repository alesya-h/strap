(ns zk-index.main
  (:require [zk-index.core :as core]
            [zk-index.crud :as crud]
            [zk-index.schema :as schema]
            [zk-index.search :as search]))

(defn -main [& args]
  (try
    (case (first args)
      "init" (schema/init-db (rest args))
      "create" (crud/create-note (rest args))
      "update" (crud/update-note (rest args))
      "delete" (crud/delete-note (rest args))
      "list" (crud/list-notes (rest args))
      "tags" (crud/list-tags (rest args))
      "get" (crud/get-note (rest args))
      "search-text" (search/search-text (rest args))
      "search-vector" (search/search-vector (rest args))
      "search-hybrid" (search/search-hybrid (rest args))
      "related" (search/related (rest args))
      "backlinks" (search/backlinks (rest args))
      "link" (search/link (rest args))
      "reindex" (search/reindex (rest args))
      (core/usage))
    (catch Throwable error
      (binding [*out* *err*]
        (println (or (ex-message error) (.getMessage error))))
      (System/exit 1))))
