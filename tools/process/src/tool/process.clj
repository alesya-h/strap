(ns tool.process
  (:require [babashka.process :as p]
            [clojure.string :as str]
            [tool.common :as c]))

(defn proc [cmd args opts]
  (let [result (apply p/shell
                      (merge {:out :string :err :string :continue true} opts)
                      cmd
                      args)]
    {:stdout (:out result)
     :stderr (:err result)
     :code (:exit result)}))

(defn combine [result]
  (str (:stdout result)
       (when-not (str/blank? (:stderr result))
         (str "\n[stderr]\n" (:stderr result)))))

(defn limited-result [result args & [extra-details]]
  (let [limited (c/truncate (combine result)
                            (long (or (:max_output_bytes args) 40000)))]
    (c/tool-result (:text limited)
                   (merge {:exitCode (:code result)
                           :signal nil
                           :truncated (:truncated limited)}
                          extra-details))))

(defn shell-runner [cwd command read-only?]
  (if read-only?
    ["bwrap" ["--ro-bind" "/" "/"
               "--dev" "/dev"
               "--proc" "/proc"
               "--tmpfs" "/tmp"
               "--chdir" cwd
               "bash" "-lc" command]]
    ["bash" ["-lc" command]]))

(defn shell [args _]
  (let [cwd (c/resolve-workspace (or (:workdir args) "."))
        command (str (or (:command args) ""))
        [runner runner-args] (shell-runner cwd command (:read_only_filesystem args))
        result (proc runner runner-args {:dir cwd})]
    (limited-result result args {:description (or (:description args) "")})))

(defn nu-eval [args _]
  (let [cwd (c/resolve-workspace (or (:workdir args) "."))
        command (str (or (:command args) ""))
        result (proc "nu" ["-c" command] {:dir cwd})]
    (limited-result result args)))

(defn tmux-args [args]
  (into [(str (or (:subcommand args) ""))]
        (map str (or (:arguments args) []))))

(defn tmux [args _]
  (let [result (proc "tmux" (tmux-args args) {})]
    (c/tool-result (combine result) {:exitCode (:code result) :signal nil})))

(defn tmux-capture [args _]
  (let [base ["capture-pane" "-p" "-S" (str "-" (or (:lines args) 200))]
        tmux-args (cond-> base (:target args) (conj "-t" (str (:target args))))
        result (proc "tmux" tmux-args {})]
    (c/tool-result (or (:stdout result) (:stderr result))
                   {:exitCode (:code result) :signal nil})))

(defn tmux-send [args _]
  (let [base (cond-> ["send-keys"]
               (:target args) (conj "-t" (str (:target args))))
        text (str (or (:text args) ""))
        tmux-args (cond-> (conj base text)
                    (not= false (:enter args)) (conj "Enter"))
        result (proc "tmux" tmux-args {})]
    (c/tool-result (or (not-empty (:stdout result))
                       (not-empty (:stderr result))
                       "sent")
                   {:exitCode (:code result) :signal nil})))

(def tools
  {"shell" shell
   "nu_eval" nu-eval
   "tmux" tmux
   "tmux_capture" tmux-capture
   "tmux_send" tmux-send})
