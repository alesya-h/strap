(ns zk.notes
  (:require [babashka.fs :as fs]
            [cheshire.core :as json]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [zk.core :as core]))

(defn markdown-files [dir]
  (let [root (io/file dir)]
    (if-not (.exists root)
      []
      (->> (file-seq root) (filter #(.isFile %)) (map #(.getPath %)) (filter #(str/ends-with? % ".md"))))))

(defn parse-frontmatter-value [raw]
  (try (json/parse-string raw true) (catch Exception _ (str/replace raw #"^\"|\"$" ""))))

(defn parse-frontmatter [text]
  (reduce
    (fn [meta line]
      (if-let [[_ key raw] (re-matches #"^([A-Za-z0-9_-]+):\s*(.*)$" line)]
        (assoc meta (keyword key) (parse-frontmatter-value raw))
        meta))
    {}
    (str/split-lines text)))

(defn parse-note [text]
  (if-not (str/starts-with? text "---\n")
    {:meta {} :body text :raw text}
    (let [end (str/index-of text "\n---" 4)]
      (if-not end
        {:meta {} :body text :raw text}
        {:meta (parse-frontmatter (subs text 4 end))
         :body (str/replace-first (subs text (+ end 4)) #"^\s+" "")
         :raw text}))))

(defn format-frontmatter [meta]
  (str (->> meta (map (fn [[k v]] (str (name k) ": " (json/generate-string v)))) (str/join "\n")) "\n"))

(defn write-note [file meta body]
  (fs/create-dirs (fs/parent file))
  (spit file (str "---\n" (format-frontmatter meta) "---\n\n" (str/trim (or body "")) "\n")))

(defn read-layer [layer]
  (for [file (markdown-files (core/zettel-dir layer))
        :let [parsed (parse-note (slurp file)) id (get-in parsed [:meta :id])]
        :when id]
    (assoc parsed :file file :layer layer)))

(defn deleted? [note]
  (let [value (get-in note [:meta :deleted])] (or (= true value) (= "true" value))))

(defn enrich-note [project-by-id note]
  (let [project (when (= "user" (:layer note)) (get project-by-id (get-in note [:meta :id])))
        project-raw (or (:project-raw note) (:raw project))
        project-file (or (:project-file note) (:file project))
        status (cond (deleted? note) "deleted" (= "project" (:layer note)) "project" (nil? project-raw) "new" (= project-raw (:raw note)) "working" :else "modified")]
    (assoc note :project-file project-file :project-raw project-raw :status status)))

(defn all-notes []
  (let [project (vec (read-layer "project"))
        project-by-id (into {} (map (juxt #(get-in % [:meta :id]) identity) project))]
    (map #(enrich-note project-by-id %) (concat project (read-layer "user")))))

(defn visible-notes
  ([] (visible-notes "all"))
  ([scope]
   (let [notes (all-notes)
         project-by-id (into {} (for [n notes :when (= "project" (:layer n))] [(get-in n [:meta :id]) n]))
         by-id (atom {})]
     (doseq [note (filter #(= "project" (:layer %)) notes)] (swap! by-id assoc (get-in note [:meta :id]) note))
     (doseq [note (filter #(= "user" (:layer %)) notes)]
       (let [id (get-in note [:meta :id]) project (get project-by-id id)
             enriched (enrich-note project-by-id (assoc note :project-file (:file project) :project-raw (:raw project)))]
         (if (deleted? note) (swap! by-id dissoc id) (swap! by-id assoc id enriched))))
     (->> (vals @by-id) (filter #(or (= scope "all") (= (:layer %) scope))) (map #(enrich-note project-by-id %))))))

(defn note-ref [note]
  {:id (get-in note [:meta :id]) :title (get-in note [:meta :title]) :file (core/basename (:file note)) :layer (:layer note) :status (:status note)})

(defn path-info [note]
  {:path (:file note) :project_path (:project-file note)})

(defn match-notes [id notes]
  (let [needle (str/trim (str id)) lower (str/lower-case needle) slugged (core/slug needle)]
    (filter
      (fn [note]
        (let [title (str (get-in note [:meta :title]))]
          (or (= (get-in note [:meta :id]) needle) (= title needle) (= (str/lower-case title) lower)
              (= (core/slug title) slugged) (= (core/basename (:file note)) needle) (= (core/basename-no-ext (:file note)) needle)
              (some #(or (= % needle) (= (str/lower-case (str %)) lower) (= (core/slug %) slugged)) (core/parse-list (get-in note [:meta :aliases]))))))
      notes)))

(defn find-one [id notes label]
  (when (or (nil? id) (empty? (str id))) (core/usage))
  (let [matches (vec (match-notes id notes))]
    (case (count matches) 0 (throw (ex-info (str label " not found: " id) {})) 1 (first matches)
          (throw (ex-info (str "Ambiguous " label ": " id) {:matches (map note-ref matches)})))))

(defn find-visible [id & [visible]] (find-one id (or visible (visible-notes)) "visible note"))
(defn find-in-layer [id layer notes]
  (let [matches (vec (match-notes id (filter #(= layer (:layer %)) notes)))]
    (case (count matches) 0 nil 1 (first matches) (throw (ex-info (str "Ambiguous " layer " note: " id) {})))))

(defn user-file-for [note] (str (fs/path (core/zettel-dir "user") (core/basename (:file note)))))
(defn project-file-for [note] (str (fs/path (core/zettel-dir "project") (core/basename (:file note)))))
(defn ensure-user-overlay [note]
  (if (= "user" (:layer note)) note
      (let [target (user-file-for note)]
        (fs/create-dirs (fs/parent target))
        (fs/copy (:file note) target {:replace-existing true})
        (assoc note :file target :layer "user" :status "working"))))
