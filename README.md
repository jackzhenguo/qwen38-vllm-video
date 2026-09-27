# Qwen Video Desk

一个给 **Qwen3.8-27B + vLLM** 用的本地视频分析网页。直接上传 MP4，或粘贴视频 URL，然后用中文提问。页面会显示模型连接状态、视频预览、分析进度和回答。

项目使用 FastAPI + 原生 HTML/CSS/JavaScript，不依赖前端构建工具。网页默认只监听 `127.0.0.1:7860`。

## 已验证环境

- Windows 11 + Ubuntu WSL2
- NVIDIA RTX 5090 32GB
- vLLM 0.30.0、Python 3.12、CUDA 13.0
- `unsloth/Qwen3.8-27B-NVFP4`，32K 上下文，FP8 KV 缓存
- 本地 MP4 上传和远程 MP4 URL 均已端到端验证

这个配置运行时约占 29.8GB 显存。模型权重和测试视频**不包含在仓库里**。

## 已有 vLLM 服务：只启动网页

先确保兼容 OpenAI Chat Completions 的 vLLM 服务运行在 `http://127.0.0.1:8000/v1`，模型名为 `Qwen3.8-27B`，支持 `video_url`。网页和 vLLM 必须能访问同一个视频目录；上传文件会在回答结束后自动删除。

```bash
git clone https://github.com/jackzhenguo/qwen38-vllm-video.git
cd qwen38-vllm-video
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-web.txt
mkdir -p videos
QWEN_VIDEO_DIR="$PWD/videos" .venv/bin/uvicorn web_app:app --host 127.0.0.1 --port 7860
```

打开 **http://localhost:7860**。

如果 API 地址或模型名不同，设置 `QWEN_API_BASE_URL` 和 `QWEN_MODEL`。`QWEN_MAX_UPLOAD_MB` 默认为 500。

## 从零在单张 RTX 5090 上部署

推荐在 Linux 或 WSL2 中执行。以下是本项目实际验证过的组合：

```bash
git clone https://github.com/jackzhenguo/qwen38-vllm-video.git ~/qwen38-vllm-video
cd ~/qwen38-vllm-video
uv python install 3.12
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python --torch-backend=cu130 'vllm==0.30.0' -r requirements-web.txt
```

在这套环境里，CUDA 运行库与编译器需要统一到 13.0：

```bash
uv pip install --python .venv/bin/python --torch-backend=cu130 --no-deps --force-reinstall \
  nvidia-cuda-nvcc==13.0.88 nvidia-cuda-crt==13.0.88 \
  nvidia-nvvm==13.0.88 nvidia-cuda-cccl==13.0.85 \
  nvidia-cuda-runtime==13.0.96

.venv/bin/hf download unsloth/Qwen3.8-27B-NVFP4 --local-dir model
./serve.sh
```

`serve.sh` 会设置 CUDA 编译器路径、限制首次 JIT 编译并发，并补齐 CUDA 轮子的库目录链接。模型首次加载和内核预热可能需要数分钟。另开终端启动网页：

```bash
cd ~/qwen38-vllm-video
.venv/bin/uvicorn web_app:app --host 127.0.0.1 --port 7860
```

在 WSL2 中，21.8GiB 权重可能超过默认内存上限。本机将 `%USERPROFILE%\.wslconfig` 设为：

```ini
[wsl2]
memory=24GB
swap=16GB
```

修改后运行 `wsl --shutdown` 生效。如果加载权重时仍报 `unable to mmap ... Cannot allocate memory`，可在 WSL 里运行 `sudo sysctl -w vm.overcommit_memory=1`；本机已把该设置写入 `/etc/sysctl.d/99-qwen38-vllm.conf`。

## Windows 使用

上面的 WSL 环境准备好后，PowerShell 中可用 `start-ui.ps1` 启动网页。它会自动找到当前项目在 WSL 中的路径，默认使用 WSL 用户目录下 `qwen38-vllm-video/.venv/bin/python`：

```powershell
& '.\start-ui.ps1'
```

也可以用命令行脚本分析 Windows 本地视频，它会复制一份到 WSL 的 `videos/` 目录：

```powershell
& '.\analyze-qwen38-video.ps1' -Video 'C:\path\to\video.mp4' -Question '这段视频发生了什么？'
```

Linux 命令行示例：

```bash
.venv/bin/python analyze_video.py 'https://example.com/video.mp4' --question '这段视频发生了什么？'
```

## 当前限制

- 网页上传支持 MP4；视频 URL 需要指向可直接访问的视频文件。
- 模型会由 vLLM 在服务端解码、采样视频帧。当前已验证默认采样方式；在这套 vLLM/Transformers 版本中，请求级 `mm_processor_kwargs.fps` 会触发处理器错误，因此界面没有开放帧率设置。
- 本项目验证的是**视频画面分析**；没有验证视频音轨的语音识别。
- 32K 是启动配置，不代表模型的原生上下文上限。可通过 `MAX_MODEL_LEN` 调整，但更高上限需要更多显存。

## 环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `QWEN_API_BASE_URL` | `http://127.0.0.1:8000/v1` | 网页连接的 vLLM API |
| `QWEN_MODEL` | `Qwen3.8-27B` | API 模型名 |
| `QWEN_VIDEO_DIR` | `~/qwen38-vllm-video/videos` | 网页暂存上传视频的目录，需与 vLLM 的允许目录一致 |
| `QWEN_MAX_UPLOAD_MB` | `500` | 单个上传文件大小上限 |
| `MODEL_PATH` | `./model` | `serve.sh` 加载的模型目录 |
| `VIDEO_DIR` | `./videos` | `serve.sh` 允许读取的本地媒体目录 |
| `MAX_MODEL_LEN` | `32768` | vLLM 上下文长度 |

代码使用 MIT License。Qwen 模型和量化权重有各自的许可，使用模型时请查看对应模型页面。
