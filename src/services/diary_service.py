"""日記サービス：ビジネスロジック層。

プロンプトローダーとAIクライアントを組み合わせて、
日記の分析・アドバイス生成・サマリー作成を行う。

このサービスはプロンプトの具体的な内容を知らない。
プロンプト名と必要な変数のマッピングのみを知る。
"""

import json
import logging

from pydantic import ValidationError

from src.models.diary import DiaryEntry, UserProfile
from src.models.analysis import AnalysisResult, AdviceResult, WeeklySummary
from src.models.symptoms import ExtractedSymptoms
from src.prompt_loader import PromptLoader
from src.services.ai_client import AIClient, AIClientError

logger = logging.getLogger(__name__)


class DiaryService:
    """未病ダイアリーのコアビジネスロジック。"""

    def __init__(
        self,
        prompt_loader: PromptLoader | None = None,
        ai_client: AIClient | None = None,
    ):
        self._prompts = prompt_loader or PromptLoader()
        self._ai = ai_client or AIClient()

    def list_prompts(self) -> dict[str, str]:
        """利用可能なプロンプト一覧を返す。"""
        return self._prompts.list_prompts()

    async def analyze_entry(
        self, entry: DiaryEntry, profile: UserProfile
    ) -> AnalysisResult:
        """日記エントリを分析して未病リスクを評価する。"""
        rendered = self._prompts.render(
            "analyze_diary",
            {
                "diary_entry": entry.text,
                "user_profile": profile.to_prompt_text(),
            },
        )
        raw = await self._ai.send(rendered)
        return self._validate("analyze_diary", raw, AnalysisResult)

    async def generate_advice(
        self,
        analysis: AnalysisResult,
        health_history: list[AnalysisResult] | None = None,
    ) -> AdviceResult:
        """分析結果に基づいてアドバイスを生成する。"""
        history_text = "履歴なし"
        if health_history:
            history_text = json.dumps(
                [a.model_dump() for a in health_history],
                ensure_ascii=False,
                indent=2,
            )

        rendered = self._prompts.render(
            "generate_advice",
            {
                "analysis_result": json.dumps(
                    analysis.model_dump(), ensure_ascii=False, indent=2
                ),
                "health_history": history_text,
            },
        )
        raw = await self._ai.send(rendered)
        return self._validate("generate_advice", raw, AdviceResult)

    async def weekly_summary(
        self,
        entries: list[DiaryEntry],
        previous_analyses: list[AnalysisResult] | None = None,
    ) -> WeeklySummary:
        """一週間分のエントリからサマリーを生成する。"""
        entries_text = "\n---\n".join(
            f"【{e.entry_date}】\n{e.text}" for e in entries
        )
        trend_text = "トレンドデータなし"
        if previous_analyses:
            trend_text = json.dumps(
                [a.model_dump() for a in previous_analyses],
                ensure_ascii=False,
                indent=2,
            )

        rendered = self._prompts.render(
            "summarize_weekly",
            {
                "weekly_entries": entries_text,
                "trend_data": trend_text,
            },
        )
        raw = await self._ai.send(rendered)
        return self._validate("summarize_weekly", raw, WeeklySummary)

    async def extract_symptoms(self, text: str) -> ExtractedSymptoms:
        """テキストから症状情報を抽出する。"""
        rendered = self._prompts.render(
            "extract_symptoms",
            {"diary_text": text},
        )
        raw = await self._ai.send(rendered)
        return self._validate("extract_symptoms", raw, ExtractedSymptoms)

    @staticmethod
    def _validate(prompt_name: str, raw: dict, model_cls):
        """AIレスポンスをモデルに検証する。スキーマ不一致は AIClientError としてラップ。"""
        try:
            return model_cls.model_validate(raw)
        except ValidationError as e:
            logger.warning(
                "Validation failed for %s: %s", prompt_name, e
            )
            raise AIClientError(
                f"AIレスポンスが期待する形式と一致しません ({prompt_name}): {e.error_count()} error(s)",
                e,
            )
