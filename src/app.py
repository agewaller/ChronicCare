"""FastAPIアプリケーションのエントリポイント。"""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from src.api.routes import router

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    if not os.environ.get("ANTHROPIC_API_KEY"):
        logger.warning(
            "ANTHROPIC_API_KEY is not set. AI endpoints will return 502 errors."
        )
    else:
        logger.info("ANTHROPIC_API_KEY detected.")
    logger.info("未病ダイアリー API starting up.")
    yield
    # Shutdown
    logger.info("未病ダイアリー API shutting down.")


app = FastAPI(
    title="未病ダイアリー API",
    description="AI-powered preventive health diary with prompt/program separation",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(router)

STATIC_DIR = Path(__file__).parent.parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
async def index():
    """フロントエンドページを返す。"""
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/ready")
async def readiness_check():
    """AI APIキーが設定されているかを含む、準備完了状態を返す。"""
    api_key_set = bool(os.environ.get("ANTHROPIC_API_KEY"))
    return {
        "status": "ok" if api_key_set else "degraded",
        "api_key_configured": api_key_set,
    }
