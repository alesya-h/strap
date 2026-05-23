(ns provider.auth
  (:require [babashka.fs :as fs]
            [babashka.process :as process]
            [cheshire.core :as json]
            [clojure.string :as str]))

(def client-id "app_EMoamEEZ73f0CkXaXp7hrann")
(def issuer "https://auth.openai.com")
(def device-url (str issuer "/codex/device"))
(def redirect-uri "https://auth.openai.com/deviceauth/callback")

(defn default-token-file []
  (str (fs/path (System/getProperty "user.home") ".config" "strap" "auth" "chatgpt.json")))

(defn expand-home [path]
  (let [value (str path)]
    (cond
      (= value "~") (System/getProperty "user.home")
      (str/starts-with? value "~/") (str (fs/path (System/getProperty "user.home") (subs value 2)))
      :else path)))

(defn decode-jwt [jwt]
  (try
    (let [payload (second (str/split jwt #"\."))]
      (json/parse-string (String. (.decode (java.util.Base64/getUrlDecoder) payload)) true))
    (catch Exception _
      nil)))

(defn account-id [jwt]
  (let [claims (decode-jwt jwt)
        auth (get claims (keyword "https://api.openai.com/auth"))]
    (or (:chatgpt_account_id auth) (get-in claims [:organizations 0 :id]))))

(defn snake [m]
  (into {}
        (map (fn [[k v]]
               [(keyword (str/replace (name k) #"[A-Z]" #(str "_" (str/lower-case %)))) v])
             m)))

(defn normalize-token [token]
  (let [normalized (snake token)]
    (cond-> normalized
      (nil? (:account_id normalized))
      (assoc :account_id (account-id (or (:id_token normalized) (:access_token normalized))))

      (and (nil? (:expires_at normalized)) (:expires_in normalized))
      (assoc :expires_at (- (+ (quot (System/currentTimeMillis) 1000) (long (:expires_in normalized))) 30)))))

(defn should-refresh? [token margin-seconds]
  (if-let [expires-at (or (:expires_at token) (:exp (decode-jwt (:access_token token))))]
    (< (- (* expires-at 1000) (System/currentTimeMillis)) (* margin-seconds 1000))
    false))

(declare refresh-token curl-json)

(defn load-token [{:keys [token_file refresh refresh_margin_seconds force_refresh]
                   :or {refresh true refresh_margin_seconds 120}}]
  (let [file (expand-home (or token_file (default-token-file)))
        token (normalize-token (json/parse-string (slurp file) true))]
    (if (or force_refresh (should-refresh? token refresh_margin_seconds))
      (if refresh
        (refresh-token {:token token :tokenFile file})
        (throw (ex-info "ChatGPT token is expired/near expiry and refresh=false" {})))
      token)))

(defn save-token [token file]
  (let [target (expand-home file)
        normalized (normalize-token token)]
    (fs/create-dirs (fs/parent target))
    (spit target (str (json/generate-string normalized {:pretty true}) "\n"))
    {:tokenFile target :token normalized}))

(defn refresh-token [{:keys [token tokenFile]}]
  (when-not (:refresh_token token)
    (throw (ex-info "ChatGPT token file is missing refresh_token" {})))
  (let [response (curl-json (str issuer "/oauth/token")
                            {:grant_type "refresh_token"
                             :refresh_token (:refresh_token token)
                             :client_id client-id}
                            :form true)
        next-token (merge token response)]
    (:token (save-token (cond-> next-token
                          (nil? (:refresh_token next-token)) (assoc :refresh_token (:refresh_token token)))
                        tokenFile))))

(defn summary [token]
  (let [normalized (normalize-token token)]
    {:accountId (:account_id normalized) :expiresAt (:expires_at normalized)}))

(defn form-body [body]
  (->> body
       (map (fn [[k v]] (str (name k) "=" (java.net.URLEncoder/encode (str v) "UTF-8"))))
       (str/join "&")))

(defn curl-json [url body & {:keys [form]}]
  (let [args (if form
               ["curl" "-sS" "-X" "POST" url "-H" "content-type: application/x-www-form-urlencoded" "-d" (form-body body)]
               ["curl" "-sS" "-X" "POST" url "-H" "content-type: application/json" "-d" (json/generate-string body)])
        result (apply process/shell {:out :string :err :string :continue true} args)]
    (when-not (zero? (:exit result))
      (throw (ex-info (:err result) {})))
    (json/parse-string (:out result) true)))

(defn auth-headers [config]
  (let [token (load-token (:auth config))]
    {"Authorization" (str "Bearer " (:access_token token))
     "ChatGPT-Account-Id" (:account_id token)}))
