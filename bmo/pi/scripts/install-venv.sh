#!/bin/bash
# Rebuild bmo/pi venv. Installs PyTorch from the official CPU index FIRST so Linux aarch64
# does not pull the CUDA+nvidia stack (~4+ GB) from PyPI — Pi 5 has no GPU.
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${1:-python3.11}"
test -f requirements.txt
rm -rf venv
"$PY" -m venv venv
venv/bin/pip install --upgrade pip
venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
venv/bin/pip install -r requirements.txt
echo "[install-venv] OK — $(du -sh venv | cut -f1). smoke test:"
venv/bin/python -c "import torch; import resemblyzer; assert not torch.cuda.is_available(); print('torch', torch.__version__, 'cpu-only OK')"
