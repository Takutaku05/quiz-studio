import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
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
