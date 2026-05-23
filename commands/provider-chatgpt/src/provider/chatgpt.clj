(ns provider.chatgpt
  (:require [babashka.fs :as fs]
            [babashka.process :as process]
            [cheshire.core :as json]
            [provider.auth :as auth]
            [provider.auth-actions :as auth-actions]
            [provider.model :as model]
            [provider.sse :as sse]
            [provider.state :as state]))

(defn usage []
  (binding [*out* *err*]
    (println "Usage: strap provider chatgpt <compile|call|complete|auth> [args]"))
  (System/exit 2))

(defn take-opt [xs flag default]
  (let [[before after] (split-with #(not= % flag) xs)]
    (if (seq after)
      [(second after) (vec (concat before (nnext after)))]
      [default xs])))

(defn read-json []
  (json/parse-string (slurp *in*) true))

(defn write-json [value]
  (println (json/generate-string value {:pretty true})))

(defn write-jsonl-err [value]
  (binding [*out* *err*]
    (println (json/generate-string value))))

(defn load-tools [group]
  (if (= group "none")
    []
    (let [strap-bin (or (System/getenv "STRAP_BIN") "strap")
           result (process/shell {:out :string :err :string :continue true :dir (model/root)}
                                 strap-bin "tools" "list" "--group" (or group "all") "--json")]
      (when-not (zero? (:exit result))
        (throw (ex-info (or (:err result) (:out result)) {})))
      (json/parse-string (:out result) true))))

(defn emit-sse-payload [payload]
  (write-jsonl-err {:kind "provider_chunk"
                    :provider "chatgpt.responses"
                    :event (:event payload)
                    :chunk (dissoc payload :event)}))

(defn curl-json [url headers body]
  (let [args (concat ["curl" "-sS" "-N" "-X" "POST" url "-H" "content-type: application/json"]
                      (mapcat (fn [[k v]] ["-H" (str k ": " v)]) (remove (comp nil? val) headers))
                      ["-d" (json/generate-string body)])
        proc (apply process/process {:out :stream :err :string :continue true} args)
        out (sse/read-stream (:out proc) emit-sse-payload)]
    (let [result @proc]
    (when-not (zero? (:exit result))
      (throw (ex-info (:err result) {})))
      (sse/decode out))))

(defn assert-chatgpt [config]
  (when-not (= (:provider config) "chatgpt")
    (throw (ex-info (str "Model profile provider mismatch: expected chatgpt, got " (:provider config)) {}))))

(defn command-compile [argv]
  (let [[model-name argv] (take-opt argv "--model" "current")
        [tools-name _] (take-opt argv "--tools" "all")
        config (model/load-model model-name)
        input-state (read-json)]
    (assert-chatgpt config)
    (write-json (state/compile-request input-state config (load-tools tools-name)))))

(defn command-call [argv]
  (let [[model-name argv] (take-opt argv "--model" "current")
        [tools-name _] (take-opt argv "--tools" "all")
        config (model/load-model model-name)
        input-state (read-json)
        body (state/compile-request input-state config (load-tools tools-name))]
    (assert-chatgpt config)
    (write-json (curl-json (:base_url config) (auth/auth-headers config) body))))

(defn command-complete [argv]
  (let [[model-name argv] (take-opt argv "--model" "current")
        [tools-name _] (take-opt argv "--tools" "all")
        config (model/load-model model-name)
        input-state (read-json)
        body (state/compile-request input-state config (load-tools tools-name))
        response (curl-json (:base_url config) (auth/auth-headers config) body)
        actor (or (get-in input-state [:runtime :active_model]) "model")]
    (assert-chatgpt config)
    (write-json (update input-state :history conj (state/response-event response actor)))))

(defn command-embed [argv]
  (throw (ex-info "ChatGPT does not support embeddings; use `strap embed --provider openrouter` instead." {})))

(defn command-auth-login [xs token-file]
  (let [[timeout xs] (take-opt xs "--timeout-seconds" "300")
        no-open (some #{"--no-open"} xs)]
    (write-json
      (auth-actions/login {:token_file token-file
                           :open (not no-open)
                           :timeout_seconds (Long/parseLong timeout)
                           :onUserCode (fn [{:keys [userCode url]}]
                                         (binding [*out* *err*]
                                           (println (str "Open " url " and enter code: " userCode))))}))))

(defn command-auth [argv]
  (let [action (first argv)
        xs (vec (rest argv))
        [token-file xs] (take-opt xs "--token-file" (auth/default-token-file))]
    (case action
      "login"
      (command-auth-login xs token-file)

      "import-codex"
      (let [[auth-file _] (take-opt xs "--auth-file" nil)]
        (write-json (auth-actions/import-codex {:auth_file auth-file :token_file token-file})))

      "refresh"
      (let [token (auth/load-token {:token_file token-file :refresh false})
            refreshed (auth/refresh-token {:token token :tokenFile (auth/expand-home token-file)})]
        (write-json (merge {:tokenFile (auth/expand-home token-file)} (auth/summary refreshed))))

      "show"
      (let [token (auth/load-token {:token_file token-file :refresh false})]
        (write-json (merge {:tokenFile (auth/expand-home token-file)} (auth/summary token))))

      "logout"
      (do
        (fs/delete-if-exists (auth/expand-home token-file))
        (write-json {:ok true :tokenFile (auth/expand-home token-file)}))

      (throw (ex-info "Usage: strap provider chatgpt auth <login|import-codex|refresh|show|logout> [--token-file file]" {})))))

(defn -main [& argv]
  (let [command (first argv)
        args (vec (rest argv))]
    (try
      (case command
        "compile" (command-compile args)
        "call" (command-call args)
        "complete" (command-complete args)
        "embed" (command-embed args)
        "auth" (command-auth args)
        (usage))
      (catch Throwable error
        (binding [*out* *err*]
          (println (ex-message error)))
        (System/exit 1)))))
