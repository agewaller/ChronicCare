"""FastAPIアプリケーションのエントリポイント。"""

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from src.api.routes import router

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="未病ダイアリー API",
    description="AI-powered preventive health diary with prompt/program separation",
    version="0.1.0",
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
