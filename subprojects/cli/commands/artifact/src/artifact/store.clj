(ns artifact.store
  (:require [artifact.common :as c]
            [babashka.fs :as fs])
  (:import [java.nio.file Files LinkOption StandardCopyOption]
           [java.nio.file.attribute FileAttribute]))

(defn destination [type root artifact]
  (c/path-str root (if (= type "command") (:name artifact) (:entryName artifact))))

(defn set-file-mode [target source]
  (Files/setPosixFilePermissions
    (fs/path target)
    (Files/getPosixFilePermissions (fs/path source) (make-array LinkOption 0))))

(defn copy-file [source target]
  (fs/create-dirs (fs/parent target))
  (Files/copy
    (fs/path source)
    (fs/path target)
    (into-array StandardCopyOption [StandardCopyOption/REPLACE_EXISTING]))
  (set-file-mode target source))

(defn copy-directory [source target]
  (fs/create-dirs target)
  (doseq [entry (fs/list-dir source)]
    (let [to (fs/path target (fs/file-name entry))]
      (cond
        (fs/directory? entry) (copy-directory entry to)
        (c/regular-file? entry) (copy-file entry to)))))

(defn copy-symlink [source target]
  (fs/delete-if-exists target)
  (Files/createSymbolicLink
    (fs/path target)
    (Files/readSymbolicLink (fs/path source))
    (make-array FileAttribute 0)))

(defn copy-sidecars [artifact target]
  (doseq [file (remove #(= % (:path artifact)) (:files artifact))]
    (copy-file file (fs/path (fs/parent target) (fs/file-name file)))))

(defn copy-artifact [artifact target]
  (fs/create-dirs (fs/parent target))
  (case (:kind artifact)
    "directory"
    (do
      (fs/delete-tree target {:force true})
      (copy-directory (:path artifact) target))

    "symlink"
    (copy-symlink (:path artifact) target)

    "file"
    (do
      (copy-file (:path artifact) target)
      (copy-sidecars artifact target))))

(defn remove-artifact [artifact]
  (if (= "directory" (:kind artifact))
    (fs/delete-tree (:path artifact) {:force true})
    (doseq [file (:files artifact)]
      (fs/delete-if-exists file))))
