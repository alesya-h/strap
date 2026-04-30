(ns run-calls.jsmcp
  (:require [babashka.curl :as curl]
            [cheshire.core :as json]
            [clojure.string :as str]
            [run-calls.common :as c]))

(defn endpoint [] (or (System/getenv "STRAP_JSMCP_URL") "http://127.0.0.1:41528"))
(defn api-key []
  (or (System/getenv "STRAP_JSMCP_API_KEY")
      (str/trim (slurp (or (System/getenv "STRAP_JSMCP_API_KEY_FILE") (str (System/getProperty "user.home") "/.config/jsmcp/api-key.txt"))))))

(defn ensure-memory [state]
  (let [session (or (get-in @state [:runtime :jsmcp :sessionId]) (str (java.util.UUID/randomUUID)))]
    (swap! state update :runtime #(or % {}))
    (swap! state update-in [:runtime :jsmcp] #(merge {:sessionId session :cachedListTools {}} (or % {})))
    (get-in @state [:runtime :jsmcp])))

(defn call-http [tool input state]
  (let [memory (ensure-memory state)
        profile (System/getenv "STRAP_JSMCP_PROFILE")
        query (str "tool=" (java.net.URLEncoder/encode tool "UTF-8")
                   "&sessionId=" (java.net.URLEncoder/encode (:sessionId memory) "UTF-8")
                   (when profile (str "&profile=" (java.net.URLEncoder/encode profile "UTF-8"))))
        r (curl/post (str (endpoint) "/api/call?" query)
                     {:headers {"content-type" "application/json" "X-JSMCP-API-Key" (api-key)}
                      :body (json/generate-string (or input {}))
                      :throw false})
        body (c/parse-json (:body r))]
    (when-not (<= 200 (:status r) 299) (throw (ex-info (or (:error body) (str "jsmcp HTTP " (:status r))) {})))
    (when (:isError body) (throw (ex-info (or (get-in body [:structuredContent :error]) (get-in body [:content 0 :text]) "jsmcp call failed") {})))
    body))

(defn result [body] {:result body})
(defn structured [response] (get-in response [:result :structuredContent]))

(defn collection-diff [kind previous next key-fn]
  (let [pmap (into {} (map (juxt key-fn identity) previous))
        nmap (into {} (map (juxt key-fn identity) next))
        added (sort (remove pmap (keys nmap)))
        removed (sort (remove nmap (keys pmap)))
        changed (sort (for [[k item] nmap :when (and (pmap k) (not= (pmap k) item))] k))]
    (when (or (seq added) (seq removed) (seq changed))
      {:kind kind :summary {:added added :removed removed :changed changed} :before previous :after next})))

(defn diff-list-servers [previous next]
  (collection-diff "list_servers" (or (:servers (structured previous)) []) (or (:servers (structured next)) []) :name))

(defn diff-list-tools [server previous next]
  (when-let [diff (collection-diff "list_tools" (or (:tools (structured previous)) []) (or (:tools (structured next)) []) :name)]
    (assoc diff :serverName server)))

(defn section [label summary item-label]
  (cond-> [(str label " changed:")]
    (seq (:added summary)) (conj (str "- added " item-label (when (> (count (:added summary)) 1) "s") ": " (str/join ", " (:added summary))))
    (seq (:removed summary)) (conj (str "- removed " item-label (when (> (count (:removed summary)) 1) "s") ": " (str/join ", " (:removed summary))))
    (seq (:changed summary)) (conj (str "- updated " item-label (when (> (count (:changed summary)) 1) "s") ": " (str/join ", " (:changed summary))))))

(defn change-lines [change]
  (if (= "list_servers" (:kind change))
    (section "list_servers" (:summary change) "server")
    (section (str "list_tools(" (:serverName change) ")") (:summary change) "tool")))

(defn capability-error [changes]
  (ex-info (str/join "\n" (concat ["The jsmcp daemon reconnected and cached discovery results changed."
                                    "Review these changes before retrying execute_code." ""]
                                   (mapcat change-lines changes)))
           {:changes changes}))

(defn list-servers [_ ctx]
  (let [state (:state ctx) body (call-http "list_servers" {} state)]
    (swap! state assoc-in [:runtime :jsmcp :cachedListServers] {:response (result body)})
    body))

(defn list-tools [args ctx]
  (let [state (:state ctx) server (str (:server args)) body (call-http "list_tools" {:server server} state)]
    (swap! state assoc-in [:runtime :jsmcp :cachedListTools server] {:response (result body)})
    body))

(defn server-name [server]
  (if (keyword? server) (name server) (str server)))

(defn refresh-discovery [ctx]
  (let [state (:state ctx) memory (ensure-memory state) changes (atom [])]
    (when-let [cached (:cachedListServers memory)]
      (let [next (result (call-http "list_servers" {} state))]
        (when-let [diff (diff-list-servers (:response cached) next)] (swap! changes conj diff))
        (swap! state assoc-in [:runtime :jsmcp :cachedListServers] {:response next})))
    (doseq [[server cached] (:cachedListTools memory)]
      (let [server (server-name server)
            next (result (call-http "list_tools" {:server server} state))]
        (when-let [diff (diff-list-tools server (:response cached) next)] (swap! changes conj diff))
        (swap! state assoc-in [:runtime :jsmcp :cachedListTools server] {:response next})))
    (when (seq @changes) (throw (capability-error @changes)))))

(defn execute-code [args ctx]
  (refresh-discovery ctx)
  (call-http "execute_code" (merge {:code (str (or (:code args) "")) :timeoutMs (long (or (:timeout_ms args) 120000))}
                                   (when (contains? args :data) {:data (:data args)}))
             (:state ctx)))

(def tools {"jsmcp_list_servers" list-servers "jsmcp_list_tools" list-tools "jsmcp_execute_code" execute-code
            "jsmcp_fetch_logs" (fn [_ ctx] (call-http "fetch_logs" {} (:state ctx)))
            "jsmcp_clear_logs" (fn [_ ctx] (call-http "clear_logs" {} (:state ctx)))})
