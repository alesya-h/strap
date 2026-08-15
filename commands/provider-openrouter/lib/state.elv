use str
use ./common

fn history {|state| common:value-or $state history [] }
fn active-agent-id {|state|
  var runtime = (common:value-or $state runtime [&])
  common:value-or $runtime active_model ''
}
fn actor {|state id|
  var actors = (common:value-or $state actors [&])
  common:value-or $actors $id [&]
}

fn actor-frame {|state|
  var active = (actor $state (active-agent-id $state))
  var self = (common:value-or $active self [&])
  var sections = []
  var public = (common:value-or $self public '')
  var private = (common:value-or $self private '')
  if (not-eq $public '') { set sections = (conj $sections "<self_public>\n"$public"\n</self_public>") }
  if (not-eq $private '') { set sections = (conj $sections "<self_private>\n"$private"\n</self_private>") }
  var peers = (common:value-or $active peers [&])
  keys $peers | each {|name|
    var relation = $peers[$name]
    var contract = ''
    if (eq (kind-of $relation) string) {
      set contract = $relation
    } elif (and (eq (kind-of $relation) map) (has-key $relation contract)) {
      set contract = $relation[contract]
    }
    if (not-eq $contract '') { set sections = (conj $sections '<contract peer="'$name'">'"\n"$contract"\n</contract>") }
  }
  str:join "\n\n" $sections
}

fn provider-role {|state event|
  var source = (common:value-or $event from '')
  var kind = (common:value-or (actor $state $source) kind '')
  if (or (eq $kind model) (eq $source (active-agent-id $state)) (eq $source model)) { put assistant } else { put user }
}

fn event-text {|event|
  var source = (common:value-or $event from '')
  var kind = (common:value-or $event kind message)
  var text = (common:value-or $event text '')
  str:trim-space '['$source'; '$kind"]\n"$text
}
