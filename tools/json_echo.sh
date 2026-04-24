#!/usr/bin/env bash
set -euo pipefail

input=""
while IFS= read -r line; do
  input+="$line"
done
printf '%s\n' "$input"
