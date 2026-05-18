(ns cli.env
  (:require [babashka.fs :as fs]
            [cli.layers :as layers]))

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
      str))

(defn workspace-root []
  (layers/workspace-root))

(defn strap-root []
  (or (layers/layer-path "root") (abs (or (env "STRAP_ROOT") (default-root)))))

(defn nearest-dir [name start]
  (loop [dir (fs/absolutize start)]
    (let [candidate (fs/path dir name)
          parent (or (fs/parent dir) dir)]
      (cond
        (fs/directory? candidate) (str candidate)
        (= dir parent) nil
        :else (recur parent)))))

(defn strap-global-root []
  (or (layers/layer-path "global")
      (if-let [root (env "STRAP_GLOBAL")]
        (abs root)
        (str (fs/path (or (env "XDG_CONFIG_HOME")
                          (str (or (env "HOME") "") "/.config"))
                      "strap")))))

(defn strap-project-root []
  (or (layers/layer-path "project")
      (if-let [root (env "STRAP_PROJECT")]
        (abs root)
        (or (nearest-dir ".strap" (workspace-root))
            (str (fs/path (workspace-root) ".strap"))))))

(defn strap-work-root []
  (or (layers/layer-path "user")
      (if-let [root (env "STRAP_WORK")]
        (abs root)
        (or (nearest-dir ".strap-user" (workspace-root))
            (str (fs/path (workspace-root) ".strap-user"))))))

(defn strap-config-root []
  (if-let [root (env "STRAP_CONFIG")]
    (abs root)
    (let [repo-config (fs/path (strap-root) "config" "strap")]
      (if (fs/exists? repo-config)
        (str repo-config)
        (strap-global-root)))))

(defn strap-session-root []
  (some-> (env "STRAP_SESSION") abs))

(defn env-for [name dir]
  (cond-> (into {} (System/getenv))
    true (assoc "STRAP_ROOT" (strap-root)
                "STRAP_PATH" (layers/normalized-path)
                "STRAP_CONFIG" (strap-config-root)
                "STRAP_GLOBAL" (strap-global-root)
                "STRAP_PROJECT" (strap-project-root)
                "STRAP_WORK" (strap-work-root)
                "STRAP_WORKSPACE" (workspace-root)
                "STRAP_CMD_NAME" name
                "STRAP_CMD_DIR" dir)
    (strap-session-root) (assoc "STRAP_SESSION" (strap-session-root))))
