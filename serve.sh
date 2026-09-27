#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
MODEL_PATH="${MODEL_PATH:-$ROOT/model}"
VIDEO_DIR="${VIDEO_DIR:-$ROOT/videos}"
VENV_DIR="${VENV_DIR:-$ROOT/.venv}"
mkdir -p "$VIDEO_DIR"
export CUDA_HOME="${CUDA_HOME:-$VENV_DIR/lib/python3.12/site-packages/nvidia/cu13}"
export PATH="$VENV_DIR/bin:$CUDA_HOME/bin:$PATH"
export MAX_JOBS=1

# CUDA wheels can ship lib/ while FlashInfer's JIT expects lib64/.
if [[ -d "$CUDA_HOME/lib" && ! -e "$CUDA_HOME/lib64" ]]; then
  ln -s lib "$CUDA_HOME/lib64"
fi
if [[ -f "$CUDA_HOME/lib/libcudart.so.13" && ! -e "$CUDA_HOME/lib/libcudart.so" ]]; then
  ln -s libcudart.so.13 "$CUDA_HOME/lib/libcudart.so"
fi
if [[ -f /usr/lib/wsl/lib/libcuda.so ]]; then
  mkdir -p "$CUDA_HOME/lib/stubs"
  if [[ ! -e "$CUDA_HOME/lib/stubs/libcuda.so" ]]; then
    ln -s /usr/lib/wsl/lib/libcuda.so "$CUDA_HOME/lib/stubs/libcuda.so"
  fi
fi

exec "$VENV_DIR/bin/vllm" serve "$MODEL_PATH" \
  --served-model-name "${SERVED_MODEL_NAME:-Qwen3.8-27B}" \
  --host 0.0.0.0 \
  --port "${VLLM_PORT:-8000}" \
  --max-model-len "${MAX_MODEL_LEN:-32768}" \
  --kv-cache-dtype fp8 \
  --linear-backend cutlass \
  --enforce-eager \
  --reasoning-parser qwen3 \
  --allowed-local-media-path "$VIDEO_DIR" \
  --media-io-kwargs '{"video":{"num_frames":-1}}'
