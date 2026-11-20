# 要件定義書：ホーム画面に追加してアプリのように使う（PWA 化）

> 最終更新: 2026-11-20（Issue #40 を反映）

## 1. 目的・ゴール
iPhone / Android で「ホーム画面に追加」したときに、ブラウザのブックマークではなく **独立したアプリのように起動できる** ようにする。

1. ホーム画面に Quiz Studio のアイコン（#33 で作成したアプリアイコン）と名前「Quiz Studio」で追加される。
2. ホーム画面から起動すると、アドレスバーのない **standalone 表示** で開く。
3. Android Chrome のインストール条件（Web App Manifest + Service Worker）を満たし、「アプリをインストール」が提示される。
4. standalone 表示でも、ログイン（メール・Google OAuth・パスキー）、Supabase の認証リダイレクト、共有 URL（`/share/:token`）の遷移がブラウザ表示と同じように動く。

## 2. スコープ

### 2.1 対象
- Web App Manifest（`public/manifest.webmanifest`）
- `index.html` の manifest リンク、`theme-color`、iOS 用メタタグ
- インストール条件を満たすための最小限の Service Worker（`public/sw.js`）と、その登録処理

### 2.2 対象外
- **Web Push 通知**（通知したい内容が決まったら別 Issue で扱う）
- **オフライン対応**（問題集・学習履歴は Supabase に保存されるため、オフライン時の閲覧・解答はサポートしない）
- アプリ内の「インストールを促すバナー」など独自のインストール導線（OS / ブラウザ標準の「ホーム画面に追加」を使う）

## 3. 仕様

### 3.1 Web App Manifest（`/manifest.webmanifest`）

| キー | 値 | 備考 |
| ----- | ----- | ----- |
| `id` | `/` | アプリの識別子 |
| `name` | `Quiz Studio` | |
| `short_name` | `Quiz Studio` | ホーム画面のアイコン下に表示される名前 |
| `description` | 問題集を作って反復学習できるクイズアプリ | |
| `lang` | `ja` | |
| `start_url` | `/` | 未ログインなら認証ガードで `/login` へ遷移する |
| `scope` | `/` | アプリ全体（`/login`, `/quiz/:id`, `/share/:token`）を standalone 表示の対象にする |
| `display` | `standalone` | |
| `theme_color` | `#4f46e5` | アイコンのグラデーション始点（indigo-600）。Android のステータスバー・タスク切替画面の色 |
| `background_color` | `#f8fafc` | アプリの背景色（slate-50）。Android の起動スプラッシュの背景 |
| `icons` | `icon-192.png`（192×192）、`icon-512.png`（512×512）を `purpose: "any"` と `purpose: "maskable"` の両方で、`icon.svg` を `purpose: "any"` で登録 | アイコンはグラデーションが全面に塗られ、図柄が中央の安全領域（80%）内に収まっているため maskable としても使える |

### 3.2 `index.html` のメタタグ
- `<link rel="manifest" href="/manifest.webmanifest">`
- `<meta name="theme-color" content="#4f46e5">`
- iOS 用:
  - `<meta name="apple-mobile-web-app-capable" content="yes">`（あわせて標準名の `mobile-web-app-capable` も指定）
  - `<meta name="apple-mobile-web-app-title" content="Quiz Studio">`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="default">`
  - `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`（#33 で追加済み）

### 3.3 ノッチ・ステータスバー領域
- ステータスバーのスタイルは `default`（白背景に黒文字）とし、コンテンツをステータスバーの下に潜り込ませない。
- `viewport-fit=cover` は **指定しない**。指定しない場合、iOS はノッチ・ホームインジケーター部分を余白として確保するため、既存レイアウト（`fixed inset-0` のモーダル含む）に safe-area 用の余白を追加しなくても表示が崩れない。
- 将来、ステータスバー下まで背景を広げたい場合は、`viewport-fit=cover` と `env(safe-area-inset-*)` の余白をセットで導入する。

### 3.4 Service Worker（`/sw.js`）
- **目的はインストール条件を満たすことだけ** とし、キャッシュは一切行わない。
  - `fetch` イベントのハンドラーを持たない（すべてのリクエストはブラウザが通常どおりネットワークへ送る）。認証リダイレクト・Supabase API・デプロイ後の新しいアセットに Service Worker が影響しないようにするため。
  - `install` で `skipWaiting()`、`activate` で `clients.claim()` を呼び、更新版がすぐ有効になるようにする。
- 登録処理（`src/lib/registerServiceWorker.ts`）:
  - **本番ビルドのみ** 登録する（開発サーバーとテストでは登録しない）。
  - `navigator.serviceWorker` が無いブラウザでは何もしない。
  - ページの `load` 後に `/sw.js` を `scope: '/'` で登録する（初回表示の妨げにしない）。
  - 登録に失敗してもアプリの動作は続ける（コンソールに警告を出すだけ）。

### 3.5 standalone 表示での認証・共有 URL
- 認証のリダイレクト先（メール確認リンク・Google OAuth の `redirectTo`）は `window.location.origin` から組み立てており、manifest の `scope`（`/`）内なので、standalone 表示から開始したログインは standalone 表示に戻る。
- Service Worker は `fetch` を横取りしないため、`/login?code=...` などの OAuth コールバックや `/share/:token` はそのまま SPA に届く。
- パスキー（WebAuthn）は standalone 表示でもブラウザと同じ API で動く。

## 4. 受け入れ条件
1. `/manifest.webmanifest` が 3.1 の内容で配信される。
2. `index.html` に 3.2 のタグがすべて含まれ、`viewport` に `viewport-fit=cover` を含まない。
3. 本番ビルドで `/sw.js` が登録され、開発・テスト環境、および Service Worker 非対応ブラウザでは登録しない。登録失敗時も画面は動き続ける。
4. `/sw.js` は `fetch` ハンドラーを持たず、キャッシュを作らない。
5. 実機確認（手動）:
   - iPhone Safari で「ホーム画面に追加」→ アイコンと名前が正しく、アドレスバーなしで起動する。ノッチ・ホームインジケーターに表示が重ならない。
   - Android Chrome で「アプリをインストール」が出て、インストール後 standalone で起動する。
   - standalone 表示でメール・Google OAuth・パスキーでログインでき、ログイン後も standalone のまま。
   - 共有 URL を開く → ログイン → 自動インポートまで standalone で完了する。
