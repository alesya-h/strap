(ns tool.common
  (:require [cheshire.core :as json]))

(defn parse-json [text]
  (json/parse-string (or text "null") true))
