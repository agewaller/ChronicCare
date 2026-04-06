"""プロンプトローダーのテスト。

プロンプトの読み込み・レンダリング・バリデーションを検証する。
AIクライアントへの接続は不要。
"""

import pytest

from src.prompt_loader import PromptLoader


@pytest.fixture
def loader():
    return PromptLoader()


class TestPromptLoader:
    def test_list_prompts(self, loader: PromptLoader):
        prompts = loader.list_prompts()
        assert "analyze_diary" in prompts
        assert "generate_advice" in prompts
        assert "summarize_weekly" in prompts
        assert "extract_symptoms" in prompts

    def test_get_input_variables(self, loader: PromptLoader):
        vars = loader.get_input_variables("analyze_diary")
        assert "diary_entry" in vars
        assert "user_profile" in vars

    def test_render_analyze_diary(self, loader: PromptLoader):
        rendered = loader.render(
            "analyze_diary",
            {
                "diary_entry": "今日は頭が痛くて、あまり眠れなかった。",
                "user_profile": "年齢: 35歳\n性別: 男性",
            },
        )
        assert rendered.model is not None
        assert rendered.max_tokens > 0
        assert "未病" in rendered.system
        assert "頭が痛くて" in rendered.user_message
        assert "35歳" in rendered.user_message

    def test_render_extract_symptoms(self, loader: PromptLoader):
        rendered = loader.render(
            "extract_symptoms",
            {"diary_text": "朝食はパンとコーヒー。少し胃もたれ。"},
        )
        assert "胃もたれ" in rendered.user_message

    def test_render_missing_variable_raises(self, loader: PromptLoader):
        with pytest.raises(ValueError, match="Missing variables"):
            loader.render("analyze_diary", {"diary_entry": "test"})

    def test_unknown_prompt_raises(self, loader: PromptLoader):
        with pytest.raises(ValueError, match="Unknown prompt"):
            loader.render("nonexistent", {})

    def test_render_generate_advice(self, loader: PromptLoader):
        rendered = loader.render(
            "generate_advice",
            {
                "analysis_result": '{"mibyou_risk": {"level": "medium"}}',
                "health_history": "履歴なし",
            },
        )
        assert "アドバイス" in rendered.system or "アドバイザー" in rendered.system
        assert "medium" in rendered.user_message

    def test_render_summarize_weekly(self, loader: PromptLoader):
        rendered = loader.render(
            "summarize_weekly",
            {
                "weekly_entries": "月曜: 元気\n火曜: 少し疲れた",
                "trend_data": "トレンドなし",
            },
        )
        assert "月曜" in rendered.user_message
