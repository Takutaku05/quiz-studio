# Bolt 07: Passkey (WebAuthn) Login & Management

## Scope
Supabase Auth のネイティブパスキー機能（WebAuthn / `@supabase/supabase-js` v2.119.0）を利用し、ログイン画面でのパスワードレス認証（`signInWithPasskey`）と、ログイン後ダッシュボードでのパスキー登録・一覧表示・名称変更・削除モーダル（`PasskeySettingsModal`）を実装する。

## Feasibility & Design Notes
- **Supabase Auth 対応状況**:
  - `@supabase/supabase-js` v2.119.0（`@supabase/auth-js`）は `auth.signInWithPasskey()`、`auth.registerPasskey()`、`auth.passkey.{list,update,delete}` をネイティブサポートしている（`experimental.passkey` フラグはデフォルト有効）。
  - Supabase Hosted の Free プランを含む標準 Auth 機能として利用可能（Beta 機能）。
- **重要な仕様上の制約**:
  - **新規アカウント作成単体には非対応**: Supabase Auth の `registerPasskey()` は「メール確認済み・非匿名の既存ログイン済みセッション」を必須とする。そのため、ユーザーはまずメールアドレス＋パスワードまたは Google OAuth でログインしたうえでダッシュボードからパスキーを登録し、次回以降に `/login` からパスキー単体（Discoverable Credential）でログインする導線とする。
  - **120文字制限 & 名称設定**: `registerPasskey()` 自体は `friendlyName` 引数を取らないため、登録成功後にユーザーが名称を入力している場合は `passkey.update({ passkeyId, friendlyName })` を続けて呼び出す（文字数上限 120 文字を事前検証）。
  - **ブラウザ / オリジン制約**: WebAuthn（`window.PublicKeyCredential` / `navigator.credentials`）は HTTPS（または `localhost`）でのみ動作する。
- **外部設定要件（手動設定が必要）**:
  - Supabase Dashboard の `Authentication -> Passkeys` を有効化し、以下を設定する：
    - **Relying Party Display Name**: `Quiz Studio`
    - **Relying Party ID**: `quiz-studio.takutakus.com`（ローカル検証時は `localhost`）
    - **Relying Party Origins**: `https://quiz-studio.takutakus.com`

## Requirements & Acceptance Criteria
1. **ドメイン型 & 認証リポジトリ (`PasskeyCredential` / `AuthRepository`)**
   - `PasskeyCredential`: `{ id: string, friendlyName: string | null, createdAt: string, lastUsedAt: string | null }`。
   - `isPasskeySupported()`: ブラウザの WebAuthn サポート有無を返す（`LocalAuthRepository` は `false`）。
   - `signInWithPasskey()`: Discoverable Credential によるパスキーログインを実行して `User` を返す。未サポートブラウザやキャンセル・期限切れ・未登録エラーを分かりやすい日本語メッセージに変換する。
   - `registerPasskey(friendlyName?)`: ログイン中ユーザーのパスキーを登録する（任意で名称設定も反映）。
   - `listPasskeys()` / `updatePasskeyName(passkeyId, friendlyName)` / `deletePasskey(passkeyId)`: パスキー一覧取得、名称変更（空欄・120文字超を拒否）、削除を提供する。
   - `LocalAuthRepository` ではパスキー操作時に `'パスキー認証はSupabase連携時のみ利用できます。'` を throw する。
2. **ログイン画面 (`/login`)**
   - サインインモード（`signin`）に「パスキーでログイン」ボタンと「ログイン後にダッシュボードのパスキー設定から登録できます」案内を表示する。
   - 認証成功時は `/` へ遷移し、失敗時は `role="alert"` に日本語エラーを表示する。
3. **ダッシュボード (`/`) & `PasskeySettingsModal`**
   - ヘッダーに「パスキー設定」ボタンを追加し、クリックで `PasskeySettingsModal` を開く。
   - 登録済みパスキー一覧、新規パスキー登録（任意ラベル入力付き）、名称変更、2段階確認付き削除を提供する。
   - WebAuthn 非対応ブラウザまたは LocalStorage モード時は非対応の案内を表示し、登録ボタンを無効化する。

## TDD Plan
1. `src/repositories/supabaseRepositories.test.ts` と `src/repositories/localStorageRepositories.test.ts` にパスキー CRUD・ログイン・エラーマッピング（`NotAllowedError`, `ERROR_CEREMONY_ABORTED`, `ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED`, `webauthn_challenge_expired`, WebAuthn 非対応等）のテストを書く。
2. `src/pages/LoginPage.test.tsx` にパスキーログイン成功遷移・失敗表示・サインアップモードでの表示制御テストを書く。
3. `src/components/PasskeySettingsModal.test.tsx` と `src/pages/DashboardPage.test.tsx` に一覧表示・登録・名称変更・確認付き削除・非対応時表示のテストを書く。
4. 型・リポジトリ・コンテキスト・UI コンポーネントを実装し、全テストとビルドを通す。
