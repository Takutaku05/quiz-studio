import { describe, expect, it, vi } from 'vitest';
import {
  createInstallPromptStore,
  DISMISS_DURATION_MS,
  INSTALL_BANNER_DISMISSED_KEY,
  detectIosDevice,
  isInstallBannerDismissed,
  isRunningStandalone,
  rememberInstallBannerDismissed,
  type BeforeInstallPromptEvent,
} from './installPrompt';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_OLD_UA =
  'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1';
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const IOS_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

describe('Bolt 17: detectIosDevice', () => {
  it('detects iPhone and old iPad user agents', () => {
    expect(detectIosDevice({ userAgent: IPHONE_UA, maxTouchPoints: 5 })).toBe(true);
    expect(detectIosDevice({ userAgent: IOS_CHROME_UA, maxTouchPoints: 5 })).toBe(true);
    expect(detectIosDevice({ userAgent: IPAD_OLD_UA, maxTouchPoints: 5 })).toBe(true);
  });

  it('detects iPadOS Safari that reports a Mac user agent with touch support', () => {
    expect(detectIosDevice({ userAgent: MAC_UA, maxTouchPoints: 5 })).toBe(true);
  });

  it('does not treat a real Mac, Android or Windows as iOS', () => {
    expect(detectIosDevice({ userAgent: MAC_UA, maxTouchPoints: 0 })).toBe(false);
    expect(detectIosDevice({ userAgent: MAC_UA, maxTouchPoints: 1 })).toBe(false);
    expect(detectIosDevice({ userAgent: ANDROID_UA, maxTouchPoints: 5 })).toBe(false);
    expect(detectIosDevice({ userAgent: WINDOWS_UA, maxTouchPoints: 10 })).toBe(false);
  });
});

describe('Bolt 17: isRunningStandalone', () => {
  const matchMediaReturning = (matches: boolean) => vi.fn(() => ({ matches }));

  it('is true when display-mode is standalone', () => {
    expect(isRunningStandalone({ matchMedia: matchMediaReturning(true), navigator: {} })).toBe(true);
  });

  it('is true when iOS navigator.standalone is true', () => {
    expect(
      isRunningStandalone({ matchMedia: matchMediaReturning(false), navigator: { standalone: true } }),
    ).toBe(true);
  });

  it('is false in a normal browser tab', () => {
    const matchMedia = matchMediaReturning(false);
    expect(isRunningStandalone({ matchMedia, navigator: { standalone: false } })).toBe(false);
    expect(matchMedia).toHaveBeenCalledWith('(display-mode: standalone)');
  });

  it('is false when matchMedia is unavailable', () => {
    expect(isRunningStandalone({ navigator: {} })).toBe(false);
  });
});

describe('Bolt 17: install banner dismissal', () => {
  it('is not dismissed by default', () => {
    expect(isInstallBannerDismissed(localStorage, Date.now())).toBe(false);
  });

  it('stays dismissed for 30 days and shows again afterwards', () => {
    const now = new Date('2026-11-20T00:00:00Z').getTime();
    rememberInstallBannerDismissed(localStorage, now);
    expect(localStorage.getItem(INSTALL_BANNER_DISMISSED_KEY)).toBe(String(now));
    expect(DISMISS_DURATION_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(isInstallBannerDismissed(localStorage, now + DISMISS_DURATION_MS - 1)).toBe(true);
    expect(isInstallBannerDismissed(localStorage, now + DISMISS_DURATION_MS)).toBe(false);
  });

  it('ignores malformed values and storage errors', () => {
    localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, 'not-a-number');
    expect(isInstallBannerDismissed(localStorage, Date.now())).toBe(false);

    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(isInstallBannerDismissed(broken, Date.now())).toBe(false);
    expect(() => rememberInstallBannerDismissed(broken, Date.now())).not.toThrow();
  });
});

function createFakeWindow() {
  const listeners = new Map<string, (event: Event) => void>();
  return {
    listeners,
    addEventListener: vi.fn((type: string, listener: (event: Event) => void) => {
      listeners.set(type, listener);
    }),
  };
}

function createPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  return {
    preventDefault: vi.fn(),
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  } as unknown as BeforeInstallPromptEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

describe('Bolt 17: createInstallPromptStore', () => {
  it('captures beforeinstallprompt, suppresses the mini-infobar, and notifies subscribers', () => {
    const win = createFakeWindow();
    const store = createInstallPromptStore(win);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.getPromptEvent()).toBeNull();
    const event = createPromptEvent();
    win.listeners.get('beforeinstallprompt')!(event as unknown as Event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(store.getPromptEvent()).toBe(event);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('clears the saved event once the app is installed', () => {
    const win = createFakeWindow();
    const store = createInstallPromptStore(win);
    win.listeners.get('beforeinstallprompt')!(createPromptEvent() as unknown as Event);
    const listener = vi.fn();
    store.subscribe(listener);

    win.listeners.get('appinstalled')!(new Event('appinstalled'));

    expect(store.getPromptEvent()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('shows the browser prompt once and forgets the event afterwards', async () => {
    const win = createFakeWindow();
    const store = createInstallPromptStore(win);
    const event = createPromptEvent('dismissed');
    win.listeners.get('beforeinstallprompt')!(event as unknown as Event);

    await expect(store.prompt()).resolves.toBe('dismissed');
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(store.getPromptEvent()).toBeNull();
    await expect(store.prompt()).resolves.toBe('unavailable');
  });

  it('stops notifying after unsubscribe', () => {
    const win = createFakeWindow();
    const store = createInstallPromptStore(win);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    win.listeners.get('beforeinstallprompt')!(createPromptEvent() as unknown as Event);
    expect(listener).not.toHaveBeenCalled();
  });
});
