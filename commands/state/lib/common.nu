export def append-message [message: record] {
  let state = $in
  $state | update history { append $message }
}
