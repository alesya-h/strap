(ns artifact.digest
  (:require [babashka.fs :as fs])
  (:import [java.math BigInteger]
           [java.nio.file Files LinkOption]
           [java.nio.file.attribute PosixFilePermission]
           [java.security MessageDigest]))

(def mode-bits
  {PosixFilePermission/OWNER_READ 256
   PosixFilePermission/OWNER_WRITE 128
   PosixFilePermission/OWNER_EXECUTE 64
   PosixFilePermission/GROUP_READ 32
   PosixFilePermission/GROUP_WRITE 16
   PosixFilePermission/GROUP_EXECUTE 8
   PosixFilePermission/OTHERS_READ 4
   PosixFilePermission/OTHERS_WRITE 2
   PosixFilePermission/OTHERS_EXECUTE 1})

(defn posix-mode [file]
  (let [perms (Files/getPosixFilePermissions (fs/path file) (make-array LinkOption 0))]
    (reduce + (for [[perm bit] mode-bits :when (.contains perms perm)] bit))))

(defn update-string [digest value]
  (.update digest (.getBytes (str value) "UTF-8")))

(defn artifact-digest [artifact]
  (let [digest (MessageDigest/getInstance "SHA-256")]
    (doseq [file (:files artifact)]
      (update-string digest (str (.relativize (fs/path (:path artifact)) (fs/path file))))
      (update-string digest (posix-mode file))
      (.update digest (Files/readAllBytes (fs/path file))))
    (format "%064x" (BigInteger. 1 (.digest digest)))))
