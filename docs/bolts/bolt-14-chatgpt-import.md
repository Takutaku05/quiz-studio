# Bolt 14: ChatGPT Project Prompt & Text Paste (CSV / JSON) Import

## Scope
`docs/requirements-chatgpt-import.md` に基づき、**スマホ上で ChatGPT アプリと本アプリの2つだけを使い、ファイルをダウンロードせずに** 問題集を作成・登録できるようにする。具体的には、メッセージ全体コピー耐性のあるコードブロック抽出、JSON / CSV テキスト貼り付けパーサー、`.json` ファイルアップロード対応、ワンタップ「クリップボードから貼り付け」補助、および「ChatGPT用プロンプトをコピー」機能を実装する。

## Design Notes
- **共通バリデーションの再利用**:
  - `src/domain/csvParser.ts` の `REQUIRED_CSV_HEADERS` と `validateQuestionRows` を JSON パーサーでもそのまま利用し、CSV / Excel / JSON 間で検証ロジックを重複させない。
- **コードブロック抽出 & JSON / テキスト貼り付けパーサー (`src/domain/jsonParser.ts`)**:
  - `extractImportPayloadFromText(text)` / `parseQuizTextInput(text)`:
    - テキスト内に Markdown コードフェンス（```` ```json ... ``` ```` / ```` ```csv ... ``` ```` / ```` ``` ... ``` ````）が含まれる場合、前後の会話文を無視してコードブロック内の本文を抽出する（閉じフェンス ```` ``` ```` が欠落していても末尾まで抽出する）。
    - 複数コードブロックがある場合は、各ブロックを順に試して **JSON / CSV として有効な最初のブロック** を採用する（すべて失敗した場合は最初のコードブロックの結果を返す）。
    - フェンスがない場合は前後空白をトリムした元テキストをそのまま解析する。
    - 抽出後の先頭文字が `[` または `{` なら `parseAndValidateJson`、それ以外は `parseAndValidateCsv` へ振り分ける。
  - `parseAndValidateJson(text)`: 配列 `QuestionInput[]` とオブジェクト `{ title?: string, questions: QuestionInput[] }` の両方を受け付け、各要素を `RawQuestionRowEntry`（`rowNumber = index + 1`）へ変換して `validateQuestionRows` を呼ぶ。抽出された `suggestedTitle` も返す。
  - `parseQuizUploadFile(file)`（`src/domain/xlsxParser.ts`）: `.json` 拡張子（および `application/json`）の分岐を追加し、`sourceType: 'csv' | 'xlsx' | 'json'` と `suggestedTitle?: string | null` を返せるようにする。
- **ChatGPT プロンプト定数 (`src/domain/chatgptPrompt.ts`)**:
  - `CHATGPT_PROJECT_PROMPT` を定数としてエクスポート（ファイル添付不要・原則 `{ "title": "...", "questions": [...] }` の単一 JSON コードブロック出力指示）。
- **アップロードモーダル (`src/components/CsvUploadModal.tsx`)**:
  - **画面幅に応じた初期タブ切替**: モーダルを開いた時点でスマホ幅（`window.innerWidth < 640`）なら「テキストを貼り付け」、PC / タブレット幅（`>= 640`）なら「ファイルをアップロード」を初期表示にする。タブ切替時は表示中タブのパース結果・エラー状態へ切り替える。
  - **ボタン配置**: ダッシュボード上部のボタン群はシンプルに保ち、「ChatGPT用プロンプトをコピー」ボタンはアップロードモーダル内にのみ配置する（テンプレート詳細を折りたたんでいても常に見える位置に置く）。
  - テキスト貼り付けタブには「クリップボードから貼り付け」ボタン（`navigator.clipboard.readText()` + 非対応・拒否時のフォールバック案内）と `<textarea>` を配置する。
  - **タイトル自動補完の優先順位**:
    - テキスト貼り付け時: タイトル欄が空のときのみ JSON 内の `suggestedTitle` を自動補完する。
    - `.json` ファイル選択時: JSON 内に有効な `suggestedTitle` があればそれを優先し、なければファイル名（`.json` 除去）を補完する（ただしユーザーが手動編集済みの場合は上書きしない）。

## Requirements & Acceptance Criteria
1. **コードブロック抽出 & テキスト貼り付けパーサー**
   - 前後に説明文（「以下が問題集です」など）を含むメッセージ全体コピーからでも、コードブロック内の JSON / CSV を抽出して正しく解析できる。
   - 複数コードブロックがある場合は有効な最初のブロックを採用し、閉じフェンス（```` ``` ````）が欠けていても末尾まで抽出できる。
   - JSON は配列ルート・`{ title, questions }` ルートの両方に対応し、必須項目・選択肢順序・正解番号のエラーを既存と同じメッセージ規則で返す。
   - 不正な JSON 構文や空テキストに対して日本語エラーを返す。
2. **`.json` ファイルアップロード**
   - `parseQuizUploadFile` が `.json` ファイルを解析し、JSON 内の `title`（なければファイル名）を補完候補として返し、不正ファイル時はエラーを返す。
3. **アップロードモーダル (`CsvUploadModal`)**
   - 画面幅に応じて初期タブ（スマホ幅 `< 640px` は「テキストを貼り付け」、PC幅 `>= 640px` は「ファイルをアップロード」）が選ばれ、手動でも切り替えられる。
   - 「クリップボードから貼り付け」ボタン（および直接ペースト）で有効な JSON / CSV を取り込むと問題数が表示され、JSON に `title` が含まれタイトル欄が空なら自動入力される。
   - バリデーションエラー時はエラー一覧が表示され、保存ボタンが無効化される。
   - モーダル内の「ChatGPT用プロンプトをコピー」ボタンで `CHATGPT_PROJECT_PROMPT` がクリップボードにコピーされ、完了表示が出る（ダッシュボード上部には追加しない）。

## TDD Plan
1. `src/domain/jsonParser.test.ts`: 前後文章付きのコードブロック抽出、複数コードブロック（先頭が無効・2つ目が有効）、閉じフェンス欠落、JSON 配列／オブジェクト＋`title`、数値/文字列 `answer`、バリデーションエラー、不正 JSON 構文、CSV/JSON 自動判別のテスト。
2. `src/domain/xlsxParser.test.ts`: `.json` ファイルの `parseQuizUploadFile` テスト（`suggestedTitle` 抽出含む）を追加。
3. `src/components/CsvUploadModal.test.tsx`: 画面幅別初期タブ、タブ切替、「クリップボードから貼り付け」、CSV/JSON 貼り付け、タイトル自動補完（JSON内 `title` 優先 / ファイル名フォールバック）、前置き付きコードブロック貼り付け、ChatGPT プロンプトコピーのテストを追加。
