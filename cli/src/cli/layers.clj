(ns cli.layers
  (:require [babashka.fs :as fs]
            [clojure.string :as str]))

(def named-order ["session" "user" "project" "global" "root"])

(defn env [name]
  (System/getenv name))

(defn abs [value]
  (str (fs/absolutize value)))

(defn nearest-dir [name start]
  (loop [dir (fs/absolutize start)]
    (let [candidate (fs/path dir name)
          parent (or (fs/parent dir) dir)]
      (cond
        (fs/directory? candidate) (str candidate)
        (= dir parent) nil
        :else (recur parent)))))

(defn workspace-root []
  (abs (or (env "STRAP_WORKSPACE") (System/getProperty "user.dir"))))

(defn default-root []
  (-> *file* fs/file fs/absolutize fs/parent fs/parent fs/parent fs/parent str))

(defn installed-root []
  (abs (or (env "STRAP_ROOT") (default-root))))

(defn xdg-config []
  (or (env "XDG_CONFIG_HOME") (str (or (env "HOME") "") "/.config")))

(defn implicit-layer [name]
  (case name
    "session" (some-> (env "STRAP_SESSION") (fs/path "overlay") str)
    "user" (or (some-> (env "STRAP_WORK") abs)
                (nearest-dir ".strap-user" (workspace-root))
                (str (fs/path (workspace-root) ".strap-user")))
    "project" (or (some-> (env "STRAP_PROJECT") abs)
                   (nearest-dir ".strap" (workspace-root))
                   (str (fs/path (workspace-root) ".strap")))
    "global" (or (some-> (env "STRAP_GLOBAL") abs)
                  (str (fs/path (xdg-config) "strap")))
    "root" (installed-root)))

(defn parse-entry [entry]
  (let [[left right] (str/split entry #"=" 2)]
    (if right
      {:name left :path (abs right) :implicit false}
      {:name nil :path (abs left) :implicit false})))

(defn explicit-layers []
  (->> (str/split (or (env "STRAP_PATH") "") (re-pattern java.io.File/pathSeparator))
       (remove str/blank?)
       (map parse-entry)
       vec))

(defn layer-names [layers]
  (set (keep :name layers)))

(defn implicit-layers [present]
  (->> named-order
       (remove present)
       (keep (fn [name]
               (when-let [path (implicit-layer name)]
                 {:name name :path path :implicit true})))
       vec))

(defn resolved-layers []
  (let [explicit (explicit-layers)]
    (if (seq explicit)
      (vec (concat explicit (implicit-layers (layer-names explicit))))
      (implicit-layers #{}))))

(defn named-layer [name]
  (first (filter #(= name (:name %)) (resolved-layers))))

(defn layer-path [name]
  (:path (named-layer name)))

(defn artifact-dir [layer artifact-dir-name]
  (str (fs/path (:path layer) artifact-dir-name)))

(defn artifact-dirs [artifact-dir-name]
  (map #(artifact-dir % artifact-dir-name) (resolved-layers)))

(defn normalized-path []
  (str/join java.io.File/pathSeparator
            (map (fn [{:keys [name path]}]
                   (if name (str name "=" path) path))
                 (resolved-layers))))
