(ns history.main
  (:require [babashka.fs :as fs]
            [babashka.process :as process]
            [cheshire.core :as json]
            [clojure.string :as str]))

(defn usage []
  (binding [*out* *err*]
    (println "Usage: strap history <init|root|status|log|diff|snapshot|new|restore|ui|jjui> [args]"))
  (System/exit 2))

(defn json-out [value]
  (println (json/generate-string value {:pretty true})))

(defn session []
  (let [root (System/getenv "STRAP_SESSION")]
    (when (str/blank? (str root))
      (throw (ex-info "No current session. Run `strap session new <name>` first." {})))
    (fs/create-dirs root)
    root))

(defn ensure-ignore [root]
  (let [file (fs/path root ".gitignore")]
    (if (fs/exists? file)
      false
      (do
        (spit (str file) "/cache/\n/logs/\n/zettel/*.sqlite\n/zettel/*.sqlite-*\n/auth/\n")
        true))))

(defn run-jj
  ([root args] (run-jj root args false))
  ([root args capture?]
   (let [opts (if capture? {:out :string :err :string :continue true :dir root} {:out :inherit :err :inherit :continue true :dir root})
         result (apply process/shell opts "jj" args)]
     (when-not (zero? (:exit result))
       (throw (ex-info (if capture? (or (not-empty (:err result)) (:out result)) (str "jj exited " (:exit result))) {})))
     (:out result))))

(defn take-option [values name]
  (let [xs (vec values)
        idx (.indexOf xs name)]
    (when-not (= -1 idx)
      {:value (get xs (inc idx))
       :args (vec (concat (subvec xs 0 idx) (subvec xs (min (count xs) (+ idx 2)))))})))

(defn snapshot [root values]
  (when-not (fs/exists? (fs/path root ".jj"))
    (throw (ex-info "History is not initialized. Run `strap history init`." {})))
  (let [m1 (take-option values "--message")
        m2 (when-not m1 (take-option values "-m"))
        message (or (:value m1) (:value m2) (str/join " " values) "strap state snapshot")]
    (run-jj root ["describe" "-m" message] true)
    (run-jj root ["new"] true)
    (json-out {:ok true :work root :message message})))

(defn init []
  (let [root (session)
        changed (ensure-ignore root)
        initialized (not (fs/exists? (fs/path root ".jj")))]
    (when initialized
      (run-jj root ["git" "init" "--no-colocate" "."] true))
    (when (or changed initialized)
      (run-jj root ["describe" "-m" "history init"] true)
      (run-jj root ["new"] true))
    (json-out {:ok true :work root :jj (str (fs/path root ".jj"))})))

(defn run-ui [root args]
  (let [result (apply process/shell {:out :inherit :err :inherit :continue true :dir root} "jjui" args)]
    (when-not (zero? (:exit result))
      (throw (ex-info (str "jjui exited " (or (:exit result) (:signal result))) {})))))

(defn -main [& argv]
  (try
    (let [command (or (first argv) "status")
          args (vec (rest argv))]
      (case command
        "init" (init)
        "root" (println (session))
        "status" (run-jj (session) (concat ["status"] args))
        "st" (run-jj (session) (concat ["status"] args))
        "log" (run-jj (session) (concat ["log"] args))
        "diff" (run-jj (session) (concat ["diff"] args))
        "snapshot" (snapshot (session) args)
        "new" (run-jj (session) (if-let [rev (first args)] ["new" rev] ["new"]))
        "restore" (if-let [rev (first args)] (run-jj (session) ["restore" "--from" rev]) (usage))
        "ui" (run-ui (session) args)
        "jjui" (run-ui (session) args)
        (usage)))
    (catch Throwable error
      (binding [*out* *err*] (println (ex-message error)))
      (System/exit 1))))
