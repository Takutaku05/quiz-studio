# Bolt 01: CSV Parser & Validation

## Scope
CSVファイル（File / ArrayBuffer / string）の読み込み、文字コード判定（UTF-8 / Shift-JIS）、PapaParseによるパース、および要件定義書 3.1 に準拠した全行バリデーションを実装する。

## Requirements & Acceptance Criteria
1. **文字コードデコード (`decodeCsvBuffer`)**
   - UTF-8（BOMあり/なし）を正しく文字列へ変換する。
   - UTF-8として不正なバイト列（Shift-JISの日本語CSV等）の場合、`shift_jis` としてフォールバックデコードする。
2. **ヘッダー検証**
   - 必須ヘッダー: `question`, `choice1`, `choice2`, `choice3`, `choice4`, `answer`, `explanation`
   - 必要なヘッダーが不足している場合、どのカラムが不足しているかをエラーとして返す。
3. **行バリデーション（全行スキャン）**
   - 1行目（ヘッダー）を除く各データ行について、CSV上の行番号（2行目〜）を特定してエラーを収集する。
   - 空行（全セル空）はスキップする（PapaParse `skipEmptyLines: true`）。
   - データ行が0件の場合はエラーとする。
   - **必須チェック**: `question`, `choice1`, `choice2`, `answer` が空欄（空白のみ含む）でないこと。
   - **選択肢順序チェック**: `choice3` が空欄で `choice4` に値がある場合はエラー（「選択肢3を埋めてください」）。
   - **正解番号チェック**:
     - `answer` が半角数字 `1` 〜 `4` のいずれかであること（全角数字や範囲外、文字列はエラー）。
     - 指定された `answer` に対応する選択肢（`choice{answer}`）が空欄でないこと（例: `choice3` が空欄で `answer=3` はエラー）。
4. **出力**
   - 成功時: `{ ok: true, questions: ParsedQuestion[], errors: [] }`
   - 失敗時: `{ ok: false, questions: [], errors: CsvValidationError[] }`（`{ row: number, field?: string, message: string }`）

## TDD Plan
1. `src/domain/csvParser.test.ts` に失敗するテストを作成（UTF-8/Shift-JIS、BOM、改行・カンマ含むセル、2〜4択混在、各種バリデーション違反、空CSV）。
2. `src/domain/csvParser.ts` を実装して全テストをパスさせる。
3. 型・エラーメッセージの整理（リファクタリング）。
