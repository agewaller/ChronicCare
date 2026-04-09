# 未病ダイアリー (Mibyou Diary)

AI によるプロンプト駆動型 **未病（みびょう）** 予防ヘルスケア日記アプリ。

> **未病** とは、健康と病気の間のグレーゾーンにある状態を指します。このアプリは日々の
> 体調記録を AI が分析し、未病リスクを早期に発見・改善するための気づきを提供します。

## 特徴

- **プロンプトとプログラムの完全分離**: すべての AI プロンプトは `prompts/` ディレクトリに YAML ファイルとして独立管理され、プログラムロジックから切り離されています
- **型安全**: Pydantic v2 による厳格なスキーマ検証
- **Claude API**: Anthropic の最新モデル (Claude Sonnet 4.6 / Haiku 4.5) を使用
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
# .env を編集し ANTHROPIC_API_KEY を入力
```

または直接 export：

```bash
export ANTHROPIC_API_KEY='sk-ant-...'
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
model: claude-sonnet-4-6
max_tokens: 1024
temperature: 0.3
system: |
  システムプロンプト（AI の役割定義）
user_template: |
  ユーザーメッセージテンプレート
  変数は {{ variable_name }} で埋め込む
```

新しいプロンプトを追加する場合は `prompts/manifest.yaml` に登録し、
必要な `input_variables` を宣言してください。プログラム側のコードを変更せずに
プロンプトの差し替えが可能です。

## 本番運用上の注意

- **API キー管理**: `ANTHROPIC_API_KEY` を `.env` に書く場合、`.env` は `.gitignore` 済みです。絶対にコミットしないでください
- **レート制限**: Anthropic API のレート制限超過時は 502 が返されます
- **ログ**: `LOG_LEVEL=DEBUG` で詳細ログを有効化できます
- **データ永続化**: 現時点では永続化層（DB）はありません。将来的な追加を検討中です

## ライセンス

未定
