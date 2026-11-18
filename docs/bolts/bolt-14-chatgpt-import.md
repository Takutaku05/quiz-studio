# Bolt 14: ChatGPT Project Prompt & Text Paste (CSV / JSON) Import

## Scope
`docs/requirements-chatgpt-import.md` に基づき、**スマホ上で ChatGPT アプリと本アプリの2つだけを使い、ファイルをダウンロードせずに** 問題集を作成・登録できるようにする。具体的には、メッセージ全体コピー耐性のあるコードブロック抽出、JSON / CSV テキスト貼り付けパーサー、`.json` ファイルアップロード対応、ワンタップ「クリップボードから貼り付け」補助、および「ChatGPT用プロンプトをコピー」機能を実装する。

## Design Notes
- **共通バリデーションの再利用**:
  - `src/domain/csvParser.ts` の `REQUIRED_CSV_HEADERS` と `validateQuestionRows` を JSON パーサーでもそのまま利用し、CSV / Excel / JSON 間で検証ロジックを重複させない。
- **コードブロック抽出 & JSON / テキスト貼り付けパーサー (`src/domain/jsonParser.ts`)**:
  - `extractImportPayloadFromText(text)`:
    - テキスト内に Markdown コードフェンス（```` ```json ... ``` ```` / ```` ```csv ... ``` ```` / ```` ``` ... ``` ````）が含まれる場合、前後の会話文を無視してコードブロック内の本文を抽出する。
    - フェンスがない場合は前後空白をトリムした元テキストを返す。
  - `parseAndValidateJson(text)`: 配列 `QuestionInput[]` とオブジェクト `{ title?: string, questions: QuestionInput[] }` の両方を受け付け、各要素を `RawQuestionRowEntry`（`rowNumber = index + 1`）へ変換して `validateQuestionRows` を呼ぶ。抽出された `suggestedTitle` も返す。
  - `parseQuizTextInput(text)`: 抽出後の先頭文字が `[` または `{` なら `parseAndValidateJson`、それ以外は `parseAndValidateCsv` へ振り分ける。
  - `parseQuizUploadFile(file)`（`src/domain/xlsxParser.ts`）: `.json` 拡張子（および `application/json`）の分岐を追加し、`sourceType: 'csv' | 'xlsx' | 'json'` と `suggestedTitle?: string | null` を返せるようにする。
- **ChatGPT プロンプト定数 (`src/domain/chatgptPrompt.ts`)**:
  - `CHATGPT_PROJECT_PROMPT` を定数としてエクスポート（ファイル添付不要・原則 `{ "title": "...", "questions": [...] }` の単一 JSON コードブロック出力指示）。
- **アップロードモーダル (`src/components/CsvUploadModal.tsx`)**:
  - 入力タブ切替（「テキストを貼り付け」/「ファイルをアップロード」）。タブ切替時は表示中タブのパース結果・エラー状態へ切り替える。
  - テキスト貼り付けタブには「クリップボードから貼り付け」ボタン（`navigator.clipboard.readText()` + 非対応・拒否時のフォールバック案内）と `<textarea>` を配置する。
  - 貼り付け時は入力変更ごとに `parseQuizTextInput` を実行し、プレビュー件数・エラー一覧・タイトル補完（タイトル欄が空のときのみ `suggestedTitle` をセット）を更新する。
  - スマホ画面でも操作しやすいよう、「ChatGPT用プロンプトをコピー」ボタンを見やすい位置に配置し、テンプレート表・列ガイドは折りたたみ可能にする。

## Requirements & Acceptance Criteria
1. **コードブロック抽出 & テキスト貼り付けパーサー**
   - 前後に説明文（「以下が問題集です」など）を含むメッセージ全体コピーからでも、コードブロック内の JSON / CSV を抽出して正しく解析できる。
   - JSON は配列ルート・`{ title, questions }` ルートの両方に対応し、必須項目・選択肢順序・正解番号のエラーを既存と同じメッセージ規則で返す。
   - 不正な JSON 構文や空テキストに対して日本語エラーを返す。
2. **`.json` ファイルアップロード**
   - `parseQuizUploadFile` が `.json` ファイルを解析し、不正ファイル時はエラーを返す。
3. **アップロードモーダル (`CsvUploadModal`)**
   - 「テキストを貼り付け」「ファイルをアップロード」タブを切り替えられる。
   - 「クリップボードから貼り付け」ボタン（および直接ペースト）で有効な JSON / CSV を取り込むと問題数が表示され、JSON に `title` が含まれタイトル欄が空なら自動入力される。
   - バリデーションエラー時はエラー一覧が表示され、保存ボタンが無効化される。
   - 「ChatGPT用プロンプトをコピー」ボタンで `CHATGPT_PROJECT_PROMPT` がクリップボードにコピーされ、完了表示が出る。

## TDD Plan
1. `src/domain/jsonParser.test.ts`: 前後文章付きのコードブロック抽出、JSON 配列／オブジェクト＋`title`、数値/文字列 `answer`、バリデーションエラー、不正 JSON 構文、CSV/JSON 自動判別のテスト。
2. `src/domain/xlsxParser.test.ts`: `.json` ファイルの `parseQuizUploadFile` テストを追加。
3. `src/components/CsvUploadModal.test.tsx`: タブ切替、「クリップボードから貼り付け」、CSV/JSON 貼り付け、タイトル自動補完、前置き付きコードブロック貼り付け、ChatGPT プロンプトコピーのテストを追加。
