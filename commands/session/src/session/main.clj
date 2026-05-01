(ns session.main
  (:require [babashka.fs :as fs]
            [session.common :as c]
            [session.files :as files]
            [session.state :as state]))

(defn usage []
  (binding [*out* *err*]
    (println "Usage: strap session <new|copy|list|resolve|path|state|show|ask|save|trace> [args]"))
  (System/exit 2))

(defn command-new [args]
  (let [title (or (not-empty (clojure.string/join " " args)) "session")
        dir (files/create-session title)]
    (c/record-trace dir {:kind "session_new" :title title})
    (c/snapshot-history dir (str "session new: " title))
    (c/set-current dir)
    (c/json-out {:ok true :dir dir :state (c/state-path dir)})))

(defn command-copy [args]
  (let [source (c/current-dir)
        opt (c/take-option args "--at" "")
        at (not-empty (:value opt))
        title (or (not-empty (clojure.string/join " " (:args opt))) (str (c/read-title source) " copy"))
        dir (files/copy-session source title at)]
    (c/record-trace dir (cond-> {:kind "session_copy" :copied_from source :title title} at (assoc :at at)))
    (c/snapshot-history dir (str "session copy: " title))
    (c/set-current dir)
    (c/json-out (cond-> {:ok true :dir dir :state (c/state-path dir) :copied_from source} at (assoc :copied_at at)))))

(defn command-list []
  (let [items (->> (fs/list-dir (c/sessions-root))
                   (filter fs/directory?)
                   (map (fn [dir] (merge {:name (fs/file-name dir) :dir (str dir)} (c/read-meta dir))))
                   (sort-by :name))]
    (c/json-out items)))

(defn command-resolve [args]
  (let [selector (clojure.string/join " " args)]
    (cond
      (and (empty? selector) (c/env "STRAP_SESSION")) (println (str (fs/absolutize (c/env "STRAP_SESSION"))))
      (empty? selector) (throw (ex-info "Usage: strap session resolve <name-or-path>" {}))
      :else (println (files/resolve-session selector)))))

(defn command-ask [args]
  (let [dir (c/current-dir) text (clojure.string/join " " args)]
    (when (empty? text) (throw (ex-info "Usage: strap session ask <text>" {})))
    (let [next-state (state/append-event (files/read-state dir) {:from "user" :to ["assistant"] :kind "message" :text text})]
      (files/write-state dir next-state)
      (c/record-trace dir {:kind "session_ask" :text text})
      (c/snapshot-history dir "session ask")
      (c/json-out next-state))))

(defn command-save []
  (let [dir (c/current-dir)
        next-state (state/normalize (c/parse-json (slurp *in*)))]
    (files/write-state dir next-state)
    (c/record-trace dir {:kind "session_save"})
    (c/snapshot-history dir "session save")
    (c/json-out {:ok true :state (c/state-path dir)})))

(defn -main [& argv]
  (try
    (let [command (first argv) args (vec (rest argv))]
      (case command
        "new" (command-new args)
        "copy" (command-copy args)
        "list" (command-list)
        "resolve" (command-resolve args)
        "path" (println (c/current-dir))
        "state" (println (c/state-path))
        "show" (print (slurp (c/state-path)))
        "trace" (print (slurp (c/trace-path)))
        "ask" (command-ask args)
        "save" (command-save)
        (usage)))
    (catch Throwable error
      (binding [*out* *err*] (println (ex-message error)))
      (System/exit 1))))
