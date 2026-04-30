(ns run-calls.scripts
  (:require [babashka.fs :as fs]
            [babashka.process :as p]
            [cheshire.core :as json]
            [clojure.string :as str]
            [run-calls.common :as c]))

(def default-schema {:type "object" :properties {} :additionalProperties true})

(defn safe-name [file]
  (-> (fs/file-name file) (str/replace #"\.[^.]+$" "") (str/replace #"[^a-zA-Z0-9_]" "_")))

(defn read-json-if-exists [file]
  (when (fs/exists? file) (c/parse-json (slurp file))))

(defn executable? [file]
  (zero? (:exit (p/shell {:continue true :out :string :err :string} "test" "-x" (str file)))))

(defn discover []
  (distinct (for [dir (c/tool-dirs)
                  :when (fs/directory? dir)
                  file (fs/list-dir dir)
                  :when (and (fs/regular-file? file) (not (str/ends-with? (str file) ".json")) (executable? file))]
              (str file))))

(defn spec-for [file]
  (let [parsed (fs/split-ext file)
        sibling (str (first parsed) ".json")
        sidecar (or (read-json-if-exists (str file ".json")) (read-json-if-exists sibling) {})]
    {:name (or (:name sidecar) (safe-name file))
     :timeoutMs (long (or (:timeoutMs sidecar) (:timeout_ms sidecar) 120000))
     :maxOutputBytes (long (or (:maxOutputBytes sidecar) (:max_output_bytes sidecar) 60000))}))

(defn script-env [spec]
  (merge (into {} (System/getenv))
         {"STRAP_ROOT" (c/root) "STRAP_CONFIG" (c/config-root) "STRAP_GLOBAL" (c/global-root)
          "STRAP_PROJECT" (c/project-root) "STRAP_WORK" (c/work-root)
          "STRAP_TOOL_NAME" (:name spec) "STRAP_WORKSPACE" (c/workspace)}
         (when-let [s (c/session-root)] {"STRAP_SESSION" s})))

(defn run-script [file spec input]
  (let [r (p/shell {:out :string :err :string :in (str (json/generate-string (or input {})) "\n")
                    :continue true :dir (c/workspace) :env (script-env spec)} file)
        output (str (:out r) (when-not (str/blank? (:err r)) (str "\n[stderr]\n" (:err r))))
        limited (c/truncate output (:maxOutputBytes spec))]
    (if (zero? (:exit r))
      (c/tool-result (:text limited) {:script file :exitCode (:exit r) :signal nil :truncated (:truncated limited)})
      (throw (ex-info (str "Script tool exited " (:exit r) ": " (:text limited)) {})))))

(defn tools []
  (loop [files (discover) seen #{} out {}]
    (if-let [file (first files)]
      (let [spec (spec-for file)]
        (if (seen (:name spec))
          (recur (rest files) seen out)
          (recur (rest files) (conj seen (:name spec)) (assoc out (:name spec) (fn [args _] (run-script file spec args))))))
      out)))
