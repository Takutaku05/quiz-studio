# Bolt 03: Auth & Storage Repository (LocalStorage)

## Scope
Supabase移行可能なリポジトリインターフェースを定義し、初期フェーズとして LocalStorage を使った認証（サインアップ・サインイン・ログアウト・セッション維持）と問題集永続化（作成・一覧取得・単一取得・削除）を実装する。

## Requirements & Acceptance Criteria
1. **認証リポジトリ (`AuthRepository`)**
   - `signUp(email, password)`: メール形式・パスワード長（6文字以上）を検証し、重複メールはエラーにする。成功時はログイン状態にする。
   - `signIn(email, password)`: 一致するユーザーがいればログイン状態にする。不一致時はエラーにする。
   - `signOut()`: 現在のセッションをクリアする。
   - `getCurrentUser()`: ログイン中ユーザーを返す（未ログインなら `null`）。
2. **問題集リポジトリ (`QuizRepository`)**
   - `listByUser(userId)`: 指定ユーザーが作成した問題集のみを新しい順（または登録順）に返す。
   - `getById(quizId, userId)`: `quiz.userId === userId` の場合のみ問題集を返す（他人の問題集や存在しないIDは `null`）。
   - `create(userId, { title, questions })`: 問題集と問題を保存して返す。タイトル空欄時はエラー。
   - `delete(quizId, userId)`: 所有者本人の場合のみ削除する（他人の問題集は削除不可）。
3. **データ分離**
   - ユーザーAで作成した問題集は、ユーザーBでログインした際に一覧取得・個別取得・削除のいずれからもアクセスできない。

## TDD Plan
1. `src/repositories/localStorageRepositories.test.ts` に失敗するテストを作成（認証フロー、重複登録・誤パスワード、ユーザー間データ分離、問題集作成・削除）。
2. `src/repositories/types.ts` と `src/repositories/localStorageRepositories.ts` を実装してテストをパスさせる。
3. ストレージキー管理とシリアライズ耐性のリファクタリング。
