(ns artifact.roots
  (:require [artifact.common :as c]))

(defn roots-for [type]
  (case type
    "command"
    {:session (c/maybe-path (c/env "STRAP_SESSION") "overlay" "commands")
     :user (c/path-str (c/env "STRAP_WORK") "commands")
     :project (c/path-str (c/env "STRAP_PROJECT") "commands")
     :global (c/path-str (c/env "STRAP_GLOBAL") "commands")
     :root (c/path-str (c/env "STRAP_ROOT") "subprojects" "cli" "commands")}

    "tool"
    {:session (c/maybe-path (c/env "STRAP_SESSION") "overlay" "tools")
     :user (c/path-str (c/env "STRAP_WORK") "tools")
     :project (c/path-str (c/env "STRAP_PROJECT") "tools")
     :global (c/path-str (c/env "STRAP_GLOBAL") "tools")
     :root (c/path-str (c/env "STRAP_ROOT") "tools")}

    "agent"
    {:session (c/maybe-path (c/env "STRAP_SESSION") "overlay" "agents")
     :user (c/path-str (c/env "STRAP_WORK") "agents")
     :project (c/path-str (c/env "STRAP_PROJECT") "agents")
     :global (c/path-str (c/env "STRAP_GLOBAL") "agents")
     :root (c/path-str (c/env "STRAP_ROOT") "agents")}

    "skill"
    {:session (c/maybe-path (c/env "STRAP_SESSION") "overlay" "skills")
     :user (c/path-str (c/env "STRAP_WORK") "skills")
     :project (c/path-str (c/env "STRAP_PROJECT") "skills")
     :global (c/path-str (c/env "STRAP_GLOBAL") "skills")
     :root (c/path-str (c/env "STRAP_ROOT") "skills")}

    "model"
    {:session (c/maybe-path (c/env "STRAP_SESSION") "overlay" "models")
     :user (c/path-str (c/env "STRAP_WORK") "models")
     :project (c/path-str (c/env "STRAP_PROJECT") "models")
     :global (c/path-str (c/env "STRAP_GLOBAL") "models")
     :root (c/path-str (c/env "STRAP_ROOT") "config" "strap" "models")}

    (c/unknown-type! type)))

(defn artifact-roots []
  (into {} (map (fn [type] [type (roots-for type)]) c/artifact-types)))
