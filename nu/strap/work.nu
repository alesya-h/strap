use ./common.nu *

export def init [] { call-json [work init] }
export def path [] { call-json [work path] }
