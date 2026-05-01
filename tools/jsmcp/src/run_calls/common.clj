(ns run-calls.common
  (:require [babashka.fs :as fs]
            [cheshire.core :as json]
            [clojure.string :as str]))

(defn parse-json [text] (json/parse-string (or text "null") true))
(defn json-str [value] (json/generate-string value {:pretty true}))
(defn write-json [value] (println (json-str value)))

(defn read-input [file]
  (parse-json (if (= file "-") (slurp *in*) (slurp file))))

(defn tool-result
  ([output] (tool-result output {}))
  ([output metadata]
   {:content [{:type "text"
               :text (if (string? output) output (json-str output))}]
    :metadata metadata}))

(defn truncate [text limit]
  (let [value (str text)]
    (if (<= (count value) limit)
      {:text value :truncated false}
      {:text (str (subs value 0 limit) "\n\n[truncated " (- (count value) limit) " bytes]")
       :truncated true})))

(defn env [k default] (or (System/getenv k) default))
(defn workspace [] (str (fs/absolutize (env "STRAP_WORKSPACE" (System/getProperty "user.dir")))))
(defn root [] (str (fs/absolutize (env "STRAP_ROOT" (System/getProperty "user.dir")))))
(defn global-root []
  (str (fs/absolutize (env "STRAP_GLOBAL" (str (env "XDG_CONFIG_HOME" (str (System/getProperty "user.home") "/.config")) "/strap")))))
(defn config-root [] (env "STRAP_CONFIG" (str (fs/path (root) "config" "strap"))))
(defn project-root [] (env "STRAP_PROJECT" (str (fs/path (workspace) ".strap"))))
(defn work-root [] (env "STRAP_WORK" (str (fs/path (workspace) ".strap-user"))))
(defn session-root [] (System/getenv "STRAP_SESSION"))

(defn tool-dirs []
  (let [configured (remove str/blank? (str/split (env "STRAP_TOOL_PATH" "") (re-pattern java.io.File/pathSeparator)))
        session (when-let [s (session-root)] [(str (fs/path s "overlay" "tools"))])]
    (concat configured session [(str (fs/path (work-root) "tools"))
                                (str (fs/path (project-root) "tools"))
                                (str (fs/path (global-root) "tools"))
                                (str (fs/path (root) "tools"))])))

(defn resolve-workspace [input]
  (let [base (fs/absolutize (workspace))
        resolved (fs/absolutize (fs/path base (or input ".")))
        rel (str (fs/relativize base resolved))]
    (when (and (not= "1" (System/getenv "STRAP_ALLOW_OUTSIDE_WORKSPACE"))
               (or (str/starts-with? rel "..") (fs/absolute? rel)))
      (throw (ex-info (str "Path is outside workspace: " input) {})))
    (str resolved)))

(defn display-path [file]
  (let [base (fs/absolutize (workspace))
        rel (str (fs/relativize base (fs/absolutize file)))]
    (if (str/starts-with? rel "..") (str file) rel)))
