/**
 * Helpers for the in-app "ホーム画面に追加" guide (Issue #43).
 *
 * - Android / Chromium: keep the `beforeinstallprompt` event and show it from a button.
 * - iPhone / iPad: there is no install API, so the UI shows manual steps instead.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const INSTALL_BANNER_DISMISSED_KEY = 'quiz-studio:install-banner-dismissed-at';
export const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * iPhone / iPod / old iPad report themselves in the UA. iPadOS 13+ Safari reports a Mac UA,
 * so a "Macintosh" UA with multi-touch is treated as an iPad (real Macs have no touch points).
 */
export function detectIosDevice({
  userAgent,
  maxTouchPoints,
}: {
  userAgent: string;
  maxTouchPoints: number;
}): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/** True when the app was launched from the home screen (Android display-mode or iOS `navigator.standalone`). */
export function isRunningStandalone({
  matchMedia,
  navigator: nav,
}: {
  matchMedia?: (query: string) => { matches: boolean };
  navigator: { standalone?: boolean };
}): boolean {
  if (nav.standalone === true) return true;
  return matchMedia?.('(display-mode: standalone)').matches ?? false;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function isInstallBannerDismissed(storage: StorageLike, now: number): boolean {
  try {
    const raw = storage.getItem(INSTALL_BANNER_DISMISSED_KEY);
    if (raw === null) return false;
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt)) return false;
    return now - dismissedAt < DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

export function rememberInstallBannerDismissed(storage: StorageLike, now: number): void {
  try {
    storage.setItem(INSTALL_BANNER_DISMISSED_KEY, String(now));
  } catch {
    // Storage can be blocked (private mode etc.); the banner simply shows again next time.
  }
}

export type InstallPromptOutcome = 'accepted' | 'dismissed' | 'unavailable';

export interface InstallPromptStore {
  getPromptEvent(): BeforeInstallPromptEvent | null;
  subscribe(listener: () => void): () => void;
  prompt(): Promise<InstallPromptOutcome>;
}

/**
 * `beforeinstallprompt` can fire before the dashboard mounts, so the listener is attached
 * once at startup (see main.tsx) and the event is kept here until a component asks for it.
 */
export function createInstallPromptStore(win: {
  addEventListener(type: string, listener: (event: Event) => void): void;
}): InstallPromptStore {
  let promptEvent: BeforeInstallPromptEvent | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  win.addEventListener('beforeinstallprompt', (event) => {
    // Suppress Chrome's mini-infobar; the dashboard shows its own button instead.
    event.preventDefault();
    promptEvent = event as BeforeInstallPromptEvent;
    notify();
  });

  win.addEventListener('appinstalled', () => {
    promptEvent = null;
    notify();
  });

  return {
    getPromptEvent: () => promptEvent,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async prompt() {
      const event = promptEvent;
      if (!event) return 'unavailable';
      // A saved event can only be prompted once.
      promptEvent = null;
      notify();
      await event.prompt();
      const choice = await event.userChoice;
      return choice.outcome;
    },
  };
}
