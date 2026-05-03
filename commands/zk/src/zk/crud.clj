(ns zk.crud
  (:require [babashka.fs :as fs]
            [clojure.string :as str]
            [zk.core :as core]
            [zk.links :as links]
            [zk.notes :as notes]))

(defn create-note [args]
  (let [{:keys [opts]} (core/parse-args args) scope (or (:scope opts) "user") title (:title opts)
        body (or (:body opts) (core/read-stdin-if-any)) id (or (:id opts) (core/note-id))]
    (when (empty? (str title)) (throw (ex-info "Usage: strap zk create --title <title> [--body body] [--scope user|project]" {})))
    (let [file (str (fs/path (core/zettel-dir scope) (str (core/slug title) "-" (subs id 3 11) ".md")))
          timestamp (core/now)
          meta {:id id :title title :tags (core/parse-list (:tags opts)) :aliases (core/parse-list (:aliases opts))
                :author (or (:author opts) "agent") :scope scope :created_at timestamp :updated_at timestamp}]
      (notes/write-note file meta body)
      (let [visible (notes/visible-notes) note (notes/find-visible id visible)]
        (core/json-out {:ok true :note (links/decorate-note note visible {:include-paths (:paths opts)})})))))

(defn list-notes [args]
  (let [{:keys [opts]} (core/parse-args args) scope (or (:scope opts) "all") tag (:tag opts)
        limit (parse-long (or (:limit opts) "50")) visible (notes/visible-notes scope)
        notes (->> visible (map #(links/decorate-note % visible {:include-paths (:paths opts)}))
                   (filter #(or (empty? (str tag)) (some #{tag} (:tags %))))
                   (sort-by #(or (:updated_at %) "") compare) reverse (take limit))]
    (core/json-out notes)))

(defn get-note [args]
  (let [{:keys [opts pos]} (core/parse-args args) visible (notes/visible-notes) note (notes/find-visible (or (first pos) (:id opts)) visible)]
    (core/json-out (links/decorate-note note visible {:include-body true :include-paths (:paths opts)}))))

(defn update-note [args]
  (let [{:keys [opts pos]} (core/parse-args args) visible (notes/visible-notes)
        current (notes/find-visible (or (first pos) (:id opts)) visible) editable (notes/ensure-user-overlay current)
        meta (merge (:meta editable) {:title (or (:title opts) (get-in editable [:meta :title]) "")
                                       :author (or (:author opts) (get-in editable [:meta :author]) "agent")
                                       :scope "user" :updated_at (core/now)})
        meta (if (contains? opts :tags) (assoc meta :tags (core/parse-list (:tags opts))) meta)
        meta (if (contains? opts :aliases) (assoc meta :aliases (core/parse-list (:aliases opts))) meta)
        meta (dissoc meta :deleted) body (or (:body opts) (:body editable) "")]
    (notes/write-note (:file editable) meta body)
    (let [next-visible (notes/visible-notes) updated (notes/find-visible (:id meta) next-visible)]
      (core/json-out {:ok true :note (links/decorate-note updated next-visible {:include-paths (:paths opts)})}))))

(defn delete-note [args]
  (let [{:keys [opts pos]} (core/parse-args args) visible (notes/visible-notes) current (notes/find-visible (or (first pos) (:id opts)) visible)]
    (if (and (= "user" (:layer current)) (nil? (:project-file current)))
      (do (fs/delete-if-exists (:file current)) (core/json-out {:ok true :id (get-in current [:meta :id]) :deleted true}))
      (let [tombstone (if (= "user" (:layer current)) (:file current) (notes/user-file-for current))
            meta (assoc (:meta current) :scope "user" :deleted true :updated_at (core/now))]
        (notes/write-note tombstone meta "")
        (core/json-out {:ok true :note (links/decorate-note (assoc current :file tombstone :layer "user" :status "deleted" :meta meta) visible {:include-paths (:paths opts)}) :deleted true})))))

(defn list-tags [_args]
  (let [counts (frequencies (mapcat #(core/parse-list (get-in % [:meta :tags])) (notes/visible-notes)))]
    (core/json-out (->> counts (map (fn [[tag notes]] {:tag tag :notes notes})) (sort-by (juxt (comp - :notes) :tag))))))

(defn search-notes [args]
  (let [{:keys [opts pos]} (core/parse-args args) scope (or (:scope opts) "all") limit (parse-long (or (:limit opts) "10")) query (or (:query opts) (str/join " " pos))]
    (when (empty? query) (core/usage))
    (let [needle (str/lower-case query) visible (notes/visible-notes scope)]
      (core/json-out
        (->> visible
             (map (fn [note] (let [text (str (get-in note [:meta :title]) "\n" (:body note))]
                               (assoc (links/decorate-note note visible {:include-paths (:paths opts)}) :score (core/count-matches (str/lower-case text) needle) :excerpt (core/excerpt text needle)))))
             (filter #(pos? (:score %))) (sort-by :score >) (take limit))))))

(defn show-links [args]
  (let [{:keys [opts pos]} (core/parse-args args) visible (notes/visible-notes) note (notes/find-visible (or (first pos) (:id opts)) visible)]
    (core/json-out {:note (notes/note-ref note) :links (links/resolve-outgoing-links note visible)})))

(defn show-backlinks [args]
  (let [{:keys [opts pos]} (core/parse-args args) visible (notes/visible-notes) note (notes/find-visible (or (first pos) (:id opts)) visible)]
    (core/json-out (merge {:note (notes/note-ref note)} (links/backlink-report note visible)))))

(defn show-status [args]
  (let [{:keys [opts]} (core/parse-args args) visible (notes/visible-notes)
        tombstones (->> (notes/all-notes) (filter #(and (= "user" (:layer %)) (notes/deleted? %)))
                        (map #(merge (notes/note-ref (assoc % :status "deleted")) {:tags (core/parse-list (get-in % [:meta :tags])) :aliases (core/parse-list (get-in % [:meta :aliases]))} (when (:paths opts) (notes/path-info %)))))]
    (core/json-out (sort-by :title (concat (map #(links/decorate-note % visible {:include-paths (:paths opts)}) visible) tombstones)))))
