"""AI クライアント：レンダリング済みプロンプトをAPIに送信する。

プロンプトの内容を知らない純粋なHTTPクライアント層。
"""

import json
import logging
import os
from typing import Any

import anthropic

from src.prompt_loader import RenderedPrompt

logger = logging.getLogger(__name__)


class AIClientError(Exception):
    """AIクライアントのエラー。"""

    def __init__(self, message: str, original_error: Exception | None = None):
        super().__init__(message)
        self.original_error = original_error


class AIClient:
    """Anthropic APIとの通信を担当。"""

    def __init__(self, api_key: str | None = None):
        key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        if not key:
            logger.warning("ANTHROPIC_API_KEY is not set")
        self._client = anthropic.AsyncAnthropic(api_key=key)

    async def send(self, prompt: RenderedPrompt) -> dict[str, Any]:
        """レンダリング済みプロンプトをAPIに送信し、JSONレスポンスを返す。"""
        try:
            message = await self._client.messages.create(
                model=prompt.model,
                max_tokens=prompt.max_tokens,
                temperature=prompt.temperature,
                system=prompt.system,
                messages=[{"role": "user", "content": prompt.user_message}],
            )
        except anthropic.AuthenticationError as e:
            raise AIClientError(
                "APIキーが無効です。ANTHROPIC_API_KEYを確認してください。", e
            )
        except anthropic.RateLimitError as e:
            raise AIClientError(
                "APIレート制限に達しました。しばらく待ってから再試行してください。", e
            )
        except anthropic.APIConnectionError as e:
            raise AIClientError(
                "APIへの接続に失敗しました。ネットワークを確認してください。", e
            )
        except anthropic.APIError as e:
            raise AIClientError(f"API エラー: {e.message}", e)

        response_text = message.content[0].text
        try:
            return self._parse_json_response(response_text)
        except (json.JSONDecodeError, ValueError) as e:
            raise AIClientError(
                f"AIレスポンスのJSON解析に失敗しました: {response_text[:200]}", e
            )

    @staticmethod
    def _parse_json_response(text: str) -> dict[str, Any]:
        """レスポンスからJSONを抽出してパースする。"""
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            start = 1
            end = len(lines) - 1
            if lines[end].strip() == "```":
                text = "\n".join(lines[start:end])
            else:
                text = "\n".join(lines[start:])

        brace_start = text.find("{")
        brace_end = text.rfind("}")
        if brace_start != -1 and brace_end != -1:
            text = text[brace_start : brace_end + 1]

        return json.loads(text)
