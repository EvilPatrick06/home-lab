"""Tests for bmo/pi/scripts/run-check.sh — the heavy-check admission gate.

run-check.sh is the wrapper scheduled agents call instead of invoking
`npx tsc` / `npx vitest` / heavy builds directly. It exists because bmo (an
8 GB Pi) OOM-crashed when several agents launched full-project checks at once.
The gate:
  1. refuses to launch while admissible RAM is below a floor (waits instead),
  2. allows only N heavy jobs per node at once (default 1) via an flock
     semaphore, so concurrent agents serialize instead of OOM-ing,
  3. queues with jitter up to a timeout, then
  4. runs the wrapped command and passes its exit code straight through.

These tests are hermetic: they never launch a real heavy build. RAM is faked
with RUN_CHECK_RAM_OVERRIDE_MB and the semaphore is pointed at a temp lock dir,
so nothing here consumes meaningful memory or touches global state.

Tests skip automatically on any host without `bash` / `flock` (e.g. Windows).
"""

import os
import shutil
import subprocess
import time

import pytest

# ── Platform guard ────────────────────────────────────────────────────────────

bash_available = shutil.which("bash") is not None
flock_available = shutil.which("flock") is not None

pytestmark = pytest.mark.skipif(
    not (bash_available and flock_available),
    reason="bash and flock are required for run-check.sh tests",
)

_PI_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RUN_CHECK_SH = os.path.join(_PI_DIR, "scripts", "run-check.sh")

EX_TEMPFAIL = 75
EX_USAGE = 2


# ── Helpers ───────────────────────────────────────────────────────────────────


def _run(args, env_extra=None, timeout=30):
    """Invoke run-check.sh with a quiet, hermetic environment."""
    env = {
        **os.environ,
        "RUN_CHECK_QUIET": "1",
        **(env_extra or {}),
    }
    return subprocess.run(
        ["bash", RUN_CHECK_SH, *args],
        capture_output=True,
        text=True,
        timeout=timeout,
        env=env,
    )


@pytest.fixture()
def lock_dir(tmp_path):
    """A fresh, isolated semaphore lock directory per test."""
    d = tmp_path / "locks"
    return str(d)


# ── Existence / usage ─────────────────────────────────────────────────────────


def test_script_exists_and_executable():
    assert os.path.isfile(RUN_CHECK_SH), f"missing: {RUN_CHECK_SH}"
    assert os.access(RUN_CHECK_SH, os.X_OK), "run-check.sh must be executable"


def test_usage_error_when_no_command(lock_dir):
    result = _run([], env_extra={"RUN_CHECK_LOCK_DIR": lock_dir})
    assert result.returncode == EX_USAGE


# ── Exit-code pass-through ─────────────────────────────────────────────────────


def test_passes_through_success(lock_dir):
    result = _run(
        ["true"],
        env_extra={
            "RUN_CHECK_LOCK_DIR": lock_dir,
            "RUN_CHECK_RAM_OVERRIDE_MB": "8000",
        },
    )
    assert result.returncode == 0


def test_passes_through_nonzero_exit(lock_dir):
    result = _run(
        ["bash", "-c", "exit 7"],
        env_extra={
            "RUN_CHECK_LOCK_DIR": lock_dir,
            "RUN_CHECK_RAM_OVERRIDE_MB": "8000",
        },
    )
    assert result.returncode == 7


def test_runs_command_when_ram_ok(lock_dir, tmp_path):
    marker = tmp_path / "ran"
    result = _run(
        ["touch", str(marker)],
        env_extra={
            "RUN_CHECK_LOCK_DIR": lock_dir,
            "RUN_CHECK_RAM_OVERRIDE_MB": "8000",
            "RUN_CHECK_RAM_FLOOR_MB": "2500",
        },
    )
    assert result.returncode == 0
    assert marker.exists(), "wrapped command should have run when RAM >= floor"


# ── RAM-floor gate ─────────────────────────────────────────────────────────────


def test_ram_floor_blocks_and_never_launches(lock_dir, tmp_path):
    """Below the RAM floor the gate must wait, then time out WITHOUT running."""
    marker = tmp_path / "should_not_exist"
    start = time.monotonic()
    result = _run(
        ["touch", str(marker)],
        env_extra={
            "RUN_CHECK_LOCK_DIR": lock_dir,
            "RUN_CHECK_RAM_OVERRIDE_MB": "100",   # far below floor
            "RUN_CHECK_RAM_FLOOR_MB": "2500",
            "RUN_CHECK_TIMEOUT_S": "2",
            "RUN_CHECK_POLL_INTERVAL_S": "1",
            "RUN_CHECK_JITTER_S": "0",
        },
    )
    elapsed = time.monotonic() - start
    assert result.returncode == EX_TEMPFAIL, "should time out with EX_TEMPFAIL(75)"
    assert not marker.exists(), "command must NOT run while below the RAM floor"
    # Tolerate small scheduler/measurement jitter under load (was an exact
    # >=2.0 floor against a 2 s timeout, which flaked red on loaded runners).
    assert elapsed >= 2 - 0.25, "gate should have waited for ~the full timeout before giving up"


def test_ram_floor_admits_at_exact_floor(lock_dir, tmp_path):
    """RAM exactly at the floor is admissible (>=, not >)."""
    marker = tmp_path / "ran"
    result = _run(
        ["touch", str(marker)],
        env_extra={
            "RUN_CHECK_LOCK_DIR": lock_dir,
            "RUN_CHECK_RAM_OVERRIDE_MB": "2500",
            "RUN_CHECK_RAM_FLOOR_MB": "2500",
            "RUN_CHECK_TIMEOUT_S": "3",
        },
    )
    assert result.returncode == 0
    assert marker.exists()


# ── Semaphore (flock) ──────────────────────────────────────────────────────────


def test_semaphore_serializes_concurrent_heavy_jobs(lock_dir, tmp_path):
    """Two concurrent invocations with concurrency=1 must NOT interleave.

    Each wrapped command appends <tag>-start, sleeps, then appends <tag>-end.
    With a semaphore of 1 the second job cannot start until the first ends, so
    the log is strictly A-start, A-end, B-start, B-end (in whichever order the
    two win the lock). Interleaving would prove the gate failed to serialize —
    which is exactly what OOM'd the Pi.
    """
    order_log = tmp_path / "order.log"
    order_log.write_text("")
    env = {
        **os.environ,
        "RUN_CHECK_QUIET": "1",
        "RUN_CHECK_LOCK_DIR": lock_dir,
        "RUN_CHECK_RAM_OVERRIDE_MB": "8000",
        "RUN_CHECK_MAX_CONCURRENCY": "1",
        "RUN_CHECK_TIMEOUT_S": "30",
        "RUN_CHECK_POLL_INTERVAL_S": "1",
        "RUN_CHECK_JITTER_S": "0",
    }

    def _spawn(tag, sleep_s):
        cmd = f"echo {tag}-start >> {order_log}; sleep {sleep_s}; echo {tag}-end >> {order_log}"
        return subprocess.Popen(
            ["bash", RUN_CHECK_SH, "bash", "-c", cmd],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    p1 = _spawn("A", 2)
    time.sleep(0.3)      # bias A to win the lock first
    p2 = _spawn("B", 1)
    p1.wait(timeout=40)
    p2.wait(timeout=40)
    assert p1.returncode == 0 and p2.returncode == 0

    lines = [ln for ln in order_log.read_text().splitlines() if ln.strip()]
    assert len(lines) == 4, f"expected 4 log lines, got: {lines}"
    # Each job's start must be immediately followed by its own end — no interleave.
    for i in (0, 2):
        tag = lines[i].split("-")[0]
        assert lines[i] == f"{tag}-start", f"unexpected order: {lines}"
        assert lines[i + 1] == f"{tag}-end", f"jobs interleaved (not serialized): {lines}"


def test_concurrency_two_allows_parallel(lock_dir, tmp_path):
    """With concurrency=2 two jobs may overlap (proves the slot count is honored)."""
    order_log = tmp_path / "order2.log"
    order_log.write_text("")
    env = {
        **os.environ,
        "RUN_CHECK_QUIET": "1",
        "RUN_CHECK_LOCK_DIR": lock_dir,
        "RUN_CHECK_RAM_OVERRIDE_MB": "8000",
        "RUN_CHECK_MAX_CONCURRENCY": "2",
        "RUN_CHECK_TIMEOUT_S": "30",
        "RUN_CHECK_POLL_INTERVAL_S": "1",
        "RUN_CHECK_JITTER_S": "0",
    }

    def _spawn(tag):
        cmd = f"echo {tag}-start >> {order_log}; sleep 1.5; echo {tag}-end >> {order_log}"
        return subprocess.Popen(
            ["bash", RUN_CHECK_SH, "bash", "-c", cmd],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    p1 = _spawn("A")
    p2 = _spawn("B")
    p1.wait(timeout=40)
    p2.wait(timeout=40)
    lines = [ln for ln in order_log.read_text().splitlines() if ln.strip()]
    # With 2 slots both starts should appear before either end (they overlap).
    assert lines[0].endswith("-start") and lines[1].endswith("-start"), (
        f"expected both starts before ends with 2 slots, got: {lines}"
    )


# ── Escape hatch ───────────────────────────────────────────────────────────────


def test_disable_bypasses_gate_even_below_floor(lock_dir, tmp_path):
    """RUN_CHECK_DISABLE=1 runs the command directly, ignoring the RAM floor."""
    marker = tmp_path / "bypass_ran"
    result = _run(
        ["touch", str(marker)],
        env_extra={
            "RUN_CHECK_LOCK_DIR": lock_dir,
            "RUN_CHECK_DISABLE": "1",
            "RUN_CHECK_RAM_OVERRIDE_MB": "1",     # below floor, but bypassed
            "RUN_CHECK_RAM_FLOOR_MB": "2500",
        },
    )
    assert result.returncode == 0
    assert marker.exists()
