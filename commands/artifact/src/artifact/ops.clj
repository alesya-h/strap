(ns artifact.ops
  (:require [artifact.history :as history]
            [artifact.query :as query]
            [artifact.roots :as roots]
            [artifact.store :as store]))

(defn workon-artifact [type name include-paths]
  (let [roots (roots/roots-for type)
        all (query/artifacts-by-layer type)
        artifact (query/find-visible type name all)
        target-layer (if (:session roots) "session" "user")]
    (if (= (:layer artifact) target-layer)
      {:ok true :action "workon" :artifact (query/describe-artifact artifact all include-paths)}
      (let [target (store/destination type (get roots (keyword target-layer)) artifact)]
        (store/copy-artifact artifact target)
        (when (= target-layer "session")
          (history/snapshot-current-session (str "artifact workon: " type "/" name)))
        (let [next-all (query/artifacts-by-layer type)]
          {:ok true
           :action "workon"
           :artifact (query/describe-artifact
                       (query/find-layer type (:name artifact) target-layer next-all)
                       next-all
                       include-paths)})))))

(defn promote-artifact [type name include-paths from to]
  (let [roots (roots/roots-for type)
        all (query/artifacts-by-layer type)
        source-layer (or from (query/first-promotable-layer type name all))
        target-layer (or to (query/next-layer source-layer))]
    (when-not target-layer
      (throw (ex-info (str "Cannot promote from " source-layer) {:from source-layer})))
    (when-not (get roots (keyword target-layer))
      (throw (ex-info (str target-layer " layer is not available") {:to target-layer})))
    (let [artifact (query/find-layer type name source-layer all)
          target (store/destination type (get roots (keyword target-layer)) artifact)]
      (store/copy-artifact artifact target)
      (store/remove-artifact artifact)
      (when (or (= source-layer "session") (= target-layer "session"))
        (history/snapshot-current-session (str "artifact promote: " type "/" name " " source-layer "->" target-layer)))
      (let [next-all (query/artifacts-by-layer type)]
        {:ok true
         :action "promote"
         :from source-layer
         :to target-layer
         :artifact (query/describe-artifact
                     (query/find-layer type (:name artifact) target-layer next-all)
                     next-all
                     include-paths)}))))

(defn discard-artifact [type name from]
  (let [all (query/artifacts-by-layer type)
        layer (or from (query/first-discardable-layer type name all))
        artifact (query/find-layer type name layer all)]
    (store/remove-artifact artifact)
    (when (= layer "session")
      (history/snapshot-current-session (str "artifact discard: " type "/" name)))
    {:ok true :action "discard" :type type :name (:name artifact) :from layer}))
