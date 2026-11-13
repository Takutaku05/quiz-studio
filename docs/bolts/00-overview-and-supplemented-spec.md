# AI-DLC Bolt Roadmap & Supplemented Specification

## 1. Purpose
`csv-quiz-studio` の要求定義書（[code_artifact.md](../../code_artifact.md)）および要件定義書（[code_artifact%20(1).md](../../code_artifact%20(1).md)）に基づき、AI-DLC（AI-Driven Development Lifecycle）の **Bolt**（設計・テスト・実装の凝集単位）に分割してTDDで構築する。

## 2. 補完仕様（要件定義書 92行目以降の補完 & ローカル先行構成）

### 2.1 シャッフルおよび出題ロジック（3.2 補完）
要件定義書 3.2 ①の続きを以下の通り確定する：
1. `choice1` 〜 `choice4` を走査し、各選択肢を `{ originalNumber: 1|2|3|4, text: string, isCorrect: originalNumber === answer }` に変換する。
2. テキストが空（`null` / `undefined` / 空白のみ）の選択肢（主に `choice3`, `choice4`）を除外する。
3. `shuffleChoices === true` の場合、残った選択肢配列を Fisher-Yates アルゴリズムでシャッフルする。
4. `shuffleQuestions === true` の場合、出題対象の問題配列を Fisher-Yates アルゴリズムでシャッフルする。
5. 正誤判定は選択された選択肢の `isCorrect`（または `originalNumber === question.answer`）で行うため、選択肢シャッフル後も判定がズレない。

### 2.2 認証・データ永続化（初期フェーズ：LocalStorage実装）
将来の Supabase（Auth + PostgreSQL + RLS）移行を見据え、リポジトリインターフェースで抽象化する。初期フェーズではブラウザの `localStorage` をバックエンドとして即座に動作確認可能な実装を提供する。

#### ドメインモデル（Supabase テーブル想定と1対1対応）
- **User**: `{ id: string, email: string, createdAt: string }`
- **Quiz**: `{ id: string, userId: string, title: string, createdAt: string, questions: Question[] }`
- **Question**: `{ id: string, quizId: string, orderIndex: number, question: string, choice1: string, choice2: string, choice3: string | null, choice4: string | null, answer: 1 | 2 | 3 | 4, explanation: string | null }`

#### アクセス制御（RLS相当のドメイン制約）
- 全ての問題集の取得・詳細表示・削除は `quiz.userId === currentUser.id` を満たすもののみ許可し、別アカウントのデータは一切参照・操作できないようにする。

## 3. Bolt 一覧

| Bolt | 名称 | 対象レイヤー | 主なTDD対象 |
| --- | --- | --- | --- |
| Bolt 01 | CSVパーサー & バリデーション | Domain / Infra | UTF-8 / Shift-JIS デコード、ヘッダー検証、行別バリデーションエラー生成 |
| Bolt 02 | クイズ出題エンジン & シャッフル | Domain | 選択肢フィルタ・シャッフル、一問一答/テストモード進行、スコア計算、誤答抽出 |
| Bolt 03 | 認証 & ストレージリポジトリ | Application / Infra | サインアップ/サインイン/ログアウト、ユーザー単位データ分離、問題集CRUD |
| Bolt 04 | UI: 認証 & ダッシュボード & CSVアップロード | UI (Pages/Modals) | `/login`、`/` 一覧・削除、D&D対応CSVモーダル・エラー表示 |
| Bolt 05 | UI: クイズプレイ画面（3フェーズ） | UI (Quiz Player) | `/quiz/:quizId` 設定・出題（一問一答/テスト）・リザルト・誤答再挑戦 |
| Bolt 06 | Google OAuth ログイン & 認証状態同期 | Auth / UI | `signInWithOAuth`、`onAuthStateChange`、OAuthエラー回収、`/login` Googleログイン導線 |
| Bolt 07 | パスキー（WebAuthn）ログイン & 管理 | Auth / UI | `signInWithPasskey`、`registerPasskey`、`passkey.*` 管理モーダル、WebAuthnエラー変換 |
