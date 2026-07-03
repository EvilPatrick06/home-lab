"""Supply-chain pinning guards for the CI workflows (SECURITY 2026-07-02).

Two regressions these tests pin against:

1. Deploy workflows SSHing to the Pi with `StrictHostKeyChecking=accept-new`
   from EPHEMERAL runners — every run is "first use", so host-key verification
   never verified anything. The workflows must pre-seed the Pi's pinned host
   public keys and use strict checking.

2. security-audit.yml installing its scanners with floating constraints
   (`bandit[toml]>=`, unpinned pip-audit) — the blocking security gate would
   auto-adopt any newly published PyPI release. Installs must go through the
   hash-pinned, pip-compile'd manifest with --require-hashes.
"""

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
WORKFLOWS = REPO_ROOT / ".github" / "workflows"
BMO_DEPLOY = WORKFLOWS / "bmo-deploy.yml"
DND_WEB_DEPLOY = WORKFLOWS / "dnd-web-deploy.yml"
SECURITY_AUDIT = WORKFLOWS / "security-audit.yml"
AUDIT_REQS = REPO_ROOT / "bmo" / "pi" / "requirements-audit.txt"
AUDIT_REQS_IN = REPO_ROOT / "bmo" / "pi" / "requirements-audit.in"


def test_deploy_workflows_pin_the_pi_host_key():
    for wf in (BMO_DEPLOY, DND_WEB_DEPLOY):
        text = wf.read_text()
        assert "StrictHostKeyChecking=accept-new" not in text, f"{wf.name}: accept-new is TOFU on an ephemeral runner"
        assert "StrictHostKeyChecking=yes" in text, f"{wf.name}: strict host-key checking required"
        assert "known_hosts" in text, f"{wf.name}: must pre-seed known_hosts"
        # The pinned key for the tailnet name the workflows actually dial.
        assert "bmo.tail31b5d9.ts.net ssh-ed25519 " in text, f"{wf.name}: missing pinned ed25519 host key"


def test_security_audit_installs_are_hash_pinned():
    text = SECURITY_AUDIT.read_text()
    assert ">=" not in re.sub(r"#.*", "", text), "no floating version constraints in run steps"
    assert "pip install --require-hashes -r bmo/pi/requirements-audit.txt" in text
    # The old floating installs must not come back.
    assert "pip install 'bandit" not in text
    assert re.search(r"run:\s*\|?\s*pip install pip-audit", text) is None


def test_audit_requirements_manifest_is_hash_pinned():
    assert AUDIT_REQS_IN.is_file()
    text = AUDIT_REQS.read_text()
    assert re.search(r"^bandit\[toml\]==\d", text, re.M), "bandit must be exact-pinned"
    assert re.search(r"^pip-audit==\d", text, re.M), "pip-audit must be exact-pinned"
    assert text.count("--hash=sha256:") > 50, "manifest must carry artifact hashes"
    assert "piwheels" not in text, "ARM piwheels hashes must not leak into the x86 CI manifest"
