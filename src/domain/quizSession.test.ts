import { describe, expect, it } from 'vitest';
import { prepareQuizQuestions } from './quizEngine';
import { restorePreparedQuestions, toSessionSnapshot } from './quizSession';
import type { Question } from './types';

const questions: Question[] = [
  { id: 'q1', quizId: 'quiz-1', orderIndex: 0, question: '2択', choice1: 'はい', choice2: 'いいえ', choice3: null, choice4: null, answer: 2, explanation: null },
  { id: 'q2', quizId: 'quiz-1', orderIndex: 1, question: '4択', choice1: 'A', choice2: 'B', choice3: 'C', choice4: 'D', answer: 3, explanation: '解説' },
  { id: 'q3', quizId: 'quiz-1', orderIndex: 2, question: '3択', choice1: 'X', choice2: 'Y', choice3: 'Z', choice4: '', answer: 1, explanation: null },
];

/** Deterministic RNG so shuffles are reproducible. */
function seededRng(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

describe('Bolt 11: session snapshot & restore', () => {
  it('captures the question order and each question\'s choice order', () => {
    const prepared = prepareQuizQuestions(questions, { shuffleQuestions: true, shuffleChoices: true }, seededRng(7));
    const snapshot = toSessionSnapshot(prepared);

    expect(snapshot.questionIds).toEqual(prepared.map((p) => p.source.id));
    for (const p of prepared) {
      expect(snapshot.choicesOrder[p.source.id]).toEqual(p.choices.map((c) => c.originalNumber));
    }
  });

  it('restores exactly the same shuffled questions, choices, and correctness', () => {
    const prepared = prepareQuizQuestions(questions, { shuffleQuestions: true, shuffleChoices: true }, seededRng(42));
    const restored = restorePreparedQuestions(questions, toSessionSnapshot(prepared));

    expect(restored).toEqual(prepared);
  });

  it('restores a subset session (e.g. a review of some questions only)', () => {
    const prepared = prepareQuizQuestions([questions[2], questions[0]], { shuffleQuestions: false, shuffleChoices: true }, seededRng(3));
    expect(restorePreparedQuestions(questions, toSessionSnapshot(prepared))).toEqual(prepared);
  });

  it('returns null when the snapshot references a question that no longer exists', () => {
    expect(
      restorePreparedQuestions(questions, { questionIds: ['q1', 'missing'], choicesOrder: { q1: [1, 2], missing: [1, 2] } }),
    ).toBeNull();
  });

  it('returns null when a choice order points to an empty choice or is missing', () => {
    expect(restorePreparedQuestions(questions, { questionIds: ['q1'], choicesOrder: { q1: [1, 3] } })).toBeNull();
    expect(restorePreparedQuestions(questions, { questionIds: ['q1'], choicesOrder: {} })).toBeNull();
    expect(restorePreparedQuestions(questions, { questionIds: ['q3'], choicesOrder: { q3: [1, 2, 3, 4] } })).toBeNull();
  });

  it('returns null for an empty session', () => {
    expect(restorePreparedQuestions(questions, { questionIds: [], choicesOrder: {} })).toBeNull();
  });
});
