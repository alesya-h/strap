(ns provider.state
  (:require [cheshire.core :as json]
            [clojure.string :as str]))

(defn flatten-visible [node]
  (cond
    (= (:type node) "event")
    [node]

    (= (:type node) "scope")
    (if (= (:status node) "collapsed")
      [{:type "event"
        :from "harness"
        :to (or (:participants node) [])
        :kind "summary"
        :text (or (:summary node) (str "[collapsed scope: " (:label node) "]"))}]
      (mapcat flatten-visible (or (:children node) [])))

    :else
    []))

(defn actor-frame [state]
  (let [actor (get-in state [:actors :assistant])]
    (str/join
      "\n\n"
      (remove
        nil?
        (concat
          [(when-let [public (get-in actor [:self :public])]
             (str "<self_public>\n" public "\n</self_public>"))
           (when-let [private (get-in actor [:self :private])]
             (str "<self_private>\n" private "\n</self_private>"))]
          (for [[peer relation] (:peers actor)
                :when (:contract relation)]
            (str "<contract peer=\"" (name peer) "\">\n" (:contract relation) "\n</contract>")))))))

(defn event-text [event]
  (let [to (if (sequential? (:to event)) (str/join "," (:to event)) (or (:to event) "all"))]
    (str/trim (str "[" (:from event) " -> " to "; " (or (:kind event) "message") "]\n" (or (:text event) "")))))

(defn tool-result [call]
  (if-not (:ok call)
    (json/generate-string {:ok false :error (or (:error call) "Tool call failed")})
    (let [output (:output call)
          text-parts (->> (:content output)
                          (filter #(and (= (:type %) "text") (string? (:text %))))
                          (map :text))]
      (cond
        (string? output) output
        (seq text-parts) (str/join "\n" text-parts)
        :else (json/generate-string output)))))

(defn function-call-inputs [call]
  (concat
    [{:type "function_call"
      :id (or (get-in call [:provider :id]) (:id call))
      :call_id (or (get-in call [:provider :call_id]) (:id call))
      :name (:tool call)
      :arguments (json/generate-string (or (:input call) {}))}]
    (when (contains? call :ok)
      [{:type "function_call_output"
        :call_id (or (get-in call [:provider :call_id]) (:id call))
        :output (tool-result call)}])))

(defn event-inputs [event]
  (if (and (= (:from event) "assistant") (seq (:calls event)))
    (concat
      (when (:text event) [{:role "assistant" :content (:text event)}])
      (mapcat function-call-inputs (:calls event)))
    [{:role (if (= (:from event) "assistant") "assistant" "user")
      :content (or (:text event) (event-text event))}]))

(defn responses-input [state]
  (vec (mapcat event-inputs (flatten-visible (:root state)))))

(defn tool-spec [tool]
  {:type "function"
   :name (:name tool)
   :description (:description tool)
   :parameters (:inputSchema tool)})

(defn compile-request [state config tools]
  (merge
    {:model (:model config)
     :input (responses-input state)
     :instructions (actor-frame state)
     :store false
     :stream true}
    (when (seq tools) {:tools (mapv tool-spec tools)})
    (:parameters config)))

(defn parse-json-object [value]
  (try
    (json/parse-string value true)
    (catch Exception _
      {:raw value})))

(defn output-text [output]
  (str/join
    "\n"
    (for [item output
          part (:content item)
          :when (#{{:type "output_text"} {:type "text"}} (select-keys part [:type]))]
      (:text part))))

(defn response-call [item]
  {:id (or (:call_id item) (:id item))
   :tool (:name item)
   :input (parse-json-object (:arguments item))
   :provider {:type (:type item)
              :id (:id item)
              :call_id (:call_id item)}})

(defn response-event [response]
  (let [output (or (:output response) [])
        text (or (:output_text response) (output-text output))
        calls (vec (map response-call (filter #(= (:type %) "function_call") output)))]
    {:from "assistant"
     :to (if (seq calls) ["harness"] ["user"])
     :kind (if (seq calls) "tool_request" "message")
     :text text
     :calls (when (seq calls) calls)
      :provider {:name "chatgpt.responses"
                :id (:id response)
                :model (:model response)
                :usage (:usage response)}}))
