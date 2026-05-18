(ns provider.model
  (:require [babashka.fs :as fs]
            [cheshire.core :as json]
            [clojure.string :as str]))

(defn env [k]
  (System/getenv k))

(defn workspace []
  (fs/absolutize (or (env "STRAP_WORKSPACE") (System/getProperty "user.dir"))))

(defn nearest [name]
  (loop [dir (workspace)]
    (let [candidate (fs/path dir name)]
      (cond
        (fs/directory? candidate) (str candidate)
        (= (str dir) (str (fs/parent dir))) nil
        :else (recur (fs/parent dir))))))

(defn project-root []
  (or (env "STRAP_PROJECT") (nearest ".strap") (str (fs/path (workspace) ".strap"))))

(defn work-root []
  (or (env "STRAP_WORK") (nearest ".strap-user") (str (fs/path (workspace) ".strap-user"))))

(defn global-root []
  (or (env "STRAP_GLOBAL")
      (str (fs/path (or (env "XDG_CONFIG_HOME") (str (fs/path (System/getProperty "user.home") ".config"))) "strap"))))

(defn root []
  (or (env "STRAP_ROOT") (str (fs/absolutize (fs/path (System/getProperty "user.dir"))))))

(defn session-overlay []
  (when-let [session (env "STRAP_SESSION")]
    (str (fs/path session "overlay"))))

(defn layer-path [entry]
  (let [[_ path] (str/split entry #"=" 2)]
    (str (fs/absolutize (or path entry)))))

(defn roots []
  (map #(str (fs/path (layer-path %) "models"))
       (remove str/blank? (str/split (or (env "STRAP_PATH") "") (re-pattern java.io.File/pathSeparator)))))

(defn expand-home [p]
  (if (str/starts-with? (str p) "~")
    (str (fs/path (System/getProperty "user.home") (subs p 1)))
    p))

(defn resolve-model [name]
  (let [expanded (expand-home name)]
    (if (or (str/ends-with? expanded ".json") (str/includes? expanded "/"))
      (let [direct (str (fs/absolutize expanded))]
        (if (fs/exists? direct)
          direct
          (throw (ex-info (str "Model profile not found: " name) {}))))
      (let [file (if (str/ends-with? name ".json") name (str name ".json"))]
        (or (some (fn [root]
                    (let [candidate (str (fs/path root file))]
                      (when (fs/exists? candidate) candidate)))
                  (roots))
            (throw (ex-info (str "Model profile not found: " name) {})))))))

(defn load-model [name]
  (let [model (json/parse-string (slurp (resolve-model name)) true)]
    (merge
      {:api "responses"
       :base_url "https://chatgpt.com/backend-api/codex/responses"
       :auth {:type "chatgpt_oauth"}
       :parameters {}
       :stream true}
      model
      {:model (:model_id model)})))
