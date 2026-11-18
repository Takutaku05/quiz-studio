# Bolt 10: 学習履歴・中断セッションのデータ層

## Scope
`docs/requirements-review-and-resume.md` の 4章（DB設計）を実装する。問題ごとの累積成績（`question_stats`）と、問題集ごとの中断セッション（`quiz_sessions`）を保存・取得する `StudyRepository` を、Supabase 版と LocalStorage 版の両方で提供する。

## Design Notes
- **新しいリポジトリに分離**: 既存の `QuizRepository` には足さず、`StudyRepository`（`src/repositories/types.ts`）を新設する。実装は `src/repositories/localStudyRepository.ts` と `src/repositories/supabaseStudyRepository.ts` に置く。
- **AppContext**: `studyRepository` を `quizRepository` と同じ方法で注入する（Supabase 接続時は Supabase 版、それ以外は LocalStorage 版。テストでは props で差し替え）。
- **DB (`supabase/migrations/20261118000000_create_study_history.sql`)**:
  - `question_stats`（主キー `(user_id, question_id)`）と `quiz_sessions`（主キー `(user_id, quiz_id)`、`target_filter` 列付き）。
  - RLS は本人のみ。INSERT / UPDATE の `with check` で、問題集が本人のものであること（`question_stats` は加えて問題がその問題集に属すること）を確認する。
  - `record_question_answer(p_quiz_id, p_question_id, p_is_correct)`：`security invoker`、`insert ... on conflict do update` で1クエリ加算。
- **LocalStorage**: キー `csv_quiz_studio_question_stats` / `csv_quiz_studio_quiz_sessions`。`LocalQuizRepository.delete` で該当問題集の成績・セッションも削除する（Supabase の `on delete cascade` 相当）。

## Interfaces
```ts
// src/domain/types.ts
export type ReviewFilter = 'all' | 'recent_wrong' | 'low_accuracy' | 'retry_wrong';
export interface QuestionStat { quizId; questionId; attemptsCount; correctCount; lastIsCorrect; lastAnsweredAt }
export interface QuizSession { quizId; mode: QuizMode; targetFilter: ReviewFilter; shuffleQuestions; shuffleChoices;
  questionIds: string[]; choicesOrder: Record<string, AnswerNumber[]>; answers: Record<string, AnswerNumber>;
  currentIndex: number; updatedAt: string }
export type SaveQuizSessionInput = Omit<QuizSession, 'updatedAt'>;

// src/repositories/types.ts
export interface StudyRepository {
  recordAnswer(userId: string, input: { quizId: string; questionId: string; isCorrect: boolean }): Promise<void>;
  listStats(userId: string, quizId?: string): Promise<QuestionStat[]>;
  getSession(userId: string, quizId: string): Promise<QuizSession | null>;
  listSessions(userId: string): Promise<QuizSession[]>;
  saveSession(userId: string, session: SaveQuizSessionInput): Promise<void>;
  deleteSession(userId: string, quizId: string): Promise<void>;
}
```

## TDD Plan
1. `src/repositories/localStudyRepository.test.ts`
   - 1回目の記録で `attempts=1`、正解なら `correct=1`、2回目以降は累積加算され `lastIsCorrect` が上書きされる。
   - ユーザー・問題集ごとに分離される（他ユーザーの成績は返らない、`quizId` 省略時は本人の全成績）。
   - セッションは `(user, quiz)` で1件。保存し直すと上書き、削除できる、他ユーザーからは見えない。
   - `LocalQuizRepository.delete` で成績とセッションも消える。
2. `src/repositories/supabaseStudyRepository.test.ts`（クライアントをモック）
   - `recordAnswer` が `record_question_answer` RPC を正しい引数で呼ぶ。
   - 行（snake_case）をドメイン型に変換する。`quizId` 指定時のみ `quiz_id` で絞る。
   - `saveSession` が `onConflict: 'user_id,quiz_id'` で upsert する。`getSession` は不正UUID（22P02）を null として扱う。
   - エラー時は例外を投げる。
