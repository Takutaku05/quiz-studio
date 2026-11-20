interface ServiceWorkerRegistrar {
  register(scriptUrl: string, options?: { scope?: string }): Promise<unknown>;
}

export interface RegisterServiceWorkerOptions {
  /** Only register in production builds (`import.meta.env.PROD`). */
  enabled: boolean;
  window: {
    document: { readyState: string };
    addEventListener(type: 'load', listener: () => void, options?: { once?: boolean }): void;
  };
  navigator: { serviceWorker?: ServiceWorkerRegistrar };
}

export const SERVICE_WORKER_URL = '/sw.js';

/**
 * Register the (cache-free) service worker that makes the app installable.
 * Waits for `load` so registration never competes with the first render, and
 * swallows failures because the app works fine without it.
 */
export function registerServiceWorker({
  enabled,
  window: win,
  navigator: nav,
}: RegisterServiceWorkerOptions): void {
  const serviceWorker = nav.serviceWorker;
  if (!enabled || !serviceWorker) return;

  const register = () => {
    serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' }).catch((error: unknown) => {
      console.warn('Service worker registration failed', error);
    });
  };

  if (win.document.readyState === 'complete') {
    register();
  } else {
    win.addEventListener('load', register, { once: true });
  }
}
