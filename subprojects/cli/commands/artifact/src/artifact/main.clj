(ns artifact.main
  (:require [artifact.common :as c]
            [artifact.ops :as ops]
            [artifact.query :as query]
            [artifact.roots :as roots]
            [clojure.string :as str]))

(def flag-options #{"--paths"})
(def value-options #{"--from" "--to"})

(defn parse-args [args]
  (loop [xs (seq args) opts {} pos []]
    (if-not xs
      {:opts opts :pos pos}
      (let [x (first xs)]
        (cond
          (contains? flag-options x)
          (recur (next xs) (assoc opts (keyword (subs x 2)) true) pos)

          (contains? value-options x)
          (let [value (second xs)]
            (when (or (nil? value) (str/starts-with? value "--"))
              (c/usage))
            (recur (nnext xs) (assoc opts (keyword (subs x 2)) value) pos))

          :else
          (recur (next xs) opts (conj pos x)))))))

(defn require-type-name [pos]
  (let [[type name] pos]
    (when (or (nil? type) (nil? name))
      (c/usage))
    [type name]))

(defn status [pos include-paths]
  (if-let [type (first pos)]
    (query/list-artifacts type include-paths)
    (query/all-artifact-status include-paths)))

(defn dispatch [command pos opts]
  (let [include-paths (true? (:paths opts))]
    (case (or command "")
      "types"
      c/artifact-types

      "roots"
      (roots/artifact-roots)

      "status"
      (status pos include-paths)

      "workon"
      (let [[type name] (require-type-name pos)]
        (ops/workon-artifact type name include-paths))

      "promote"
      (let [[type name] (require-type-name pos)]
        (ops/promote-artifact type name include-paths (:from opts) (:to opts)))

      "discard"
      (let [[type name] (require-type-name pos)]
        (ops/discard-artifact type name (:from opts)))

      (c/usage))))

(defn -main [& raw-args]
  (let [[command & rest-args] raw-args
        {:keys [opts pos]} (parse-args rest-args)]
    (c/json-out (dispatch command pos opts))))
