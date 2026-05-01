(ns run-calls.fs-tools
  (:require [babashka.fs :as fs]
            [babashka.process :as p]
            [clojure.string :as str]
            [run-calls.common :as c]))

(defn line-window [text offset limit]
  (let [lines (str/split text #"\n" -1)
        start (max 1 (long (or offset 1)))
        end (min (count lines) (+ start (max 1 (long (or limit 2000))) -1))]
    {:rendered (->> (range start (inc end))
                    (map (fn [line-number]
                           (let [raw (nth lines (dec line-number) "")
                                 shown (if (> (count raw) 2000)
                                         (str (subs raw 0 2000) "[line truncated]")
                                         raw)]
                             (str line-number ": " shown))))
                    (str/join "\n"))
     :totalLines (count lines)
     :shown [start end]}))

(defn directory-result [dir]
  (let [entries (->> (fs/list-dir dir)
                     (sort-by fs/file-name)
                     (map #(str (fs/file-name %) (when (fs/directory? %) "/")))
                     (str/join "\n"))]
    (c/tool-result (str "<path>" (c/display-path dir) "</path>\n"
                        "<type>directory</type>\n"
                        "<entries>\n" entries "\n</entries>"))))

(defn file-result [file args]
  (let [window (line-window (slurp file) (:offset args) (:limit args))]
    (c/tool-result (str "<path>" (c/display-path file) "</path>\n"
                        "<type>file</type>\n"
                        "<content>\n" (:rendered window) "\n</content>")
                   window)))

(defn read-file [args _]
  (let [file (c/resolve-workspace (:path args))]
    (if (fs/directory? file)
      (directory-result file)
      (file-result file args))))

(defn entry [file]
  {:name (fs/file-name file)
   :path (c/display-path file)
   :type (cond
           (fs/directory? file) "directory"
           (fs/regular-file? file) "file"
           :else "other")})

(defn list-dir [args _]
  (let [dir (c/resolve-workspace (or (:path args) "."))]
    (c/tool-result (->> (fs/list-dir dir)
                        (sort-by fs/file-name)
                        (map entry)))))

(defn run-rg [cwd args]
  (apply p/shell {:out :string :err :string :continue true :dir cwd} "rg" args))

(defn glob-files [args _]
  (let [cwd (c/resolve-workspace (or (:path args) "."))
        result (run-rg cwd ["--files" "-g" (str (:pattern args))])
        all (remove str/blank? (str/split (:out result) #"\n"))
        shown (take (long (or (:limit args) 2000)) all)]
    (c/tool-result (map #(c/display-path (fs/absolutize (fs/path cwd %))) shown)
                   {:truncated (> (count all) (count shown))})))

(defn grep-args [args]
  (cond-> ["--line-number" "--color" "never"]
    (pos? (long (or (:context args) 0)))
    (conj "--context" (str (:context args)))

    (:include args)
    (conj "-g" (str (:include args)))

    true
    (conj (str (:pattern args)))))

(defn render-grep-line [cwd line]
  (str/replace-first line
                     #"^[^:]+"
                     #(c/display-path (fs/absolutize (fs/path cwd %)))))

(defn grep-files [args _]
  (let [cwd (c/resolve-workspace (or (:path args) "."))
        result (run-rg cwd (grep-args args))]
    (if (= 1 (:exit result))
      (c/tool-result "No matches" {:matchesShown 0})
      (let [lines (remove str/blank? (str/split (:out result) #"\n"))
            shown (take (long (or (:limit args) 2000)) lines)]
        (c/tool-result (str/join "\n" (map #(render-grep-line cwd %) shown))
                       {:matchesShown (count shown)
                        :truncated (> (count lines) (count shown))})))))

(defn write-file [args _]
  (let [file (c/resolve-workspace (:path args))
        content (str (or (:content args) ""))]
    (when (and (not (:overwrite args)) (fs/exists? file))
      (throw (ex-info "File exists. Set overwrite=true to replace it." {})))
    (fs/create-dirs (fs/parent file))
    (spit file content)
    (c/tool-result {:path (c/display-path file)
                    :bytes (count (.getBytes content))
                    :overwritten (boolean (:overwrite args))})))

(defn replacement-count [text old]
  (dec (count (str/split text
                         (re-pattern (java.util.regex.Pattern/quote old))
                         -1))))

(defn edit-file [args _]
  (let [file (c/resolve-workspace (:path args))
        old (str (or (:old_text args) ""))
        new (str (or (:new_text args) ""))
        original (slurp file)
        count (replacement-count original old)]
    (when (zero? count)
      (throw (ex-info "old_text was not found" {})))
    (when (and (not (:replace_all args)) (> count 1))
      (throw (ex-info "old_text occurs multiple times. Set replace_all=true or use a more specific string." {})))
    (spit file (if (:replace_all args)
                 (str/replace original old new)
                 (str/replace-first original old new)))
    (c/tool-result {:path (c/display-path file)
                    :replacements (if (:replace_all args) count 1)})))

(defn multi-edit-file [args ctx]
  (reduce (fn [_ edit] (edit-file (merge args edit) ctx)) nil (:edits args))
  (c/tool-result {:path (c/display-path (c/resolve-workspace (:path args)))
                  :replacements (count (:edits args))}))

(def tools
  {"read_file" read-file
   "list_dir" list-dir
   "glob_files" glob-files
   "grep_files" grep-files
   "write_file" write-file
   "edit_file" edit-file
   "multi_edit_file" multi-edit-file})
