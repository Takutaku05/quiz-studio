import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseStudyRepository } from './supabaseStudyRepository';

/** Chainable PostgREST query builder mock that resolves to `result` when awaited. */
function queryBuilder(result: { data?: unknown; error?: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'upsert', 'delete', 'maybeSingle']) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    });
  }
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve, reject);
  return { builder, calls };
}

function clientWith(from: ReturnType<typeof queryBuilder>['builder'], rpc = vi.fn()) {
  return {
    from: vi.fn(() => from),
    rpc,
  } as unknown as SupabaseClient & { from: ReturnType<typeof vi.fn>; rpc: ReturnType<typeof vi.fn> };
}

const sessionRow = {
  quiz_id: 'quiz-1',
  mode: 'test',
  target_filter: 'low_accuracy',
  shuffle_questions: true,
  shuffle_choices: true,
  question_ids: ['q2', 'q1'],
  choices_order: { q1: [2, 1], q2: [3, 1, 2] },
  answers: { q2: 1 },
  current_index: 1,
  updated_at: '2026-11-18T00:00:00Z',
};

const expectedSession = {
  quizId: 'quiz-1',
  mode: 'test',
  targetFilter: 'low_accuracy',
  shuffleQuestions: true,
  shuffleChoices: true,
  questionIds: ['q2', 'q1'],
  choicesOrder: { q1: [2, 1], q2: [3, 1, 2] },
  answers: { q2: 1 },
  currentIndex: 1,
  updatedAt: '2026-11-18T00:00:00Z',
};

describe('Bolt 10: SupabaseStudyRepository', () => {
  it('records an answer through the record_question_answer RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const repo = new SupabaseStudyRepository(clientWith(queryBuilder({}).builder, rpc));

    await repo.recordAnswer('u1', { quizId: 'quiz-1', questionId: 'q1', isCorrect: false });

    expect(rpc).toHaveBeenCalledWith('record_question_answer', {
      p_quiz_id: 'quiz-1',
      p_question_id: 'q1',
      p_is_correct: false,
    });
  });

  it('throws when recording fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const repo = new SupabaseStudyRepository(clientWith(queryBuilder({}).builder, rpc));

    await expect(
      repo.recordAnswer('u1', { quizId: 'quiz-1', questionId: 'q1', isCorrect: true }),
    ).rejects.toThrow('permission denied');
  });

  it('maps stat rows and filters by quiz only when quizId is given', async () => {
    const row = {
      quiz_id: 'quiz-1',
      question_id: 'q1',
      attempts_count: 5,
      correct_count: 3,
      last_is_correct: false,
      last_answered_at: '2026-11-18T00:00:00Z',
    };
    const withQuiz = queryBuilder({ data: [row] });
    const repo = new SupabaseStudyRepository(clientWith(withQuiz.builder));

    await expect(repo.listStats('u1', 'quiz-1')).resolves.toEqual([
      {
        quizId: 'quiz-1',
        questionId: 'q1',
        attemptsCount: 5,
        correctCount: 3,
        lastIsCorrect: false,
        lastAnsweredAt: '2026-11-18T00:00:00Z',
      },
    ]);
    expect(withQuiz.calls).toContainEqual(['eq', ['user_id', 'u1']]);
    expect(withQuiz.calls).toContainEqual(['eq', ['quiz_id', 'quiz-1']]);

    const allQuizzes = queryBuilder({ data: [] });
    await new SupabaseStudyRepository(clientWith(allQuizzes.builder)).listStats('u1');
    expect(allQuizzes.calls.filter(([m, args]) => m === 'eq' && args[0] === 'quiz_id')).toEqual([]);
  });

  it('gets and lists sessions mapped to the domain shape', async () => {
    const single = queryBuilder({ data: sessionRow });
    await expect(
      new SupabaseStudyRepository(clientWith(single.builder)).getSession('u1', 'quiz-1'),
    ).resolves.toEqual(expectedSession);
    expect(single.calls).toContainEqual(['eq', ['quiz_id', 'quiz-1']]);

    const list = queryBuilder({ data: [sessionRow] });
    await expect(
      new SupabaseStudyRepository(clientWith(list.builder)).listSessions('u1'),
    ).resolves.toEqual([expectedSession]);
  });

  it('treats a missing session or an invalid UUID as no session', async () => {
    await expect(
      new SupabaseStudyRepository(clientWith(queryBuilder({ data: null }).builder)).getSession('u1', 'quiz-1'),
    ).resolves.toBeNull();
    await expect(
      new SupabaseStudyRepository(
        clientWith(queryBuilder({ error: { code: '22P02', message: 'invalid input syntax for type uuid' } }).builder),
      ).getSession('u1', 'not-a-uuid'),
    ).resolves.toBeNull();
  });

  it('upserts a session keyed by user and quiz', async () => {
    const upsert = queryBuilder({});
    const repo = new SupabaseStudyRepository(clientWith(upsert.builder));
    const { updatedAt: _updatedAt, ...input } = expectedSession;

    await repo.saveSession('u1', input as Parameters<typeof repo.saveSession>[1]);

    const call = upsert.calls.find(([m]) => m === 'upsert');
    expect(call?.[1][0]).toMatchObject({
      user_id: 'u1',
      quiz_id: 'quiz-1',
      mode: 'test',
      target_filter: 'low_accuracy',
      shuffle_questions: true,
      shuffle_choices: true,
      question_ids: ['q2', 'q1'],
      choices_order: { q1: [2, 1], q2: [3, 1, 2] },
      answers: { q2: 1 },
      current_index: 1,
    });
    expect(call?.[1][1]).toEqual({ onConflict: 'user_id,quiz_id' });
  });

  it('deletes the session for the user and quiz and surfaces errors', async () => {
    const del = queryBuilder({});
    await new SupabaseStudyRepository(clientWith(del.builder)).deleteSession('u1', 'quiz-1');
    expect(del.calls).toContainEqual(['delete', []]);
    expect(del.calls).toContainEqual(['eq', ['user_id', 'u1']]);
    expect(del.calls).toContainEqual(['eq', ['quiz_id', 'quiz-1']]);

    const failing = queryBuilder({ error: { message: 'network down' } });
    await expect(
      new SupabaseStudyRepository(clientWith(failing.builder)).deleteSession('u1', 'quiz-1'),
    ).rejects.toThrow('network down');
  });
});
