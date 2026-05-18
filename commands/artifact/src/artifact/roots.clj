(ns artifact.roots
  (:require [artifact.common :as c]))

(defn subdir [type]
  (case type
    "command" "commands"
    "tool" "tools"
    "agent" "agents"
    "skill" "skills"
    "model" "models"
    (c/unknown-type! type)))

(defn roots-for [type]
  (let [dir (subdir type)]
    (into {}
          (map (fn [{:keys [name path]}]
                 [(keyword name) (c/path-str path dir)])
               (c/layer-list)))))

(defn artifact-roots []
  (into {} (map (fn [type] [type (roots-for type)]) c/artifact-types)))
