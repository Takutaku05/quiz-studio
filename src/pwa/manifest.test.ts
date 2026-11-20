import manifestRaw from '../../public/manifest.webmanifest?raw';

const publicFiles = Object.keys(import.meta.glob('../../public/*.{png,svg}')).map((path) =>
  path.replace('../../public', ''),
);

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

describe('public/manifest.webmanifest', () => {
  const manifest = JSON.parse(manifestRaw) as Record<string, unknown> & { icons: ManifestIcon[] };

  it('describes a standalone app scoped to the whole site', () => {
    expect(manifest).toMatchObject({
      id: '/',
      name: 'Quiz Studio',
      short_name: 'Quiz Studio',
      lang: 'ja',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#4f46e5',
      background_color: '#f8fafc',
    });
    expect(typeof manifest.description).toBe('string');
  });

  it.each(['192x192', '512x512'])('provides a %s PNG icon for both any and maskable purposes', (size) => {
    const pngs = manifest.icons.filter((icon) => icon.sizes === size && icon.type === 'image/png');
    const purposes = pngs.flatMap((icon) => (icon.purpose ?? 'any').split(/\s+/));
    expect(purposes).toEqual(expect.arrayContaining(['any', 'maskable']));
  });

  it('only references icon files that exist in public/', () => {
    for (const icon of manifest.icons) {
      expect(publicFiles).toContain(icon.src);
    }
  });
});
