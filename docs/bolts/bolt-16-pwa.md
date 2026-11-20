# Bolt 16: ホーム画面に追加してアプリのように使う（PWA 化）

## Scope
`docs/requirements-pwa.md`（Issue #40）に基づき、ホーム画面から standalone 表示で起動できるようにする。
1. Web App Manifest（`public/manifest.webmanifest`）を追加する。
2. `index.html` に manifest・`theme-color`・iOS 用メタタグを追加する。
3. インストール条件を満たす最小限の Service Worker（`public/sw.js`、キャッシュなし）と、本番ビルドだけで登録する処理を追加する。

Web Push 通知・オフライン対応は対象外。

## Design Notes
- **Manifest / メタタグは静的ファイル**: Vite のプラグインは使わず、`public/` と `index.html` に直接書く。テストではファイルを読み込んで必須項目を検証する。
- **Service Worker はキャッシュしない (`public/sw.js`)**: `fetch` ハンドラーを持たないため、認証リダイレクト・Supabase API・デプロイ後の新アセットに影響しない。`install` で `skipWaiting()`、`activate` で `clients.claim()`。
- **登録処理 (`src/lib/registerServiceWorker.ts`)**: `registerServiceWorker({ enabled, navigator, window })` のように依存を引数で受け取り、テストから差し替えられるようにする。`main.tsx` からは `enabled: import.meta.env.PROD` で呼ぶ。`load` イベント後（すでに読み込み済みなら即時）に `navigator.serviceWorker.register('/sw.js', { scope: '/' })` を呼び、失敗は `console.warn` で握りつぶす。
- **safe-area**: `viewport-fit=cover` を指定せず、ステータスバーは `default` にすることで、既存レイアウトに手を入れずにノッチ・ホームインジケーターとの重なりを避ける。

## Requirements & Acceptance Criteria
1. **Manifest**: `name` / `short_name` = `Quiz Studio`、`start_url` / `scope` / `id` = `/`、`display` = `standalone`、`theme_color` = `#4f46e5`、`background_color` = `#f8fafc`。`icons` に 192 / 512 の PNG（`any` と `maskable`）を含み、参照先ファイルが `public/` に存在する。
2. **index.html**: manifest リンク、`theme-color`、`apple-mobile-web-app-capable`、`mobile-web-app-capable`、`apple-mobile-web-app-title`、`apple-mobile-web-app-status-bar-style`、`apple-touch-icon` を含む。`viewport` に `viewport-fit=cover` を含まない。
3. **登録処理**: 有効時は `load` 後に `/sw.js` を `scope: '/'` で登録する。読み込み済みなら即時登録する。無効時・`serviceWorker` 非対応時は何もしない。登録失敗時は例外を投げず警告を出す。
4. **Service Worker**: `fetch` リスナーを登録せず、`caches` を使わない。`install` で `skipWaiting()`、`activate` で `clients.claim()` を呼ぶ。

## TDD Plan
1. `src/pwa/manifest.test.ts`: `public/manifest.webmanifest` を JSON として読み込み、受け入れ条件1の各項目とアイコンファイルの存在を検証する。
2. `src/pwa/indexHtml.test.ts`: `index.html` を `DOMParser` で解析し、受け入れ条件2のタグと値を検証する。
3. `src/lib/registerServiceWorker.test.ts`: フェイクの `navigator` / `window` を渡し、受け入れ条件3を検証する。
4. `src/pwa/serviceWorker.test.ts`: `public/sw.js` をフェイクの `self`（`addEventListener` を記録）で評価し、受け入れ条件4を検証する。
