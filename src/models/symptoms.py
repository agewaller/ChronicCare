"""症状抽出のデータモデル。"""

from pydantic import BaseModel, Field


class Symptom(BaseModel):
    name: str
    severity: str  # mild | moderate | severe | unknown
    duration: str | None = None


class Mood(BaseModel):
    state: str
    score: int | None = None


class Sleep(BaseModel):
    quality: str  # good | fair | poor | unknown
    hours: float | None = None


class Meal(BaseModel):
    type: str  # 朝食 | 昼食 | 夕食 | 間食
    description: str


class Exercise(BaseModel):
    done: bool
    type: str | None = None
    duration_minutes: int | None = None


class ExtractedSymptoms(BaseModel):
    """日記テキストから抽出された構造化データ。"""

    symptoms: list[Symptom] = Field(default_factory=list)
    mood: Mood | None = None
    sleep: Sleep | None = None
    meals: list[Meal] = Field(default_factory=list)
    exercise: Exercise | None = None
    other_notes: list[str] = Field(default_factory=list)
