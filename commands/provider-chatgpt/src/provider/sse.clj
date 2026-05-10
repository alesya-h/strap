(ns provider.sse
  (:require [cheshire.core :as json]
            [clojure.string :as str]))

(defn stream? [text]
  (or (str/starts-with? text "event:")
      (str/includes? text "\ndata:")))

(defn parse-json [text]
  (json/parse-string text true))

(defn block-event [lines]
  (some #(when (str/starts-with? % "event:")
           (str/trim (subs % 6)))
        lines))

(defn block-data [lines]
  (let [items (keep #(when (str/starts-with? % "data:")
                       (str/trim (subs % 5)))
                    lines)]
    (when (seq items) (str/join "\n" items))))

(defn parse-block [block]
  (let [lines (str/split-lines block)
        data (block-data lines)]
    (when (and data (not= data "[DONE]"))
      (assoc (parse-json data) :event (block-event lines)))))

(defn parse-stream [text]
  (->> (str/split text #"\r?\n\r?\n")
       (keep parse-block)
       vec))

(defn response-payload? [payload]
  (and (:id payload) (or (:output payload) (:output_text payload))))

(defn completed-response [payloads]
  (or (some->> payloads
               reverse
               (keep :response)
               first)
      (some->> payloads
               reverse
               (filter response-payload?)
               first)))

(defn done-text [payloads]
  (let [texts (for [payload payloads
                    :when (= (:type payload) "response.output_text.done")]
                (:text payload))]
    (when (seq texts) (str/join "\n" texts))))

(defn delta-text [payloads]
  (let [chunks (for [payload payloads
                     :when (= (:type payload) "response.output_text.delta")]
                 (:delta payload))]
    (when (seq chunks) (apply str chunks))))

(defn output-items [payloads]
  (let [done (for [payload payloads
                   :when (= (:type payload) "response.output_item.done")]
               (:item payload))
        added (for [payload payloads
                    :when (= (:type payload) "response.output_item.added")]
                (:item payload))]
    (vec (or (seq done) (seq added) []))))

(defn assembled-response [payloads]
  (let [last-response (some->> payloads reverse (keep :response) first)
        text (or (done-text payloads) (delta-text payloads) "")]
    (merge
      (select-keys last-response [:id :model :usage])
      {:output_text text
       :output (output-items payloads)})))

(defn throw-api-error [response]
  (when-let [error (:error response)]
    (throw (ex-info (or (:message error) (str error)) {:error error})))
  response)

(defn decode [text]
  (throw-api-error
    (if (stream? text)
      (let [payloads (parse-stream text)]
        (if-let [response (completed-response payloads)]
          (let [assembled (assembled-response payloads)]
            (cond-> response
              (str/blank? (str (:output_text response)))
              (assoc :output_text (:output_text assembled))

              (empty? (:output response))
              (assoc :output (:output assembled))))
          (assembled-response payloads)))
      (parse-json text))))
