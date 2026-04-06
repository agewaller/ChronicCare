"""データモデルのテスト。"""

import pytest
from datetime import date

from src.models.diary import DiaryEntry, UserProfile
from src.models.analysis import AnalysisResult, MibyouRisk, AdviceResult
from src.models.symptoms import ExtractedSymptoms, Symptom, Mood


class TestUserProfile:
    def test_to_prompt_text_full(self):
        profile = UserProfile(
            user_id="u1",
            age=40,
            gender="女性",
            chronic_conditions=["高血圧"],
            lifestyle_notes="デスクワーク中心",
        )
        text = profile.to_prompt_text()
        assert "40歳" in text
        assert "女性" in text
        assert "高血圧" in text
        assert "デスクワーク" in text

    def test_to_prompt_text_empty(self):
        profile = UserProfile(user_id="u2")
        text = profile.to_prompt_text()
        assert text == "プロフィール情報なし"

    def test_diary_entry_creation(self):
        entry = DiaryEntry(
            user_id="u1",
            entry_date=date(2026, 4, 6),
            text="今日は元気だった",
        )
        assert entry.entry_date == date(2026, 4, 6)
        assert entry.text == "今日は元気だった"


class TestAnalysisResult:
    def test_from_dict(self):
        data = {
            "physical_signs": [
                {"symptom": "頭痛", "severity": "medium", "note": "午後から"}
            ],
            "mental_state": {"overall": "fair", "details": "少し不安"},
            "lifestyle_factors": [],
            "mibyou_risk": {
                "level": "medium",
                "areas": ["睡眠", "ストレス"],
                "explanation": "睡眠不足の傾向",
            },
            "key_observations": ["睡眠の質に注意"],
        }
        result = AnalysisResult.model_validate(data)
        assert result.physical_signs[0].symptom == "頭痛"
        assert result.mibyou_risk.level == "medium"
        assert len(result.mibyou_risk.areas) == 2

    def test_empty_result(self):
        result = AnalysisResult()
        assert result.physical_signs == []
        assert result.mibyou_risk is None


class TestExtractedSymptoms:
    def test_from_dict(self):
        data = {
            "symptoms": [
                {"name": "頭痛", "severity": "mild", "duration": "2時間"}
            ],
            "mood": {"state": "普通", "score": None},
            "sleep": {"quality": "fair", "hours": 6.5},
            "meals": [{"type": "朝食", "description": "パンとコーヒー"}],
            "exercise": {"done": False, "type": None, "duration_minutes": None},
            "other_notes": [],
        }
        result = ExtractedSymptoms.model_validate(data)
        assert result.symptoms[0].name == "頭痛"
        assert result.sleep.hours == 6.5
        assert result.exercise.done is False
