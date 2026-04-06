"""AI クライアント：レンダリング済みプロンプトをAPIに送信する。

プロンプトの内容を知らない純粋なHTTPクライアント層。
"""

import json
import os
from typing import Any

import anthropic

from src.prompt_loader import RenderedPrompt


class AIClient:
    """Anthropic APIとの通信を担当。"""

    def __init__(self, api_key: str | None = None):
        self._client = anthropic.Anthropic(
            api_key=api_key or os.environ.get("ANTHROPIC_API_KEY", ""),
        )

    async def send(self, prompt: RenderedPrompt) -> dict[str, Any]:
        """レンダリング済みプロンプトをAPIに送信し、JSONレスポンスを返す。"""
        message = self._client.messages.create(
            model=prompt.model,
            max_tokens=prompt.max_tokens,
            temperature=prompt.temperature,
            system=prompt.system,
            messages=[{"role": "user", "content": prompt.user_message}],
        )

        response_text = message.content[0].text
        return self._parse_json_response(response_text)

    @staticmethod
    def _parse_json_response(text: str) -> dict[str, Any]:
        """レスポンスからJSONを抽出してパースする。"""
        # JSONブロックを探す
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            # ```json or ``` で始まる行をスキップ
            start = 1
            end = len(lines) - 1
            if lines[end].strip() == "```":
                text = "\n".join(lines[start:end])
            else:
                text = "\n".join(lines[start:])

        # JSON部分を抽出（{ から最後の } まで）
        brace_start = text.find("{")
        brace_end = text.rfind("}")
        if brace_start != -1 and brace_end != -1:
            text = text[brace_start : brace_end + 1]

        return json.loads(text)
