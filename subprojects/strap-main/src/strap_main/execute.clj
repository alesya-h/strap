(ns strap-main.execute
  (:require [babashka.fs :as fs]
            [cheshire.core :as json]
            [clojure.string :as str]
            [strap-main.env :as env])
  (:import [java.lang ProcessBuilder$Redirect]))

(defn apply-env! [^ProcessBuilder builder values]
  (let [target (.environment builder)]
    (.clear target)
    (doseq [[k v] values]
      (.put target k v))))

(defn command-cwd [dir values]
  (let [wd (fs/path dir "wd")]
    (if-not (fs/exists? wd)
      (env/workspace-root)
      (let [builder (ProcessBuilder. [(str wd)])]
        (apply-env! builder values)
        (.redirectError builder ProcessBuilder$Redirect/INHERIT)
        (let [process (.start builder)
              stdout (slurp (.getInputStream process))
              code (.waitFor process)]
          (if (zero? code)
            (env/abs (or (not-empty (str/trim stdout)) (env/workspace-root)))
            (throw (ex-info (str "wd exited " code) {:code code}))))))))

(defn debug-command [name args file dir cwd]
  (when (= "1" (env/env "STRAP_COMMANDS_DEBUG"))
    (binding [*out* *err*]
      (println (json/generate-string {:command name
                                      :args args
                                      :file file
                                      :dir dir
                                      :cwd cwd})))))

(defn run-executable [file name dir args]
  (let [values (env/env-for name dir)
        cwd (command-cwd dir values)
        command (mapv str (cons file args))
        builder (ProcessBuilder. command)]
    (debug-command name args file dir cwd)
    (doto builder
      (.directory (fs/file cwd))
      (.inheritIO))
    (apply-env! builder values)
    (System/exit (.waitFor (.start builder)))))
