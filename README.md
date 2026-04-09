# 未病ダイアリー (Mibyou Diary)

AI によるプロンプト駆動型 **未病（みびょう）** 予防ヘルスケア日記アプリ。

> **未病** とは、健康と病気の間のグレーゾーンにある状態を指します。このアプリは日々の
> 体調記録を AI が分析し、未病リスクを早期に発見・改善するための気づきを提供します。

## 特徴

- **プロンプトとプログラムの完全分離**: すべての AI プロンプトは `prompts/` ディレクトリに YAML ファイルとして独立管理され、プログラムロジックから切り離されています
- **型安全**: Pydantic v2 による厳格なスキーマ検証
- **マルチプロバイダーAI対応**: Anthropic Claude / OpenAI GPT / Google Gemini を自動振り分け
  - `claude-*`, `gpt-*` / `o1-*` / `o3-*`, `gemini-*` というモデル名だけで切り替え可能
- **日本語ファースト**: すべてのプロンプト・UI が日本語

## アーキテクチャ

```
┌─────────────────────────────────────────────┐
│  Frontend (static/index.html)               │
│  ├ プロフィール / 日記入力                    │
│  └ 分析結果 / アドバイス / 症状抽出表示         │
└──────────────────┬──────────────────────────┘
                   │ HTTP (fetch)
┌──────────────────▼──────────────────────────┐
│  FastAPI (src/api/routes.py)                │
│  └ リクエスト/レスポンス処理のみ              │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  DiaryService (src/services/diary_service)  │
│  └ ビジネスロジック / スキーマ検証            │
└───────┬───────────────────────┬──────────────┘
        │                       │
┌───────▼─────────┐    ┌───────▼─────────────┐
│ PromptLoader    │    │ AIClient            │
│ prompts/*.yaml  │    │ Anthropic API       │
└─────────────────┘    └─────────────────────┘
```

### ディレクトリ構成

```
ChronicCare/
├── prompts/             # AI プロンプト（YAML）
│   ├── manifest.yaml    # プロンプト一覧定義
│   ├── analyze_diary.yaml
│   ├── generate_advice.yaml
│   ├── summarize_weekly.yaml
│   └── extract_symptoms.yaml
├── src/
│   ├── app.py           # FastAPI アプリケーション
│   ├── api/routes.py    # HTTP エンドポイント定義
│   ├── models/          # Pydantic データモデル
│   │   ├── diary.py
│   │   ├── analysis.py
│   │   └── symptoms.py
│   ├── services/
│   │   ├── ai_client.py     # Anthropic API ラッパー
│   │   └── diary_service.py # ビジネスロジック
│   └── prompt_loader.py # プロンプト YAML 読込・レンダリング
├── static/
│   └── index.html       # シングルページ Web UI
├── tests/               # pytest テスト
└── pyproject.toml
```

## セットアップ

### 1. 依存関係のインストール

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e '.[dev]'
```

### 2. 環境変数の設定

`.env.example` を `.env` にコピーして API キーを設定：

```bash
cp .env.example .env
# .env を編集して使いたいプロバイダーのキーを入力
```

必要なキーは使用するモデルによって変わります（少なくとも1つ必要）：

| プロバイダー | 環境変数 | 発行ページ |
|---|---|---|
| Anthropic Claude | `ANTHROPIC_API_KEY` | https://console.anthropic.com/ |
| OpenAI GPT | `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| Google Gemini | `GOOGLE_API_KEY` | https://aistudio.google.com/app/apikey |

または直接 export：

```bash
export ANTHROPIC_API_KEY='sk-ant-...'
export OPENAI_API_KEY='sk-...'
export GOOGLE_API_KEY='AIza...'
```

### 3. サーバー起動

```bash
uvicorn src.app:app --reload --port 8000
```

ブラウザで [http://localhost:8000](http://localhost:8000) を開く。

### 4. テスト実行

```bash
pytest
```

## API エンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/` | Web UI (HTML) |
| GET | `/health` | 簡易ヘルスチェック |
| GET | `/ready` | API キー設定状態を含む準備完了チェック |
| GET | `/api/v1/prompts` | 利用可能なプロンプト一覧 |
| POST | `/api/v1/analyze` | 日記エントリを分析 |
| POST | `/api/v1/advice` | 分析結果に基づくアドバイス生成 |
| POST | `/api/v1/weekly-summary` | 週間サマリー |
| POST | `/api/v1/extract-symptoms` | 症状情報抽出 |

API ドキュメント（Swagger UI）: [http://localhost:8000/docs](http://localhost:8000/docs)

## プロンプトの編集

プロンプトはすべて `prompts/*.yaml` にあります。各ファイルは以下の構造：

```yaml
model: claude-opus-4-6
max_tokens: 2048
temperature: 0.3
system: |
  システムプロンプト（AI の役割定義）
user_template: |
  ユーザーメッセージテンプレート
  変数は {{ variable_name }} で埋め込む
```

### モデルの切り替え（マルチプロバイダー）

`model:` フィールドにモデル名を書くだけで、使用するプロバイダーが自動判定されます。
コード変更は一切不要です：

| モデル例 | プロバイダー | 用途 |
|---|---|---|
| `claude-opus-4-6` | Anthropic | **現在のデフォルト**。最高精度の深い分析・推論 |
| `claude-sonnet-4-6` | Anthropic | 高速・高精度バランス |
| `claude-haiku-4-5-20251001` | Anthropic | 超高速・低コスト（簡単な抽出向け）|
| `gpt-4o` | OpenAI | マルチモーダル、JSON出力対応 |
| `gpt-4o-mini` | OpenAI | 高速・低コスト |
| `o1`, `o3` | OpenAI | 高度な推論（temperature 非対応）|
| `gemini-2.5-pro` | Google | 1M トークンの超長文対応 |
| `gemini-2.5-flash` | Google | 高速・低コスト |

### 現在のデフォルトモデル

| プロンプト | モデル | 理由 |
|---|---|---|
| `analyze_diary` | `claude-opus-4-6` | 複雑な症状分析・未病リスク判定 |
| `generate_advice` | `claude-opus-4-6` | 質の高いパーソナライズアドバイス |
| `summarize_weekly` | `claude-opus-4-6` | 週間データの統合的分析 |
| `extract_symptoms` | `claude-sonnet-4-6` | 構造化抽出（速度重視）|

### 新しいプロンプトの追加

`prompts/manifest.yaml` に登録し、必要な `input_variables` を宣言してください。
プログラム側のコードを変更せずにプロンプトの差し替え・追加が可能です。

## 本番運用上の注意

- **API キー管理**: `ANTHROPIC_API_KEY` を `.env` に書く場合、`.env` は `.gitignore` 済みです。絶対にコミットしないでください
- **レート制限**: Anthropic API のレート制限超過時は 502 が返されます
- **ログ**: `LOG_LEVEL=DEBUG` で詳細ログを有効化できます
- **データ永続化**: 現時点では永続化層（DB）はありません。将来的な追加を検討中です

## ライセンス

未定
