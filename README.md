# csv-quiz-studio
## Supabase 連携

`.env.local` に以下を設定すると、認証と問題集の保存先が Supabase（Auth + PostgreSQL + RLS）になります。未設定の場合とテスト実行時は従来どおり `localStorage` を使います。

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

DB スキーマは `supabase/migrations/` にあります（`quizzes` / `questions` テーブル、本人のみアクセス可能な RLS、問題集を一括作成する `create_quiz_with_questions` 関数）。
