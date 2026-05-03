(ns zk.links
  (:require [clojure.string :as str]
            [zk.core :as core]
            [zk.notes :as notes]))

(defn excerpt-at [text index length]
  (-> (subs text (max 0 (- index 60)) (min (count text) (+ index length 100)))
      (str/replace #"\s+" " ") str/trim))

(defn parse-wikilinks [body]
  (let [text (or body "") matcher (re-matcher #"\[\[([^\]\n]+)\]\]" text)]
    (loop [links []]
      (if-not (.find matcher)
        links
        (let [raw (str/trim (.group matcher 1)) parts (str/split raw #"\|" 2)
              target (str/trim (first parts)) display (str/trim (or (second parts) target))]
          (recur (conj links {:raw (.group matcher 0) :target target :display display :index (.start matcher)
                              :context (excerpt-at text (.start matcher) (count (.group matcher 0)))})))))))

(defn resolve-link-target [target visible]
  (let [lower (str/lower-case target) slugged (core/slug target)
        exact-id (filter #(= (get-in % [:meta :id]) target) visible)
        exact-title (filter #(= (get-in % [:meta :title]) target) visible)
        case-title (filter #(= (str/lower-case (str (get-in % [:meta :title]))) lower) visible)
        slug-title (filter #(= (core/slug (get-in % [:meta :title])) slugged) visible)
        alias-match (filter (fn [note] (some #(or (= % target) (= (str/lower-case (str %)) lower) (= (core/slug %) slugged))
                                             (core/parse-list (get-in note [:meta :aliases])))) visible)]
    (cond (seq exact-id) exact-id (seq exact-title) exact-title (seq case-title) case-title (seq slug-title) slug-title :else alias-match)))

(declare backlink-report)

(defn resolve-outgoing-links [note visible]
  (mapv
    (fn [link]
      (let [candidates (remove #(= (get-in % [:meta :id]) (get-in note [:meta :id])) (resolve-link-target (:target link) visible))]
        (case (count candidates)
          0 (assoc link :status "unresolved" :suggestions [])
          1 (assoc link :status "resolved" :note (notes/note-ref (first candidates)))
          (assoc link :status "ambiguous" :candidates (mapv notes/note-ref candidates)
                 :suggestions (mapv #(str "[[" (get-in % [:meta :id]) "|" (:display link) "]]") candidates)))))
    (parse-wikilinks (:body note))))

(defn backlink-report [target visible]
  (let [reports (for [source visible :when (not= (get-in source [:meta :id]) (get-in target [:meta :id]))
                      link (resolve-outgoing-links source visible)] {:source source :link link})]
    {:backlinks (->> reports
                     (filter #(and (= "resolved" (get-in % [:link :status])) (= (get-in target [:meta :id]) (get-in % [:link :note :id]))))
                      (mapv #(hash-map :source (notes/note-ref (:source %)) :link (:link %))))
     :ambiguous_mentions (->> reports
                              (filter #(and (= "ambiguous" (get-in % [:link :status]))
                                            (some (fn [candidate] (= (:id candidate) (get-in target [:meta :id]))) (get-in % [:link :candidates]))))
                               (mapv #(hash-map :source (notes/note-ref (:source %)) :link (:link %))))}))

(defn decorate-note [note visible & [{:keys [include-body include-paths]}]]
  (let [links (resolve-outgoing-links note visible) backlinks (backlink-report note visible)
        body (str/trim (or (:body note) ""))
         result (merge (notes/note-ref note)
                       {:tags (core/parse-list (get-in note [:meta :tags])) :aliases (core/parse-list (get-in note [:meta :aliases]))
                       :author (get-in note [:meta :author]) :created_at (get-in note [:meta :created_at]) :updated_at (get-in note [:meta :updated_at])
                       :excerpt (subs body 0 (min 160 (count body)))
                       :link_counts {:links (count (filter #(= "resolved" (:status %)) links)) :backlinks (count (:backlinks backlinks))
                                     :ambiguous_links (count (filter #(= "ambiguous" (:status %)) links))
                                     :unresolved_links (count (filter #(= "unresolved" (:status %)) links))
                                     :ambiguous_backlinks (count (:ambiguous_mentions backlinks))}
                       :links links})
        result (if include-body (assoc result :body (:body note)) result)]
    (if include-paths (merge result (notes/path-info note)) result)))
