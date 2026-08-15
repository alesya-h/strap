fn strap-bin {
  if (and (has-env STRAP_BIN) (not-eq $E:STRAP_BIN '')) { put $E:STRAP_BIN } else { put strap }
}

fn load {|group|
  if (eq $group none) { put []; return }
  var resolved = $group
  if (eq $resolved '') { set resolved = all }
  var strap = (external (strap-bin))
  $strap tools list --group $resolved --json | from-json
}
