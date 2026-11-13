import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeAuthRedirectError,
  SupabaseAuthRepository,
  SupabaseQuizRepository,
  toAuthErrorMessage,
  toPasskeyErrorMessage,
} from './supabaseRepositories';

const fakeUser = { id: 'u1', email: 'a@example.com', created_at: '2026-01-01T00:00:00Z', identities: [{}] };

function authClient(signUpResult: unknown) {
  return {
    auth: { signUp: vi.fn().mockResolvedValue(signUpResult) },
  } as unknown as SupabaseClient;
}

describe('toAuthErrorMessage', () => {
  it('maps Supabase messages to Japanese', () => {
    expect(toAuthErrorMessage('Invalid login credentials')).toBe(
      'メールアドレスまたはパスワードが正しくありません。',
    );
    expect(toAuthErrorMessage('User already registered')).toBe(
      'このメールアドレスは既に登録されています。',
    );
    expect(toAuthErrorMessage('Unsupported provider: provider is not enabled')).toBe(
      'Googleログインは現在有効になっていません。Supabaseダッシュボードの設定を確認してください。',
    );
    expect(toAuthErrorMessage('access_denied')).toBe(
      'Googleログインがキャンセルされました。',
    );
  });
});

describe('SupabaseAuthRepository.signInWithGoogle & onAuthStateChange', () => {
  it('calls signInWithOAuth with google provider and login redirect URL', async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: { provider: 'google', url: 'https://accounts.google.com' }, error: null });
    const repo = new SupabaseAuthRepository({
      auth: { signInWithOAuth },
    } as unknown as SupabaseClient);

    await repo.signInWithGoogle();

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/login` },
    });
  });

  it('maps OAuth error to a Japanese error message', async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({
      data: { provider: 'google', url: null },
      error: { message: 'Unsupported provider: provider is not enabled' },
    });
    const repo = new SupabaseAuthRepository({
      auth: { signInWithOAuth },
    } as unknown as SupabaseClient);

    await expect(repo.signInWithGoogle()).rejects.toThrow('有効になっていません');
  });

  it('subscribes to onAuthStateChange and unsubscribes cleanly', () => {
    const unsubscribe = vi.fn();
    let capturedHandler: ((event: string, session: { user: typeof fakeUser } | null) => void) | undefined;
    const onAuthStateChange = vi.fn((handler) => {
      capturedHandler = handler;
      return { data: { subscription: { unsubscribe } } };
    });
    const repo = new SupabaseAuthRepository({
      auth: { onAuthStateChange },
    } as unknown as SupabaseClient);

    const listener = vi.fn();
    const unsub = repo.onAuthStateChange(listener);

    capturedHandler?.('SIGNED_IN', { user: fakeUser });
    expect(listener).toHaveBeenCalledWith({
      id: 'u1',
      email: 'a@example.com',
      createdAt: '2026-01-01T00:00:00Z',
    });

    capturedHandler?.('SIGNED_OUT', null);
    expect(listener).toHaveBeenCalledWith(null);

    unsub();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('consumeAuthRedirectError', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('returns null when no auth error params are present', () => {
    window.history.replaceState(null, '', '/login');
    expect(consumeAuthRedirectError()).toBeNull();
  });

  it('extracts OAuth query error, maps it to Japanese, and cleans URL params', () => {
    window.history.replaceState(
      null,
      '',
      '/login?error=access_denied&error_description=User+denied+access&keep=1',
    );
    expect(consumeAuthRedirectError()).toBe('Googleログインがキャンセルされました。');
    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toBe('?keep=1');
  });

  it('extracts OAuth hash error and cleans hash params', () => {
    window.history.replaceState(
      null,
      '',
      '/login#error=server_error&error_code=bad_oauth_state&error_description=Invalid+state',
    );
    expect(consumeAuthRedirectError()).toBe(
      '認証のコールバック処理に失敗しました。もう一度お試しください。',
    );
    expect(window.location.hash).toBe('');
  });
});

describe('SupabaseAuthRepository.signUp', () => {
  it('returns the user when a session is created', async () => {
    const repo = new SupabaseAuthRepository(
      authClient({ data: { user: fakeUser, session: {} }, error: null }),
    );
    await expect(repo.signUp('A@example.com', 'secret1')).resolves.toEqual({
      id: 'u1',
      email: 'a@example.com',
      createdAt: '2026-01-01T00:00:00Z',
    });
  });

  it('asks to confirm the email when no session is returned', async () => {
    const repo = new SupabaseAuthRepository(
      authClient({ data: { user: fakeUser, session: null }, error: null }),
    );
    await expect(repo.signUp('a@example.com', 'secret1')).rejects.toThrow('確認メール');
  });

  it('rejects an existing email (user with no identities)', async () => {
    const repo = new SupabaseAuthRepository(
      authClient({ data: { user: { ...fakeUser, identities: [] }, session: null }, error: null }),
    );
    await expect(repo.signUp('a@example.com', 'secret1')).rejects.toThrow('既に登録');
  });
});

describe('SupabaseQuizRepository.getById', () => {
  it('maps rows to a Quiz with questions sorted by order', async () => {
    const row = {
      id: 'q1',
      user_id: 'u1',
      title: 'T',
      created_at: '2026-01-01T00:00:00Z',
      questions: [
        { id: 'b', quiz_id: 'q1', order_index: 1, question: 'Q2', choice1: 'a', choice2: 'b', choice3: null, choice4: null, answer: 2, explanation: null },
        { id: 'a', quiz_id: 'q1', order_index: 0, question: 'Q1', choice1: 'a', choice2: 'b', choice3: 'c', choice4: null, answer: 1, explanation: 'e' },
      ],
    };
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: () => Promise.resolve({ data: row, error: null }),
    };
    const client = { from: () => builder } as unknown as SupabaseClient;
    const quiz = await new SupabaseQuizRepository(client).getById('q1', 'u1');
    expect(quiz?.userId).toBe('u1');
    expect(quiz?.questions.map((q) => q.question)).toEqual(['Q1', 'Q2']);
    expect(quiz?.questions[0]).toMatchObject({ quizId: 'q1', orderIndex: 0, answer: 1, explanation: 'e' });
  });

  it('treats an invalid UUID as not found', async () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: () => Promise.resolve({ data: null, error: { code: '22P02', message: 'invalid uuid' } }),
    };
    const client = { from: () => builder } as unknown as SupabaseClient;
    await expect(new SupabaseQuizRepository(client).getById('bad', 'u1')).resolves.toBeNull();
  });
});

describe('toPasskeyErrorMessage', () => {
  it('maps WebAuthn and Supabase passkey errors to Japanese', () => {
    expect(
      toPasskeyErrorMessage({
        code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY',
        cause: { name: 'NotAllowedError' },
        message: 'The operation either timed out or was not allowed.',
      }),
    ).toBe('パスキーの操作がキャンセルされたか、タイムアウトしました。');

    expect(
      toPasskeyErrorMessage({
        code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED',
        message: 'The authenticator was previously registered',
      }),
    ).toBe('この認証器のパスキーは既に登録されています。');

    expect(
      toPasskeyErrorMessage({
        code: 'webauthn_challenge_expired',
        message: 'Challenge expired',
      }),
    ).toBe('パスキー認証の有効期限が切れました。もう一度お試しください。');

    expect(
      toPasskeyErrorMessage({
        code: 'ERROR_INVALID_RP_ID',
        message: 'The RP ID is invalid',
      }),
    ).toContain('Relying Party');
  });
});

describe('SupabaseAuthRepository passkey methods', () => {
  const originalPublicKeyCredential = window.PublicKeyCredential;
  const originalCredentials = navigator.credentials;

  function enableMockWebAuthn() {
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: function MockPublicKeyCredential() {},
    });
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: { get: vi.fn(), create: vi.fn() },
    });
  }

  afterEach(() => {
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: originalPublicKeyCredential,
    });
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: originalCredentials,
    });
  });

  it('rejects signInWithPasskey when browser does not support WebAuthn', async () => {
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: undefined,
    });
    const repo = new SupabaseAuthRepository({ auth: {} } as unknown as SupabaseClient);
    expect(repo.isPasskeySupported()).toBe(false);
    await expect(repo.signInWithPasskey()).rejects.toThrow('対応していません');
  });

  it('signs in with passkey and returns mapped User', async () => {
    enableMockWebAuthn();
    const signInWithPasskey = vi.fn().mockResolvedValue({
      data: { user: fakeUser, session: { access_token: 'tok' } },
      error: null,
    });
    const repo = new SupabaseAuthRepository({
      auth: { signInWithPasskey },
    } as unknown as SupabaseClient);

    expect(repo.isPasskeySupported()).toBe(true);
    await expect(repo.signInWithPasskey()).resolves.toEqual({
      id: 'u1',
      email: 'a@example.com',
      createdAt: '2026-01-01T00:00:00Z',
    });
  });

  it('registers a passkey and optionally updates its friendly name', async () => {
    enableMockWebAuthn();
    const registerPasskey = vi.fn().mockResolvedValue({
      data: { id: 'pk-1', created_at: '2026-11-13T00:00:00Z' },
      error: null,
    });
    const update = vi.fn().mockResolvedValue({
      data: { id: 'pk-1', friendly_name: 'MacBook Touch ID', created_at: '2026-11-13T00:00:00Z' },
      error: null,
    });
    const repo = new SupabaseAuthRepository({
      auth: { registerPasskey, passkey: { update } },
    } as unknown as SupabaseClient);

    const created = await repo.registerPasskey('  MacBook Touch ID  ');
    expect(registerPasskey).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ passkeyId: 'pk-1', friendlyName: 'MacBook Touch ID' });
    expect(created).toEqual({
      id: 'pk-1',
      friendlyName: 'MacBook Touch ID',
      createdAt: '2026-11-13T00:00:00Z',
      lastUsedAt: null,
    });
  });

  it('validates friendly name length before registering passkey', async () => {
    enableMockWebAuthn();
    const registerPasskey = vi.fn();
    const repo = new SupabaseAuthRepository({
      auth: { registerPasskey },
    } as unknown as SupabaseClient);

    await expect(repo.registerPasskey('a'.repeat(121))).rejects.toThrow('120文字以内');
    expect(registerPasskey).not.toHaveBeenCalled();
  });

  it('lists, updates, and deletes passkeys', async () => {
    const list = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'pk-1',
          friendly_name: 'iPhone',
          created_at: '2026-11-10T00:00:00Z',
          last_used_at: '2026-11-12T00:00:00Z',
        },
      ],
      error: null,
    });
    const update = vi.fn().mockResolvedValue({
      data: {
        id: 'pk-1',
        friendly_name: 'iPhone 16',
        created_at: '2026-11-10T00:00:00Z',
        last_used_at: '2026-11-12T00:00:00Z',
      },
      error: null,
    });
    const del = vi.fn().mockResolvedValue({ data: null, error: null });

    const repo = new SupabaseAuthRepository({
      auth: { passkey: { list, update, delete: del } },
    } as unknown as SupabaseClient);

    await expect(repo.listPasskeys()).resolves.toEqual([
      {
        id: 'pk-1',
        friendlyName: 'iPhone',
        createdAt: '2026-11-10T00:00:00Z',
        lastUsedAt: '2026-11-12T00:00:00Z',
      },
    ]);

    await expect(repo.updatePasskeyName('pk-1', '   ')).rejects.toThrow('パスキー名を入力');
    await expect(repo.updatePasskeyName('pk-1', 'iPhone 16')).resolves.toMatchObject({
      id: 'pk-1',
      friendlyName: 'iPhone 16',
    });

    await repo.deletePasskey('pk-1');
    expect(del).toHaveBeenCalledWith({ passkeyId: 'pk-1' });
  });
});
