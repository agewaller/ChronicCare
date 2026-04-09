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
        self._api_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        if not self._api_key:
            logger.warning(
                "ANTHROPIC_API_KEY is not set. API calls will fail with a clear error."
            )
        # Anthropic SDK は空文字列でもインスタンス化は成功するが、
        # エラーを明確化するため送信時に再チェックする。
        self._client = anthropic.AsyncAnthropic(api_key=self._api_key or "dummy")

    async def send(self, prompt: RenderedPrompt) -> dict[str, Any]:
        """レンダリング済みプロンプトをAPIに送信し、JSONレスポンスを返す。"""
        if not self._api_key:
            raise AIClientError(
                "ANTHROPIC_API_KEY が設定されていません。環境変数を設定してください。"
            )

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
            raise AIClientError(f"API エラー: {str(e)}", e)

        if not message.content:
            raise AIClientError("AIレスポンスが空です。")

        first_block = message.content[0]
        response_text = getattr(first_block, "text", None)
        if not response_text:
            raise AIClientError(
                f"AIレスポンスにテキストが含まれていません: {type(first_block).__name__}"
            )

        try:
            return self._parse_json_response(response_text)
        except (json.JSONDecodeError, ValueError) as e:
            raise AIClientError(
                f"AIレスポンスのJSON解析に失敗しました: {response_text[:200]}", e
            )

    @staticmethod
    def _parse_json_response(text: str) -> dict[str, Any]:
        """レスポンスからJSONを抽出してパースする。

        AIレスポンスは以下の形式で返される可能性がある：
        - プレーンJSON
        - ```json ... ``` コードブロック
        - 説明文に埋め込まれたJSON
        """
        text = text.strip()

        # コードブロック形式の場合、内側の内容を取り出す
        if text.startswith("```"):
            lines = text.split("\n")
            if len(lines) >= 2:
                # 最初の行（```json や ```）を除外
                inner_lines = lines[1:]
                # 最後の行が ``` なら除外
                if inner_lines and inner_lines[-1].strip() == "```":
                    inner_lines = inner_lines[:-1]
                text = "\n".join(inner_lines).strip()

        # 最初の { から最後の } までを抽出
        brace_start = text.find("{")
        brace_end = text.rfind("}")
        if brace_start == -1 or brace_end == -1 or brace_end < brace_start:
            raise ValueError("JSONオブジェクトが見つかりません")
        text = text[brace_start : brace_end + 1]

        return json.loads(text)
