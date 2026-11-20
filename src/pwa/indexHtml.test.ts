import indexHtml from '../../index.html?raw';

describe('index.html PWA metadata', () => {
  const doc = new DOMParser().parseFromString(indexHtml, 'text/html');
  const meta = (name: string) =>
    doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? null;

  it('links the web app manifest', () => {
    expect(doc.querySelector('link[rel="manifest"]')?.getAttribute('href')).toBe(
      '/manifest.webmanifest',
    );
  });

  it('sets the theme color to match the manifest', () => {
    expect(meta('theme-color')).toBe('#4f46e5');
  });

  it('opts into standalone mode on iOS and Android', () => {
    expect(meta('apple-mobile-web-app-capable')).toBe('yes');
    expect(meta('mobile-web-app-capable')).toBe('yes');
    expect(meta('apple-mobile-web-app-title')).toBe('Quiz Studio');
    expect(meta('apple-mobile-web-app-status-bar-style')).toBe('default');
    expect(doc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toBe(
      '/apple-touch-icon.png',
    );
  });

  it('keeps content out of the notch by not using viewport-fit=cover', () => {
    expect(meta('viewport')).not.toMatch(/viewport-fit\s*=\s*cover/);
  });
});
