export def state [] {
  {
    version: "strap.state.v0.3"
    actors: { humans: {}, agents: {}, runtimes: {} }
    root: { type: "scope", label: "root", status: "open", participants: [], children: [] }
  }
}
