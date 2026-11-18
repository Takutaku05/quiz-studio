# Bolt 14: ChatGPT Project Prompt & Text Paste (CSV / JSON) Import

## Scope
`docs/requirements-chatgpt-import.md` に基づき、ChatGPT プロジェクトで作成した問題集を「CSV Quiz Studio」へスムーズに取り込めるようにする。具体的には、JSON パーサーの追加、テキスト貼り付け（CSV / JSON 自動判別・コードフェンス除去）対応、`.json` ファイルアップロード対応、および「ChatGPT用プロンプトをコピー」機能を実装する。

## Design Notes
- **共通バリデーションの再利用**:
  - `src/domain/csvParser.ts` の `REQUIRED_CSV_HEADERS` と `validateQuestionRows` を JSON パーサーでもそのまま利用し、CSV / Excel / JSON 間で検証ロジックを重複させない。
- **JSON / テキスト貼り付けパーサー (`src/domain/jsonParser.ts` または `textImportParser.ts`)**:
  - `stripCodeFence(text)`: 先頭・末尾の ```` ```csv ```` / ```` ```json ```` / ```` ``` ```` を除去する。
  - `parseAndValidateJson(text)`: 配列 `QuestionInput[]` とオブジェクト `{ title?: string, questions: QuestionInput[] }` の両方を受け付け、各要素を `RawQuestionRowEntry`（`rowNumber = index + 1`）へ変換して `validateQuestionRows` を呼ぶ。抽出された `suggestedTitle` も返す。
  - `parseQuizTextInput(text)`: コードフェンス除去後、先頭文字が `[` または `{` なら `parseAndValidateJson`、それ以外は `parseAndValidateCsv` へ振り分ける。
  - `parseQuizUploadFile(file)`（`src/domain/xlsxParser.ts`）: `.json` 拡張子（および `application/json`）の分岐を追加し、`sourceType: 'csv' | 'xlsx' | 'json'` と `suggestedTitle?: string | null` を返せるようにする。
- **ChatGPT プロンプト定数 (`src/domain/chatgptPrompt.ts`)**:
  - `CHATGPT_PROJECT_PROMPT` を定数としてエクスポートし、ヘッダー名配列 `REQUIRED_CSV_HEADERS` を参照して仕様と実装のズレを防ぐ。
- **アップロードモーダル (`src/components/CsvUploadModal.tsx`)**:
  - 入力タブ切替（「ファイルをアップロード」/「テキストを貼り付け」）。タブ切替時は表示中タブのパース結果・エラー状態へ切り替える。
  - テキスト貼り付け時は入力変更ごとに `parseQuizTextInput` を実行し、プレビュー件数・エラー一覧・タイトル補完（タイトル未入力時のみ `suggestedTitle` をセット）を更新する。
  - 「鋳型（テンプレート）と書き方」エリアに「ChatGPT用プロンプトをコピー」ボタンを追加する。

## Requirements & Acceptance Criteria
1. **テキスト貼り付けパーサー & JSON パーサー**
   - コードフェンス付き／なしの CSV テキストおよび JSON テキストを正しく解析できる。
   - JSON は配列ルート・`{ title, questions }` ルートの両方に対応し、必須項目・選択肢順序・正解番号のエラーを既存と同じメッセージ規則で返す。
   - 不正な JSON 構文や空テキストに対して日本語エラーを返す。
2. **`.json` ファイルアップロード**
   - `parseQuizUploadFile` が `.json` ファイルを解析し、不正ファイル時はエラーを返す。
3. **アップロードモーダル (`CsvUploadModal`)**
   - 「ファイルをアップロード」「テキストを貼り付け」タブを切り替えられる。
   - 貼り付け欄に有効な CSV または JSON を入力すると問題数と保存ボタンが有効になる（JSON に `title` が含まれ、タイトル欄が空なら自動入力される）。
   - バリデーションエラー時はエラー一覧が表示され、保存ボタンが無効化される。
   - 「ChatGPT用プロンプトをコピー」ボタンで `CHATGPT_PROJECT_PROMPT` がクリップボードにコピーされ、完了表示が出る。

## TDD Plan
1. `src/domain/jsonParser.test.ts`: コードフェンス除去、JSON 配列／オブジェクト＋`title`、数値/文字列 `answer`、バリデーションエラー、不正 JSON 構文、CSV/JSON 自動判別のテスト。
2. `src/domain/xlsxParser.test.ts`: `.json` ファイルの `parseQuizUploadFile` テストを追加。
3. `src/components/CsvUploadModal.test.tsx`: タブ切替、CSV/JSON 貼り付け、タイトル自動補完、コードフェンス付き貼り付け、ChatGPT プロンプトコピーのテストを追加。
