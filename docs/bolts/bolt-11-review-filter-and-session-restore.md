# Bolt 11: 復習フィルターとセッション復元ロジック

## Scope
`docs/requirements-review-and-resume.md` 3.2（復習フィルター）と 3.3（シャッフル状態の完全復元）のドメインロジックを、画面から独立した純粋関数として実装する。

## Interfaces
```ts
// src/domain/studyFilters.ts
export const LOW_ACCURACY_THRESHOLD_PERCENT = 60;
export function isLowAccuracy(stat: QuestionStat): boolean;          // attempts>=1 かつ 累積正答率<=60%
export function filterQuestionsByReview(questions: readonly Question[], stats: readonly QuestionStat[],
  filter: Exclude<ReviewFilter, 'retry_wrong'>): Question[];          // 元の並び順を保つ
export function countReviewTargets(questions: readonly Question[], stats: readonly QuestionStat[]):
  Record<'all' | 'recent_wrong' | 'low_accuracy', number>;
export function countWeakQuestions(stats: readonly QuestionStat[]): number;

// src/domain/quizSession.ts
export function toSessionSnapshot(prepared: readonly PreparedQuestion[]):
  Pick<QuizSession, 'questionIds' | 'choicesOrder'>;
export function restorePreparedQuestions(questions: readonly Question[],
  snapshot: Pick<QuizSession, 'questionIds' | 'choicesOrder'>): PreparedQuestion[] | null;
```

## Design Notes
- 正答率は全回答の累積（`correct / attempts * 100 <= 60`）。ちょうど60%は苦手に含む。
- 一度も回答していない問題（成績なし）はどちらのフィルターにも入らない。
- 復元時、問題IDが見つからない・選択肢番号が空欄の選択肢を指している・問題数が0、のいずれかなら `null` を返し、呼び出し側は中断セッションを無効として扱う。`isCorrect` は保存せず、元の `answer` から再計算する。

## TDD Plan（`src/domain/studyFilters.test.ts`, `src/domain/quizSession.test.ts`）
- 60% ちょうど（3/5）は苦手、61%以上相当（2/3=66%）は苦手でない、0/1 は苦手。
- `recent_wrong` は `lastIsCorrect === false` のみ、未回答は対象外、他の問題集の成績は無視。
- 件数カウントがフィルター結果の件数と一致する。
- シャッフル済みの `PreparedQuestion[]` をスナップショット→復元すると、問題順・選択肢順・`isCorrect` が一致する。
- 存在しない問題ID・不正な選択肢番号を含むスナップショットは `null`。
