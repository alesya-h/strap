(ns artifact.query
  (:require [artifact.common :as c]
            [artifact.digest :as digest]
            [artifact.discover :as discover]
            [artifact.roots :as roots]))

(defn artifacts-by-layer [type]
  (let [roots (roots/roots-for type)]
    (vec
      (mapcat
        (fn [layer]
          (when-let [root (get roots (keyword layer))]
            (discover/discover-artifacts type root layer)))
        (c/layers)))))

(defn lower-priority? [candidate artifact]
  (let [layers (c/layers)]
    (> (.indexOf layers (:layer candidate)) (.indexOf layers (:layer artifact)))))

(defn visible-status [artifact base]
  (if (#{"session" "user"} (:layer artifact))
    (if base
      (if (= (digest/artifact-digest artifact) (digest/artifact-digest base)) "working" "modified")
      "new")
    (:layer artifact)))

(defn describe-artifact [artifact all include-paths]
  (let [base (first (filter #(and (= (:name %) (:name artifact)) (lower-priority? % artifact)) all))
        shadows (->> all
                     (filter #(and (= (:name %) (:name artifact)) (not= (:layer %) (:layer artifact))))
                     (map :layer)
                     vec)
        described {:type (:type artifact)
                   :name (:name artifact)
                   :layer (:layer artifact)
                   :status (visible-status artifact base)
                   :shadows shadows}]
    (if include-paths
      (assoc described :path (:path artifact) :root (:root artifact) :files (:files artifact))
      described)))

(defn list-artifacts [type include-paths]
  (let [all (artifacts-by-layer type)
        seen (atom #{})]
    (->> (c/layers)
         (mapcat
           (fn [layer]
             (for [artifact (filter #(= (:layer %) layer) all)
                   :when (not (contains? @seen (:name artifact)))]
               (do
                 (swap! seen conj (:name artifact))
                 (describe-artifact artifact all include-paths)))))
         (sort-by :name)
         vec)))

(defn all-artifact-status [include-paths]
  (into {} (map (fn [type] [type (list-artifacts type include-paths)]) c/artifact-types)))

(defn find-visible [type name all]
  (let [matches (vec (mapcat (fn [layer] (filter #(and (= (:layer %) layer) (= (:name %) name)) all)) (c/layers)))]
    (when (empty? matches)
      (throw (ex-info (str type " artifact not found: " name) {:type type :name name})))
    (first matches)))

(defn find-layer [type name layer all]
  (let [matches (vec (filter #(and (= (:layer %) layer) (= (:name %) name)) all))]
    (cond
      (empty? matches) (throw (ex-info (str type " artifact not found in " layer " layer: " name) {:type type :name name :layer layer}))
      (> (count matches) 1) (throw (ex-info (str "Ambiguous " type " artifact in " layer " layer: " name) {:type type :name name :layer layer}))
      :else (first matches))))

(defn first-layer-with [allowed type name all message]
  (or (some (fn [layer] (when (some #(and (= (:layer %) layer) (= (:name %) name)) all) layer)) allowed)
      (throw (ex-info (str type " artifact not found in a " message " layer: " name) {:type type :name name}))))

(defn first-promotable-layer [type name all]
  (first-layer-with (c/mutable-layers) type name all "promotable"))

(defn first-discardable-layer [type name all]
  (first-layer-with ["session" "user"] type name all "discardable"))

(defn next-layer [layer]
  (let [layers (c/layers)]
    (nth layers (inc (.indexOf layers layer)) nil)))
