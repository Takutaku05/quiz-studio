# Bolt 06: Google OAuth Login & Auth State Sync

## Scope
Supabase Auth の Google OAuth（`signInWithOAuth`）を利用したソーシャルログインを実装する。あわせて `onAuthStateChange` による認証状態のリアルタイム同期、OAuth リダイレクト戻り時のエラー抽出（キャンセル・設定未有効化等）と URL クリーンアップ、および LocalStorage フォールバック時の案内を提供する。

## Feasibility & Design Notes
- **Supabase Auth 対応状況**: `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })` により、Free プランを含む全プランで利用可能。新規ユーザー登録と既存ユーザーログインの双方を同一フローで処理できる。
- **コールバック処理**: 既存の `@supabase/supabase-js` クライアントはデフォルトで `detectSessionInUrl: true`（`flowType: 'implicit'`）が有効であり、リダイレクト戻り時に自動でセッションを復元して URL フラグメントを消去する。クロスデバイスのメール確認リンク互換性を維持するため、`flowType: 'implicit'` を維持する。
- **リダイレクト先**: `redirectTo` には `${window.location.origin}/login` を指定する。ログイン成功時は `AppContext` がセッションを検知して `PublicOnlyRoute` により `/` へ遷移し、失敗・キャンセル時は `/login` 上でエラーを表示できる。また `/` へフォールバックした場合でも、`AppContext` マウント時に URL エラーを回収して `/login` で表示できるようにする。
- **外部設定要件（手動設定が必要）**:
  1. Google Cloud Console で OAuth 2.0 クライアント ID（ウェブアプリケーション）を作成し、承認済みのリダイレクト URI に `https://<project-ref>.supabase.co/auth/v1/callback` を登録する。
  2. Supabase Dashboard の `Authentication -> Providers -> Google` を有効化し、Client ID / Client Secret を設定する。
  3. Supabase Dashboard の `Authentication -> URL Configuration -> Redirect URLs` に本番（`https://quiz-studio.takutakus.com/**`）およびローカル（`http://localhost:5173/**`）を登録する。

## Requirements & Acceptance Criteria
1. **認証リポジトリ (`AuthRepository`)**
   - `signInWithGoogle()`:
     - `SupabaseAuthRepository` では `client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })` を呼び出す。エラー時は日本語メッセージに変換して throw する。
     - `LocalAuthRepository` では `'GoogleログインはSupabase連携時のみ利用できます。'` を throw する。
   - `onAuthStateChange(callback)`:
     - `SupabaseAuthRepository` では `client.auth.onAuthStateChange` を購読し、購読解除関数を返す。
     - `LocalAuthRepository` では `signUp` / `signIn` / `signOut` 時に登録済みリスナーへ通知し、購読解除関数を返す。
2. **OAuth リダイレクトエラー処理 (`consumeAuthRedirectError`)**
   - URL のクエリ（`?error=...` / `?error_description=...` / `?error_code=...`）またはフラグメント（`#error=...` 等）から認証エラーを抽出して日本語化し、`history.replaceState` で URL から該当パラメータを除去する。
3. **コンテキストと画面 (`AppContext` / `LoginPage`)**
   - `AppContext` はマウント時に `consumeAuthRedirectError()` を回収し、`onAuthStateChange` を購読してセッション変化を即時反映する。
   - `LoginPage` に「Googleでログイン」ボタン（区切り線「または」付き）を表示し、クリックで `signInWithGoogle()` を呼び出す。処理中はボタンを無効化し、失敗時はエラーメッセージを表示する。

## TDD Plan
1. `src/repositories/supabaseRepositories.test.ts` に `signInWithGoogle`、`onAuthStateChange`、OAuth エラーメッセージ変換、`consumeAuthRedirectError` のテストを追加する。
2. `src/repositories/localStorageRepositories.test.ts` に `signInWithGoogle` エラーと `onAuthStateChange` 通知のテストを追加する。
3. `src/pages/LoginPage.test.tsx` と `src/App.test.tsx` に Google ログインボタン操作、OAuth リダイレクトエラー表示、認証状態変化による `/` 遷移のテストを追加する。
4. `types.ts`、`supabaseRepositories.ts`、`localStorageRepositories.ts`、`AppContext.tsx`、`LoginPage.tsx` を実装し、全テストとビルドを通す。
