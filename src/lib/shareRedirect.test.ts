import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSharePath,
  buildShareUrl,
  clearPendingShareToken,
  extractShareTokenFromPath,
  getPendingShareToken,
  resolvePendingShareToken,
  resolvePostAuthRedirect,
  sanitizeRedirectPath,
  savePendingShareToken,
} from './shareRedirect';

describe('shareRedirect helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds share paths and URLs cleanly', () => {
    expect(buildSharePath(' abc-123 ')).toBe('/share/abc-123');
    expect(buildShareUrl('abc123', 'https://csv-quiz-studio.takutakus.com')).toBe(
      'https://csv-quiz-studio.takutakus.com/share/abc123',
    );
  });

  it('sanitizes redirect paths against open redirects and /login loops', () => {
    expect(sanitizeRedirectPath('/share/tok1')).toBe('/share/tok1');
    expect(sanitizeRedirectPath('https://evil.example.com')).toBeNull();
    expect(sanitizeRedirectPath('//evil.example.com/share/1')).toBeNull();
    expect(sanitizeRedirectPath('/\\evil.example.com')).toBeNull();
    expect(sanitizeRedirectPath('/login')).toBeNull();
    expect(sanitizeRedirectPath('/login?redirect=/share/tok1')).toBeNull();
    expect(sanitizeRedirectPath('share/tok1')).toBeNull();
  });

  it('extracts share tokens from /share/:token paths', () => {
    expect(extractShareTokenFromPath('/share/abc123')).toBe('abc123');
    expect(extractShareTokenFromPath('/share/abc%20123?foo=1')).toBe('abc 123');
    expect(extractShareTokenFromPath('/share/')).toBeNull();
    expect(extractShareTokenFromPath('/quiz/123')).toBeNull();
    expect(extractShareTokenFromPath('/share/%E0%A4%A')).toBeNull();
  });

  it('persists pending share token with TTL expiration', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-17T00:00:00Z'));

    savePendingShareToken('tok-fresh');
    expect(getPendingShareToken()).toBe('tok-fresh');

    vi.advanceTimersByTime(29 * 60 * 1000);
    expect(getPendingShareToken()).toBe('tok-fresh');

    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(getPendingShareToken()).toBeNull();

    savePendingShareToken('tok-clear');
    clearPendingShareToken();
    expect(getPendingShareToken()).toBeNull();
  });

  it('resolves post-auth redirect prioritizing explicit query param then pending token', () => {
    savePendingShareToken('tok-pending');
    expect(resolvePostAuthRedirect('?redirect=%2Fshare%2Ftok-explicit')).toBe('/share/tok-explicit');
    expect(resolvePostAuthRedirect('?redirect=https%3A%2F%2Fevil.example.com')).toBe(
      '/share/tok-pending',
    );
    expect(resolvePendingShareToken('?redirect=%2Fshare%2Ftok-explicit')).toBe('tok-explicit');

    clearPendingShareToken();
    expect(resolvePostAuthRedirect('')).toBe('/');
    expect(resolvePendingShareToken('')).toBeNull();
  });
});
