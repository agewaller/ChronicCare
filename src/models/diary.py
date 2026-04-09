"""日記エントリとユーザープロフィールのデータモデル。

プロンプトの内容には依存しない純粋なデータ構造。
"""

from datetime import date, datetime, timezone
from pydantic import BaseModel, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class UserProfile(BaseModel):
    """ユーザーの基本プロフィール。"""

    user_id: str
    age: int | None = None
    gender: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    chronic_conditions: list[str] = Field(default_factory=list)
    lifestyle_notes: str | None = None

    def to_prompt_text(self) -> str:
        """プロンプトに挿入するためのテキスト表現を生成。"""
        parts = []
        if self.age:
            parts.append(f"年齢: {self.age}歳")
        if self.gender:
            parts.append(f"性別: {self.gender}")
        if self.height_cm:
            parts.append(f"身長: {self.height_cm}cm")
        if self.weight_kg:
            parts.append(f"体重: {self.weight_kg}kg")
        bmr = self.basal_metabolic_rate()
        if bmr is not None:
            parts.append(f"基礎代謝: 約{bmr}kcal")
        if self.chronic_conditions:
            parts.append(f"既往歴: {', '.join(self.chronic_conditions)}")
        if self.lifestyle_notes:
            parts.append(f"生活メモ: {self.lifestyle_notes}")
        return "\n".join(parts) if parts else "プロフィール情報なし"

    def basal_metabolic_rate(self) -> int | None:
        """基礎代謝量 (kcal/日) を計算。Mifflin-St Jeor 式を使用。

        年齢・身長・体重のいずれかが未設定の場合は None を返す。
        性別が男性/女性以外の場合は男女平均を返す。
        """
        if self.age is None or self.height_cm is None or self.weight_kg is None:
            return None
        base = 10.0 * self.weight_kg + 6.25 * self.height_cm - 5.0 * self.age
        if self.gender == "男性":
            return round(base + 5)
        if self.gender == "女性":
            return round(base - 161)
        # その他・未設定: 男女の中間値
        return round(base - 78)


class DiaryEntry(BaseModel):
    """一日分の日記エントリ。"""

    entry_id: str | None = None
    user_id: str
    entry_date: date
    text: str
    created_at: datetime = Field(default_factory=_utc_now)
