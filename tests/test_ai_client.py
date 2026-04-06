"""AIクライアントのJSONパースのテスト。"""

import pytest

from src.services.ai_client import AIClient


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
