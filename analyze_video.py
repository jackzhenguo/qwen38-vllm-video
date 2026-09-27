#!/usr/bin/env python3
"""Send a video URL or a server-local MP4 to Qwen3.8-27B via vLLM."""

import argparse
import os
from pathlib import Path

from openai import OpenAI


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("video", help="HTTPS URL or MP4 inside ~/qwen38-vllm-video/videos")
    parser.add_argument("--question", default="请按时间顺序概括视频中的关键事件，并标出大致时间点。")
    parser.add_argument("--base-url", default="http://localhost:8000/v1")
    args = parser.parse_args()

    video = args.video
    if not video.startswith(("http://", "https://", "file://")):
        video = Path(video).expanduser().resolve().as_uri()

    client = OpenAI(base_url=args.base_url, api_key="EMPTY", timeout=3600)
    response = client.chat.completions.create(
        model=os.getenv("QWEN_MODEL", "Qwen3.8-27B"),
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "video_url", "video_url": {"url": video}},
                    {"type": "text", "text": args.question},
                ],
            }
        ],
        extra_body={"chat_template_kwargs": {"enable_thinking": False}},
        max_tokens=1024,
    )
    print(response.choices[0].message.content)


if __name__ == "__main__":
    main()
