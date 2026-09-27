"""Small local web UI for Qwen video analysis through a vLLM OpenAI API."""

import json
import logging
import os
import re
import sqlite3
import time
from contextlib import closing, suppress
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
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
logger = logging.getLogger(__name__)


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


@dataclass
class VideoInput:
    source: str
    source_type: str
    filename: str
    video_path: str | None = None
    video_url: str | None = None
    uploaded_path: Path | None = None


async def prepare_video(question: str, video_url: str, history_id: str, file: UploadFile | None) -> VideoInput:
    if not question:
        raise HTTPException(400, "请输入想问视频的问题。")
    if len(question) > 4000:
        raise HTTPException(400, "问题请控制在 4000 字以内。")
    if sum((bool(file and file.filename), bool(video_url), bool(history_id))) != 1:
        raise HTTPException(400, "请选择一个 MP4 文件、视频 URL 或历史视频。")

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
        return VideoInput(saved_file.as_uri(), "upload", Path(file.filename).name,
                          video_path=str(saved_file), uploaded_path=saved_file)

    if history_id:
        previous = get_record(history_id)
        if previous["source_type"] == "upload":
            return VideoInput(local_video_path(previous).as_uri(), "upload", previous["filename"],
                              video_path=previous["video_path"])
        return VideoInput(previous["video_url"], "url", previous["filename"],
                          video_url=previous["video_url"])

    if not video_url.startswith(("https://", "http://")):
        raise HTTPException(400, "视频 URL 必须以 https:// 或 http:// 开头。")
    return VideoInput(video_url, "url", video_url, video_url=video_url)


def system_prompt(answer_language: str) -> str:
    timeline_zh = ("除非用户明确要求其他形式，默认先用一句话引出答案，再按时间顺序逐行列出事件。"
                   "每行严格使用 '- 00:00 - 00:10: 事件描述' 的格式；使用两位数字分秒，不加粗时间，"
                   "不要合并多个时间段。时间仅写画面能支持的大致范围。")
    timeline_en = ("Unless the user explicitly requests a different format, start with one short introductory "
                   "sentence, then list events in chronological order, one per line. Each line must have exactly "
                   "the form '- 00:00 - 00:10: event description'. Use two-digit minutes and seconds, no bold "
                   "timestamps, and do not combine time ranges. Only give approximate ranges supported by the video.")
    if answer_language == "en":
        return ("Answer entirely in English, regardless of the language of the question or video. "
                "Describe only what is observable in the video. Do not invent identities, actions, or timestamps; "
                "say when something is uncertain. " + timeline_en)
    if answer_language == "zh":
        return ("请全程使用简体中文回答，即使问题或视频内容是英文也不要改用英文。"
                "只描述视频中可观察到的内容；不要编造人物身份、动作或时间点。无法确定时请说明。" + timeline_zh)
    return ("请用与用户问题相同的语言、以纯文本回答，除时间线项目符号外不使用 Markdown 标记。"
            "只描述视频中可观察到的内容；不要编造人物身份、动作或时间点。无法确定时请说明。"
            + timeline_zh + " For English answers: " + timeline_en)


def validate_answer_language(answer_language: str) -> str:
    if answer_language not in {"auto", "zh", "en"}:
        raise HTTPException(400, "回答语言必须是 auto、zh 或 en。")
    return answer_language


def model_messages(video: VideoInput, question: str, answer_language: str = "auto"):
    if answer_language == "en":
        question_text = ("Answer the video question below entirely in English. "
                         "Translate the question internally if needed. Do not write Chinese in the answer.\n\n"
                         f"Question: {question}\n\nEnglish answer:")
    elif answer_language == "zh":
        question_text = ("请完全用简体中文回答下面的视频问题。如果问题是英文，请先理解问题再用中文回答。\n\n"
                         f"问题：{question}\n\n中文回答：")
    else:
        question_text = question
    return [
        {"role": "system", "content": system_prompt(answer_language)},
        {"role": "user", "content": [
            {"type": "video_url", "video_url": {"url": video.source}},
            {"type": "text", "text": question_text},
        ]},
    ]


def normalize_answer(answer: str, answer_language: str = "auto") -> str:
    answer = re.sub(r"\*\*(.*?)\*\*", r"\1", answer, flags=re.DOTALL)
    timecode = r"(?:\d{1,2}:)?\d{1,2}:\d{2}"
    timeline_line = re.compile(
        rf"^\s*(?:[-*•]\s*)?(?:\d+[.)]\s*)?(?P<start>{timecode})\s*[-–—~～]\s*"
        rf"(?P<end>{timecode})\s*(?:[:：]\s*)?(?P<description>.+?)\s*$"
    )
    lines = []
    for line in answer.splitlines():
        match = timeline_line.match(line)
        if match:
            lines.append(f"- {match['start']} - {match['end']}: {match['description']}")
        else:
            lines.append(line)
    first_line = next((line for line in lines if line.strip()), "")
    if first_line.startswith("- ") and timeline_line.match(first_line):
        use_chinese = answer_language == "zh" or (answer_language == "auto" and bool(re.search(r"[\u4e00-\u9fff]", answer)))
        introduction = ("好的，这是视频中发生的主要事件的总结：" if use_chinese
                        else "Here is a summary of the main events in the video:")
        return introduction + "\n\n" + "\n".join(lines)
    return "\n".join(lines)


def save_record(video: VideoInput, question: str, answer: str, seconds: float) -> str:
    record_id = uuid4().hex
    with closing(connect_history()) as db:
        db.execute(
            "INSERT INTO analyses VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (record_id, datetime.now(timezone.utc).isoformat(), video.source_type,
             video.video_path, video.video_url, video.filename, question, answer, seconds, MODEL),
        )
        db.commit()
    return record_id


def model_error(exc: Exception) -> tuple[int, str]:
    if isinstance(exc, (APIConnectionError, APITimeoutError)):
        return 503, "连接模型服务失败，请确认 vLLM 已启动。"
    if isinstance(exc, APIStatusError):
        if exc.status_code == 400:
            return 400, "模型无法处理这段视频。请先试较短的 MP4，或换一个可直接访问的 URL。"
        return 502, f"模型服务返回错误（HTTP {exc.status_code}）。"
    return 500, "分析过程中发生错误，请稍后重试。"


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
            "SELECT id, created_at, source_type, video_url, filename, question, answer, seconds, model "
            "FROM analyses ORDER BY created_at DESC LIMIT 100"
        ).fetchall()
    items = []
    for row in rows:
        item = dict(row)
        item["video_src"] = f"/api/history/{item['id']}/video" if item["source_type"] == "upload" else item["video_url"]
        del item["video_url"]
        items.append(item)
    return {"items": items}


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
    answer_language: str = Form("auto"),
    save_history: bool = Form(True),
    file: UploadFile | None = File(None),
):
    question = question.strip()
    video_url = video_url.strip()
    history_id = history_id.strip()
    answer_language = validate_answer_language(answer_language)
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
            messages=model_messages(VideoInput(source, source_type, filename), question, answer_language),
            extra_body={"chat_template_kwargs": {"enable_thinking": False}},
            max_tokens=2048,
        )
        answer = result.choices[0].message.content or "模型没有返回正文，请换一种问法重试。"
        answer = normalize_answer(answer, answer_language)
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


@app.post("/api/analyze/stream")
async def analyze_stream(
    question: str = Form(...),
    video_url: str = Form(""),
    history_id: str = Form(""),
    answer_language: str = Form("auto"),
    save_history: bool = Form(True),
    file: UploadFile | None = File(None),
):
    question = question.strip()
    answer_language = validate_answer_language(answer_language)
    try:
        video = await prepare_video(question, video_url.strip(), history_id.strip(), file)
    finally:
        if file is not None:
            await file.close()

    def line(kind: str, **data):
        return json.dumps({"type": kind, **data}, ensure_ascii=False) + "\n"

    async def generate():
        started = time.monotonic()
        stream = None
        keep_uploaded = False
        try:
            stream = await client.chat.completions.create(
                model=MODEL,
                messages=model_messages(video, question, answer_language),
                extra_body={"chat_template_kwargs": {"enable_thinking": False}},
                max_tokens=2048,
                stream=True,
            )
            parts = []
            async for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    parts.append(delta)
                    yield line("delta", text=delta)
            answer = "".join(parts) or "模型没有返回正文，请换一种问法重试。"
            answer = normalize_answer(answer, answer_language)
            seconds = round(time.monotonic() - started, 1)
            record_id = save_record(video, question, answer, seconds) if save_history else None
            keep_uploaded = record_id is not None
            yield line("done", answer=answer, seconds=seconds, model=MODEL, history_id=record_id)
        except (APIConnectionError, APITimeoutError, APIStatusError) as exc:
            _, message = model_error(exc)
            yield line("error", message=message)
        except Exception:
            logger.exception("Video streaming failed")
            yield line("error", message="分析过程中发生错误，请稍后重试。")
        finally:
            if stream is not None:
                with suppress(Exception):
                    await stream.close()
            if video.uploaded_path is not None and not keep_uploaded:
                video.uploaded_path.unlink(missing_ok=True)

    return StreamingResponse(generate(), media_type="application/x-ndjson", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
