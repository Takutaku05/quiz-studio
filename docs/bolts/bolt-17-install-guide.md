# Bolt 17: 「ホーム画面に追加」の案内（スマホ・iPad）

## Scope
`docs/requirements-pwa.md` §3.6（Issue #43）に基づき、スマホ・iPad のブラウザでダッシュボードを開いたときだけ「ホーム画面に追加」の導線を表示する。

## Design Notes
- **判定・保存処理は純粋関数 (`src/lib/installPrompt.ts`)**: `detectIosDevice({ userAgent, maxTouchPoints })`、`isRunningStandalone({ matchMedia, navigator })`、`isInstallBannerDismissed(storage, now)` / `rememberInstallBannerDismissed(storage, now)`。
- **`beforeinstallprompt` の保持 (`createInstallPromptStore(window)`)**: イベントを `preventDefault()` して保持し、購読者に通知する。`prompt()` は 1 回だけ使え、呼んだらイベントを捨てる。`appinstalled` でも捨てる。アプリ全体のインスタンスは `src/lib/appInstallPrompt.ts` で作り、`main.tsx` で読み込んで起動時にリスナーを付ける。
- **表示 (`src/components/InstallAppBanner.tsx`)**: `useSyncExternalStore` でストアを購読する。`store` と `environment`（UA・タッチ点数・standalone・storage・現在時刻）を props で差し替えられ、省略時はブラウザの値を使う。`DashboardPage` の `main` 先頭に置く。

## Requirements & Acceptance Criteria
1. iPhone / iPod / 旧 iPad の UA、または Mac UA + `maxTouchPoints > 1` を iOS と判定し、共有ボタン → 「ホーム画面に追加」の手順を表示する。
2. Android UA で `beforeinstallprompt` を受け取ったときだけ「ホーム画面に追加」ボタンを表示し、押すと `prompt()` を呼んでボタンを消す。`appinstalled` でボタンを消す。
3. PC、standalone 起動中は表示しない。
4. 「閉じる」で現在時刻を `localStorage` に保存し、30 日間表示しない。storage が使えなくても例外を出さない。

## TDD Plan
1. `src/lib/installPrompt.test.ts`: 判定関数、30 日間の非表示、ストアのイベント保持・`prompt()`・`appinstalled`・購読解除。
2. `src/components/InstallAppBanner.test.tsx`: iPhone / iPadOS / Android / PC / standalone / 閉じる の各ケース。
