(ns artifact.history
  (:require [artifact.common :as c]
            [babashka.fs :as fs]
            [clojure.java.shell :as sh]))

(defn run-jj [dir args]
  (let [result (apply sh/sh (concat ["jj"] args [:dir dir]))]
    (when-not (zero? (:exit result))
      (throw
        (ex-info
          (or (not-empty (:err result)) (not-empty (:out result)) (str "jj exited " (:exit result)))
          {:dir dir :args args})))
    (:out result)))

(defn ensure-history [dir]
  (let [ignore-file (fs/path dir ".gitignore")]
    (when-not (fs/exists? ignore-file)
      (spit (str ignore-file) "/provider-requests/tmp/\n/tool-results/tmp/\n"))
    (when-not (fs/exists? (fs/path dir ".jj"))
      (run-jj dir ["git" "init" "--no-colocate" "."]))))

(defn snapshot-current-session [message]
  (when-let [dir (c/env "STRAP_SESSION")]
    (ensure-history dir)
    (run-jj dir ["describe" "-m" message])
    (run-jj dir ["new"])
    true))
