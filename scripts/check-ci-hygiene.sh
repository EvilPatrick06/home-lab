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
#   6. workflow_run.workflows: references resolve to a declared workflow name:
#      (a rename cannot silently sever a workflow_run trigger, e.g. bmo deploy).
#   7. Every push-triggered workflow declares a concurrency: block (push bursts
#      supersede/complete instead of piling duplicate runs).
#   8. Every workflow job declares timeout-minutes: (a hung step cannot burn the
#      6-hour default-runner ceiling).
#   9. Every */LICENSE is byte-identical to the root LICENSE (no license drift).
#  10. The biome tool version is single-sourced across the biome projects + the
#      husky hook pin (local pre-commit and CI lint with the same binary).
# actionlint + zizmor (both jobs in ci-hygiene.yml) jointly cover the deeper
# workflow-lint surface (correctness + security); guards 1,2,5-8 above remain as
# the cheap, self-contained mechanical convention checks.
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

# Enumerate via git ls-files (both .yml and .yaml) rather than a *.yml shell
# glob: GitHub Actions loads either extension, so a .yaml workflow must not
# silently skip this guard (mirrors the recursive coverage of GUARDs 1-2).
while IFS= read -r f; do
  [ -z "$f" ] && continue
  grep -qE "^permissions:" "$f" || { echo "GUARD 5 FAIL: $f has no top-level permissions: block" >&2; fail=1; }
done < <(git ls-files ".github/workflows/*.yml" ".github/workflows/*.yaml")


# 6. workflow_run referential integrity: every name listed under a
#    workflow_run.workflows: trigger must match the name: declared by some
#    workflow file in this same tree. GitHub couples workflow_run by DISPLAY
#    NAME with no error on a miss — renaming a referenced workflow silently
#    severs the trigger (e.g. the bmo auto-deploy, or the 14-name CI-failure
#    triage list). This guard makes such a rename fail CI instead.
#    Extract the set of declared names, and the set of referenced names, and
#    assert referenced is a subset of declared.
declared_names="$(mktemp)"
referenced_names="$(mktemp)"
trap "rm -f \"$declared_names\" \"$referenced_names\"" EXIT
# Declared: the first top-level `name:` per workflow file.
while IFS= read -r wf; do
  [ -z "$wf" ] && continue
  n="$(grep -m1 -E "^name:" "$wf" | sed -E "s/^name:[[:space:]]*//; s/^\"(.*)\"$/\1/; s/^'(.*)'$/\1/")"
  [ -n "$n" ] && printf "%s\n" "$n" >> "$declared_names"
done < <(git ls-files ".github/workflows/*.yml" ".github/workflows/*.yaml")
sort -u "$declared_names" -o "$declared_names"
# Referenced: names appearing under a workflow_run.workflows: list. Handle both
# the inline `workflows: ["A", "B"]` form and the block `- "A"` list form.
python3 - "$declared_names" "$referenced_names" <<'PY'
import sys, re, glob, yaml
declared = set(l.strip() for l in open(sys.argv[1]) if l.strip())
refs = set()
for f in glob.glob(".github/workflows/*.yml") + glob.glob(".github/workflows/*.yaml"):
    try:
        doc = yaml.safe_load(open(f))
    except Exception:
        continue
    if not isinstance(doc, dict):
        continue
    on = doc.get("on") or doc.get(True)  # YAML parses bare `on:` as True
    if not isinstance(on, dict):
        continue
    wr = on.get("workflow_run")
    if isinstance(wr, dict):
        for w in (wr.get("workflows") or []):
            refs.add(str(w))
with open(sys.argv[2], "w") as out:
    for r in sorted(refs):
        out.write(r + "\n")
PY
while IFS= read -r ref; do
  [ -z "$ref" ] && continue
  grep -Fxq "$ref" "$declared_names" || { echo "GUARD 6 FAIL: workflow_run references \"$ref\" but no workflow declares that name:" >&2; fail=1; }
done < "$referenced_names"

# 7. Every push-triggered workflow declares a concurrency: block, so push bursts
#    supersede (or, for security scanners, complete) instead of piling duplicate
#    runs under the high-churn integrator/auto/* model.
while IFS= read -r wf; do
  [ -z "$wf" ] && continue
  grep -qE "^on:" "$wf" || continue
  # Does its on: block include push? (covers `on: push:` and `on:` mapping.)
  if grep -qE "^[[:space:]]+push:" "$wf" || grep -qE "^on:[[:space:]]*\[.*push" "$wf"; then
    grep -qE "^concurrency:" "$wf" || { echo "GUARD 7 FAIL: $wf triggers on push but declares no concurrency: block" >&2; fail=1; }
  fi
done < <(git ls-files ".github/workflows/*.yml" ".github/workflows/*.yaml")

# 8. Every workflow job declares timeout-minutes:, so a hung step cannot burn the
#    6-hour default-runner ceiling. Counts jobs (runs-on: lines) vs timeout lines.
while IFS= read -r wf; do
  [ -z "$wf" ] && continue
  jobs="$(grep -cE "^[[:space:]]+runs-on:" "$wf" || true)"
  touts="$(grep -cE "^[[:space:]]+timeout-minutes:" "$wf" || true)"
  if [ "$jobs" -gt 0 ] && [ "$touts" -lt "$jobs" ]; then
    echo "GUARD 8 FAIL: $wf has $jobs job(s) but only $touts timeout-minutes: (every job needs one)" >&2
    fail=1
  fi
done < <(git ls-files ".github/workflows/*.yml" ".github/workflows/*.yaml")

# 9. LICENSE drift guard: every */LICENSE must be byte-identical to the root
#    LICENSE. Per-package copies are intentional (each area is independently
#    cloneable) but nothing asserted they stay in sync — a partial edit could
#    license the repo inconsistently with no signal.
if [ -f LICENSE ]; then
  root_sum="$(sha256sum LICENSE | cut -d" " -f1)"
  while IFS= read -r lf; do
    [ -z "$lf" ] && continue
    [ "$lf" = "LICENSE" ] && continue
    s="$(sha256sum "$lf" | cut -d" " -f1)"
    [ "$s" = "$root_sum" ] || { echo "GUARD 9 FAIL: $lf differs from root LICENSE (keep all LICENSE copies identical)" >&2; fail=1; }
  done < <(git ls-files "*/LICENSE" "LICENSE")
fi

# 10. Biome version single-source: the biome tool version must match across the
#     projects that declare it as a devDependency and the husky hook pin, so
#     local pre-commit and CI never lint the same diff with different biome
#     binaries. Collect the declared versions (stripped of ^~ range prefixes)
#     and assert they are all equal.
biome_versions="$(mktemp)"
trap "rm -f \"$declared_names\" \"$referenced_names\" \"$biome_versions\"" EXIT
for pj in dnd-app/package.json dnd-app/mobile/package.json dungeon-scholar/package.json; do
  [ -f "$pj" ] || continue
  v="$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); dd=d.get(\"devDependencies\",{}); print(dd.get(\"@biomejs/biome\",\"\"))" "$pj")"
  [ -n "$v" ] && printf "%s %s\n" "${v#[\^~]}" "$pj" >> "$biome_versions"
done
# husky hook inline pins (@biomejs/biome@X.Y.Z) — if the hook still hard-codes any.
if [ -f .husky/pre-commit ]; then
  while IFS= read -r hv; do
    [ -n "$hv" ] && printf "%s .husky/pre-commit\n" "$hv" >> "$biome_versions"
  done < <(grep -oE "@biomejs/biome@[0-9]+\.[0-9]+\.[0-9]+" .husky/pre-commit | sed "s#@biomejs/biome@##" | sort -u)
fi
if [ -s "$biome_versions" ]; then
  uniq_versions="$(cut -d" " -f1 "$biome_versions" | sort -u | wc -l)"
  if [ "$uniq_versions" -gt 1 ]; then
    echo "GUARD 10 FAIL: biome version drift across sources:" >&2
    cat "$biome_versions" >&2
    fail=1
  fi
fi

if [ "$fail" -ne 0 ]; then
  echo "check-ci-hygiene: FAILED" >&2
  exit 1
fi
echo "check-ci-hygiene: all guards passed"
