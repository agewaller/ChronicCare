"""AI クライアント：マルチプロバイダー対応。

プロンプトの model 属性に基づいて、Anthropic / OpenAI / Google Gemini のいずれかに
ルーティングする。プロンプトの内容を知らない純粋なクライアント層。

サポートするモデル prefix:
- claude-*    → Anthropic (claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-*)
- gpt-*, o1-*, o3-*, o4-* → OpenAI (gpt-4o, gpt-4o-mini, o1, o3 等)
- gemini-*    → Google Gemini (gemini-2.5-pro, gemini-2.5-flash 等)
"""

import json
import logging
import os
from typing import Any

import anthropic
import openai
from google import genai as google_genai
from google.genai import types as google_types

from src.prompt_loader import RenderedPrompt

logger = logging.getLogger(__name__)


class AIClientError(Exception):
    """AIクライアントのエラー。"""

    def __init__(self, message: str, original_error: Exception | None = None):
        super().__init__(message)
        self.original_error = original_error


def detect_provider(model: str) -> str:
    """モデル名から使用プロバイダーを判定する。"""
    if model.startswith("claude"):
        return "anthropic"
    if model.startswith(("gpt", "o1", "o3", "o4", "chatgpt")):
        return "openai"
    if model.startswith("gemini"):
        return "google"
    raise AIClientError(
        f"未知のモデルです: '{model}'。"
        f"claude-*, gpt-*, gemini-* のいずれかを指定してください。"
    )


class AIClient:
    """マルチプロバイダーAIクライアント。

    プロンプトの model 属性を見て Anthropic / OpenAI / Google に振り分ける。
    各プロバイダーのクライアントは遅延初期化される（使わないプロバイダーの
    APIキーは不要）。
    """

    def __init__(
        self,
        anthropic_key: str | None = None,
        openai_key: str | None = None,
        google_key: str | None = None,
        *,
        api_key: str | None = None,  # 後方互換: Anthropic キーのみ指定
    ):
        # 後方互換: 古いコードは api_key= で Anthropic キーを渡す
        if api_key is not None and anthropic_key is None:
            anthropic_key = api_key

        self._anthropic_key = anthropic_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self._openai_key = openai_key or os.environ.get("OPENAI_API_KEY", "")
        self._google_key = google_key or os.environ.get("GOOGLE_API_KEY", "")

        # 遅延初期化
        self._anthropic_client: anthropic.AsyncAnthropic | None = None
        self._openai_client: openai.AsyncOpenAI | None = None
        self._gemini_client: google_genai.Client | None = None

        active = [
            name
            for name, key in [
                ("ANTHROPIC_API_KEY", self._anthropic_key),
                ("OPENAI_API_KEY", self._openai_key),
                ("GOOGLE_API_KEY", self._google_key),
            ]
            if key
        ]
        if not active:
            logger.warning(
                "APIキーが1つも設定されていません。どのAI APIも使えません。"
            )
        else:
            logger.info("APIキー検出: %s", ", ".join(active))

    def provider_status(self) -> dict[str, bool]:
        """各プロバイダーのAPIキー設定状況を返す。"""
        return {
            "anthropic": bool(self._anthropic_key),
            "openai": bool(self._openai_key),
            "google": bool(self._google_key),
        }

    # --- 後方互換: 古いテストが self._client を参照するため ---
    @property
    def _client(self) -> anthropic.AsyncAnthropic:
        """後方互換: Anthropic クライアントへのアクセサ。"""
        if self._anthropic_client is None:
            self._anthropic_client = anthropic.AsyncAnthropic(
                api_key=self._anthropic_key or "dummy"
            )
        return self._anthropic_client

    async def send(self, prompt: RenderedPrompt) -> dict[str, Any]:
        """プロンプトを適切なプロバイダーに送信し、JSONレスポンスを返す。"""
        provider = detect_provider(prompt.model)
        if provider == "anthropic":
            return await self._send_anthropic(prompt)
        if provider == "openai":
            return await self._send_openai(prompt)
        if provider == "google":
            return await self._send_gemini(prompt)
        raise AIClientError(f"未対応プロバイダー: {provider}")

    # --- Anthropic ---

    async def _send_anthropic(self, prompt: RenderedPrompt) -> dict[str, Any]:
        if not self._anthropic_key:
            raise AIClientError(
                "ANTHROPIC_API_KEY が設定されていません。"
                "Claude モデルを使うには環境変数を設定してください。"
            )
        if self._anthropic_client is None:
            self._anthropic_client = anthropic.AsyncAnthropic(
                api_key=self._anthropic_key
            )

        try:
            message = await self._anthropic_client.messages.create(
                model=prompt.model,
                max_tokens=prompt.max_tokens,
                temperature=prompt.temperature,
                system=prompt.system,
                messages=[{"role": "user", "content": prompt.user_message}],
            )
        except anthropic.AuthenticationError as e:
            raise AIClientError(
                "Anthropic: APIキーが無効です。ANTHROPIC_API_KEY を確認してください。",
                e,
            )
        except anthropic.RateLimitError as e:
            raise AIClientError(
                "Anthropic: レート制限に達しました。しばらく待ってから再試行してください。",
                e,
            )
        except anthropic.APIConnectionError as e:
            raise AIClientError(
                "Anthropic: APIへの接続に失敗しました。ネットワークを確認してください。",
                e,
            )
        except anthropic.APIError as e:
            raise AIClientError(f"Anthropic APIエラー: {str(e)}", e)

        if not message.content:
            raise AIClientError("Anthropic: レスポンスが空です。")

        first_block = message.content[0]
        response_text = getattr(first_block, "text", None)
        if not response_text:
            raise AIClientError(
                f"Anthropic: レスポンスにテキストが含まれていません: "
                f"{type(first_block).__name__}"
            )

        return self._parse_json_response(response_text)

    # --- OpenAI ---

    async def _send_openai(self, prompt: RenderedPrompt) -> dict[str, Any]:
        if not self._openai_key:
            raise AIClientError(
                "OPENAI_API_KEY が設定されていません。"
                "GPT モデルを使うには環境変数を設定してください。"
            )
        if self._openai_client is None:
            self._openai_client = openai.AsyncOpenAI(api_key=self._openai_key)

        # o1/o3 系は temperature / max_tokens の扱いが異なるため分岐
        reasoning_model = prompt.model.startswith(("o1", "o3", "o4"))

        kwargs: dict[str, Any] = {
            "model": prompt.model,
            "messages": [
                {"role": "system", "content": prompt.system},
                {"role": "user", "content": prompt.user_message},
            ],
            "response_format": {"type": "json_object"},
        }
        if reasoning_model:
            # o1/o3 系は temperature 未対応、max_completion_tokens を使用
            kwargs["max_completion_tokens"] = prompt.max_tokens
        else:
            kwargs["temperature"] = prompt.temperature
            kwargs["max_tokens"] = prompt.max_tokens

        try:
            response = await self._openai_client.chat.completions.create(**kwargs)
        except openai.AuthenticationError as e:
            raise AIClientError(
                "OpenAI: APIキーが無効です。OPENAI_API_KEY を確認してください。", e
            )
        except openai.RateLimitError as e:
            raise AIClientError(
                "OpenAI: レート制限または残高不足です。課金状況を確認してください。",
                e,
            )
        except openai.APIConnectionError as e:
            raise AIClientError("OpenAI: APIへの接続に失敗しました。", e)
        except openai.BadRequestError as e:
            raise AIClientError(f"OpenAI: リクエストが不正です: {str(e)}", e)
        except openai.APIError as e:
            raise AIClientError(f"OpenAI APIエラー: {str(e)}", e)

        if not response.choices:
            raise AIClientError("OpenAI: レスポンスが空です。")

        response_text = response.choices[0].message.content
        if not response_text:
            raise AIClientError("OpenAI: レスポンスにテキストが含まれていません。")

        return self._parse_json_response(response_text)

    # --- Google Gemini ---

    async def _send_gemini(self, prompt: RenderedPrompt) -> dict[str, Any]:
        if not self._google_key:
            raise AIClientError(
                "GOOGLE_API_KEY が設定されていません。"
                "Gemini モデルを使うには環境変数を設定してください。"
            )
        if self._gemini_client is None:
            self._gemini_client = google_genai.Client(api_key=self._google_key)

        config = google_types.GenerateContentConfig(
            system_instruction=prompt.system,
            temperature=prompt.temperature,
            max_output_tokens=prompt.max_tokens,
            response_mime_type="application/json",
        )

        try:
            response = await self._gemini_client.aio.models.generate_content(
                model=prompt.model,
                contents=prompt.user_message,
                config=config,
            )
        except Exception as e:
            # google-genai SDK の例外階層は比較的フラット
            msg = str(e).lower()
            if "api key" in msg or "unauthenticated" in msg or "permission" in msg:
                raise AIClientError(
                    "Gemini: APIキーが無効です。GOOGLE_API_KEY を確認してください。",
                    e,
                )
            if "quota" in msg or "rate" in msg or "resource_exhausted" in msg:
                raise AIClientError(
                    "Gemini: レート制限またはクォータ超過です。", e
                )
            raise AIClientError(f"Gemini APIエラー: {str(e)}", e)

        response_text = getattr(response, "text", None)
        if not response_text:
            raise AIClientError("Gemini: レスポンスにテキストが含まれていません。")

        return self._parse_json_response(response_text)

    # --- JSON パース ---

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
