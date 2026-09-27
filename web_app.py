"""Small local web UI for Qwen video analysis through a vLLM OpenAI API."""

import os
import re
import time
from pathlib import Path
from uuid import uuid4

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openai import APIConnectionError, APIStatusError, APITimeoutError, AsyncOpenAI


ROOT = Path(__file__).resolve().parent
VIDEO_DIR = Path(os.getenv("QWEN_VIDEO_DIR", str(Path.home() / "qwen38-vllm-video" / "videos"))).expanduser().resolve()
API_BASE_URL = os.getenv("QWEN_API_BASE_URL", "http://127.0.0.1:8000/v1").rstrip("/")
MODEL = os.getenv("QWEN_MODEL", "Qwen3.8-27B")
MAX_UPLOAD_MB = int(os.getenv("QWEN_MAX_UPLOAD_MB", "500"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

app = FastAPI(title="Qwen Video Desk", docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=ROOT / "web"), name="static")
client = AsyncOpenAI(base_url=API_BASE_URL, api_key="EMPTY", timeout=3600)


@app.get("/")
async def index():
    return FileResponse(ROOT / "web" / "index.html")


@app.get("/api/health")
async def health():
    try:
        async with httpx.AsyncClient(timeout=3) as http:
            response = await http.get(API_BASE_URL.removesuffix("/v1") + "/health")
        online = response.status_code == 200
    except httpx.HTTPError:
        online = False
    return {"online": online, "model": MODEL, "max_upload_mb": MAX_UPLOAD_MB}


@app.post("/api/analyze")
async def analyze(
    question: str = Form(...),
    video_url: str = Form(""),
    file: UploadFile | None = File(None),
):
    question = question.strip()
    video_url = video_url.strip()
    if not question:
        raise HTTPException(400, "请输入想问视频的问题。")
    if len(question) > 4000:
        raise HTTPException(400, "问题请控制在 4000 字以内。")
    if bool(file and file.filename) == bool(video_url):
        raise HTTPException(400, "请选择一个 MP4 文件，或填写一个视频 URL。")

    saved_file: Path | None = None
    source = video_url
    if file and file.filename:
        if Path(file.filename).suffix.lower() != ".mp4":
            raise HTTPException(400, "目前只支持 MP4 文件。")
        VIDEO_DIR.mkdir(parents=True, exist_ok=True)
        saved_file = VIDEO_DIR / f"upload-{uuid4().hex}.mp4"
        size = 0
        try:
            with saved_file.open("wb") as output:
                while chunk := await file.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_UPLOAD_BYTES:
                        raise HTTPException(413, f"文件不能超过 {MAX_UPLOAD_MB} MB。")
                    output.write(chunk)
            if size == 0:
                raise HTTPException(400, "视频文件为空。")
        except Exception:
            saved_file.unlink(missing_ok=True)
            raise
        source = saved_file.as_uri()
    elif not video_url.startswith(("https://", "http://")):
        raise HTTPException(400, "视频 URL 必须以 https:// 或 http:// 开头。")

    started = time.monotonic()
    try:
        result = await client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "请用纯文本回答，不使用 Markdown 标记。只描述视频中可观察到的内容；不要编造人物身份、动作或时间点。无法确定时请说明。",
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "video_url", "video_url": {"url": source}},
                        {"type": "text", "text": question},
                    ],
                }
            ],
            extra_body={"chat_template_kwargs": {"enable_thinking": False}},
            max_tokens=2048,
        )
        answer = result.choices[0].message.content or "模型没有返回正文，请换一种问法重试。"
        answer = re.sub(r"\*\*(.*?)\*\*", r"\1", answer, flags=re.DOTALL)
        return {"answer": answer, "seconds": round(time.monotonic() - started, 1), "model": MODEL}
    except (APIConnectionError, APITimeoutError) as exc:
        raise HTTPException(503, "连接模型服务失败，请确认 vLLM 已启动。") from exc
    except APIStatusError as exc:
        # vLLM can include raw frame arrays in a 400 response; never expose that payload.
        if exc.status_code == 400:
            raise HTTPException(400, "模型无法处理这段视频。请先试较短的 MP4，或换一个可直接访问的 URL。") from exc
        raise HTTPException(502, f"模型服务返回错误（HTTP {exc.status_code}）。") from exc
    finally:
        if saved_file is not None:
            saved_file.unlink(missing_ok=True)
        if file is not None:
            await file.close()
