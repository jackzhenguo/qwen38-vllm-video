"""Small local web UI for Qwen video analysis through a vLLM OpenAI API."""

import os
import re
import sqlite3
import time
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openai import APIConnectionError, APIStatusError, APITimeoutError, AsyncOpenAI


ROOT = Path(__file__).resolve().parent
VIDEO_DIR = Path(os.getenv("QWEN_VIDEO_DIR", str(Path.home() / "qwen38-vllm-video" / "videos"))).expanduser().resolve()
HISTORY_DB = Path(os.getenv("QWEN_HISTORY_DB", str(Path.home() / "qwen38-vllm-video" / "history.sqlite3"))).expanduser().resolve()
API_BASE_URL = os.getenv("QWEN_API_BASE_URL", "http://127.0.0.1:8000/v1").rstrip("/")
MODEL = os.getenv("QWEN_MODEL", "Qwen3.8-27B")
MAX_UPLOAD_MB = int(os.getenv("QWEN_MAX_UPLOAD_MB", "500"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

app = FastAPI(title="Qwen Video Desk", docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=ROOT / "web"), name="static")
client = AsyncOpenAI(base_url=API_BASE_URL, api_key="EMPTY", timeout=3600)


def connect_history():
    HISTORY_DB.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(HISTORY_DB, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("""
        CREATE TABLE IF NOT EXISTS analyses (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            source_type TEXT NOT NULL,
            video_path TEXT,
            video_url TEXT,
            filename TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            seconds REAL NOT NULL,
            model TEXT NOT NULL
        )
    """)
    return connection


def get_record(record_id: str):
    with closing(connect_history()) as db:
        row = db.execute("SELECT * FROM analyses WHERE id = ?", (record_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "历史记录不存在。")
    return dict(row)


def local_video_path(record):
    path = Path(record["video_path"]).resolve()
    if not path.is_relative_to(VIDEO_DIR) or not path.is_file():
        raise HTTPException(404, "本地视频文件已不存在。")
    return path


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


@app.get("/api/history")
async def list_history():
    with closing(connect_history()) as db:
        rows = db.execute(
            "SELECT id, created_at, source_type, filename, question, answer, seconds, model "
            "FROM analyses ORDER BY created_at DESC LIMIT 100"
        ).fetchall()
    return {"items": [dict(row) for row in rows]}


@app.get("/api/history/{record_id}")
async def history_detail(record_id: str):
    record = get_record(record_id)
    record["video_path"] = None
    record["video_src"] = f"/api/history/{record_id}/video" if record["source_type"] == "upload" else record["video_url"]
    return record


@app.get("/api/history/{record_id}/video")
async def history_video(record_id: str):
    record = get_record(record_id)
    if record["source_type"] != "upload":
        raise HTTPException(404, "这条记录使用的是视频 URL。")
    return FileResponse(local_video_path(record), media_type="video/mp4", filename=record["filename"], content_disposition_type="inline")


@app.delete("/api/history/{record_id}")
async def delete_history(record_id: str):
    record = get_record(record_id)
    with closing(connect_history()) as db:
        db.execute("DELETE FROM analyses WHERE id = ?", (record_id,))
        remaining = db.execute(
            "SELECT COUNT(*) FROM analyses WHERE video_path = ?", (record["video_path"],)
        ).fetchone()[0] if record["video_path"] else 0
        db.commit()
    if record["video_path"] and remaining == 0:
        path = Path(record["video_path"]).resolve()
        if path.is_relative_to(VIDEO_DIR):
            path.unlink(missing_ok=True)
    return {"deleted": True}


@app.post("/api/analyze")
async def analyze(
    question: str = Form(...),
    video_url: str = Form(""),
    history_id: str = Form(""),
    save_history: bool = Form(True),
    file: UploadFile | None = File(None),
):
    question = question.strip()
    video_url = video_url.strip()
    history_id = history_id.strip()
    if not question:
        raise HTTPException(400, "请输入想问视频的问题。")
    if len(question) > 4000:
        raise HTTPException(400, "问题请控制在 4000 字以内。")
    if sum((bool(file and file.filename), bool(video_url), bool(history_id))) != 1:
        raise HTTPException(400, "请选择一个 MP4 文件、视频 URL 或历史视频。")

    saved_file: Path | None = None
    keep_uploaded = False
    source_type = "url"
    filename = video_url
    stored_path = None
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
        source_type = "upload"
        filename = Path(file.filename).name
        stored_path = str(saved_file)
    elif history_id:
        previous = get_record(history_id)
        source_type = previous["source_type"]
        filename = previous["filename"]
        stored_path = previous["video_path"]
        video_url = previous["video_url"] or ""
        source = local_video_path(previous).as_uri() if source_type == "upload" else video_url
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
        seconds = round(time.monotonic() - started, 1)
        record_id = None
        if save_history:
            record_id = uuid4().hex
            with closing(connect_history()) as db:
                db.execute(
                    "INSERT INTO analyses VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (record_id, datetime.now(timezone.utc).isoformat(), source_type,
                     stored_path, video_url or None, filename, question, answer, seconds, MODEL),
                )
                db.commit()
            keep_uploaded = True
        return {"answer": answer, "seconds": seconds, "model": MODEL, "history_id": record_id}
    except (APIConnectionError, APITimeoutError) as exc:
        raise HTTPException(503, "连接模型服务失败，请确认 vLLM 已启动。") from exc
    except APIStatusError as exc:
        # vLLM can include raw frame arrays in a 400 response; never expose that payload.
        if exc.status_code == 400:
            raise HTTPException(400, "模型无法处理这段视频。请先试较短的 MP4，或换一个可直接访问的 URL。") from exc
        raise HTTPException(502, f"模型服务返回错误（HTTP {exc.status_code}）。") from exc
    finally:
        if saved_file is not None and not keep_uploaded:
            saved_file.unlink(missing_ok=True)
        if file is not None:
            await file.close()
