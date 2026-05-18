(ns cli.commands
  (:require [babashka.fs :as fs]
            [clojure.string :as str]
            [cli.layers :as layers]))

(defn maybe-join [root name]
  (if root [(str (fs/path root name))] []))

(defn command-dirs []
  (layers/artifact-dirs "commands"))

(defn command-dir [name]
  (when name
    (first
     (for [root (command-dirs)
           :let [candidate (fs/path root name)]
            :when (fs/exists? (fs/path candidate "run"))]
       (str candidate)))))

(defn commands []
  (let [found (atom {})]
    (doseq [root (reverse (command-dirs))
            :when (fs/directory? root)
            entry (fs/list-dir root)
            :when (fs/directory? entry)
            :let [name (fs/file-name entry)]
            :when (fs/exists? (fs/path entry "run"))]
      (swap! found assoc name {:name name :dir (str entry)}))
    (sort-by :name (vals @found))))

(defn description [dir]
  (let [file (fs/path dir "desc")]
    (if (fs/exists? file)
      (or (first (str/split-lines (slurp (str file)))) "")
      "")))

(defn pretty-commands [show-hidden]
  (println "\n  Available commands:\n")
  (doseq [{:keys [name dir]} (commands)]
    (when (or show-hidden (not (fs/exists? (fs/path dir "hide"))))
      (let [desc (description dir)]
        (println (str "  * "
                      (format "%-15s" name)
                      (when-not (str/blank? desc)
                        (str " - " desc)))))))
  (println "\nUse `strap help <command>` to see docs for a command.\n"))
