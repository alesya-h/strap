(ns tool.jsmcp-diff
  (:require [clojure.string :as str]))

(defn structured [response]
  (get-in response [:result :structuredContent]))

(defn collection-diff [kind previous next key-fn]
  (let [previous-map (into {} (map (juxt key-fn identity) previous))
        next-map (into {} (map (juxt key-fn identity) next))
        added (sort (remove previous-map (keys next-map)))
        removed (sort (remove next-map (keys previous-map)))
        changed (sort (for [[k item] next-map
                            :when (and (previous-map k)
                                       (not= (previous-map k) item))]
                        k))]
    (when (or (seq added) (seq removed) (seq changed))
      {:kind kind
       :summary {:added added :removed removed :changed changed}
       :before previous
       :after next})))

(defn list-servers [previous next]
  (collection-diff "list_servers"
                   (or (:servers (structured previous)) [])
                   (or (:servers (structured next)) [])
                   :name))

(defn list-tools [server previous next]
  (when-let [diff (collection-diff "list_tools"
                                   (or (:tools (structured previous)) [])
                                   (or (:tools (structured next)) [])
                                   :name)]
    (assoc diff :serverName server)))

(defn summary-line [verb item-label names]
  (str "- " verb " " item-label (when (> (count names) 1) "s") ": "
       (str/join ", " names)))

(defn section [label summary item-label]
  (cond-> [(str label " changed:")]
    (seq (:added summary))
    (conj (summary-line "added" item-label (:added summary)))
    (seq (:removed summary))
    (conj (summary-line "removed" item-label (:removed summary)))
    (seq (:changed summary))
    (conj (summary-line "updated" item-label (:changed summary)))))

(defn change-lines [change]
  (if (= "list_servers" (:kind change))
    (section "list_servers" (:summary change) "server")
    (section (str "list_tools(" (:serverName change) ")")
             (:summary change)
             "tool")))

(defn capability-error [changes]
  (ex-info (str/join "\n" (concat ["The jsmcp daemon reconnected and cached discovery results changed."
                                    "Review these changes before retrying execute_code."
                                    ""]
                                   (mapcat change-lines changes)))
           {:changes changes}))
