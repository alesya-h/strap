(ns strap-main.commands
  (:require [babashka.fs :as fs]
            [clojure.string :as str]
            [strap-main.env :as env]))

(defn maybe-join [root name]
  (if root [(str (fs/path root name))] []))

(defn command-dirs []
  (let [configured (remove str/blank?
                           (str/split (or (env/env "STRAP_COMMAND_PATH") "")
                                      (re-pattern java.io.File/pathSeparator)))
        session (env/strap-session-root)]
    (concat configured
            (maybe-join (some-> session (fs/path "overlay")) "commands")
            [(str (fs/path (env/strap-work-root) "commands"))
             (str (fs/path (env/strap-project-root) "commands"))
             (str (fs/path (env/strap-global-root) "commands"))
             (str (fs/path (env/strap-root) "commands"))])))

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
