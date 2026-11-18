#!/usr/bin/env bash
# Read-only check, after a merge to the skills repo, that every installed copy OpenCode or Claude
# Code can load has the content of origin/main. `merge-gate/commands.md`, "Sync installed copies",
# says what to do with each line.
#
# usage: installed-check.sh <clone>   <clone> is a clone of the repo, fetched just before
# exit codes: 0 every copy matches, 1 a stale or local-edit line, 2 usage error
#
# Copies are compared by content: a clone by the tree id of the skill folder, which is a content
# hash, so a merge that changes no skill folder leaves every copy green.
set -u
slug=emanueledenaro/claude-skills
ref=origin/main

[ $# -eq 1 ] || { echo "usage: installed-check.sh <clone>" >&2; exit 2; }
clone=$1
git -C "$clone" rev-parse --verify --quiet "$ref^{commit}" >/dev/null 2>&1 \
  || { echo "error: $clone has no $ref; run git -C $clone fetch origin first" >&2; exit 2; }
tmp=$(mktemp -d) || exit 2
trap 'rm -rf "$tmp"' EXIT
git -C "$clone" archive "$ref" | tar -x -C "$tmp" || { echo "error: cannot extract $ref" >&2; exit 2; }

same_repo() { git -C "$1" remote get-url origin 2>/dev/null | grep -Eq "[/:]$slug(\.git)?\$"; }
same_content() { diff -rq -x .DS_Store "$tmp/$1" "$2" >/dev/null 2>&1; }

bad=0
for id in $(git -C "$clone" ls-tree -r --name-only "$ref" | sed -n 's|^\([^/]*\)/SKILL\.md$|\1|p'); do
  tree=$(git -C "$clone" rev-parse "$ref:$id")
  for root in "$HOME/.config/opencode/skills" "$HOME/.claude/skills" "$HOME/.agents/skills"; do
    d=$root/$id
    [ -d "$d" ] || continue
    real=$(realpath "$d")
    top=$(git -C "$real" rev-parse --show-toplevel 2>/dev/null)
    if [ -n "$top" ] && same_repo "$top"; then
      if [ "$(realpath "$top/$id" 2>/dev/null)" = "$real" ]; then
        [ "$(git -C "$top" rev-parse --verify --quiet "HEAD:$id")" = "$tree" ] \
          || { echo "stale: $d, $top at $(git -C "$top" rev-parse --short HEAD)"; bad=1; }
        [ -z "$(git --no-optional-locks -C "$top" status --porcelain -- "$id")" ] \
          || { echo "local edit: $d in $top"; bad=1; }
        continue
      fi
      top= # another folder of this repo: judged by content, like a copy
    fi
    if [ -n "$top" ]; then
      if same_content "$id" "$real"; then state="same content as"; else state="differs from"; fi
      echo "report: $d is in another repo, $top, and $state $ref"
    elif same_content "$id" "$real"; then
      echo "report: plain copy $d, same content as $ref"
    else
      echo "stale copy: $d differs from $ref"; bad=1
    fi
  done
done
echo "checked against $ref $(git -C "$clone" rev-parse --short "$ref")"
exit "$bad"
