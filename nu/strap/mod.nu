export use ../plumbing.nu [
  init
  append-event
  add-user
  add-assistant
  add-tool-request
  open-scope
  collapse-last-scope
  last-assistant-text
  add-trace
  walk
  events
  with-events
  map-events
  where-events
  bookmarks
  locate-text
  locate-bookmark
  extract-range
  with-extract
  update-actor
]

export use ./state.nu
export use ./agents.nu
export use ./skills.nu
export use ./model.nu
export use ./session.nu
export use ./work.nu
export use ./context.nu
export use ./one-shot.nu
export use ./llm.nu
export use ./zk.nu
export use ./nu.nu
export use ./artifact.nu
export use ./commands.nu
export use ./paths.nu
export use ./status.nu
export use ./policy.nu

export def "model use" [name: string] {
  run-external ($env.STRAP_BIN? | default "strap") model use $name | from json
}
