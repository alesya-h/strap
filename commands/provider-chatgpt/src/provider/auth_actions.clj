(ns provider.auth-actions
  (:require [babashka.fs :as fs]
            [babashka.process :as process]
            [cheshire.core :as json]
            [provider.auth :as auth]))

(defn import-codex [{:keys [auth_file token_file]}]
  (let [file (auth/expand-home (or auth_file (str (fs/path (or (System/getenv "CODEX_HOME")
                                                                (str (fs/path (System/getProperty "user.home") ".codex")))
                                                            "auth.json"))))
        doc (json/parse-string (slurp file) true)]
    (when (:OPENAI_API_KEY doc)
      (throw (ex-info "Codex auth file contains API-key auth, not ChatGPT OAuth auth" {})))
    (when-not (get-in doc [:tokens :access_token])
      (throw (ex-info "Codex auth file is missing tokens.access_token" {})))
    (let [saved (auth/save-token {:access_token (get-in doc [:tokens :access_token])
                                  :refresh_token (get-in doc [:tokens :refresh_token])
                                  :id_token (or (get-in doc [:tokens :id_token :raw_jwt]) (get-in doc [:tokens :id_token]))
                                  :account_id (get-in doc [:tokens :account_id])}
                                 (or token_file (auth/default-token-file)))]
      {:tokenFile (:tokenFile saved)
       :accountId (get-in saved [:token :account_id])
       :expiresAt (get-in saved [:token :expires_at])})))

(defn poll-device [{:keys [deviceAuthId userCode timeout_seconds poll_interval_seconds]}]
  (let [deadline (+ (System/currentTimeMillis) (* timeout_seconds 1000))]
    (loop []
      (when (> (System/currentTimeMillis) deadline)
        (throw (ex-info "Timed out waiting for ChatGPT device authorization" {})))
      (let [body (auth/curl-json (str auth/issuer "/api/accounts/deviceauth/token")
                                 {:device_auth_id deviceAuthId :user_code userCode})]
        (if (:authorization_code body)
          body
          (do
            (Thread/sleep (* 1000 (max 1 poll_interval_seconds)))
            (recur)))))))

(defn open-url [url]
  (try
    (process/process (if (= (System/getProperty "os.name") "Mac OS X") "open" "xdg-open")
                     url
                     {:out :inherit :err :inherit})
    (catch Exception _ nil)))

(defn login [{:keys [token_file open timeout_seconds poll_interval_seconds onUserCode]
              :or {open true timeout_seconds 300 poll_interval_seconds 5}}]
  (let [usercode (auth/curl-json (str auth/issuer "/api/accounts/deviceauth/usercode") {:client_id auth/client-id})
        device-id (:device_auth_id usercode)
        user-code (:user_code usercode)]
    (when (or (nil? device-id) (nil? user-code))
      (throw (ex-info "ChatGPT login response missing device auth fields" {})))
    (when onUserCode (onUserCode {:userCode user-code :url auth/device-url}))
    (when open (open-url auth/device-url))
    (let [exchange (poll-device {:deviceAuthId device-id
                                 :userCode user-code
                                 :timeout_seconds timeout_seconds
                                 :poll_interval_seconds poll_interval_seconds})
          token (auth/curl-json (str auth/issuer "/oauth/token")
                                {:grant_type "authorization_code"
                                 :code (:authorization_code exchange)
                                 :redirect_uri auth/redirect-uri
                                 :client_id auth/client-id
                                 :code_verifier (:code_verifier exchange)}
                                :form true)
          saved (auth/save-token token (or token_file (auth/default-token-file)))]
      {:tokenFile (:tokenFile saved)
       :accountId (get-in saved [:token :account_id])
       :expiresAt (get-in saved [:token :expires_at])})))
