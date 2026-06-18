"""Structural checks for the off-by-default BMO Docker deploy files.

Covers bmo/docker/{Dockerfile,compose.yml}, bmo/.dockerignore, and the
.github/workflows/bmo-docker-build.yml CI build. This is an OPTIONAL deploy
path: it is never wired into setup-bmo.sh/systemd (host venv stays the
default). These tests assert only that the files are internally consistent
and reference requirements files that actually exist.
"""

import re
from pathlib import Path

import yaml

# tests/ -> pi/ -> bmo/ -> repo root
REPO_ROOT = Path(__file__).resolve().parents[3]
BMO_DIR = REPO_ROOT / "bmo"
DOCKER_DIR = BMO_DIR / "docker"
DOCKERFILE = DOCKER_DIR / "Dockerfile"
COMPOSE = DOCKER_DIR / "compose.yml"
DOCKERIGNORE = BMO_DIR / ".dockerignore"
PI_DIR = BMO_DIR / "pi"
BUILD_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "bmo-docker-build.yml"


def _load_yaml(path: Path) -> dict:
    with path.open() as fh:
        return yaml.safe_load(fh)


def test_deploy_files_exist():
    assert DOCKERFILE.is_file()
    assert COMPOSE.is_file()
    assert DOCKERIGNORE.is_file()
    assert BUILD_WORKFLOW.is_file()


def test_compose_loads_and_pins_host_network_and_disabled_hardware():
    doc = _load_yaml(COMPOSE)
    svc = doc["services"]["bmo-app"]
    assert svc["network_mode"] == "host"
    env = svc["environment"]
    # Both hardware-disabling envs must be present so a container never tries
    # to init the OLED face or the camera (no devices passed through).
    assert env["BMO_DISABLE_OLED"] == "1"
    assert env["BMO_DISABLE_CAMERA"] == "1"


def test_dockerfile_references_only_existing_requirements():
    text = DOCKERFILE.read_text()

    # The COPY glob must match at least one real requirements file.
    assert "COPY pi/requirements*.txt" in text
    assert sorted(PI_DIR.glob("requirements*.txt")), "no pi/requirements*.txt found"

    # Collect every requirements file named in the Dockerfile and assert each
    # exists under bmo/pi/: the ARG default + the CI override.
    referenced = set()

    arg_match = re.search(r"ARG\s+REQUIREMENTS=(\S+)", text)
    assert arg_match, "no ARG REQUIREMENTS default in Dockerfile"
    referenced.add(arg_match.group(1))

    # CI override mentioned in the inline comment / used by the workflow.
    referenced.update(re.findall(r"requirements-[a-z]+\.txt", text))

    # And the override the build workflow actually passes.
    wf = _load_yaml(BUILD_WORKFLOW)
    for step in wf["jobs"]["build"]["steps"]:
        with_ = step.get("with") or {}
        build_args = with_.get("build-args")
        if build_args:
            for m in re.findall(r"REQUIREMENTS=(\S+)", str(build_args)):
                referenced.add(m)

    assert "requirements.txt" in referenced
    assert "requirements-ci.txt" in referenced
    for req in referenced:
        assert (PI_DIR / req).is_file(), f"{req} referenced but missing under bmo/pi/"


def test_dockerignore_excludes_venv():
    lines = {ln.strip() for ln in DOCKERIGNORE.read_text().splitlines()}
    assert "pi/venv/" in lines


def test_build_workflow_parses_and_does_not_push():
    wf = _load_yaml(BUILD_WORKFLOW)

    # PyYAML parses the bare `on:` key as the boolean True, not the string "on".
    on = wf.get(True, wf.get("on"))
    assert on is not None

    assert wf["permissions"] == {"contents": "read"}

    # The build-push step must explicitly disable push (build-only proof).
    push_steps = [
        s
        for s in wf["jobs"]["build"]["steps"]
        if "build-push-action" in str(s.get("uses", ""))
    ]
    assert push_steps, "no docker/build-push-action step found"
    assert push_steps[0]["with"]["push"] is False
