fn strap-bin {
  if (and (has-env STRAP_BIN) (not-eq $E:STRAP_BIN '')) {
    put $E:STRAP_BIN
  } elif (and (has-env STRAP_ROOT) (not-eq $E:STRAP_ROOT '')) {
    put $E:STRAP_ROOT'/bin/strap'
  } else {
    put strap
  }
}

fn load {|name|
  var strap = (external (strap-bin))
  $strap model show $name | from-json
}
