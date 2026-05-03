use ./common.nu *

export def list [--scope: string = "all"] { call-json [zk list "--scope" $scope] }

export def get [id_or_title: string] { call-json [zk get $id_or_title] }

export def search [query: string] { call-json [zk search $query] }

export def search-hybrid [query: string, --db: string = ""] {
  call-json ([zk search-hybrid $query] ++ (maybe-flag "--db" $db))
}

export def tags [] { call-json [zk tags] }

export def links [id_or_title: string] { call-json [zk links $id_or_title] }

export def backlinks [id_or_title: string] { call-json [zk backlinks $id_or_title] }

export def status [] { call-json [zk status] }
