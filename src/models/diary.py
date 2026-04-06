"""日記エントリとユーザープロフィールのデータモデル。

プロンプトの内容には依存しない純粋なデータ構造。
"""

from datetime import date, datetime
from pydantic import BaseModel, Field


class UserProfile(BaseModel):
    """ユーザーの基本プロフィール。"""

    user_id: str
    age: int | None = None
    gender: str | None = None
    chronic_conditions: list[str] = Field(default_factory=list)
    lifestyle_notes: str | None = None

    def to_prompt_text(self) -> str:
        """プロンプトに挿入するためのテキスト表現を生成。"""
        parts = []
        if self.age:
            parts.append(f"年齢: {self.age}歳")
        if self.gender:
            parts.append(f"性別: {self.gender}")
        if self.chronic_conditions:
            parts.append(f"既往歴: {', '.join(self.chronic_conditions)}")
        if self.lifestyle_notes:
            parts.append(f"生活メモ: {self.lifestyle_notes}")
        return "\n".join(parts) if parts else "プロフィール情報なし"


class DiaryEntry(BaseModel):
    """一日分の日記エントリ。"""

    entry_id: str | None = None
    user_id: str
    entry_date: date
    text: str
    created_at: datetime = Field(default_factory=datetime.now)
