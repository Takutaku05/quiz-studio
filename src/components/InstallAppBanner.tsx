import { useState, useSyncExternalStore } from 'react';
import { Share, Smartphone, X } from 'lucide-react';
import { appInstallPromptStore } from '../lib/appInstallPrompt';
import {
  detectIosDevice,
  isInstallBannerDismissed,
  isRunningStandalone,
  rememberInstallBannerDismissed,
  type InstallPromptStore,
} from '../lib/installPrompt';

export interface InstallBannerEnvironment {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  now: () => number;
}

function browserEnvironment(): InstallBannerEnvironment {
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: isRunningStandalone({
      matchMedia: typeof window.matchMedia === 'function' ? (q) => window.matchMedia(q) : undefined,
      navigator: navigator as Navigator & { standalone?: boolean },
    }),
    storage: localStorage,
    now: Date.now,
  };
}

interface InstallAppBannerProps {
  store?: InstallPromptStore;
  environment?: InstallBannerEnvironment;
}

/**
 * "ホーム画面に追加" guide shown only on phones / tablets in a normal browser tab (Issue #43).
 * Android gets a button that opens the browser's install dialog; iOS gets manual steps.
 */
export function InstallAppBanner({ store = appInstallPromptStore, environment }: InstallAppBannerProps) {
  const [env] = useState(() => environment ?? browserEnvironment());
  const [dismissed, setDismissed] = useState(() => isInstallBannerDismissed(env.storage, env.now()));
  const promptEvent = useSyncExternalStore(store.subscribe, store.getPromptEvent);

  if (env.standalone || dismissed) return null;

  const isIos = detectIosDevice(env);
  const isAndroid = /Android/.test(env.userAgent);
  const canPrompt = isAndroid && promptEvent !== null;
  if (!isIos && !canPrompt) return null;

  const handleDismiss = () => {
    rememberInstallBannerDismissed(env.storage, env.now());
    setDismissed(true);
  };

  const handleInstall = () => {
    void store.prompt().catch(() => {
      // The browser may refuse to show the dialog; nothing else to do.
    });
  };

  return (
    <section
      aria-label="ホーム画面に追加"
      className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3.5 flex items-start gap-3"
    >
      <Smartphone className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-indigo-900">ホーム画面に追加するとアプリのように使えます</p>
          {isIos ? (
            <p className="text-xs text-indigo-800 mt-1 leading-relaxed">
              画面の
              <span className="inline-flex items-center gap-0.5 mx-0.5 font-semibold">
                <Share className="w-3.5 h-3.5" aria-hidden="true" />
                共有ボタン
              </span>
              をタップし、メニューから「ホーム画面に追加」を選んでください。
            </p>
          ) : (
            <p className="text-xs text-indigo-800 mt-1">ホーム画面からワンタップで起動できます。</p>
          )}
        </div>
        {canPrompt && (
          <button
            type="button"
            onClick={handleInstall}
            className="shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 cursor-pointer"
          >
            ホーム画面に追加
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="ホーム画面に追加の案内を閉じる"
        className="p-1 rounded-lg text-indigo-600 hover:bg-indigo-100 cursor-pointer shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </section>
  );
}
