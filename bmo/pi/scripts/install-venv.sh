#!/bin/bash
# Rebuild bmo/pi venv. Installs PyTorch from the official CPU index FIRST so Linux aarch64
# does not pull the CUDA+nvidia stack (~4+ GB) from PyPI — Pi 5 has no GPU.
set -euo pipefail
cd "$(dirname "$0")/.."
# Interpreter selection. An explicit arg wins. Otherwise prefer the pinned
# .python-version interpreter, but fall back to the newest python3.x actually
# present on this host so a Pi without python3.14 (BMO-ISSUES 2026-07-15) still
# rebuilds instead of dying on "python3.14: command not found". The interpreter/
# lockfile skew itself is tracked separately (owner decision); this only stops
# the hard default from breaking a documented venv rebuild.
pick_python() {
  local pinned="python3.14"
  [ -f .python-version ] && pinned="python$(sed -n '1p' .python-version | tr -d '[:space:]')"
  local cand
  for cand in "$pinned" python3.14 python3.13 python3.12 python3.11 python3; do
    if command -v "$cand" >/dev/null 2>&1; then echo "$cand"; return 0; fi
  done
  echo "python3"
}
PY="${1:-$(pick_python)}"
echo "[install-venv] using interpreter: $PY ($("$PY" --version 2>&1 || echo unavailable))"
test -f requirements.txt
rm -rf venv
"$PY" -m venv venv
venv/bin/pip install --upgrade pip
venv/bin/pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
venv/bin/pip install -r requirements.txt
# openwakeword pulls the abandoned tflite-runtime (no py3.12+ wheel) as a hard
# dep, but bmo runs it onnx-only; install it without deps (its real deps are in
# requirements.txt).
venv/bin/pip install --no-deps openwakeword==0.6.0
# Download openwakeword default ONNX wake models so wake-word detection can load.
# Without them the voice pipeline silently degrades to the energy+STT fallback
# (BMO-ISSUES 2026-06-22). Best-effort: never fail the install when offline.
echo "[install-venv] downloading openwakeword models (best-effort)..."
venv/bin/python -c "import openwakeword.utils as u; u.download_models()" \
  || echo "[install-venv] WARN: openwakeword model download skipped (offline?) — wake uses energy+STT fallback"
echo "[install-venv] OK — $(du -sh venv | cut -f1). smoke test:"
venv/bin/python -c "import torch; import resemblyzer; assert not torch.cuda.is_available(); print('torch', torch.__version__, 'cpu-only OK')"
