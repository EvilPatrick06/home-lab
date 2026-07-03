"""win_proxy._safe_path containment (SECURITY-LOG 2026-07-02).

The old bare startswith(root) admitted sibling directories sharing the
root's leading string (root C:\\Users\\evilp let C:\\Users\\evilp-backup
through); containment is now asserted at a path-component boundary.
"""

import importlib.util
import os

import pytest

_SPEC = importlib.util.spec_from_file_location(
    "win_proxy",
    os.path.join(os.path.dirname(__file__), "..", "scripts", "win_proxy.py"),
)
win_proxy = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(win_proxy)


def _proxy(root):
    p = win_proxy.WindowsProxy.__new__(win_proxy.WindowsProxy)
    p.root = os.path.abspath(str(root))
    return p


def test_path_inside_root_allowed(tmp_path):
    p = _proxy(tmp_path)
    want = os.path.abspath(str(tmp_path / "sub" / "f.txt"))
    assert p._safe_path(str(tmp_path / "sub" / "f.txt")) == want


def test_relative_path_resolves_inside_root(tmp_path):
    p = _proxy(tmp_path)
    assert p._safe_path("f.txt") == os.path.join(os.path.abspath(str(tmp_path)), "f.txt")


def test_sibling_prefix_dir_rejected(tmp_path):
    root = tmp_path / "evilp"
    p = _proxy(root)
    with pytest.raises(ValueError):
        p._safe_path(str(tmp_path / "evilp-backup" / "secret.txt"))


def test_dotdot_escape_rejected(tmp_path):
    root = tmp_path / "evilp"
    p = _proxy(root)
    with pytest.raises(ValueError):
        p._safe_path(os.path.join("..", "outside.txt"))


def test_root_itself_allowed(tmp_path):
    p = _proxy(tmp_path)
    assert p._safe_path(str(tmp_path)) == os.path.abspath(str(tmp_path))
