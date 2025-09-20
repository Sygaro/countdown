#!/bin/bash

USER="Sygaro"
REPO="countdown"
BRANCH="fix/UI_backend"

# Sett default MAPPE hvis ingen argumenter
MAPPE=${1:-""}

# Hent filstruktur fra GitHub API
curl -s "https://api.github.com/repos/$USER/$REPO/git/trees/$BRANCH?recursive=1" \
  | jq -r --arg MAPPE "$MAPPE" '
      .tree[]
      | select(.type=="blob")
      | select($MAPPE == "" or (.path | startswith($MAPPE)))
      | .path
    ' \
  | while read path; do
      echo "https://raw.githubusercontent.com/$USER/$REPO/$BRANCH/$path"
    done
