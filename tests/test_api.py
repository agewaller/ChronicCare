"""APIエンドポイントのテスト。"""

import pytest
from httpx import AsyncClient, ASGITransport

from src.app import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


class TestHealthCheck:
    async def test_health(self, client: AsyncClient):
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestFrontend:
    async def test_index_page(self, client: AsyncClient):
        response = await client.get("/")
        assert response.status_code == 200
        assert "未病ダイアリー" in response.text

    async def test_index_has_linkify(self, client: AsyncClient):
        response = await client.get("/")
        assert "linkifyUrls" in response.text
        assert 'target="_blank"' in response.text


class TestPromptsList:
    async def test_list_prompts(self, client: AsyncClient):
        response = await client.get("/api/v1/prompts")
        assert response.status_code == 200
        data = response.json()
        assert "analyze_diary" in data
        assert "extract_symptoms" in data


class TestValidation:
    async def test_extract_empty_text_rejected(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/extract-symptoms",
            json={"text": "  "},
        )
        assert response.status_code == 400

    async def test_weekly_summary_empty_entries_rejected(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/weekly-summary",
            json={"entries": [], "previous_analyses": []},
        )
        assert response.status_code == 400
