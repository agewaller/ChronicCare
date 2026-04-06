"""FastAPIアプリケーションのエントリポイント。"""

from fastapi import FastAPI

from src.api.routes import router

app = FastAPI(
    title="未病ダイアリー API",
    description="AI-powered preventive health diary with prompt/program separation",
    version="0.1.0",
)

app.include_router(router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
