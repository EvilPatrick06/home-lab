#!/usr/bin/env bash
# Repo-hygiene CI guards. Mechanically enforces conventions that were previously
# verified only by hand (and so drifted). Deferred follow-ups implemented
# 2026-06-29 from the cross-cutting RESOLVED entries:
#   1. No literal node-version: in workflows (use node-version-file: .nvmrc) so the
#      monorepo Node pin cannot drift per-workflow.
#   2. Every non-local GitHub Action is pinned to a full 40-char commit SHA
#      (supply-chain hardening; mutable @vN tags can be repointed upstream).
#   3. docs/README.md indexes every docs/*.md (no orphaned/unindexed docs).
#   4. No tracked file under docs/superpowers/ that docs/README.md does not
#      reference (recurrence guard for the archived superpowers design specs).
#   5. Every workflow declares a top-level permissions: block (least-privilege;
#      avoids falling back to the repo/org default token scope).
# Future: a deeper actions linter (actionlint / zizmor) could subsume guards 1,2,5.
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0

if grep -rnE "^[[:space:]]*node-version:[[:space:]]" .github/workflows/ ; then
  echo "GUARD 1 FAIL: literal node-version found; use node-version-file: .nvmrc" >&2
  fail=1
fi

while IFS= read -r ref; do
  ref="${ref#uses: }"
  case "$ref" in
    ./*) continue ;;
  esac
  if ! printf "%s" "$ref" | grep -qE "@[0-9a-f]{40}$"; then
    echo "GUARD 2 FAIL: action not SHA-pinned: $ref" >&2
    fail=1
  fi
done < <(grep -rhoE "uses: [^[:space:]]+" .github/workflows/ .github/actions/ 2>/dev/null)

for f in docs/*.md; do
  b="$(basename "$f")"
  [ "$b" = "README.md" ] && continue
  grep -q "$b" docs/README.md || { echo "GUARD 3 FAIL: docs/$b not referenced in docs/README.md" >&2; fail=1; }
done

if [ -d docs/superpowers ]; then
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    b="$(basename "$f")"
    grep -q "$b" docs/README.md || { echo "GUARD 4 FAIL: $f not referenced in docs/README.md (archive or index it)" >&2; fail=1; }
  done < <(git ls-files docs/superpowers/)
fi

for f in .github/workflows/*.yml; do
  grep -qE "^permissions:" "$f" || { echo "GUARD 5 FAIL: $f has no top-level permissions: block" >&2; fail=1; }
done

if [ "$fail" -ne 0 ]; then
  echo "check-ci-hygiene: FAILED" >&2
  exit 1
fi
echo "check-ci-hygiene: all guards passed"
