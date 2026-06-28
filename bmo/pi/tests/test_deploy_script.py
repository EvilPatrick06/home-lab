"""Hermetic tests for bmo/pi/scripts/deploy.sh (Phase 42B; deploy isolation).

The deploy script is health-gated, lockable, idempotent, and rollback-capable.
These tests exercise its CONTROL FLOW only — every run is `--dry-run`, so the
run() wrapper merely echoes mutating commands ("[dry-run] <cmd>") and makes NO
side effects: no real `git reset`, `pip install`, `app.py` canary launch,
`systemctl`, or `curl`.  This keeps the tests safe to run anywhere.

deploy.sh deploys from a DEDICATED, deploy-owned checkout (default
/home/patrick/home-lab-deploy) that it fetch+`reset --hard`s to the target SHA —
it is fully decoupled from the shared dev tree, so a dirty/mid-merge dev tree can
no longer block or pollute a deploy. The hermetic harness points
BMO_DEPLOY_REPO_ROOT at a throwaway clone standing in for that deploy checkout.

A fixture builds a throwaway git setup:
  - a bare `origin` repo
  - a clone with bmo/pi/requirements.txt and >=2 commits on a `master` branch
  - `origin/master` tracking the clone's history

The clone's path is NOT the standard deploy-checkout root, so every invocation
passes BMO_DEPLOY_ALLOW_NONSTANDARD_ROOT=1 (which relaxes the resolved-root
equality check for the temp dir).

Tests skip automatically when `bash` or `git` is unavailable.
"""

import os
import shutil
import subprocess

import pytest

# ── Platform guard ────────────────────────────────────────────────────────────

bash_available = shutil.which("bash") is not None
git_available = shutil.which("git") is not None

pytestmark = pytest.mark.skipif(
    not (bash_available and git_available),
    reason="bash and git are required for deploy.sh tests",
)

_PI_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DEPLOY_SH = os.path.join(_PI_DIR, "scripts", "deploy.sh")


# ── Helpers ─────────────────────────────────────────────────────────────────--


def _git(repo: str, *args: str, check: bool = True) -> str:
    """Run a git command inside `repo`; return stdout."""
    result = subprocess.run(
        ["git", "-C", repo, *args],
        capture_output=True,
        text=True,
        check=check,
    )
    return result.stdout.strip()


def _run_deploy(
    clone: str, args: list[str] | None = None, env_extra: dict | None = None,
    timeout: int = 30,
) -> subprocess.CompletedProcess:
    """Invoke deploy.sh with the hermetic-test env defaults (always dry-run)."""
    env = {
        **os.environ,
        "BMO_DEPLOY_REPO_ROOT": clone,
        "BMO_DEPLOY_ALLOW_NONSTANDARD_ROOT": "1",
    }
    env.update(env_extra or {})
    return subprocess.run(
        ["bash", DEPLOY_SH, *(args or [])],
        capture_output=True,
        text=True,
        timeout=timeout,
        env=env,
    )


@pytest.fixture()
def repos(tmp_path):
    """Build a bare origin + a master-branch clone with >=2 commits.

    Returns (clone_path, head_sha, prev_sha).
    """
    origin = str(tmp_path / "origin.git")
    work = str(tmp_path / "work")
    clone = str(tmp_path / "clone")

    # Bare origin.
    subprocess.run(["git", "init", "--bare", "-b", "master", origin], check=True,
                   capture_output=True)

    # Seed it via a throwaway work tree.
    subprocess.run(["git", "init", "-b", "master", work], check=True,
                   capture_output=True)
    _git(work, "config", "user.email", "test@example.com")
    _git(work, "config", "user.name", "Test")
    os.makedirs(os.path.join(work, "bmo", "pi"), exist_ok=True)
    with open(os.path.join(work, "bmo", "pi", "requirements.txt"), "w") as f:
        f.write("flask==3.0.0\n")
    with open(os.path.join(work, "README.md"), "w") as f:
        f.write("# seed\n")
    _git(work, "add", "-A")
    _git(work, "commit", "-m", "initial commit")
    # Second commit so we have history.
    with open(os.path.join(work, "bmo", "pi", "app.py"), "w") as f:
        f.write("print('hi')\n")
    _git(work, "add", "-A")
    _git(work, "commit", "-m", "second commit")
    _git(work, "remote", "add", "origin", origin)
    _git(work, "push", "-u", "origin", "master")

    # Clone it (this is the "deploy checkout" under test).
    subprocess.run(["git", "clone", origin, clone], check=True, capture_output=True)
    _git(clone, "config", "user.email", "test@example.com")
    _git(clone, "config", "user.name", "Test")
    _git(clone, "checkout", "master")

    head = _git(clone, "rev-parse", "HEAD")
    prev = _git(clone, "rev-parse", "HEAD~1")
    return clone, head, prev


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestScriptPresence:
    def test_script_exists_and_executable(self):
        assert os.path.isfile(DEPLOY_SH), "deploy.sh not found"
        assert os.access(DEPLOY_SH, os.X_OK), "deploy.sh is not executable"

    def test_bash_syntax_valid(self):
        result = subprocess.run(
            ["bash", "-n", DEPLOY_SH], capture_output=True, text=True, timeout=10,
        )
        assert result.returncode == 0, result.stderr


class TestDryRunFlow:
    def test_dry_run_reset_when_origin_ahead(self, repos):
        """origin/master ahead of HEAD → dry-run shows a hard reset, exit 0."""
        clone, head, prev = repos
        # Move the clone's HEAD back one commit so origin/master is ahead.
        _git(clone, "reset", "--hard", prev)
        result = _run_deploy(clone, ["--dry-run"])
        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "[dry-run] git" in result.stdout
        # Clean-checkout deploy = reset --hard to the target (replaces ff-merge).
        assert "reset --hard" in result.stdout

    def test_dry_run_pip_install_when_requirements_changed(self, repos):
        """A pending commit that touches requirements.txt → dry-run pip install."""
        clone, head, prev = repos
        # Build a new commit touching requirements on origin, then rewind the
        # clone behind it so the pending diff includes requirements.txt.
        with open(os.path.join(clone, "bmo", "pi", "requirements.txt"), "a") as f:
            f.write("requests==2.32.0\n")
        _git(clone, "add", "-A")
        _git(clone, "commit", "-m", "add requests to requirements")
        _git(clone, "push", "origin", "master")
        new_head = _git(clone, "rev-parse", "HEAD")
        # Rewind the clone behind the requirements commit.
        _git(clone, "reset", "--hard", head)
        result = _run_deploy(clone, ["--dry-run"])
        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "pip" in result.stdout and "install" in result.stdout
        assert "requirements.txt" in result.stdout
        assert new_head  # sanity

    def test_dry_run_already_deployed_when_target_is_head(self, repos):
        """TARGET == HEAD (deploy current HEAD) → 'already deployed', exit 0."""
        clone, head, prev = repos
        result = _run_deploy(clone, [head, "--dry-run"])
        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "already deployed" in result.stdout
        # No reset should be attempted.
        assert "reset --hard" not in result.stdout

    def test_services_only_emits_no_reset(self, repos):
        """--services-only restarts affected units only; never resets the tree."""
        clone, head, prev = repos
        # Rewind so the diff HEAD->origin/master touches bmo/pi/app.py.
        _git(clone, "reset", "--hard", prev)
        result = _run_deploy(clone, ["--services-only", "--dry-run"])
        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "reset --hard" not in result.stdout
        assert "pip" not in result.stdout
        # app.py is under bmo/pi/ → main service restart.
        assert "systemctl restart" in result.stdout


class TestGuardRails:
    def test_dirty_tree_is_discarded_not_blocking(self, repos):
        """A dirty deploy checkout NO LONGER blocks the deploy.

        The deploy checkout is deploy-owned and is hard-reset to the target, so an
        unexpected tracked modification is logged as a WARNING and discarded by the
        reset — it must NOT abort the deploy the way the old shared-tree gate did.
        """
        clone, head, prev = repos
        # Rewind so a real deploy (reset) would occur, then dirty a file that is
        # TRACKED at `prev` (README.md exists from the initial commit; app.py is
        # only added in the second commit, so it would be untracked at `prev`).
        _git(clone, "reset", "--hard", prev)
        with open(os.path.join(clone, "README.md"), "a") as f:
            f.write("dirty\n")
        result = _run_deploy(clone, ["--dry-run"])
        combined = result.stdout + result.stderr
        # Not blocked: exit 0, proceeds to the reset.
        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "reset --hard" in result.stdout
        # The anomaly is surfaced (diagnosis), but it is NOT a hard FAIL.
        assert "WARNING" in combined
        assert "FAIL" not in combined

    def test_non_ancestor_sha_aborts(self, repos):
        """A SHA that is not an ancestor of origin/master is refused."""
        clone, head, prev = repos
        # Create a sidetrack commit that is never pushed to origin/master.
        _git(clone, "checkout", "-b", "sidetrack")
        with open(os.path.join(clone, "bmo", "pi", "other.py"), "w") as f:
            f.write("x = 1\n")
        _git(clone, "add", "-A")
        _git(clone, "commit", "-m", "unpushed sidetrack commit")
        rogue = _git(clone, "rev-parse", "HEAD")
        _git(clone, "checkout", "master")
        result = _run_deploy(clone, [rogue, "--dry-run"])
        assert result.returncode != 0
        assert "FAIL" in (result.stdout + result.stderr)
        assert "ancestor" in (result.stdout + result.stderr)

    def test_invalid_sha_arg_aborts(self, repos):
        """A malformed TARGET_SHA arg is rejected by the regex gate."""
        clone, head, prev = repos
        result = _run_deploy(clone, ["zzzznothex", "--dry-run"])
        assert result.returncode != 0
        assert "FAIL" in (result.stdout + result.stderr)

    def test_unknown_flag_aborts(self, repos):
        clone, head, prev = repos
        result = _run_deploy(clone, ["--bogus", "--dry-run"])
        assert result.returncode != 0
        assert "FAIL" in (result.stdout + result.stderr)

    def test_missing_checkout_aborts(self, tmp_path):
        """A non-existent deploy checkout fails loudly (migration not run)."""
        missing = str(tmp_path / "no-such-checkout")
        result = _run_deploy(missing, ["--dry-run"])
        assert result.returncode != 0
        assert "FAIL" in (result.stdout + result.stderr)


class TestNoSideEffects:
    def test_dry_run_does_not_move_head(self, repos):
        """A dry-run must not actually reset the checkout."""
        clone, head, prev = repos
        _git(clone, "reset", "--hard", prev)
        before = _git(clone, "rev-parse", "HEAD")
        result = _run_deploy(clone, ["--dry-run"])
        after = _git(clone, "rev-parse", "HEAD")
        assert before == after, "dry-run moved HEAD (side effect!)"
        assert result.returncode == 0

    def test_dry_run_does_not_launch_canary(self, repos):
        """No deploy-canary.log should be created under --dry-run."""
        clone, head, prev = repos
        _git(clone, "reset", "--hard", prev)
        _run_deploy(clone, ["--dry-run"])
        canary_log = os.path.join(clone, "bmo", "pi", "data", "logs",
                                  "deploy-canary.log")
        assert not os.path.exists(canary_log), "dry-run launched the canary"
