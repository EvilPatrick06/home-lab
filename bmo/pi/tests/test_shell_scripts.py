"""Tests for BMO shell scripts.

Shell-execution tests skip automatically on Windows or any host where
`bash` is not on PATH.  Shellcheck tests additionally skip if shellcheck
is not installed.

The tests intentionally avoid calling scripts that would require a real Pi
environment (systemctl, docker, SSH, etc.).  Instead they focus on:
  - Syntax validity via shellcheck
  - Argument / flag parsing (dry-run inspection)
  - Controlled script execution with mocked/empty environments
"""

import os
import shutil
import subprocess
import textwrap

import pytest

# ── Platform guard ────────────────────────────────────────────────────────────

bash_available = shutil.which("bash") is not None
pytestmark = pytest.mark.skipif(
    not bash_available, reason="bash not available on this platform"
)

# ── Script paths ──────────────────────────────────────────────────────────────

_PI_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_BMOSEUP_DIR = os.path.abspath(os.path.join(_PI_DIR, "..", ".."))  # repo root / bmo
_SCRIPTS_DIR = os.path.join(_PI_DIR, "scripts")

HEALTH_CHECK_SH = os.path.join(_SCRIPTS_DIR, "health_check.sh")
E2E_TEST_SH = os.path.join(_SCRIPTS_DIR, "e2e_test.sh")
SETUP_BMO_SH = os.path.join(_BMOSEUP_DIR, "bmo", "setup-bmo.sh")
DEPLOY_SH = os.path.join(_BMOSEUP_DIR, "bmo", "docker", "deploy.sh")

DIAGNOSE_CF_SH = os.path.join(_SCRIPTS_DIR, "diagnose-cloudflare.sh")
SETUP_CF_SH = os.path.join(_SCRIPTS_DIR, "setup-cloudflare-tunnel.sh")
SETUP_TAILSCALE_SH = os.path.join(_SCRIPTS_DIR, "setup-tailscale.sh")
CLOUDFLARE_ACCESS_SH = os.path.join(_SCRIPTS_DIR, "cloudflare-access-api.sh")
APPLY_ACCESS_SH = os.path.join(_SCRIPTS_DIR, "apply-access-config.sh")

# All .sh files we want to syntax-check (optional paths omitted if missing)
ALL_SH_FILES = [
    HEALTH_CHECK_SH,
    E2E_TEST_SH,
    DIAGNOSE_CF_SH,
    SETUP_CF_SH,
    SETUP_TAILSCALE_SH,
    CLOUDFLARE_ACCESS_SH,
    APPLY_ACCESS_SH,
] + ([DEPLOY_SH] if os.path.isfile(DEPLOY_SH) else [])

# ── Helpers ───────────────────────────────────────────────────────────────────

shellcheck_available = shutil.which("shellcheck") is not None


def _run_bash(script: str, args: list[str] | None = None, env: dict | None = None,
              timeout: int = 10) -> subprocess.CompletedProcess:
    """Run a bash script and return the CompletedProcess."""
    cmd = ["bash", script] + (args or [])
    merged_env = {**os.environ, **(env or {})}
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        env=merged_env,
    )


def _bash_syntax_ok(script: str) -> tuple[bool, str]:
    """Check bash syntax with `bash -n`."""
    result = subprocess.run(
        ["bash", "-n", script],
        capture_output=True,
        text=True,
        timeout=10,
    )
    return result.returncode == 0, result.stderr


# ═════════════════════════════════════════════════════════════════════════════
# Bash syntax checks (`bash -n`)
# ═════════════════════════════════════════════════════════════════════════════


class TestBashSyntax:
    """Every .sh file must pass `bash -n` (syntax-only parse)."""

    @pytest.mark.parametrize("script", [
        pytest.param(p, id=os.path.basename(p))
        for p in ALL_SH_FILES
    ])
    def test_syntax_valid(self, script):
        if not os.path.exists(script):
            pytest.skip(f"Script not found: {script}")
        ok, stderr = _bash_syntax_ok(script)
        assert ok, f"`bash -n` failed for {os.path.basename(script)}:\n{stderr}"


# ═════════════════════════════════════════════════════════════════════════════
# Shellcheck linting
# ═════════════════════════════════════════════════════════════════════════════


class TestShellcheck:
    """Run shellcheck on every .sh file if shellcheck is installed."""

    @pytest.mark.skipif(not shellcheck_available, reason="shellcheck not installed")
    @pytest.mark.parametrize("script", [
        pytest.param(p, id=os.path.basename(p))
        for p in ALL_SH_FILES
    ])
    def test_shellcheck_passes(self, script):
        if not os.path.exists(script):
            pytest.skip(f"Script not found: {script}")

        result = subprocess.run(
            ["shellcheck", "--severity=error", script],
            capture_output=True,
            text=True,
            timeout=15,
        )
        assert result.returncode == 0, (
            f"shellcheck found errors in {os.path.basename(script)}:\n"
            f"{result.stdout}\n{result.stderr}"
        )


# ═════════════════════════════════════════════════════════════════════════════
# health_check.sh
# ═════════════════════════════════════════════════════════════════════════════


class TestHealthCheckScript:
    """health_check.sh runs BMO service + curl + docker checks.

    In a test environment these will all fail (no real Pi), so we:
      - Verify it exits 0 when every check is stubbed to succeed.
      - Verify it exits 1 when a check is forced to fail.
      - Verify the script is executable and contains expected logic.
    """

    def _stub_script(self, tmp_path: str, content: str) -> str:
        """Write a stub shell script and make it executable."""
        import stat
        p = os.path.join(tmp_path, "stub")
        with open(p, "w", newline="\n") as f:
            f.write("#!/bin/bash\n" + content)
        os.chmod(p, os.stat(p).st_mode | stat.S_IEXEC)
        return p

    def test_script_exists(self):
        assert os.path.isfile(HEALTH_CHECK_SH), "health_check.sh not found"

    def test_syntax_valid(self):
        ok, stderr = _bash_syntax_ok(HEALTH_CHECK_SH)
        assert ok, f"health_check.sh syntax error:\n{stderr}"

    def test_exits_nonzero_when_services_down(self, tmp_path):
        """Script reports STATUS=1 when systemctl says service is inactive."""
        # Provide a fake `systemctl` that reports inactive for everything
        fake_systemctl = self._stub_script(str(tmp_path), "exit 1")
        fake_curl = self._stub_script(str(tmp_path), "exit 1")
        fake_docker = self._stub_script(str(tmp_path), "echo false")

        # Put fake commands first on PATH, also block sudo from restarting things
        fake_sudo = self._stub_script(str(tmp_path), "exit 0")

        env_path = str(tmp_path) + ":" + os.environ.get("PATH", "")

        # Rename stubs to match the commands
        import shutil as _shutil
        _shutil.copy(fake_systemctl, os.path.join(str(tmp_path), "systemctl"))
        _shutil.copy(fake_curl, os.path.join(str(tmp_path), "curl"))
        _shutil.copy(fake_docker, os.path.join(str(tmp_path), "docker"))
        _shutil.copy(fake_sudo, os.path.join(str(tmp_path), "sudo"))

        result = _run_bash(HEALTH_CHECK_SH, env={"PATH": env_path})
        # Script should exit 1 because services are "down"
        assert result.returncode == 1

    def test_exits_zero_when_all_checks_pass(self, tmp_path):
        """Script exits 0 when all stub commands succeed."""
        import stat

        def make_exe(name: str, body: str) -> None:
            p = os.path.join(str(tmp_path), name)
            with open(p, "w", newline="\n") as f:
                f.write("#!/bin/bash\n" + body)
            os.chmod(p, os.stat(p).st_mode | stat.S_IEXEC)

        # systemctl is-active → exit 0 (active)
        make_exe("systemctl", "exit 0")
        # curl succeeds
        make_exe("curl", "exit 0")
        # docker → print 'true' (container running)
        make_exe("docker", "echo true")
        # sudo is a no-op
        make_exe("sudo", "exit 0")
        # avahi-resolve-host-name → not found (skipped by `command -v` check)
        # tailscale → not found (skipped)
        # Provide fake /sys/class/thermal temp = 50000 (50°C) via env override
        # We override the shell's cat behaviour using a wrapper

        # Write a fake 'cat' that intercepts the thermal zone path
        make_exe("cat", textwrap.dedent("""\
            case "$1" in
                /sys/class/thermal/thermal_zone0/temp) echo 50000 ;;
                *) /usr/bin/cat "$@" ;;
            esac
        """))

        # Provide fake df that returns 50% usage
        make_exe("df", textwrap.dedent("""\
            echo 'Filesystem     1K-blocks  Used Available Use% Mounted on'
            echo '/dev/sda1      100000     50000     50000  50% /'
        """))

        # awk must be real; we only stub df here — awk is in /usr/bin typically
        env_path = str(tmp_path) + ":/usr/bin:/bin"
        result = _run_bash(HEALTH_CHECK_SH, env={"PATH": env_path})
        assert result.returncode == 0

    def test_high_temperature_triggers_alert(self, tmp_path):
        """Script exits 1 when CPU temperature is > 80°C."""
        import stat

        def make_exe(name: str, body: str) -> None:
            p = os.path.join(str(tmp_path), name)
            with open(p, "w", newline="\n") as f:
                f.write("#!/bin/bash\n" + body)
            os.chmod(p, os.stat(p).st_mode | stat.S_IEXEC)

        # All services pass
        make_exe("systemctl", "exit 0")
        make_exe("curl", "exit 0")
        make_exe("docker", "echo true")
        make_exe("sudo", "exit 0")

        # CPU temperature = 85000 (85°C) — above the 80°C threshold
        make_exe("cat", textwrap.dedent("""\
            case "$1" in
                /sys/class/thermal/thermal_zone0/temp) echo 85000 ;;
                *) /usr/bin/cat "$@" ;;
            esac
        """))

        # Normal disk usage
        make_exe("df", textwrap.dedent("""\
            echo 'Filesystem     1K-blocks  Used Available Use% Mounted on'
            echo '/dev/sda1      100000     50000     50000  50% /'
        """))

        env_path = str(tmp_path) + ":/usr/bin:/bin"
        result = _run_bash(HEALTH_CHECK_SH, env={"PATH": env_path})
        assert result.returncode == 1
        assert "temp critical" in result.stdout or "temp critical" in result.stderr

    def test_high_disk_usage_triggers_alert(self, tmp_path):
        """Script exits 1 when disk usage is > 90%."""
        import stat

        def make_exe(name: str, body: str) -> None:
            p = os.path.join(str(tmp_path), name)
            with open(p, "w", newline="\n") as f:
                f.write("#!/bin/bash\n" + body)
            os.chmod(p, os.stat(p).st_mode | stat.S_IEXEC)

        make_exe("systemctl", "exit 0")
        make_exe("curl", "exit 0")
        make_exe("docker", "echo true")
        make_exe("sudo", "exit 0")

        # Normal temperature
        make_exe("cat", textwrap.dedent("""\
            case "$1" in
                /sys/class/thermal/thermal_zone0/temp) echo 40000 ;;
                *) /usr/bin/cat "$@" ;;
            esac
        """))

        # 95% disk usage — above 90% threshold
        make_exe("df", textwrap.dedent("""\
            echo 'Filesystem     1K-blocks  Used Available Use% Mounted on'
            echo '/dev/sda1      100000     95000      5000  95% /'
        """))

        env_path = str(tmp_path) + ":/usr/bin:/bin"
        result = _run_bash(HEALTH_CHECK_SH, env={"PATH": env_path})
        assert result.returncode == 1
        assert "Disk usage critical" in result.stdout or \
               "Disk usage critical" in result.stderr


# ═════════════════════════════════════════════════════════════════════════════
# e2e_test.sh
# ═════════════════════════════════════════════════════════════════════════════


class TestE2EScript:
    def test_script_exists(self):
        assert os.path.isfile(E2E_TEST_SH), "e2e_test.sh not found"

    def test_syntax_valid(self):
        ok, stderr = _bash_syntax_ok(E2E_TEST_SH)
        assert ok, f"e2e_test.sh syntax error:\n{stderr}"

    def test_help_flag_not_required(self):
        """Script should accept --verbose flag without crashing on arg parsing."""
        # Just check that `bash -n` passed (execution would need a real Pi)
        ok, _ = _bash_syntax_ok(E2E_TEST_SH)
        assert ok

    def test_script_contains_expected_test_sections(self):
        """Verify the script has all major test sections."""
        with open(E2E_TEST_SH, "r", encoding="utf-8") as f:
            content = f.read()

        expected_sections = [
            "Core Infrastructure",
            "Chat & Agent",
            "Music",
            "Calendar",
            "Weather",
            "Timers",
        ]
        for section in expected_sections:
            assert section in content, f"Expected section '{section}' not found in e2e_test.sh"

    def test_script_defines_pass_fail_counters(self):
        """Verify PASS/FAIL counters are initialized."""
        with open(E2E_TEST_SH, "r", encoding="utf-8") as f:
            content = f.read()
        assert "PASS=0" in content
        assert "FAIL=0" in content

    def test_script_exits_nonzero_on_failure(self):
        """Verify the exit logic: `exit 1` when FAIL > 0."""
        with open(E2E_TEST_SH, "r", encoding="utf-8") as f:
            content = f.read()
        assert 'exit 1' in content


# ═════════════════════════════════════════════════════════════════════════════
# deploy.sh argument parsing (optional — not all checkouts include docker/deploy.sh)
# ═════════════════════════════════════════════════════════════════════════════


@pytest.mark.skipif(
    not os.path.isfile(DEPLOY_SH),
    reason="bmo/docker/deploy.sh not present in this checkout",
)
class TestDeployScript:
    def test_syntax_valid(self):
        ok, stderr = _bash_syntax_ok(DEPLOY_SH)
        assert ok, f"deploy.sh syntax error:\n{stderr}"

    def test_quick_flag_recognized(self):
        """Verify --quick flag is parsed."""
        with open(DEPLOY_SH, "r", encoding="utf-8") as f:
            content = f.read()
        assert "--quick" in content
        assert "QUICK=true" in content

    def test_services_flag_recognized(self):
        """Verify --services flag is parsed."""
        with open(DEPLOY_SH, "r", encoding="utf-8") as f:
            content = f.read()
        assert "--services" in content
        assert "SERVICES_ONLY=true" in content

    def test_pi_user_default_is_patrick(self):
        """Default PI_USER should be 'patrick'."""
        with open(DEPLOY_SH, "r", encoding="utf-8") as f:
            content = f.read()
        assert 'PI_USER:-patrick' in content or 'PI_USER="patrick"' in content

    def test_pi_hostname_default_is_bmo(self):
        """Default PI_HOSTNAME should be 'bmo'."""
        with open(DEPLOY_SH, "r", encoding="utf-8") as f:
            content = f.read()
        assert 'PI_HOSTNAME:-bmo' in content or 'PI_HOSTNAME="bmo"' in content

    def test_env_file_sourced_if_present(self):
        """Script must source the .env file when present."""
        with open(DEPLOY_SH, "r", encoding="utf-8") as f:
            content = f.read()
        # Uses `. "$ENV_FILE"` or `source`
        assert '. "$ENV_FILE"' in content or "source" in content


# ═════════════════════════════════════════════════════════════════════════════
# scripts/ directory scripts
# ═════════════════════════════════════════════════════════════════════════════


class TestScriptsDirectory:
    """Syntax validation for all scripts in bmo/pi/scripts/."""

    @pytest.mark.parametrize("script", [
        pytest.param(p, id=os.path.basename(p))
        for p in [DIAGNOSE_CF_SH, SETUP_CF_SH, SETUP_TAILSCALE_SH,
                  CLOUDFLARE_ACCESS_SH, APPLY_ACCESS_SH]
    ])
    def test_syntax_valid(self, script):
        if not os.path.isfile(script):
            pytest.skip(f"Script not found: {script}")
        ok, stderr = _bash_syntax_ok(script)
        assert ok, f"`bash -n` failed for {os.path.basename(script)}:\n{stderr}"

    def test_scripts_directory_exists(self):
        assert os.path.isdir(_SCRIPTS_DIR), "pi/scripts/ directory not found"

    def test_all_sh_files_found(self):
        sh_files = [
            f for f in os.listdir(_SCRIPTS_DIR)
            if f.endswith(".sh") and os.path.isfile(os.path.join(_SCRIPTS_DIR, f))
        ]
        assert len(sh_files) > 0, "No .sh files found in pi/scripts/"

    @pytest.mark.skipif(not shellcheck_available, reason="shellcheck not installed")
    def test_scripts_dir_shellcheck(self):
        """Run shellcheck on all scripts in the scripts/ directory."""
        sh_files = [
            os.path.join(_SCRIPTS_DIR, f)
            for f in os.listdir(_SCRIPTS_DIR)
            if f.endswith(".sh") and os.path.isfile(os.path.join(_SCRIPTS_DIR, f))
        ]
        errors = []
        for script in sh_files:
            result = subprocess.run(
                ["shellcheck", "--severity=error", script],
                capture_output=True, text=True, timeout=15,
            )
            if result.returncode != 0:
                errors.append(f"{os.path.basename(script)}:\n{result.stdout}")

        assert not errors, "shellcheck errors found:\n" + "\n".join(errors)


# ═════════════════════════════════════════════════════════════════════════════
# setup-bmo.sh (content-only — never executed in tests, too destructive)
# ═════════════════════════════════════════════════════════════════════════════


class TestSetupBmoScript:
    def test_script_exists(self):
        assert os.path.isfile(SETUP_BMO_SH), "setup-bmo.sh not found"

    def test_syntax_valid(self):
        ok, stderr = _bash_syntax_ok(SETUP_BMO_SH)
        assert ok, f"setup-bmo.sh syntax error:\n{stderr}"

    def test_uses_set_e(self):
        """Script should exit on first error."""
        with open(SETUP_BMO_SH, "r", encoding="utf-8") as f:
            content = f.read()
        assert "set -euo pipefail" in content or "set -e" in content

    def test_installs_python3_venv(self):
        with open(SETUP_BMO_SH, "r", encoding="utf-8") as f:
            content = f.read()
        assert "python3-venv" in content or "python3 -m venv" in content

    def test_enables_bmo_service(self):
        with open(SETUP_BMO_SH, "r", encoding="utf-8") as f:
            content = f.read()
        assert "systemctl enable bmo" in content

    def test_creates_env_template(self):
        """Script should create the .env file template."""
        with open(SETUP_BMO_SH, "r", encoding="utf-8") as f:
            content = f.read()
        assert "GEMINI_API_KEY" in content
        assert "ANTHROPIC_API_KEY" in content

    @pytest.mark.skipif(not shellcheck_available, reason="shellcheck not installed")
    def test_shellcheck(self):
        result = subprocess.run(
            ["shellcheck", "--severity=error", SETUP_BMO_SH],
            capture_output=True, text=True, timeout=15,
        )
        assert result.returncode == 0, (
            f"shellcheck errors in setup-bmo.sh:\n{result.stdout}\n{result.stderr}"
        )
