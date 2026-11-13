import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeAuthRedirectError,
  SupabaseAuthRepository,
  SupabaseQuizRepository,
  toAuthErrorMessage,
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
