(ns run-calls.jsmcp
  (:require [babashka.curl :as curl]
            [cheshire.core :as json]
            [clojure.string :as str]
            [run-calls.common :as c]
            [run-calls.jsmcp-diff :as diff]))

(defn endpoint []
  (or (System/getenv "STRAP_JSMCP_URL") "http://127.0.0.1:41528"))

(defn api-key-file []
  (or (System/getenv "STRAP_JSMCP_API_KEY_FILE")
      (str (System/getProperty "user.home") "/.config/jsmcp/api-key.txt")))

(defn api-key []
  (or (System/getenv "STRAP_JSMCP_API_KEY")
      (str/trim (slurp (api-key-file)))))

(defn ensure-memory [state]
  (let [session (or (get-in @state [:runtime :jsmcp :sessionId])
                    (str (java.util.UUID/randomUUID)))]
    (swap! state update :runtime #(or % {}))
    (swap! state update-in
           [:runtime :jsmcp]
           #(merge {:sessionId session :cachedListTools {}} (or % {})))
    (get-in @state [:runtime :jsmcp])))

(defn query-string [tool memory]
  (str "tool=" (java.net.URLEncoder/encode tool "UTF-8")
       "&sessionId=" (java.net.URLEncoder/encode (:sessionId memory) "UTF-8")
       (when-let [profile (System/getenv "STRAP_JSMCP_PROFILE")]
         (str "&profile=" (java.net.URLEncoder/encode profile "UTF-8")))))

(defn call-http [tool input state]
  (let [memory (ensure-memory state)
        url (str (endpoint) "/api/call?" (query-string tool memory))
        response (curl/post url
                            {:headers {"content-type" "application/json"
                                       "X-JSMCP-API-Key" (api-key)}
                             :body (json/generate-string (or input {}))
                             :throw false})
        body (c/parse-json (:body response))]
    (when-not (<= 200 (:status response) 299)
      (throw (ex-info (or (:error body) (str "jsmcp HTTP " (:status response))) {})))
    (when (:isError body)
      (throw (ex-info (or (get-in body [:structuredContent :error])
                          (get-in body [:content 0 :text])
                          "jsmcp call failed")
                      {})))
    body))

(defn result [body]
  {:result body})

(defn list-servers [_ ctx]
  (let [state (:state ctx)
        body (call-http "list_servers" {} state)]
    (swap! state assoc-in [:runtime :jsmcp :cachedListServers] {:response (result body)})
    body))

(defn list-tools [args ctx]
  (let [state (:state ctx)
        server (str (:server args))
        body (call-http "list_tools" {:server server} state)]
    (swap! state assoc-in [:runtime :jsmcp :cachedListTools server] {:response (result body)})
    body))

(defn server-name [server]
  (if (keyword? server) (name server) (str server)))

(defn refresh-list-servers [state changes cached]
  (let [next (result (call-http "list_servers" {} state))]
    (when-let [change (diff/list-servers (:response cached) next)]
      (swap! changes conj change))
    (swap! state assoc-in [:runtime :jsmcp :cachedListServers] {:response next})))

(defn refresh-list-tools [state changes server cached]
  (let [server (server-name server)
        next (result (call-http "list_tools" {:server server} state))]
    (when-let [change (diff/list-tools server (:response cached) next)]
      (swap! changes conj change))
    (swap! state assoc-in [:runtime :jsmcp :cachedListTools server] {:response next})))

(defn refresh-discovery [ctx]
  (let [state (:state ctx)
        memory (ensure-memory state)
        changes (atom [])]
    (when-let [cached (:cachedListServers memory)]
      (refresh-list-servers state changes cached))
    (doseq [[server cached] (:cachedListTools memory)]
      (refresh-list-tools state changes server cached))
    (when (seq @changes)
      (throw (diff/capability-error @changes)))))

(defn execute-code [args ctx]
  (refresh-discovery ctx)
  (call-http "execute_code"
             (merge {:code (str (or (:code args) ""))
                     :timeoutMs (long (or (:timeout_ms args) 120000))}
                    (when (contains? args :data) {:data (:data args)}))
             (:state ctx)))

(def tools
  {"list_servers" list-servers
   "list_tools" list-tools
   "execute_code" execute-code
   "fetch_logs" (fn [_ ctx] (call-http "fetch_logs" {} (:state ctx)))
   "clear_logs" (fn [_ ctx] (call-http "clear_logs" {} (:state ctx)))})
