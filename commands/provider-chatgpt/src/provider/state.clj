(ns provider.state
  (:require [cheshire.core :as json]
            [clojure.string :as str]))

(defn active-model [state]
  (get-in state [:runtime :active_model]))

(defn actor [state id]
  (get-in state [:actors (keyword id)]))

(defn actor-frame [state]
  (let [actor (actor state (active-model state))]
    (str/join "\n\n"
              (remove nil?
                      (concat
                        [(when-let [public (get-in actor [:self :public])] (str "<self_public>\n" public "\n</self_public>"))
                         (when-let [private (get-in actor [:self :private])] (str "<self_private>\n" private "\n</self_private>"))]
                        (for [[peer relation] (:peers actor)
                              :let [contract (if (string? relation) relation (:contract relation))]
                              :when contract]
                          (str "<contract peer=\"" (name peer) "\">\n" contract "\n</contract>")))))))

(defn event-text [event]
  (str/trim (str "[" (:from event) "; " (or (:kind event) "message") "]\n" (or (:text event) ""))))

(defn tool-result [call]
  (if-not (:ok call)
    (json/generate-string {:ok false :error (or (:error call) "Tool call failed")})
    (let [output (:output call)
          text-parts (->> (:content output) (filter #(and (= (:type %) "text") (string? (:text %)))) (map :text))]
      (cond (string? output) output (seq text-parts) (str/join "\n" text-parts) :else (json/generate-string output)))))

(defn provider-tool-name [name] (str/replace (str name) "." "__"))
(defn canonical-tool-name [name] (str/replace (str name) "__" "."))

(defn function-call-inputs [call]
  (concat [{:type "function_call" :id (or (get-in call [:provider :id]) (:id call)) :call_id (or (get-in call [:provider :call_id]) (:id call)) :name (provider-tool-name (:tool call)) :arguments (json/generate-string (or (:input call) {}))}]
          (when (contains? call :ok) [{:type "function_call_output" :call_id (or (get-in call [:provider :call_id]) (:id call)) :output (tool-result call)}])))

(defn provider-role [state event]
  (if (= "model" (:kind (actor state (:from event)))) "assistant" "user"))

(defn event-inputs [state event]
  (if (seq (:calls event))
    (concat (when (seq (:text event)) [{:role (provider-role state event) :content (:text event)}]) (mapcat function-call-inputs (:calls event)))
    [{:role (provider-role state event) :content (or (:text event) (event-text event))}]))

(defn responses-input [state]
  (vec (mapcat #(event-inputs state %) (:history state))))

(defn tool-spec [tool]
  {:type "function" :name (provider-tool-name (:name tool)) :description (:description tool) :parameters (:inputSchema tool)})

(defn compile-request [state config tools]
  (merge {:model (:model config) :input (responses-input state) :instructions (actor-frame state) :store false :stream true}
         (when (seq tools) {:tools (mapv tool-spec tools)}) (:parameters config)))

(defn parse-json-object [value]
  (try (json/parse-string value true) (catch Exception _ {:raw value})))

(defn output-text [output]
  (str/join "\n" (for [item output part (:content item) :when (#{{:type "output_text"} {:type "text"}} (select-keys part [:type]))] (:text part))))

(defn response-call [item]
  {:id (or (:call_id item) (:id item)) :tool (canonical-tool-name (:name item)) :input (parse-json-object (:arguments item)) :provider {:type (:type item) :id (:id item) :call_id (:call_id item)}})

(defn response-event
  ([response] (response-event response "model"))
  ([response actor]
   (let [output (or (:output response) []) text (or (:output_text response) (output-text output)) calls (vec (map response-call (filter #(= (:type %) "function_call") output)))]
     (cond-> {:from actor :text text :calls (when (seq calls) calls) :provider {:name "chatgpt.responses" :id (:id response) :model (:model response) :usage (:usage response)}}
       (not (seq calls)) (dissoc :calls)))))
