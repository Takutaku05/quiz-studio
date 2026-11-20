# 要件定義書：ホーム画面に追加してアプリのように使う（PWA 化）

> 最終更新: 2026-11-20（Issue #40、#43 を反映）

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
- スマホ・iPad でダッシュボード上部に表示する「ホーム画面に追加」の案内（Issue #43、3.6 参照）

### 2.2 対象外
- **Web Push 通知**（通知したい内容が決まったら別 Issue で扱う）
- **オフライン対応**（問題集・学習履歴は Supabase に保存されるため、オフライン時の閲覧・解答はサポートしない）
- PC 向けのインストール導線（PC ではブラウザ標準のインストール UI を使う）

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

### 3.6 「ホーム画面に追加」の案内（Issue #43）
- **表示場所**: ログイン後のダッシュボード（`/`）の `main` 先頭。閉じるボタン付きのバナー（`InstallAppBanner`）。
- **表示しない条件**（いずれかに当てはまれば非表示）:
  - すでにホーム画面から起動している（`matchMedia('(display-mode: standalone)')` が一致、または iOS の `navigator.standalone === true`）。
  - 「閉じる」を押してから 30 日以内（`localStorage` の `quiz-studio:install-banner-dismissed-at` に押した時刻を保存。`localStorage` が使えない場合は毎回表示）。
  - PC（iOS でも Android でもない端末）。PC の Chrome が `beforeinstallprompt` を出しても表示しない。
- **iPhone / iPad**（Safari、iOS 版 Chrome など）:
  - 判定: UA に `iPhone` / `iPad` / `iPod` を含む、または UA に `Macintosh` を含み `navigator.maxTouchPoints > 1`（iPadOS の Safari は Mac として名乗るため）。
  - ページからホーム画面へ追加する API が無いため、「共有ボタンをタップし、メニューから『ホーム画面に追加』を選んでください」と手順を表示する。
- **Android**（Chrome / Edge / Samsung Internet など。UA に `Android` を含む）:
  - `beforeinstallprompt` を起動時（`main.tsx` で読み込む `src/lib/appInstallPrompt.ts`）に `preventDefault()` して保持する。ダッシュボードより先に発火しても取りこぼさないため。
  - イベントを保持しているときだけ「ホーム画面に追加」ボタンを表示し、押すと `prompt()` でブラウザ標準のインストール確認を出す。イベントは 1 回しか使えないため、押した時点でボタンは消える。
  - `appinstalled` を受け取ったら保持しているイベントを捨て、ボタンを消す。
  - イベントが届かない（インストール済み・条件未達・非対応ブラウザ）場合は何も表示しない。

## 4. 受け入れ条件
1. `/manifest.webmanifest` が 3.1 の内容で配信される。
2. `index.html` に 3.2 のタグがすべて含まれ、`viewport` に `viewport-fit=cover` を含まない。
3. 本番ビルドで `/sw.js` が登録され、開発・テスト環境、および Service Worker 非対応ブラウザでは登録しない。登録失敗時も画面は動き続ける。
4. `/sw.js` は `fetch` ハンドラーを持たず、キャッシュを作らない。
5. 「ホーム画面に追加」の案内（3.6）:
   - iPhone / iPad（Mac UA + タッチ）では手順の案内を、Android では `beforeinstallprompt` を受け取ったときだけボタンを表示し、押すと `prompt()` を呼ぶ。`appinstalled` でボタンが消える。
   - PC、standalone 起動中、閉じてから 30 日以内は表示しない。
6. 実機確認（手動）:
   - iPhone Safari で「ホーム画面に追加」→ アイコンと名前が正しく、アドレスバーなしで起動する。ノッチ・ホームインジケーターに表示が重ならない。
   - Android Chrome で「アプリをインストール」が出て、インストール後 standalone で起動する。
   - standalone 表示でメール・Google OAuth・パスキーでログインでき、ログイン後も standalone のまま。
   - 共有 URL を開く → ログイン → 自動インポートまで standalone で完了する。
   - iPhone Safari / iPad Safari のダッシュボードに手順の案内が出て、ホーム画面から開いたときは出ない。
   - Android Chrome のダッシュボードに「ホーム画面に追加」ボタンが出て、押すとインストール確認が出る。
