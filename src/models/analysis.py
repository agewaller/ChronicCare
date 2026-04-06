"""分析結果のデータモデル。

AIからの出力を型安全に扱うための構造体。
"""

from pydantic import BaseModel, Field


class PhysicalSign(BaseModel):
    symptom: str
    severity: str  # low | medium | high
    note: str = ""


class MentalState(BaseModel):
    overall: str  # good | fair | poor
    details: str = ""


class LifestyleFactor(BaseModel):
    factor: str
    assessment: str  # positive | neutral | negative
    note: str = ""


class MibyouRisk(BaseModel):
    level: str  # low | medium | high
    areas: list[str] = Field(default_factory=list)
    explanation: str = ""


class AnalysisResult(BaseModel):
    """日記分析の結果。"""

    physical_signs: list[PhysicalSign] = Field(default_factory=list)
    mental_state: MentalState | None = None
    lifestyle_factors: list[LifestyleFactor] = Field(default_factory=list)
    mibyou_risk: MibyouRisk | None = None
    key_observations: list[str] = Field(default_factory=list)


class PriorityAction(BaseModel):
    action: str
    reason: str
    difficulty: str  # easy | medium | hard


class LifestyleSuggestion(BaseModel):
    category: str
    suggestion: str
    frequency: str


class AdviceResult(BaseModel):
    """アドバイス生成の結果。"""

    priority_actions: list[PriorityAction] = Field(default_factory=list)
    lifestyle_suggestions: list[LifestyleSuggestion] = Field(default_factory=list)
    caution_items: list[str] = Field(default_factory=list)
    positive_points: list[str] = Field(default_factory=list)
    seek_medical_attention: bool = False
    medical_attention_reason: str | None = None


class NotablePattern(BaseModel):
    pattern: str
    frequency: str
    concern_level: str  # low | medium | high


class WeeklySummary(BaseModel):
    """週間サマリーの結果。"""

    week_overview: str = ""
    health_trend: str = ""  # improving | stable | declining
    notable_patterns: list[NotablePattern] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    next_week_focus: list[str] = Field(default_factory=list)
