use lib/route.nu

export def main [
  command?: string,
  sub?: string,
  ...args: any,
  --from: string = "",
  --to: string = "",
  --summary: string = "",
  --label: string = "folded conversation segment",
  --text: string = "",
  --created-by: string = "assistant",
  --id: string = "",
  --hidden,
  --bookmark: string = ""
] {
  if ($command | is-empty) { error make { msg: "Usage: strap state <command> [args]" } }
  $in | route dispatch $command ($sub | default "") ...$args --from $from --to $to --summary $summary --label $label --text $text --created-by $created_by --id $id --hidden=$hidden --bookmark $bookmark
}
