const PENDING_SHARE_STORAGE_KEY = 'csv_quiz_studio_pending_share';
const PENDING_SHARE_TTL_MS = 30 * 60 * 1000;

interface StoredPendingShare {
  token: string;
  savedAt: number;
}

/** Build the in-app route path for a share token. */
export function buildSharePath(token: string): string {
  return `/share/${encodeURIComponent(token.trim())}`;
}

/** Build the full share URL suitable for copying or encoding in a QR code. */
export function buildShareUrl(token: string, origin?: string): string {
  const resolvedOrigin =
    origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${resolvedOrigin}${buildSharePath(token)}`;
}

/**
 * Accept only safe relative in-app redirect paths (rejecting external URLs,
 * protocol-relative paths, control characters, and /login loops).
 */
export function sanitizeRedirectPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return null;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  if (trimmed === '/login' || trimmed.startsWith('/login?') || trimmed.startsWith('/login#')) {
    return null;
  }
  return trimmed;
}

/** Extract the share token when the path is `/share/<token>`. */
export function extractShareTokenFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const pathname = path.split(/[?#]/, 1)[0];
  const match = /^\/share\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  try {
    const decoded = decodeURIComponent(match[1]).trim();
    return decoded || null;
  } catch {
    return null;
  }
}

export function savePendingShareToken(token: string): void {
  if (typeof localStorage === 'undefined') return;
  const trimmed = token.trim();
  if (!trimmed) return;
  const payload: StoredPendingShare = {
    token: trimmed,
    savedAt: Date.now(),
  };
  localStorage.setItem(PENDING_SHARE_STORAGE_KEY, JSON.stringify(payload));
}

export function getPendingShareToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(PENDING_SHARE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPendingShare>;
    if (
      typeof parsed.token !== 'string' ||
      !parsed.token.trim() ||
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > PENDING_SHARE_TTL_MS
    ) {
      localStorage.removeItem(PENDING_SHARE_STORAGE_KEY);
      return null;
    }
    return parsed.token.trim();
  } catch {
    localStorage.removeItem(PENDING_SHARE_STORAGE_KEY);
    return null;
  }
}

export function clearPendingShareToken(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(PENDING_SHARE_STORAGE_KEY);
}

/**
 * Determine where to send the user after authentication completes:
 * explicit sanitized `?redirect=...` query param -> recent pending share -> `/`.
 */
export function resolvePostAuthRedirect(search: string): string {
  const params = new URLSearchParams(search);
  const explicit = sanitizeRedirectPath(params.get('redirect'));
  if (explicit) return explicit;

  const pendingToken = getPendingShareToken();
  if (pendingToken) {
    return buildSharePath(pendingToken);
  }
  return '/';
}

/** Resolve the pending share token from either `?redirect=...` or localStorage. */
export function resolvePendingShareToken(search: string): string | null {
  const params = new URLSearchParams(search);
  const explicit = sanitizeRedirectPath(params.get('redirect'));
  const fromQuery = extractShareTokenFromPath(explicit);
  if (fromQuery) return fromQuery;
  return getPendingShareToken();
}
