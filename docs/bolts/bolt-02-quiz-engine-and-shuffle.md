# Bolt 02: Quiz Engine & Shuffle Logic

## Scope
問題データの正規化、問題順・選択肢順のシャッフル、出題セッション（一問一答 / テストモード）の進行管理、採点、および誤答問題のみを抽出して再挑戦するドメインロジックを実装する。

## Requirements & Acceptance Criteria
1. **問題・選択肢の構築 (`prepareQuizQuestions`)**
   - `choice1`〜`choice4` のうち非空のものだけを選択肢リストに含める。
   - 各選択肢に `originalNumber`（1〜4）、`text`、`isCorrect` を持たせる。
   - `shuffleChoices: true` の場合は選択肢をシャッフルする（元の問題データは破壊しない）。
   - `shuffleQuestions: true` の場合は問題順をシャッフルする。
2. **セッション管理・採点 (`QuizSession` / reducer / pure functions)**
   - フェーズ遷移: `setup` -> `playing` -> `result`。
   - **一問一答モード (`one_by_one`)**: 回答を選択した時点でその問題の回答が確定し、即座に正誤判定および解説が参照可能になる。回答後の上書きは不可。
   - **テストモード (`test`)**: 回答を選択してもプレイ中は正誤・解説を表示しない（「次へ」で次の問題へ進む、または最終問題で「結果を見る」へ進む）。
   - **結果集計 (`calculateResult`)**:
     - 正答数 (`correctCount`)、総問題数 (`totalCount`)、正答率 (`accuracyPercent`, 四捨五入整数)。
     - 各問題の振り返りレコード（問題文、自分の回答テキスト、正解テキスト、正誤、解説）。
   - **誤答抽出 (`extractWrongQuestions`)**:
     - 不正解だった元の問題リストを抽出し、リザルトから「間違えた問題だけ解く」を開始できる。

## TDD Plan
1. `src/domain/quizEngine.test.ts` に失敗するテストを作成（空選択肢の除外、シャッフル不変性・決定論的RNG注入テスト、一問一答/テストモードの回答確定・結果計算、誤答抽出）。
2. `src/domain/quizEngine.ts` を実装してテストをパスさせる。
3. エッジケース（全問正解時の誤答抽出、2択問題、解説なし問題）の検証とリファクタリング。
