(ns run-calls.web-tools
  (:require [babashka.curl :as curl]
            [clojure.string :as str]
            [run-calls.common :as c]))

(defn web-fetch [args _]
  (let [url (str (:url args))
        r (curl/get url {:headers {"user-agent" "strap/0.1"} :throw false})
        limited (c/truncate (:body r) (long (or (:max_output_bytes args) 60000)))]
    (c/tool-result (:text limited) {:url url :status (:status r) :contentType (get-in r [:headers "content-type"] "") :format (or (:format args) "text") :truncated (:truncated limited)})))

(defn decode-html [s]
  (-> s (str/replace "&amp;" "&") (str/replace "&quot;" "\"") (str/replace "&#x27;" "'") (str/replace "&lt;" "<") (str/replace "&gt;" ">")))

(defn web-search [args _]
  (let [url (str "https://duckduckgo.com/html/?q=" (java.net.URLEncoder/encode (str (:query args)) "UTF-8"))
        html (:body (curl/get url {:headers {"user-agent" "strap/0.1"} :throw false}))
        matches (re-seq #"<a rel=\"nofollow\" class=\"result__a\" href=\"([^\"]+)\">([\s\S]*?)</a>" html)
        snippets (map (fn [[_ u title]] {:url (decode-html u) :title (-> title decode-html (str/replace #"<[^>]+>" "") (str/replace #"\s+" " ") str/trim)}) (take (long (or (:limit args) 10)) matches))]
    (c/tool-result (if (seq snippets) snippets (str "Search page fetched, but no results parsed. URL: " url)))))

(def tools {"web_fetch" web-fetch "web_search" web-search})
