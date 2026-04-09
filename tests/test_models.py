"""データモデルのテスト。"""

import pytest
from datetime import date, timezone

from src.models.diary import DiaryEntry, UserProfile
from src.models.analysis import AnalysisResult, MibyouRisk, AdviceResult
from src.models.symptoms import (
    ExtractedSymptoms,
    NutritionEstimate,
    Symptom,
    Mood,
)


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

    def test_diary_entry_created_at_is_timezone_aware(self):
        entry = DiaryEntry(
            user_id="u1",
            entry_date=date(2026, 4, 6),
            text="test",
        )
        assert entry.created_at.tzinfo is not None
        assert entry.created_at.tzinfo == timezone.utc


class TestBasalMetabolicRate:
    """Mifflin-St Jeor式の基礎代謝計算。"""

    def test_male_bmr(self):
        # 男性 30歳 170cm 70kg
        # BMR = 10*70 + 6.25*170 - 5*30 + 5 = 700 + 1062.5 - 150 + 5 = 1617.5 → 1618
        profile = UserProfile(
            user_id="u1", age=30, gender="男性", height_cm=170, weight_kg=70
        )
        assert profile.basal_metabolic_rate() == 1618

    def test_female_bmr(self):
        # 女性 30歳 160cm 55kg
        # BMR = 10*55 + 6.25*160 - 5*30 - 161 = 550 + 1000 - 150 - 161 = 1239
        profile = UserProfile(
            user_id="u1", age=30, gender="女性", height_cm=160, weight_kg=55
        )
        assert profile.basal_metabolic_rate() == 1239

    def test_other_gender_bmr(self):
        # その他: 男女平均 (base - 78)
        profile = UserProfile(
            user_id="u1",
            age=30,
            gender="その他",
            height_cm=165,
            weight_kg=60,
        )
        assert profile.basal_metabolic_rate() is not None

    def test_missing_data_returns_none(self):
        assert UserProfile(user_id="u1").basal_metabolic_rate() is None
        assert UserProfile(
            user_id="u1", age=30, height_cm=170
        ).basal_metabolic_rate() is None
        assert UserProfile(
            user_id="u1", age=30, weight_kg=70
        ).basal_metabolic_rate() is None
        assert UserProfile(
            user_id="u1", height_cm=170, weight_kg=70
        ).basal_metabolic_rate() is None

    def test_bmr_in_prompt_text(self):
        profile = UserProfile(
            user_id="u1", age=30, gender="男性", height_cm=170, weight_kg=70
        )
        text = profile.to_prompt_text()
        assert "170" in text and "cm" in text
        assert "70" in text and "kg" in text
        assert "基礎代謝" in text
        assert "1618" in text


class TestNutritionEstimate:
    def test_default_values(self):
        n = NutritionEstimate()
        assert n.total_calories == 0
        assert n.protein_g == 0.0
        assert n.fat_g == 0.0
        assert n.carbs_g == 0.0
        assert n.confidence == "unknown"
        assert n.note == ""

    def test_full_nutrition(self):
        n = NutritionEstimate(
            total_calories=1800,
            protein_g=80.5,
            fat_g=55.2,
            carbs_g=220.0,
            confidence="medium",
            note="ご飯2杯と鶏胸肉150gを仮定",
        )
        assert n.total_calories == 1800
        assert n.protein_g == 80.5
        assert n.confidence == "medium"

    def test_extracted_symptoms_with_nutrition(self):
        data = {
            "symptoms": [],
            "mood": None,
            "sleep": None,
            "meals": [{"type": "朝食", "description": "トーストとコーヒー"}],
            "exercise": None,
            "nutrition": {
                "total_calories": 300,
                "protein_g": 10.0,
                "fat_g": 12.0,
                "carbs_g": 40.0,
                "confidence": "low",
                "note": "トースト1枚160kcal想定",
            },
            "other_notes": [],
        }
        result = ExtractedSymptoms.model_validate(data)
        assert result.nutrition is not None
        assert result.nutrition.total_calories == 300
        assert result.nutrition.confidence == "low"

    def test_extracted_symptoms_without_nutrition(self):
        """nutrition は省略可能（既存データとの後方互換）。"""
        data = {
            "symptoms": [
                {"name": "頭痛", "severity": "mild", "duration": "2時間"}
            ],
            "mood": {"state": "普通", "score": None},
            "sleep": {"quality": "fair", "hours": 6.5},
            "meals": [],
            "exercise": {"done": False, "type": None, "duration_minutes": None},
            "other_notes": [],
        }
        result = ExtractedSymptoms.model_validate(data)
        assert result.nutrition is None


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
