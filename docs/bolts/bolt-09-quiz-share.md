# Bolt 09: Quiz Sharing via URL / QR Code with Post-Auth Auto-Import

## Scope
問題集ごとに共有 URL と QR コードを発行し、受け取った相手が認証（ログイン / 新規登録）を完了すると、問題集のコピーが相手のアカウントへ自動でインポートされる仕組みを実装する。作成者は共有の停止・再開・リンク再発行ができる。

## Design Notes
- **共有はコピー方式**: 相手は元の問題集を参照するのではなく、自分の `quizzes` / `questions` に複製を持つ。既存の「本人のみアクセス可」RLS を崩さずに受け渡しできる。
- **DB (`supabase/migrations/20261117000000_create_quiz_shares.sql`)**:
  - `quiz_shares`: 問題集ごとに1件（`quiz_id` 一意）。`token`（一意、ハイフン無し UUID）と `is_active` を持つ。RLS は作成者（`owner_id`）のみ。
  - `quiz_share_imports`: `(share_id, recipient_user_id)` 一意のインポート履歴。RLS は受け取ったユーザーのみ参照可。
  - `enable_quiz_share` / `disable_quiz_share` / `regenerate_quiz_share`: `security invoker`。自分の問題集のみ操作できる。
  - `get_shared_quiz_summary(token)`: `security definer`、`anon` にも許可。有効なトークンに対してタイトルと問題数のみを返す。
  - `import_shared_quiz(token)`: `security definer`、ログインユーザーのみ。`pg_advisory_xact_lock` で同一ユーザー・同一共有の同時実行を直列化し、重複作成を防ぐ。結果は `imported` / `already_imported` / `own_quiz`。
- **認証をまたぐ遷移 (`src/lib/shareRedirect.ts`)**:
  - `/share/:token` を未ログインで開くと、トークンを `localStorage`（キー `csv_quiz_studio_pending_share`、有効期限30分）に保存し `/login?redirect=/share/<token>` へ遷移する。
  - 認証後の遷移先は `?redirect=`（安全な相対パスのみ）→ 保留中の共有トークン → `/` の順で決める（`resolvePostAuthRedirect`）。
  - メール確認リンク（`emailRedirectTo`）と Google OAuth の `redirectTo` にも共有パスを引き継ぐ。
- **再実行の防止**: `ShareImportPage` はユーザーオブジェクトではなくユーザー ID に依存して実行する。Supabase は `INITIAL_SESSION` / `SIGNED_IN` / トークン更新で新しい User オブジェクトを発行するため、オブジェクト依存だと実行中のインポートがキャンセルされたまま再試行されなくなる。
- **LocalStorage モード**: `LocalQuizRepository` も同じ共有・インポート API を実装する（同一ブラウザ内での動作確認用）。

## Requirements & Acceptance Criteria
1. **リポジトリ (`QuizRepository`)**
   - `getShare` / `enableShare` / `disableShare` / `regenerateShare` / `getSharedQuizSummary` / `importByShareToken` を Supabase 版・LocalStorage 版の両方に実装する。
   - 問題集削除時は共有設定も削除される。
2. **共有モーダル (`ShareQuizModal`)**
   - 開くと共有を有効化し、共有 URL・QR コード（SVG）・状態バッジ（共有中 / 共有停止中）を表示する。
   - 「URLをコピー」「QR画像を保存（SVG）」「リンクを再発行」「共有を停止」、停止中は「共有を再開する」「新しいリンクを発行して再開」を提供する。
   - クリップボード非対応やエラー時は日本語メッセージを表示する。
3. **共有インポート画面 (`/share/:token`)**
   - 未ログイン → トークン保存 → `/login?redirect=...`。
   - ログイン済み → インポート実行 → `navigate('/', { state: { importNotice } })`。
   - 失敗時はエラー理由と「ダッシュボードへ戻る」リンクを表示する。
4. **ログイン画面 (`/login`)**
   - 共有経由の場合、共有問題集のタイトル・問題数と自動インポートの案内、「共有をキャンセルして通常ログイン」を表示する。無効なリンクの場合はその旨を表示する。
5. **ダッシュボード (`/`)**
   - 各カードに「共有」ボタンを追加する。
   - インポート結果通知（`imported` / `already_imported` / `own_quiz`）と「今すぐプレイ」/「問題集を開く」リンクを表示する。

## TDD Plan
1. `src/lib/shareRedirect.test.ts`: パス生成、`sanitizeRedirectPath` の拒否パターン、保留トークンの保存・期限切れ、遷移先決定のテスト。
2. `src/repositories/supabaseRepositories.test.ts` / `localStorageRepositories.test.ts`: 共有 API と各インポート結果のテスト。
3. `src/components/ShareQuizModal.test.tsx`、`src/pages/ShareImportPage.test.tsx`、`src/pages/LoginPage.test.tsx`、`src/pages/DashboardPage.test.tsx`、`src/App.test.tsx`: 画面操作と認証をまたぐ遷移のテスト（認証イベントで User オブジェクトが差し替わってもインポートが継続するケースを含む）。
