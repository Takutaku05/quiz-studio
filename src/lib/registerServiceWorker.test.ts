import { registerServiceWorker } from './registerServiceWorker';

function setup({
  readyState = 'loading',
  register = vi.fn((_url: string, _options?: { scope?: string }): Promise<unknown> =>
    Promise.resolve({}),
  ),
} = {}) {
  const loadListeners: Array<() => void> = [];
  const fakeWindow = {
    document: { readyState },
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === 'load') loadListeners.push(listener);
    }),
  };
  const fakeNavigator = { serviceWorker: { register } };
  const fireLoad = () => loadListeners.forEach((listener) => listener());
  return { fakeWindow, fakeNavigator, register, fireLoad };
}

describe('registerServiceWorker', () => {
  it('registers /sw.js for the whole site after the page has loaded', () => {
    const { fakeWindow, fakeNavigator, register, fireLoad } = setup();

    registerServiceWorker({ enabled: true, window: fakeWindow, navigator: fakeNavigator });
    expect(register).not.toHaveBeenCalled();

    fireLoad();
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('registers immediately when the page has already loaded', () => {
    const { fakeWindow, fakeNavigator, register } = setup({ readyState: 'complete' });

    registerServiceWorker({ enabled: true, window: fakeWindow, navigator: fakeNavigator });

    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(fakeWindow.addEventListener).not.toHaveBeenCalled();
  });

  it('does nothing when disabled (dev server / tests)', () => {
    const { fakeWindow, fakeNavigator, register, fireLoad } = setup({ readyState: 'complete' });

    registerServiceWorker({ enabled: false, window: fakeWindow, navigator: fakeNavigator });
    fireLoad();

    expect(register).not.toHaveBeenCalled();
  });

  it('does nothing when the browser has no service worker support', () => {
    const { fakeWindow } = setup({ readyState: 'complete' });

    expect(() =>
      registerServiceWorker({ enabled: true, window: fakeWindow, navigator: {} }),
    ).not.toThrow();
  });

  it('warns instead of throwing when registration fails', async () => {
    const error = new Error('boom');
    const { fakeWindow, fakeNavigator } = setup({
      readyState: 'complete',
      register: vi.fn((): Promise<unknown> => Promise.reject(error)),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    registerServiceWorker({ enabled: true, window: fakeWindow, navigator: fakeNavigator });
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(expect.any(String), error));

    warn.mockRestore();
  });
});
