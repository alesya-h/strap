(ns strap-main.env
  (:require [babashka.fs :as fs]
            [clojure.string :as str]))

(def session-override (atom nil))

(defn env [name]
  (System/getenv name))

(defn abs [value]
  (str (fs/absolutize value)))

(defn default-root []
  (-> *file*
      fs/file
      fs/absolutize
      fs/parent
      fs/parent
      fs/parent
      fs/parent
      fs/parent
      str))

(defn workspace-root []
  (abs (or (env "STRAP_WORKSPACE") (System/getProperty "user.dir"))))

(defn strap-root []
  (abs (or (env "STRAP_ROOT") (default-root))))

(defn nearest-dir [name start]
  (loop [dir (fs/absolutize start)]
    (let [candidate (fs/path dir name)
          parent (or (fs/parent dir) dir)]
      (cond
        (fs/directory? candidate) (str candidate)
        (= dir parent) nil
        :else (recur parent)))))

(defn strap-global-root []
  (if-let [root (env "STRAP_GLOBAL")]
    (abs root)
    (str (fs/path (or (env "XDG_CONFIG_HOME")
                      (str (or (env "HOME") "") "/.config"))
                  "strap"))))

(defn strap-project-root []
  (if-let [root (env "STRAP_PROJECT")]
    (abs root)
    (or (nearest-dir ".strap" (workspace-root))
        (str (fs/path (workspace-root) ".strap")))))

(defn strap-work-root []
  (if-let [root (env "STRAP_WORK")]
    (abs root)
    (or (nearest-dir ".strap-user" (workspace-root))
        (str (fs/path (workspace-root) ".strap-user")))))

(defn strap-config-root []
  (if-let [root (env "STRAP_CONFIG")]
    (abs root)
    (let [repo-config (fs/path (strap-root) "config" "strap")]
      (if (fs/exists? repo-config)
        (str repo-config)
        (strap-global-root)))))

(defn strap-session-root []
  (some-> (or @session-override (env "STRAP_SESSION")) abs))

(defn set-session! [session]
  (reset! session-override session))

(defn resolve-session-env-from-pointer []
  (when-not (env "STRAP_SESSION")
    (let [current (fs/path (strap-work-root) "sessions" "current")]
      (when (fs/exists? current)
        (let [session (str/trim (slurp (str current)))]
          (when-not (str/blank? session)
            (set-session! (abs session))))))))

(defn env-for [name dir]
  (cond-> (into {} (System/getenv))
    true (assoc "STRAP_ROOT" (strap-root)
                "STRAP_CONFIG" (strap-config-root)
                "STRAP_GLOBAL" (strap-global-root)
                "STRAP_PROJECT" (strap-project-root)
                "STRAP_WORK" (strap-work-root)
                "STRAP_WORKSPACE" (workspace-root)
                "STRAP_CMD_NAME" name
                "STRAP_CMD_DIR" dir)
    (strap-session-root) (assoc "STRAP_SESSION" (strap-session-root))))
