(ns strap-main.session
  (:require [babashka.fs :as fs]
            [clojure.string :as str]
            [strap-main.env :as env]))

(defn resolve-session [value die]
  (let [direct (fs/absolutize value)
        sessions (fs/path (env/strap-work-root) "sessions")
        candidate (fs/path sessions value)
        matches (if (fs/directory? sessions)
                  (filter #(and (fs/directory? %)
                                (str/includes? (fs/file-name %) value))
                          (fs/list-dir sessions))
                  [])]
    (cond
      (fs/directory? direct) (str direct)
      (fs/directory? candidate) (str candidate)
      (= 1 (count matches)) (str (first matches))
      (< 1 (count matches)) (die (str "Ambiguous session: " value))
      :else (die (str "Session not found: " value)))))
