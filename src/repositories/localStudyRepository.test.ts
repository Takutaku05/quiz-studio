import { beforeEach, describe, expect, it } from 'vitest';
import type { SaveQuizSessionInput } from '../domain/types';
import { LocalQuizRepository } from './localStorageRepositories';
import { LocalStudyRepository } from './localStudyRepository';

function sessionInput(overrides: Partial<SaveQuizSessionInput> = {}): SaveQuizSessionInput {
  return {
    quizId: 'quiz-1',
    mode: 'one_by_one',
    targetFilter: 'all',
    shuffleQuestions: true,
    shuffleChoices: false,
    questionIds: ['q2', 'q1'],
    choicesOrder: { q1: [1, 2], q2: [2, 1, 3] },
    answers: { q2: 3 },
    currentIndex: 1,
    ...overrides,
  };
}

describe('Bolt 10: LocalStudyRepository', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('accumulates attempts and correct counts per question and overwrites the last result', async () => {
    const repo = new LocalStudyRepository();

    await repo.recordAnswer('u1', { quizId: 'quiz-1', questionId: 'q1', isCorrect: true });
    await repo.recordAnswer('u1', { quizId: 'quiz-1', questionId: 'q1', isCorrect: false });
    await repo.recordAnswer('u1', { quizId: 'quiz-1', questionId: 'q1', isCorrect: true });
    await repo.recordAnswer('u1', { quizId: 'quiz-1', questionId: 'q2', isCorrect: false });

    const stats = await repo.listStats('u1', 'quiz-1');
    const q1 = stats.find((s) => s.questionId === 'q1');
    const q2 = stats.find((s) => s.questionId === 'q2');
    expect(q1).toMatchObject({ quizId: 'quiz-1', attemptsCount: 3, correctCount: 2, lastIsCorrect: true });
    expect(q2).toMatchObject({ attemptsCount: 1, correctCount: 0, lastIsCorrect: false });
    expect(typeof q1?.lastAnsweredAt).toBe('string');
  });

  it('separates stats by user and filters by quiz only when quizId is given', async () => {
    const repo = new LocalStudyRepository();
    await repo.recordAnswer('u1', { quizId: 'quiz-1', questionId: 'q1', isCorrect: true });
    await repo.recordAnswer('u1', { quizId: 'quiz-2', questionId: 'q9', isCorrect: true });
    await repo.recordAnswer('u2', { quizId: 'quiz-1', questionId: 'q1', isCorrect: false });

    expect(await repo.listStats('u1', 'quiz-1')).toHaveLength(1);
    expect((await repo.listStats('u1')).map((s) => s.questionId).sort()).toEqual(['q1', 'q9']);
    const otherUser = await repo.listStats('u2', 'quiz-1');
    expect(otherUser).toHaveLength(1);
    expect(otherUser[0]).toMatchObject({ attemptsCount: 1, correctCount: 0 });
  });

  it('keeps one session per user and quiz, overwrites on save, and deletes it', async () => {
    const repo = new LocalStudyRepository();
    expect(await repo.getSession('u1', 'quiz-1')).toBeNull();

    await repo.saveSession('u1', sessionInput());
    const saved = await repo.getSession('u1', 'quiz-1');
    expect(saved).toMatchObject(sessionInput());
    expect(typeof saved?.updatedAt).toBe('string');

    await repo.saveSession('u1', sessionInput({ currentIndex: 0, answers: {}, targetFilter: 'recent_wrong' }));
    expect(await repo.listSessions('u1')).toHaveLength(1);
    expect(await repo.getSession('u1', 'quiz-1')).toMatchObject({ currentIndex: 0, targetFilter: 'recent_wrong' });

    expect(await repo.getSession('u2', 'quiz-1')).toBeNull();
    expect(await repo.listSessions('u2')).toEqual([]);

    await repo.deleteSession('u1', 'quiz-1');
    expect(await repo.getSession('u1', 'quiz-1')).toBeNull();
  });

  it('removes stats and sessions of a quiz when the quiz is deleted', async () => {
    const quizRepo = new LocalQuizRepository();
    const studyRepo = new LocalStudyRepository();
    const quiz = await quizRepo.create('u1', {
      title: '削除テスト',
      questions: [
        { question: 'Q', choice1: 'A', choice2: 'B', choice3: null, choice4: null, answer: 1, explanation: null },
      ],
    });
    const questionId = quiz.questions[0].id;
    await studyRepo.recordAnswer('u1', { quizId: quiz.id, questionId, isCorrect: true });
    await studyRepo.recordAnswer('u1', { quizId: 'other-quiz', questionId: 'x', isCorrect: true });
    await studyRepo.saveSession('u1', sessionInput({ quizId: quiz.id, questionIds: [questionId], choicesOrder: { [questionId]: [1, 2] }, answers: {}, currentIndex: 0 }));

    await quizRepo.delete(quiz.id, 'u1');

    expect(await studyRepo.listStats('u1', quiz.id)).toEqual([]);
    expect(await studyRepo.getSession('u1', quiz.id)).toBeNull();
    expect(await studyRepo.listStats('u1', 'other-quiz')).toHaveLength(1);
  });
});
