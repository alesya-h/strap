(ns run-calls.web-tools
  (:require [babashka.curl :as curl]
            [clojure.string :as str]
            [run-calls.common :as c]))

(def user-agent "strap/0.1")

(defn web-fetch [args _]
  (let [url (str (:url args))
        response (curl/get url {:headers {"user-agent" user-agent} :throw false})
        limited (c/truncate (:body response)
                            (long (or (:max_output_bytes args) 60000)))]
    (c/tool-result (:text limited)
                   {:url url
                    :status (:status response)
                    :contentType (get-in response [:headers "content-type"] "")
                    :format (or (:format args) "text")
                    :truncated (:truncated limited)})))

(defn decode-html [s]
  (-> s
      (str/replace "&amp;" "&")
      (str/replace "&quot;" "\"")
      (str/replace "&#x27;" "'")
      (str/replace "&lt;" "<")
      (str/replace "&gt;" ">")))

(defn search-url [query]
  (str "https://duckduckgo.com/html/?q="
       (java.net.URLEncoder/encode (str query) "UTF-8")))

(defn clean-title [title]
  (-> title
      decode-html
      (str/replace #"<[^>]+>" "")
      (str/replace #"\s+" " ")
      str/trim))

(defn search-result [[_ url title]]
  {:url (decode-html url)
   :title (clean-title title)})

(defn web-search [args _]
  (let [url (search-url (:query args))
        html (:body (curl/get url {:headers {"user-agent" user-agent}
                                   :throw false}))
        matches (re-seq #"<a rel=\"nofollow\" class=\"result__a\" href=\"([^\"]+)\">([\s\S]*?)</a>" html)
        snippets (map search-result (take (long (or (:limit args) 10)) matches))]
    (c/tool-result (if (seq snippets)
                     snippets
                     (str "Search page fetched, but no results parsed. URL: " url)))))

(def tools
  {"web_fetch" web-fetch
   "web_search" web-search})
