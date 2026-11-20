import swSource from '../../public/sw.js?raw';

type Listener = (event: { waitUntil: (p: Promise<unknown>) => void }) => void;

function loadServiceWorker() {
  const listeners = new Map<string, Listener>();
  const fakeSelf = {
    addEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.set(type, listener);
    }),
    skipWaiting: vi.fn(() => Promise.resolve()),
    clients: { claim: vi.fn(() => Promise.resolve()) },
  };
  const fakeCaches = { open: vi.fn(), match: vi.fn(), keys: vi.fn(), delete: vi.fn() };
  new Function('self', 'caches', swSource)(fakeSelf, fakeCaches);
  return { listeners, fakeSelf, fakeCaches };
}

describe('public/sw.js', () => {
  it('does not intercept network requests', () => {
    const { listeners } = loadServiceWorker();
    expect(listeners.has('fetch')).toBe(false);
  });

  it('activates new versions immediately without touching caches', () => {
    const { listeners, fakeSelf, fakeCaches } = loadServiceWorker();
    const waitUntil = vi.fn();

    listeners.get('install')?.({ waitUntil });
    listeners.get('activate')?.({ waitUntil });

    expect(fakeSelf.skipWaiting).toHaveBeenCalledTimes(1);
    expect(fakeSelf.clients.claim).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(2);
    expect(fakeCaches.open).not.toHaveBeenCalled();
  });
});
