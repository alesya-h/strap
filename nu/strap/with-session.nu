use ../../commands/with-session/run.nu

export def main [session: string, block: closure] {
  run $session $block
}
