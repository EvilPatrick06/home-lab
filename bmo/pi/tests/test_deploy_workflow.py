"""Structural checks for the bmo deploy CI workflow.

Scoped to .github/workflows/bmo-deploy.yml ONLY. A sibling sub-phase owns
bmo-docker-build.yml and its assertions.
"""

from pathlib import Path

import yaml

# tests/ -> pi/ -> bmo/ -> repo root
REPO_ROOT = Path(__file__).resolve().parents[3]
DEPLOY_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "bmo-deploy.yml"
PYTEST_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "bmo-pi-pytest.yml"
DEPLOY_SCRIPT = REPO_ROOT / "bmo" / "pi" / "scripts" / "deploy.sh"


def _load(path: Path) -> dict:
    with path.open() as fh:
        return yaml.safe_load(fh)


def test_workflow_files_exist():
    assert DEPLOY_WORKFLOW.is_file()
    assert PYTEST_WORKFLOW.is_file()


def test_workflow_run_matches_pytest_workflow_name():
    deploy = _load(DEPLOY_WORKFLOW)
    pytest_wf = _load(PYTEST_WORKFLOW)
    pytest_name = pytest_wf["name"]
    # PyYAML parses the bare `on:` key as the boolean True, not the string "on".
    on = deploy.get(True, deploy.get("on"))
    assert on["workflow_run"]["workflows"] == [pytest_name]


def test_permissions_are_contents_read_only():
    deploy = _load(DEPLOY_WORKFLOW)
    assert deploy["permissions"] == {"contents": "read"}


def test_gate_if_guards_branch_event_and_opt_in():
    deploy = _load(DEPLOY_WORKFLOW)
    gate_if = deploy["jobs"]["gate"]["if"]
    assert "head_branch == 'master'" in gate_if
    assert ".event ==" in gate_if  # workflow_run.event == 'push'
    assert "vars.BMO_AUTO_DEPLOY" in gate_if


def test_deploy_step_references_tag_and_deploy_script():
    deploy = _load(DEPLOY_WORKFLOW)
    steps = deploy["jobs"]["deploy"]["steps"]
    text = yaml.safe_dump(steps)
    assert "tag:ci" in text
    assert "/home/patrick/home-lab/bmo/pi/scripts/deploy.sh" in text


def test_deploy_script_exists_in_repo():
    assert DEPLOY_SCRIPT.is_file()
