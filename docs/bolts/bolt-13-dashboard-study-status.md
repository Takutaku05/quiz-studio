# Bolt 13: ダッシュボードの進行中・苦手問題数表示

## Scope
`docs/requirements-review-and-resume.md` 3.4 をダッシュボードの問題集カードに実装する。問題集全体の正答率は表示しない。

## Design Notes
- ダッシュボード読み込み時に `listSessions(userId)` と `listStats(userId)` を1回ずつ取得し、問題集IDごとに振り分ける。取得失敗時はバッジを出さないだけで一覧表示は妨げない。
- 表示は `src/components/QuizStudyBadges.tsx` に切り出す。
  - 進行中セッションあり: `進行中 (3 / 20問)`（3 = 回答済み位置 `currentIndex`、20 = セッションの出題数）。
  - 回答済みの問題が1問以上: `苦手（正答率60%以下）: ◯問`（0問でも表示）。
- クイズ設定画面の状態表示は、Bolt 12 の中断カードと出題対象バッジで満たす。

## TDD Plan（`src/components/QuizStudyBadges.test.tsx`, `src/pages/DashboardPage.test.tsx`）
1. セッション・成績が無い問題集はバッジを表示しない。
2. 進行中セッションと苦手数が正しく表示される。
3. ダッシュボードで、該当する問題集のカードにだけバッジが出る。
