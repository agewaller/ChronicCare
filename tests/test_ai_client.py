"""AIクライアントのJSONパースとエラーハンドリングのテスト。"""

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.prompt_loader import RenderedPrompt
from src.services.ai_client import AIClient, AIClientError, detect_provider


def _prompt(model: str) -> RenderedPrompt:
    return RenderedPrompt(
        model=model,
        max_tokens=100,
        temperature=0.3,
        system="system",
        user_message="hello",
    )


class TestParseJsonResponse:
    def test_plain_json(self):
        text = '{"key": "value", "num": 42}'
        result = AIClient._parse_json_response(text)
        assert result == {"key": "value", "num": 42}

    def test_json_in_code_block(self):
        text = '```json\n{"key": "value"}\n```'
        result = AIClient._parse_json_response(text)
        assert result == {"key": "value"}

    def test_json_with_surrounding_text(self):
        text = 'Here is the result:\n{"key": "value"}\nEnd of response.'
        result = AIClient._parse_json_response(text)
        assert result == {"key": "value"}

    def test_nested_json(self):
        text = '{"outer": {"inner": "value"}, "list": [1, 2]}'
        result = AIClient._parse_json_response(text)
        assert result["outer"]["inner"] == "value"
        assert result["list"] == [1, 2]

    def test_japanese_content(self):
        text = '{"症状": "頭痛", "程度": "軽度"}'
        result = AIClient._parse_json_response(text)
        assert result["症状"] == "頭痛"

    def test_invalid_json_raises(self):
        with pytest.raises(Exception):
            AIClient._parse_json_response("not json at all")

    def test_code_block_without_language(self):
        text = '```\n{"key": "value"}\n```'
        result = AIClient._parse_json_response(text)
        assert result == {"key": "value"}

    def test_unclosed_code_block(self):
        text = '```json\n{"key": "value"}'
        result = AIClient._parse_json_response(text)
        assert result == {"key": "value"}


class TestDetectProvider:
    def test_claude_models(self):
        assert detect_provider("claude-opus-4-6") == "anthropic"
        assert detect_provider("claude-sonnet-4-6") == "anthropic"
        assert detect_provider("claude-haiku-4-5-20251001") == "anthropic"

    def test_openai_models(self):
        assert detect_provider("gpt-4o") == "openai"
        assert detect_provider("gpt-4o-mini") == "openai"
        assert detect_provider("o1") == "openai"
        assert detect_provider("o3-mini") == "openai"

    def test_gemini_models(self):
        assert detect_provider("gemini-2.5-pro") == "google"
        assert detect_provider("gemini-2.5-flash") == "google"

    def test_unknown_model_raises(self):
        with pytest.raises(AIClientError, match="未知のモデル"):
            detect_provider("llama-3")
        with pytest.raises(AIClientError, match="未知のモデル"):
            detect_provider("")


class TestProviderStatus:
    def test_no_keys_set(self):
        with patch.dict(os.environ, {}, clear=True):
            client = AIClient()
            status = client.provider_status()
            assert status == {"anthropic": False, "openai": False, "google": False}

    def test_only_anthropic(self):
        with patch.dict(os.environ, {}, clear=True):
            client = AIClient(anthropic_key="sk-ant-xxx")
            status = client.provider_status()
            assert status["anthropic"] is True
            assert status["openai"] is False
            assert status["google"] is False

    def test_all_keys_set(self):
        with patch.dict(os.environ, {}, clear=True):
            client = AIClient(
                anthropic_key="sk-ant-xxx",
                openai_key="sk-xxx",
                google_key="AIza-xxx",
            )
            status = client.provider_status()
            assert all(status.values())

    def test_legacy_api_key_param(self):
        """古いテストが AIClient(api_key=...) を使うための後方互換。"""
        with patch.dict(os.environ, {}, clear=True):
            client = AIClient(api_key="sk-ant-legacy")
            assert client.provider_status()["anthropic"] is True


class TestAnthropicDispatch:
    async def test_missing_key_raises_clear_error(self):
        with patch.dict(os.environ, {}, clear=True):
            client = AIClient()
            with pytest.raises(AIClientError, match="ANTHROPIC_API_KEY"):
                await client.send(_prompt("claude-opus-4-6"))

    async def test_empty_content_raises_clear_error(self):
        client = AIClient(anthropic_key="fake-key")
        mock_message = MagicMock()
        mock_message.content = []
        # _client プロパティ経由で lazy 初期化させ、そのインスタンスをモック
        client._client.messages = MagicMock()
        client._client.messages.create = AsyncMock(return_value=mock_message)

        with pytest.raises(AIClientError, match="空"):
            await client.send(_prompt("claude-opus-4-6"))

    async def test_successful_dispatch(self):
        client = AIClient(anthropic_key="fake-key")
        mock_block = MagicMock()
        mock_block.text = '{"result": "ok"}'
        mock_message = MagicMock()
        mock_message.content = [mock_block]
        client._client.messages = MagicMock()
        client._client.messages.create = AsyncMock(return_value=mock_message)

        result = await client.send(_prompt("claude-opus-4-6"))
        assert result == {"result": "ok"}


class TestOpenAIDispatch:
    async def test_missing_key_raises_clear_error(self):
        with patch.dict(os.environ, {}, clear=True):
            client = AIClient()
            with pytest.raises(AIClientError, match="OPENAI_API_KEY"):
                await client.send(_prompt("gpt-4o"))

    async def test_successful_dispatch(self):
        client = AIClient(openai_key="sk-fake")
        mock_choice = MagicMock()
        mock_choice.message.content = '{"result": "openai ok"}'
        mock_response = MagicMock()
        mock_response.choices = [mock_choice]

        # lazy 初期化させる
        import openai
        client._openai_client = MagicMock(spec=openai.AsyncOpenAI)
        client._openai_client.chat = MagicMock()
        client._openai_client.chat.completions = MagicMock()
        client._openai_client.chat.completions.create = AsyncMock(return_value=mock_response)

        result = await client.send(_prompt("gpt-4o"))
        assert result == {"result": "openai ok"}

        # kwargs を検証: 通常モデルは temperature + max_tokens
        call_kwargs = client._openai_client.chat.completions.create.call_args.kwargs
        assert call_kwargs["model"] == "gpt-4o"
        assert "temperature" in call_kwargs
        assert "max_tokens" in call_kwargs
        assert call_kwargs["response_format"] == {"type": "json_object"}

    async def test_reasoning_model_uses_max_completion_tokens(self):
        """o1/o3 系は max_completion_tokens を使い temperature を渡さない。"""
        client = AIClient(openai_key="sk-fake")
        mock_choice = MagicMock()
        mock_choice.message.content = '{"ok": true}'
        mock_response = MagicMock()
        mock_response.choices = [mock_choice]

        client._openai_client = MagicMock()
        client._openai_client.chat = MagicMock()
        client._openai_client.chat.completions = MagicMock()
        client._openai_client.chat.completions.create = AsyncMock(return_value=mock_response)

        await client.send(_prompt("o1"))
        call_kwargs = client._openai_client.chat.completions.create.call_args.kwargs
        assert "max_completion_tokens" in call_kwargs
        assert "temperature" not in call_kwargs
        assert "max_tokens" not in call_kwargs


class TestGeminiDispatch:
    async def test_missing_key_raises_clear_error(self):
        with patch.dict(os.environ, {}, clear=True):
            client = AIClient()
            with pytest.raises(AIClientError, match="GOOGLE_API_KEY"):
                await client.send(_prompt("gemini-2.5-pro"))

    async def test_successful_dispatch(self):
        client = AIClient(google_key="AIza-fake")

        mock_response = MagicMock()
        mock_response.text = '{"result": "gemini ok"}'

        # google-genai SDK の構造をモック
        mock_models = MagicMock()
        mock_models.generate_content = AsyncMock(return_value=mock_response)
        mock_aio = MagicMock()
        mock_aio.models = mock_models
        client._gemini_client = MagicMock()
        client._gemini_client.aio = mock_aio

        result = await client.send(_prompt("gemini-2.5-pro"))
        assert result == {"result": "gemini ok"}

        call_args = mock_models.generate_content.call_args
        assert call_args.kwargs["model"] == "gemini-2.5-pro"

    async def test_api_key_error_is_wrapped(self):
        client = AIClient(google_key="AIza-fake")

        mock_models = MagicMock()
        mock_models.generate_content = AsyncMock(
            side_effect=Exception("API key not valid. PERMISSION_DENIED")
        )
        client._gemini_client = MagicMock()
        client._gemini_client.aio = MagicMock()
        client._gemini_client.aio.models = mock_models

        with pytest.raises(AIClientError, match="APIキーが無効"):
            await client.send(_prompt("gemini-2.5-pro"))


class TestAIClientError:
    def test_error_with_original(self):
        original = RuntimeError("test")
        err = AIClientError("wrapper message", original)
        assert str(err) == "wrapper message"
        assert err.original_error is original

    def test_error_without_original(self):
        err = AIClientError("simple error")
        assert err.original_error is None
