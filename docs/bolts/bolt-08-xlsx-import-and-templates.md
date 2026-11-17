# Bolt 08: Excel (.xlsx) Import & CSV / Excel Templates

## Scope
問題集のアップロードで CSV に加えて Excel（`.xlsx`）を受け付け、CSV と同じ列定義・バリデーションで取り込む。あわせて、書き方の見本となるテンプレート（CSV / Excel）をダッシュボードとアップロードモーダルからダウンロードできるようにする。

## Design Notes
- **パーサー共通化**: `csvParser.ts` の `REQUIRED_CSV_HEADERS` と `validateQuestionRows` を CSV / Excel で共有し、バリデーション結果（`CsvParseResult` / `CsvValidationError`）の形を揃える。
- **Excel 読み込み**: `read-excel-file/universal` で全シートを読み込む。セル値は文字列へ変換する（数値はそのまま、真偽値は `TRUE` / `FALSE`、日付は `YYYY-MM-DD` または ISO 文字列）。ヘッダーが重複した列は最初の列のみ使う。
- **シート選択**: 初期選択は「バリデーションを通過する最初のシート」→「必須ヘッダーを持つ最初のシート」→「先頭シート」。複数シートがある場合はモーダルで切り替えられる。
- **形式判定**: `parseQuizUploadFile` が拡張子（`.csv` / `.xlsx`）で振り分け、それ以外はエラーを返す。
- **テンプレート生成**:
  - CSV（`quiz_template.csv`）: BOM 付き UTF-8。ヘッダー + サンプル行。
  - Excel（`quiz_template.xlsx`）: `write-excel-file/universal` を動的 import して生成。シート `問題データ`（ヘッダー + サンプル行）と `書き方ガイド`（列ごとの説明と注意事項）の2シート構成。
  - 列の説明とサンプル行は `CSV_COLUMN_GUIDES` / `CSV_TEMPLATE_SAMPLE_ROWS` を CSV / Excel で共有する。

## Requirements & Acceptance Criteria
1. **Excel パーサー (`xlsxParser.ts`)**
   - `parseXlsxSheetData(sheetData)`: 1シート分を CSV と同じルールで検証する。空シートは `'シートが空です。'`。
   - `parseXlsxBuffer(buffer)`: 全シートを解析し、`sheets` / `selectedSheetName` / `questions` / `errors` を返す。シートが無い場合・読み込み失敗時は日本語エラーを返す。
   - `parseQuizUploadFile(file)`: 拡張子で CSV / Excel を判定し、`sourceType` 付きで結果を返す。
2. **アップロードモーダル (`CsvUploadModal`)**
   - `.csv` / `.xlsx` を受け付ける（ファイル選択・ドラッグ＆ドロップ）。タイトルの初期値は拡張子 `.csv` / `.xlsx` / `.xls` を除いたファイル名。
   - 複数シート時は「読み込むシート」セレクトを表示し、切り替えるとプレビュー・エラー表示が更新される。
   - 「鋳型（テンプレート）と書き方」エリアにテンプレート Excel / CSV のダウンロードボタンと列ガイドを表示する。
3. **ダッシュボード (`DashboardPage`)**
   - ヘッダーと空状態に「テンプレートExcel」「テンプレートCSV」ダウンロード導線を表示する。Excel 生成中はボタンを無効化して「Excel作成中...」を表示する。

## TDD Plan
1. `src/domain/xlsxParser.test.ts`: セル値の文字列化、ヘッダー重複、空シート、複数シートの初期選択、壊れたファイル、拡張子判定のテスト。
2. `src/domain/csvTemplate.test.ts` / `src/domain/xlsxTemplate.test.ts`: テンプレートがヘッダー・サンプル行を含み、パーサーで読み戻すとバリデーションを通過すること。
3. `src/components/CsvUploadModal.test.tsx` / `src/pages/DashboardPage.test.tsx`: `.xlsx` アップロード、シート切替、テンプレートダウンロード導線のテスト。
