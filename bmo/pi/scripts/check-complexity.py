#!/usr/bin/env python3
"""Cyclomatic-complexity ratchet for bmo/pi.

Diffs `radon cc --min=D --json` of touched .py files against a pinned
baseline at `bmo/pi/.complexity-baseline.json`. The gate fails iff:
  - A baseline D+ function's complexity score WENT UP in a touched file, or
  - A touched file gained a NEW function ranked D or worse.

Files NOT in the baseline are treated as new (printed as info, never failed)
— first inclusion happens via `--update-baseline`.

Touched files: `git diff --name-only $BASE_REF...HEAD`. Defaults: `BASE_REF`
env var, then `origin/$GITHUB_BASE_REF` if running in Actions, then
`origin/master`. With `--all-files`, every .py under SCOPE is checked.

Why per-function CC and not radon's MI: `radon mi` for our largest files
saturates at 0.00 (the formula's domain doesn't fit dense files like
`app.py` and `voice_pipeline.py`), making MI useless as a regression
metric. Per-function CC is precise and ratchets cleanly.

Usage:
    python scripts/check-complexity.py             # check vs baseline
    python scripts/check-complexity.py --update-baseline    # regen baseline
    python scripts/check-complexity.py --all-files          # full audit
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path

# Top-level Python files that ARE production source.
SCOPE_TOP_LEVEL = ("agent.py", "app.py", "cli.py", "state.py")
# Subpackages that ARE production source.
SCOPE_DIRS = ("agents", "bots", "hardware", "mcp_servers", "routes", "services", "wake")
# Skip-list: kiosk is templates, ide_app/dev are separate, tests/scripts/web
# are not production source. __pycache__ / venv obvious.
SKIP_PARTS = {"__pycache__", "tests", "venv", "node_modules"}

PI_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PI_ROOT.parent.parent
BASELINE_FILE = PI_ROOT / ".complexity-baseline.json"


def _resolve_base_ref(cli_value: str | None) -> str:
    """Order: --base-ref, BASE_REF, origin/$GITHUB_BASE_REF, origin/master."""
    if cli_value:
        return cli_value
    env = os.environ.get("BASE_REF")
    if env:
        return env
    gh = os.environ.get("GITHUB_BASE_REF")
    if gh:
        return f"origin/{gh}"
    return "origin/master"


def _git_diff_touched(base_ref: str) -> list[Path]:
    """Return PI_ROOT-relative .py paths in SCOPE touched on this branch vs base_ref."""
    try:
        out = subprocess.check_output(
            ["git", "diff", "--name-only", f"{base_ref}...HEAD"],
            cwd=REPO_ROOT,
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError:
        # Base ref may not exist locally (fresh clone, missing fetch). Empty
        # diff is the safe fallback — caller treats as "no regressions".
        return []
    paths: list[Path] = []
    for line in out.splitlines():
        line = line.strip()
        if not line.startswith("bmo/pi/") or not line.endswith(".py"):
            continue
        rel = Path(line[len("bmo/pi/") :])
        if any(p in SKIP_PARTS for p in rel.parts):
            continue
        if str(rel) in SCOPE_TOP_LEVEL or rel.parts[0] in SCOPE_DIRS:
            # Only include if the file still exists (PR may have deleted it).
            if (PI_ROOT / rel).exists():
                paths.append(rel)
    return sorted(paths)


def _all_scope_files() -> list[Path]:
    """Every .py under SCOPE, PI_ROOT-relative."""
    paths: list[Path] = []
    for top in SCOPE_TOP_LEVEL:
        if (PI_ROOT / top).is_file():
            paths.append(Path(top))
    for d in SCOPE_DIRS:
        root = PI_ROOT / d
        if not root.is_dir():
            continue
        for f in root.rglob("*.py"):
            if any(p in SKIP_PARTS for p in f.parts):
                continue
            paths.append(f.relative_to(PI_ROOT))
    return sorted(paths)


def _radon_d_plus(files: list[Path]) -> dict[str, dict[str, int]]:
    """`radon cc --min=D --json` over `files`. Returns:
        {relpath: {func_name: complexity_int, ...}, ...}
    Only files with at least one D+ function appear.
    """
    if not files:
        return {}
    cmd = [sys.executable, "-m", "radon", "cc", "--min=D", "--json", *map(str, files)]
    out = subprocess.check_output(cmd, cwd=PI_ROOT, text=True)
    raw = json.loads(out) if out.strip() else {}
    result: dict[str, dict[str, int]] = {}
    for path, items in raw.items():
        funcs = {item["name"]: int(item["complexity"]) for item in items}
        if funcs:
            result[path] = funcs
    return result


def _load_baseline() -> dict:
    if not BASELINE_FILE.exists():
        return {"version": 1, "files": {}}
    return json.loads(BASELINE_FILE.read_text())


def _write_baseline(data: dict) -> None:
    BASELINE_FILE.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")


def cmd_update_baseline() -> int:
    files = _all_scope_files()
    cc = _radon_d_plus(files)
    data = {
        "version": 1,
        "generated_at": str(date.today()),
        "method": (
            "Per-function ratchet on cyclomatic complexity. Records every "
            "function rated D or worse (cc >= 21). A touched file regresses "
            "iff a baseline function's cc went UP, or a new D+ function "
            "appeared. Regenerate via --update-baseline after a refactor."
        ),
        "scope_top_level": list(SCOPE_TOP_LEVEL),
        "scope_dirs": list(SCOPE_DIRS),
        "files": cc,
    }
    _write_baseline(data)
    total = sum(len(v) for v in cc.values())
    print(f"Baseline written: {BASELINE_FILE.relative_to(REPO_ROOT)}")
    print(f"  {len(cc)} file(s) with {total} D+ function(s) snapshotted.")
    return 0


def cmd_check(touched: list[Path]) -> int:
    if not touched:
        print("No touched .py files in scope. Pass.")
        return 0

    baseline_files = _load_baseline().get("files", {})
    current = _radon_d_plus(touched)

    failures: list[str] = []
    info: list[str] = []
    for path in touched:
        rel = str(path)
        base_funcs = baseline_files.get(rel, {})
        cur_funcs = current.get(rel, {})

        # Rule 1: existing D+ function got worse
        for fname, base_cc in base_funcs.items():
            cur_cc = cur_funcs.get(fname)
            if cur_cc is None:
                continue
            if cur_cc > base_cc:
                failures.append(f"{rel}::{fname}  cc {base_cc} -> {cur_cc}  (regression)")

        # Rule 2: new D+ function in a file that's already in the baseline
        if rel in baseline_files:
            for fname, cur_cc in cur_funcs.items():
                if fname not in base_funcs:
                    failures.append(f"{rel}::{fname}  NEW D+ function (cc {cur_cc})")
        elif cur_funcs:
            # File not in baseline at all but has D+ funcs — info, not fail.
            info.append(f"{rel}  (new file, {len(cur_funcs)} D+ func(s) — run --update-baseline to track)")

    if info:
        print("Note:")
        for m in info:
            print(f"  - {m}")
        print()

    if failures:
        print("FAIL — complexity ratchet broken on touched files:")
        for f in failures:
            print(f"  - {f}")
        print()
        print("Options:")
        print("  1) Reduce the function's complexity (preferred — extract helpers).")
        print("  2) If the regression is intentional (refactor that's net-better),")
        print("     run: python scripts/check-complexity.py --update-baseline")
        return 1

    print(f"OK - {len(touched)} touched file(s); no D+ regressions.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--update-baseline",
        action="store_true",
        help="Regenerate .complexity-baseline.json from the current code.",
    )
    parser.add_argument(
        "--all-files",
        action="store_true",
        help="Check every file under SCOPE, not just git-touched ones.",
    )
    parser.add_argument(
        "--base-ref",
        default=None,
        help="Git ref to diff against. Default: $BASE_REF, then origin/$GITHUB_BASE_REF, then origin/master.",
    )
    args = parser.parse_args()

    if args.update_baseline:
        return cmd_update_baseline()

    if args.all_files:
        touched = _all_scope_files()
    else:
        touched = _git_diff_touched(_resolve_base_ref(args.base_ref))
    return cmd_check(touched)


if __name__ == "__main__":
    sys.exit(main())
