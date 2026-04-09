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


PROVIDER_KEYS = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "google": "GOOGLE_API_KEY",
}


def _provider_key_status() -> dict[str, bool]:
    return {
        provider: bool(os.environ.get(env_var))
        for provider, env_var in PROVIDER_KEYS.items()
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    status = _provider_key_status()
    active = [p for p, ok in status.items() if ok]
    if not active:
        logger.warning(
            "No AI provider API keys set. AI endpoints will return 502 errors. "
            "Set at least one of: %s",
            ", ".join(PROVIDER_KEYS.values()),
        )
    else:
        logger.info("AI providers available: %s", ", ".join(active))
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
    """各AIプロバイダーのAPIキー設定状態を含む、準備完了状態を返す。"""
    providers = _provider_key_status()
    any_set = any(providers.values())
    return {
        "status": "ok" if any_set else "degraded",
        "providers": providers,
        # 後方互換: 旧クライアントが api_key_configured を参照するため保持
        "api_key_configured": providers["anthropic"],
    }
