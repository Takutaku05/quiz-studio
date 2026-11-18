# Quiz Studio
## Supabase 連携

`.env.local` に以下を設定すると、認証と問題集の保存先が Supabase（Auth + PostgreSQL + RLS）になります。未設定の場合とテスト実行時は従来どおり `localStorage` を使います。

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

DB スキーマは `supabase/migrations/` にあります（`quizzes` / `questions` テーブル、本人のみアクセス可能な RLS、問題集を一括作成する `create_quiz_with_questions` 関数、URL / QR コード共有用の `quiz_shares` / `quiz_share_imports` テーブルおよび `enable_quiz_share` / `disable_quiz_share` / `regenerate_quiz_share` / `get_shared_quiz_summary` / `import_shared_quiz` 関数）。

共有機能を使う場合は、`supabase/migrations/20261117000000_create_quiz_shares.sql` を Supabase Dashboard の SQL Editor 等から適用してください。

### 問題集のURL / QRコード共有

1. ダッシュボードの各問題集カードの「共有」ボタンから、共有URLとQRコードを表示できます。
2. 相手が共有URLを開くかQRコードを読み取ると、未ログイン時はログイン／アカウント登録画面へ案内され、認証完了後に問題集のコピーが相手のアカウントへ自動インポートされます。
3. 共有モーダルから「リンクを再発行」または「共有を停止」を行うことで、既存のリンク・QRコードを無効化できます。

### Google OAuth ログイン設定

1. Google Cloud Console で OAuth 2.0 クライアント ID（ウェブアプリケーション）を作成し、承認済みリダイレクト URI に `https://<project-ref>.supabase.co/auth/v1/callback` を設定します。
2. Supabase Dashboard の `Authentication -> Providers -> Google` を有効化し、Client ID / Client Secret を入力します。
3. Supabase Dashboard の `Authentication -> URL Configuration -> Redirect URLs` に `https://quiz-studio.takutakus.com/**`（ローカル確認時は `http://localhost:5173/**` も）を追加します。

### パスキー（WebAuthn）設定

1. Supabase Dashboard の `Authentication -> Passkeys` を有効化します。
2. WebAuthn Relying Party を設定します（本番: Display Name `Quiz Studio` / Relying Party ID `quiz-studio.takutakus.com` / Origins `https://quiz-studio.takutakus.com`）。
3. メールアドレスまたは Google で一度ログインし、ダッシュボード右上の「パスキー設定」からパスキーを登録すると、次回以降 `/login` の「パスキーでログイン」が利用できます。
