use ./common.nu *

export def modules [] { call-json [nu modules] }
export def path [module: string = "strap"] { call-text [nu path $module] }
export def use-line [module: string = "strap"] { call-text [nu use-line $module] }
export def source-line [module: string = "strap"] { call-text [nu source-line $module] }
