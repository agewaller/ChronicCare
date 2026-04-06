"""プロンプトローダー：prompts/ディレクトリからテンプレートを読み込み、レンダリングする。

これがプログラムとプロンプトの橋渡し役。
- プログラム側はプロンプトの具体的な内容を知らない
- プロンプト側はプログラムのデータ構造を知らない
- このローダーが両者を接続する
"""

from pathlib import Path
from typing import Any

import yaml
from jinja2 import Environment, BaseLoader
from pydantic import BaseModel, Field

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


class PromptConfig(BaseModel):
    """YAMLから読み込まれたプロンプト設定。"""

    model: str
    max_tokens: int
    temperature: float
    system: str
    user_template: str


class RenderedPrompt(BaseModel):
    """レンダリング済みのプロンプト。APIに直接渡せる形式。"""

    model: str
    max_tokens: int
    temperature: float
    system: str
    user_message: str


class PromptManifest(BaseModel):
    """マニフェストのエントリ。"""

    file: str
    description: str
    input_variables: list[str] = Field(default_factory=list)
    output_format: str = "structured_json"


class PromptLoader:
    """プロンプトテンプレートの読み込みとレンダリングを担当。"""

    def __init__(self, prompts_dir: Path | None = None):
        self._dir = prompts_dir or PROMPTS_DIR
        self._jinja = Environment(loader=BaseLoader(), autoescape=False)
        self._cache: dict[str, PromptConfig] = {}
        self._manifest: dict[str, PromptManifest] | None = None

    def _load_manifest(self) -> dict[str, PromptManifest]:
        if self._manifest is not None:
            return self._manifest

        manifest_path = self._dir / "manifest.yaml"
        with open(manifest_path) as f:
            raw = yaml.safe_load(f)

        self._manifest = {
            name: PromptManifest(**config)
            for name, config in raw["prompts"].items()
        }
        return self._manifest

    def _load_config(self, prompt_name: str) -> PromptConfig:
        if prompt_name in self._cache:
            return self._cache[prompt_name]

        manifest = self._load_manifest()
        if prompt_name not in manifest:
            available = ", ".join(manifest.keys())
            raise ValueError(
                f"Unknown prompt: '{prompt_name}'. Available: {available}"
            )

        entry = manifest[prompt_name]
        prompt_path = self._dir / entry.file
        with open(prompt_path) as f:
            raw = yaml.safe_load(f)

        config = PromptConfig(
            model=raw["model"],
            max_tokens=raw["max_tokens"],
            temperature=raw["temperature"],
            system=raw["system"].strip(),
            user_template=raw["user_template"].strip(),
        )
        self._cache[prompt_name] = config
        return config

    def list_prompts(self) -> dict[str, str]:
        """利用可能なプロンプト一覧を返す。"""
        manifest = self._load_manifest()
        return {name: entry.description for name, entry in manifest.items()}

    def get_input_variables(self, prompt_name: str) -> list[str]:
        """指定プロンプトに必要な入力変数を返す。"""
        manifest = self._load_manifest()
        if prompt_name not in manifest:
            raise ValueError(f"Unknown prompt: '{prompt_name}'")
        return manifest[prompt_name].input_variables

    def render(self, prompt_name: str, variables: dict[str, Any]) -> RenderedPrompt:
        """プロンプトをレンダリングしてAPI呼び出し可能な形式にする。

        Args:
            prompt_name: マニフェストで定義されたプロンプト名
            variables: テンプレートに渡す変数

        Returns:
            RenderedPrompt: レンダリング済みプロンプト

        Raises:
            ValueError: 必要な変数が不足している場合
        """
        config = self._load_config(prompt_name)
        manifest = self._load_manifest()
        entry = manifest[prompt_name]

        # 必要な変数の検証
        missing = set(entry.input_variables) - set(variables.keys())
        if missing:
            raise ValueError(
                f"Missing variables for '{prompt_name}': {', '.join(missing)}"
            )

        # Jinja2テンプレートのレンダリング
        template = self._jinja.from_string(config.user_template)
        user_message = template.render(**variables)

        return RenderedPrompt(
            model=config.model,
            max_tokens=config.max_tokens,
            temperature=config.temperature,
            system=config.system,
            user_message=user_message,
        )
