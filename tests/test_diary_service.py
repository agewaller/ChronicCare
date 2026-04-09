"""DiaryServiceの動作確認テスト。

AIクライアントをモックして、サービス層のエラーハンドリングと
入出力の変換ロジックを検証する。
"""

from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.models.analysis import AnalysisResult
from src.models.diary import DiaryEntry, UserProfile
from src.services.ai_client import AIClientError
from src.services.diary_service import DiaryService


def _make_service(ai_response):
    ai = MagicMock()
    ai.send = AsyncMock(return_value=ai_response)
    return DiaryService(ai_client=ai)


class TestListPrompts:
    def test_list_prompts_public_api(self):
        service = DiaryService()
        prompts = service.list_prompts()
        assert "analyze_diary" in prompts
        assert "extract_symptoms" in prompts


class TestAnalyzeEntry:
    async def test_valid_response(self):
        service = _make_service({
            "physical_signs": [{"symptom": "頭痛", "severity": "medium", "note": ""}],
            "mental_state": {"overall": "fair", "details": "少し不安"},
            "lifestyle_factors": [],
            "mibyou_risk": {"level": "low", "areas": [], "explanation": ""},
            "key_observations": [],
        })
        entry = DiaryEntry(user_id="u1", entry_date=date.today(), text="頭が痛い")
        profile = UserProfile(user_id="u1")
        result = await service.analyze_entry(entry, profile)
        assert isinstance(result, AnalysisResult)
        assert result.physical_signs[0].symptom == "頭痛"

    async def test_invalid_schema_raises_ai_client_error(self):
        # AIレスポンスがスキーマと一致しない場合
        service = _make_service({
            "physical_signs": [{"wrong_field": "value"}],  # symptom/severity欠落
        })
        entry = DiaryEntry(user_id="u1", entry_date=date.today(), text="test")
        profile = UserProfile(user_id="u1")
        with pytest.raises(AIClientError, match="analyze_diary"):
            await service.analyze_entry(entry, profile)


class TestExtractSymptoms:
    async def test_empty_extraction(self):
        service = _make_service({
            "symptoms": [],
            "mood": None,
            "sleep": None,
            "meals": [],
            "exercise": None,
            "other_notes": [],
        })
        result = await service.extract_symptoms("特に何もなかった")
        assert result.symptoms == []
