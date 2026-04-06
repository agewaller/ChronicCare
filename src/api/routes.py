"""APIルート定義。

HTTPリクエスト/レスポンスの処理のみを担当。
ビジネスロジックはDiaryServiceに委譲する。
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.models.diary import DiaryEntry, UserProfile
from src.models.analysis import AnalysisResult, AdviceResult, WeeklySummary
from src.models.symptoms import ExtractedSymptoms
from src.services.diary_service import DiaryService

router = APIRouter(prefix="/api/v1", tags=["diary"])


def get_diary_service() -> DiaryService:
    return DiaryService()


# --- Request/Response schemas ---


class AnalyzeRequest(BaseModel):
    entry: DiaryEntry
    profile: UserProfile


class AdviceRequest(BaseModel):
    analysis: AnalysisResult
    health_history: list[AnalysisResult] = Field(default_factory=list)


class WeeklySummaryRequest(BaseModel):
    entries: list[DiaryEntry]
    previous_analyses: list[AnalysisResult] = Field(default_factory=list)


class ExtractRequest(BaseModel):
    text: str


# --- Endpoints ---


@router.post("/analyze", response_model=AnalysisResult)
async def analyze_diary(
    request: AnalyzeRequest,
    service: DiaryService = Depends(get_diary_service),
):
    """日記エントリを分析して未病リスクを評価する。"""
    return await service.analyze_entry(request.entry, request.profile)


@router.post("/advice", response_model=AdviceResult)
async def generate_advice(
    request: AdviceRequest,
    service: DiaryService = Depends(get_diary_service),
):
    """分析結果に基づいてアドバイスを生成する。"""
    history = request.health_history if request.health_history else None
    return await service.generate_advice(request.analysis, history)


@router.post("/weekly-summary", response_model=WeeklySummary)
async def weekly_summary(
    request: WeeklySummaryRequest,
    service: DiaryService = Depends(get_diary_service),
):
    """一週間分のエントリからサマリーを生成する。"""
    if not request.entries:
        raise HTTPException(status_code=400, detail="At least one entry is required")
    analyses = request.previous_analyses if request.previous_analyses else None
    return await service.weekly_summary(request.entries, analyses)


@router.post("/extract-symptoms", response_model=ExtractedSymptoms)
async def extract_symptoms(
    request: ExtractRequest,
    service: DiaryService = Depends(get_diary_service),
):
    """テキストから症状情報を抽出する。"""
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    return await service.extract_symptoms(request.text)


@router.get("/prompts")
async def list_prompts(
    service: DiaryService = Depends(get_diary_service),
):
    """利用可能なプロンプト一覧を取得する。"""
    return service._prompts.list_prompts()
