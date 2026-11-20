import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  createInstallPromptStore,
  INSTALL_BANNER_DISMISSED_KEY,
  type BeforeInstallPromptEvent,
} from '../lib/installPrompt';
import { InstallAppBanner, type InstallBannerEnvironment } from './InstallAppBanner';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

const NOW = new Date('2026-11-20T00:00:00Z').getTime();

function env(overrides: Partial<InstallBannerEnvironment> = {}): InstallBannerEnvironment {
  return {
    userAgent: IPHONE_UA,
    maxTouchPoints: 5,
    standalone: false,
    storage: localStorage,
    now: () => NOW,
    ...overrides,
  };
}

function setup() {
  const listeners = new Map<string, (event: Event) => void>();
  const store = createInstallPromptStore({
    addEventListener: (type, listener) => listeners.set(type, listener),
  });
  const fireBeforeInstallPrompt = (outcome: 'accepted' | 'dismissed' = 'accepted') => {
    const event = {
      preventDefault: vi.fn(),
      prompt: vi.fn(() => Promise.resolve()),
      userChoice: Promise.resolve({ outcome, platform: 'web' }),
    } as unknown as BeforeInstallPromptEvent;
    act(() => listeners.get('beforeinstallprompt')!(event));
    return event;
  };
  const fireAppInstalled = () => act(() => listeners.get('appinstalled')!(new Event('appinstalled')));
  return { store, fireBeforeInstallPrompt, fireAppInstalled };
}

describe('Bolt 17: InstallAppBanner', () => {
  it('shows manual steps on iPhone', () => {
    const { store } = setup();
    render(<InstallAppBanner store={store} environment={env()} />);
    const banner = screen.getByRole('region', { name: 'ホーム画面に追加' });
    expect(banner).toHaveTextContent('共有ボタン');
    expect(banner).toHaveTextContent('「ホーム画面に追加」');
    expect(screen.queryByRole('button', { name: 'ホーム画面に追加' })).not.toBeInTheDocument();
  });

  it('shows manual steps on iPadOS Safari (Mac UA with touch)', () => {
    const { store } = setup();
    render(<InstallAppBanner store={store} environment={env({ userAgent: IPAD_UA })} />);
    expect(screen.getByRole('region', { name: 'ホーム画面に追加' })).toHaveTextContent('共有ボタン');
  });

  it('shows nothing on Android until beforeinstallprompt arrives, then prompts on click', async () => {
    const user = userEvent.setup();
    const { store, fireBeforeInstallPrompt } = setup();
    render(<InstallAppBanner store={store} environment={env({ userAgent: ANDROID_UA })} />);
    expect(screen.queryByRole('region', { name: 'ホーム画面に追加' })).not.toBeInTheDocument();

    const event = fireBeforeInstallPrompt();
    await user.click(screen.getByRole('button', { name: 'ホーム画面に追加' }));

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region', { name: 'ホーム画面に追加' })).not.toBeInTheDocument();
  });

  it('hides the Android button once the app is installed', () => {
    const { store, fireBeforeInstallPrompt, fireAppInstalled } = setup();
    fireBeforeInstallPrompt();
    render(<InstallAppBanner store={store} environment={env({ userAgent: ANDROID_UA })} />);
    expect(screen.getByRole('button', { name: 'ホーム画面に追加' })).toBeInTheDocument();
    fireAppInstalled();
    expect(screen.queryByRole('button', { name: 'ホーム画面に追加' })).not.toBeInTheDocument();
  });

  it('does not show on PC even when the browser offers installation', () => {
    const { store, fireBeforeInstallPrompt } = setup();
    fireBeforeInstallPrompt();
    render(
      <InstallAppBanner store={store} environment={env({ userAgent: WINDOWS_UA, maxTouchPoints: 0 })} />,
    );
    expect(screen.queryByRole('region', { name: 'ホーム画面に追加' })).not.toBeInTheDocument();
  });

  it('does not show when already launched from the home screen', () => {
    const { store } = setup();
    render(<InstallAppBanner store={store} environment={env({ standalone: true })} />);
    expect(screen.queryByRole('region', { name: 'ホーム画面に追加' })).not.toBeInTheDocument();
  });

  it('hides for 30 days after closing', async () => {
    const user = userEvent.setup();
    const { store } = setup();
    const { unmount } = render(<InstallAppBanner store={store} environment={env()} />);

    await user.click(screen.getByRole('button', { name: 'ホーム画面に追加の案内を閉じる' }));

    expect(screen.queryByRole('region', { name: 'ホーム画面に追加' })).not.toBeInTheDocument();
    expect(localStorage.getItem(INSTALL_BANNER_DISMISSED_KEY)).toBe(String(NOW));
    unmount();

    render(<InstallAppBanner store={store} environment={env({ now: () => NOW + 1000 })} />);
    expect(screen.queryByRole('region', { name: 'ホーム画面に追加' })).not.toBeInTheDocument();
  });
});
