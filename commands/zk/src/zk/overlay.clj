(ns zk.overlay
  (:require [babashka.fs :as fs]
            [zk.core :as core]
            [zk.links :as links]
            [zk.notes :as notes]))

(defn workon-note [args]
  (let [{:keys [opts pos]} (core/parse-args args) note (notes/find-visible (or (first pos) (:id opts)) (notes/visible-notes))]
    (notes/ensure-user-overlay note)
    (let [visible (notes/visible-notes) updated (notes/find-visible (get-in note [:meta :id]) visible)]
      (core/json-out {:ok true :note (links/decorate-note updated visible {:include-paths (:paths opts)})}))))

(defn promote-note [args]
  (let [{:keys [opts pos]} (core/parse-args args) id (or (first pos) (:id opts)) notes (notes/all-notes) user (notes/find-in-layer id "user" notes)]
    (when-not user (throw (ex-info (str "No user overlay note found: " id) {})))
    (let [project (some #(when (and (= "project" (:layer %)) (= (get-in % [:meta :id]) (get-in user [:meta :id]))) %) notes)]
      (if (notes/deleted? user)
        (do (when project (fs/delete-if-exists (:file project))) (fs/delete-if-exists (:file user)) (core/json-out {:ok true :id (get-in user [:meta :id]) :promoted "delete"}))
        (let [target (or (:file project) (notes/project-file-for user)) meta (assoc (dissoc (:meta user) :deleted) :scope "project")]
          (notes/write-note target meta (:body user))
          (fs/delete-if-exists (:file user))
          (let [visible (notes/visible-notes) promoted (notes/find-visible (get-in user [:meta :id]) visible)]
            (core/json-out {:ok true :promoted true :note (links/decorate-note promoted visible {:include-paths (:paths opts)})})))))))

(defn discard-note [args]
  (let [{:keys [opts pos]} (core/parse-args args) id (or (first pos) (:id opts)) user (notes/find-in-layer id "user" (notes/all-notes))]
    (when-not user (throw (ex-info (str "No user overlay note found: " id) {})))
    (fs/delete-if-exists (:file user))
    (core/json-out {:ok true :id (get-in user [:meta :id]) :discarded true})))
