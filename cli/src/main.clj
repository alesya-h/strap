(ns main
  (:require [babashka.fs :as fs]
            [cli.commands :as commands]
            [cli.env :as env]
            [cli.execute :as execute]))

(defn die [message]
  (binding [*out* *err*]
    (println message))
  (System/exit 255))

(defn show-help [name]
  (when-not name
    (die "Usage: strap help <command>"))
  (let [dir (or (commands/command-dir name) (die (str "Unknown command: " name)))
        file (fs/path dir "desc")]
    (when-not (fs/exists? file)
      (die (str "No help found for command: " name)))
    (println (str "Showing help for: " name "\n"))
    (print (slurp (str file)))))

(defn run-command [name args]
  (let [dir (or (commands/command-dir name) (die (str "Unknown command: " name)))]
    (execute/run-executable (str (fs/path dir "run")) name dir args)))

(defn run-inner [[name script & args]]
  (when-not (and name script)
    (die "Usage: strap inner <command> <script> [args...]"))
  (let [dir (or (commands/command-dir name) (die (str "Unknown command: " name)))
        file (fs/path dir "inner" script)]
    (when-not (fs/exists? file)
      (die (str "Inner script not found: " file)))
    (execute/run-executable (str file) name dir args)))

(defn -main [& argv]
  (env/resolve-session-env-from-pointer)
  (let [[command & args] argv]
    (cond
      (or (nil? command) (contains? #{"-h" "--help"} command)) (commands/pretty-commands false)
      (= command "-a") (commands/pretty-commands true)
      (= command "help") (show-help (first args))
      (= command "command-dir") (if-let [dir (commands/command-dir (first args))]
                                   (println dir)
                                   (die (str "Unknown command: " (first args))))
      (= command "inner") (run-inner args)
      :else (run-command command args))))
