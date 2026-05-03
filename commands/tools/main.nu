#!/usr/bin/env nu

def --wrapped main [...args: string] {
  run-external "nu" ($env.STRAP_CMD_DIR | path join run.nu) ...$args
}
