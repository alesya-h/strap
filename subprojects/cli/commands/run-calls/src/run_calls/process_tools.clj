(ns run-calls.process-tools
  (:require [babashka.process :as p]
            [clojure.string :as str]
            [run-calls.common :as c]))

(defn proc [cmd args opts]
  (let [r (apply p/shell (merge {:out :string :err :string :continue true} opts) cmd args)]
    {:stdout (:out r) :stderr (:err r) :code (:exit r)}))

(defn combine [r]
  (str (:stdout r) (when-not (str/blank? (:stderr r)) (str "\n[stderr]\n" (:stderr r)))))

(defn shell [args _]
  (let [cwd (c/resolve-workspace (or (:workdir args) "."))
        command (str (or (:command args) ""))
        [runner rargs] (if (:read_only_filesystem args)
                         ["bwrap" ["--ro-bind" "/" "/" "--dev" "/dev" "--proc" "/proc" "--tmpfs" "/tmp" "--chdir" cwd "bash" "-lc" command]]
                         ["bash" ["-lc" command]])
        r (proc runner rargs {:dir cwd})
        limited (c/truncate (combine r) (long (or (:max_output_bytes args) 40000)))]
    (c/tool-result (:text limited) {:exitCode (:code r) :signal nil :truncated (:truncated limited) :description (or (:description args) "")})))

(defn nu-eval [args _]
  (let [r (proc "nu" ["-c" (str (or (:command args) ""))] {:dir (c/resolve-workspace (or (:workdir args) "."))})
        limited (c/truncate (combine r) (long (or (:max_output_bytes args) 40000)))]
    (c/tool-result (:text limited) {:exitCode (:code r) :signal nil :truncated (:truncated limited)})))

(defn tmux [args _]
  (let [r (proc "tmux" (into [(str (or (:subcommand args) ""))] (remove str/blank? (str/split (str (or (:arguments args) "")) #" "))) {})]
    (c/tool-result (combine r) {:exitCode (:code r) :signal nil})))

(defn tmux-capture [args _]
  (let [base ["capture-pane" "-p" "-S" (str "-" (or (:lines args) 200))]
        r (proc "tmux" (cond-> base (:target args) (conj "-t" (str (:target args)))) {})]
    (c/tool-result (or (:stdout r) (:stderr r)) {:exitCode (:code r) :signal nil})))

(defn tmux-send [args _]
  (let [base (cond-> ["send-keys"] (:target args) (conj "-t" (str (:target args))))
        r (proc "tmux" (cond-> (conj base (str (or (:text args) ""))) (not= false (:enter args)) (conj "Enter")) {})]
    (c/tool-result (or (not-empty (:stdout r)) (not-empty (:stderr r)) "sent") {:exitCode (:code r) :signal nil})))

(def tools {"shell" shell "nu_eval" nu-eval "tmux" tmux "tmux_capture" tmux-capture "tmux_send" tmux-send})
