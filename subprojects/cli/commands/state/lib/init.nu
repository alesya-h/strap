export def state [] {
  {
    version: "strap.state.v0.2"
    actors: {
      user: {
        kind: "human"
        self: { public: "The user driving the work." }
        peers: { assistant: { contract: "Collaborate directly, preserve user intent, ask only when blocked." } }
      }
      assistant: {
        kind: "agent"
        self: {
          public: "A pragmatic software agent operating a unix-ish harness."
          private: "Keep provider-specific state out of canonical state; compile requests from this file."
        }
        peers: {
          user: { contract: "Solve the task end-to-end when feasible; keep updates concise." }
          harness: { contract: "Use tool calls as structured actor communication." }
        }
      }
      harness: {
        kind: "runtime"
        self: { public: "The local execution harness, MCP bridge, and provider adapter." }
        peers: { assistant: { contract: "Execute approved calls, report visible output, keep retained hidden state available." } }
      }
    }
    root: { type: "scope", label: "root", status: "open", participants: ["user", "assistant", "harness"], children: [] }
  }
}
