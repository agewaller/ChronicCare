"""AIクライアントのJSONパースとエラーハンドリングのテスト。"""

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.prompt_loader import RenderedPrompt
from src.services.ai_client import AIClient, AIClientError


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


class TestAIClientSend:
    async def test_missing_api_key_raises_clear_error(self):
        with patch.dict(os.environ, {}, clear=True):
            client = AIClient()
            prompt = RenderedPrompt(
                model="claude-sonnet-4-6",
                max_tokens=100,
                temperature=0.3,
                system="test",
                user_message="hello",
            )
            with pytest.raises(AIClientError, match="ANTHROPIC_API_KEY"):
                await client.send(prompt)

    async def test_empty_content_raises_clear_error(self):
        client = AIClient(api_key="fake-key")
        mock_message = MagicMock()
        mock_message.content = []
        client._client.messages = MagicMock()
        client._client.messages.create = AsyncMock(return_value=mock_message)

        prompt = RenderedPrompt(
            model="claude-sonnet-4-6",
            max_tokens=100,
            temperature=0.3,
            system="test",
            user_message="hello",
        )
        with pytest.raises(AIClientError, match="空"):
            await client.send(prompt)


class TestAIClientError:
    def test_error_with_original(self):
        original = RuntimeError("test")
        err = AIClientError("wrapper message", original)
        assert str(err) == "wrapper message"
        assert err.original_error is original

    def test_error_without_original(self):
        err = AIClientError("simple error")
        assert err.original_error is None
