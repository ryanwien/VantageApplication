#!/usr/bin/env bash
# ============================================================================
# Vantage — AMD Radeon Cloud one-shot setup (Track 2, AMD AI DevMaster)
# Run inside a Radeon Cloud instance (JupyterLab terminal or SSH):
#   bash scripts/radeon-setup.sh
# Installs Ollama (ROCm backend) + llama3.1, serves it with the browser
# origin allowed, installs Node 20, and starts Vantage. Then open:
#   http://127.0.0.1:5173/?local=1
# From your laptop, tunnel first:  ssh -L 5173:localhost:5173 <user>@<host> -p <port>
# ============================================================================
set -euo pipefail

step() { printf '\n\033[1;33m== %s ==\033[0m\n' "$*"; }

step "0/6 GPU sanity — ROCm must see the Radeon"
if command -v rocm-smi >/dev/null 2>&1; then
  rocm-smi || true
else
  echo "WARNING: rocm-smi not found — pick a ROCm container image for the instance template."
fi

step "1/6 Install Ollama (uses ROCm on Radeon automatically)"
if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh
fi
ollama --version

step "2/6 Serve Ollama with the browser origin allowed"
pkill -f "ollama serve" 2>/dev/null || true
sleep 1
OLLAMA_ORIGINS='*' nohup ollama serve > /tmp/ollama.log 2>&1 &
sleep 3
curl -sf http://localhost:11434/api/tags >/dev/null && echo "ollama serving on :11434"

step "3/6 Pull the model (llama3.1 8B Q4_K_M — ~4.9 GB, one-time)"
ollama pull llama3.1
# Optional latency-demo model (~1.3 GB):  ollama pull llama3.2:1b

step "4/6 Node 20 (Vantage needs Node 20+)"
if ! command -v node >/dev/null 2>&1 || [ "$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node --version

step "5/6 Install deps + start Vantage"
npm install
nohup npm run dev -- --host 0.0.0.0 --port 5173 > /tmp/vantage.log 2>&1 &
sleep 5
curl -sf -o /dev/null http://localhost:5173/ && echo "Vantage serving on :5173"

step "6/6 PROOF — the demo claim depends on this line reading '100% GPU'"
curl -s http://localhost:11434/api/chat -d '{"model":"llama3.1","stream":false,"messages":[{"role":"user","content":"say OK"}]}' >/dev/null
ollama ps
echo
echo "Capture for the submission:  ollama ps   +   rocm-smi   (during a query)"
echo "Then open:  http://127.0.0.1:5173/?local=1   (tunnel: ssh -L 5173:localhost:5173 <user>@<host> -p <port>)"
echo "If PROCESSOR says CPU: ROCm is not engaged — see README 'Run on AMD Radeon / ROCm' troubleshooting."
echo "vLLM instead of Ollama?  vllm serve <model> --host 0.0.0.0 --port 8000  then open ?local=vllm (auto-detects the model)."
