(in-ns 'zk.main)

(defn create-note [args]
  (let [{:keys [opts]} (parse-args args) scope (or (:scope opts) "user") title (:title opts)
        body (or (:body opts) (read-stdin-if-any)) id (or (:id opts) (note-id))]
    (when (empty? (str title)) (throw (ex-info "Usage: strap zk create --title <title> [--body body] [--scope user|project]" {})))
    (let [file (str (fs/path (zettel-dir scope) (str (slug title) "-" (subs id 3 11) ".md")))
          timestamp (now)
          meta {:id id :title title :tags (parse-list (:tags opts)) :aliases (parse-list (:aliases opts))
                :author (or (:author opts) "agent") :scope scope :created_at timestamp :updated_at timestamp}]
      (write-note file meta body)
      (let [visible (visible-notes) note (find-visible id visible)]
        (json-out {:ok true :note (decorate-note note visible {:include-paths (:paths opts)})})))))

(defn list-notes [args]
  (let [{:keys [opts]} (parse-args args) scope (or (:scope opts) "all") tag (:tag opts)
        limit (parse-long (or (:limit opts) "50")) visible (visible-notes scope)
        notes (->> visible (map #(decorate-note % visible {:include-paths (:paths opts)}))
                   (filter #(or (empty? (str tag)) (some #{tag} (:tags %))))
                   (sort-by #(or (:updated_at %) "") compare) reverse (take limit))]
    (json-out notes)))

(defn get-note [args]
  (let [{:keys [opts pos]} (parse-args args) visible (visible-notes) note (find-visible (or (first pos) (:id opts)) visible)]
    (json-out (decorate-note note visible {:include-body true :include-paths (:paths opts)}))))

(defn update-note [args]
  (let [{:keys [opts pos]} (parse-args args) visible (visible-notes)
        current (find-visible (or (first pos) (:id opts)) visible) editable (ensure-user-overlay current)
        meta (merge (:meta editable) {:title (or (:title opts) (get-in editable [:meta :title]) "")
                                      :author (or (:author opts) (get-in editable [:meta :author]) "agent")
                                      :scope "user" :updated_at (now)})
        meta (if (contains? opts :tags) (assoc meta :tags (parse-list (:tags opts))) meta)
        meta (if (contains? opts :aliases) (assoc meta :aliases (parse-list (:aliases opts))) meta)
        meta (dissoc meta :deleted) body (or (:body opts) (:body editable) "")]
    (write-note (:file editable) meta body)
    (let [next-visible (visible-notes) updated (find-visible (:id meta) next-visible)]
      (json-out {:ok true :note (decorate-note updated next-visible {:include-paths (:paths opts)})}))))

(defn delete-note [args]
  (let [{:keys [opts pos]} (parse-args args) visible (visible-notes) current (find-visible (or (first pos) (:id opts)) visible)]
    (if (and (= "user" (:layer current)) (nil? (:project-file current)))
      (do (fs/delete-if-exists (:file current)) (json-out {:ok true :id (get-in current [:meta :id]) :deleted true}))
      (let [tombstone (if (= "user" (:layer current)) (:file current) (user-file-for current))
            meta (assoc (:meta current) :scope "user" :deleted true :updated_at (now))]
        (write-note tombstone meta "")
        (json-out {:ok true :note (decorate-note (assoc current :file tombstone :layer "user" :status "deleted" :meta meta) visible {:include-paths (:paths opts)}) :deleted true})))))

(defn list-tags [_args]
  (let [counts (frequencies (mapcat #(parse-list (get-in % [:meta :tags])) (visible-notes)))]
    (json-out (->> counts (map (fn [[tag notes]] {:tag tag :notes notes})) (sort-by (juxt (comp - :notes) :tag))))))

(defn search-notes [args]
  (let [{:keys [opts pos]} (parse-args args) scope (or (:scope opts) "all") limit (parse-long (or (:limit opts) "10")) query (or (:query opts) (str/join " " pos))]
    (when (empty? query) (usage))
    (let [needle (str/lower-case query) visible (visible-notes scope)]
      (json-out
        (->> visible
             (map (fn [note] (let [text (str (get-in note [:meta :title]) "\n" (:body note))]
                               (assoc (decorate-note note visible {:include-paths (:paths opts)}) :score (count-matches (str/lower-case text) needle) :excerpt (excerpt text needle)))))
             (filter #(pos? (:score %))) (sort-by :score >) (take limit))))))

(defn show-links [args]
  (let [{:keys [opts pos]} (parse-args args) visible (visible-notes) note (find-visible (or (first pos) (:id opts)) visible)]
    (json-out {:note (note-ref note) :links (resolve-outgoing-links note visible)})))

(defn show-backlinks [args]
  (let [{:keys [opts pos]} (parse-args args) visible (visible-notes) note (find-visible (or (first pos) (:id opts)) visible)]
    (json-out (merge {:note (note-ref note)} (backlink-report note visible)))))

(defn show-status [args]
  (let [{:keys [opts]} (parse-args args) visible (visible-notes)
        tombstones (->> (all-notes) (filter #(and (= "user" (:layer %)) (deleted? %)))
                        (map #(merge (note-ref (assoc % :status "deleted")) {:tags (parse-list (get-in % [:meta :tags])) :aliases (parse-list (get-in % [:meta :aliases]))} (when (:paths opts) (path-info %)))))]
    (json-out (sort-by :title (concat (map #(decorate-note % visible {:include-paths (:paths opts)}) visible) tombstones)))))
