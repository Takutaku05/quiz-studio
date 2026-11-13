import { describe, expect, it } from 'vitest';
import type { Question } from './types';
import {
  calculateQuizResult,
  extractWrongQuestions,
  prepareQuizQuestions,
} from './quizEngine';

const sampleQuestions: Question[] = [
  {
    id: 'q1',
    quizId: 'quiz-1',
    orderIndex: 0,
    question: '2択の問題',
    choice1: '〇',
    choice2: '✕',
    choice3: null,
    choice4: null,
    answer: 1,
    explanation: '〇が正解です',
  },
  {
    id: 'q2',
    quizId: 'quiz-1',
    orderIndex: 1,
    question: '3択の問題',
    choice1: '赤',
    choice2: '青',
    choice3: '黄',
    choice4: null,
    answer: 3,
    explanation: null,
  },
  {
    id: 'q3',
    quizId: 'quiz-1',
    orderIndex: 2,
    question: '4択の問題',
    choice1: 'A',
    choice2: 'B',
    choice3: 'C',
    choice4: 'D',
    answer: 4,
    explanation: 'Dが正解',
  },
];

describe('Bolt 02: quizEngine', () => {
  describe('prepareQuizQuestions', () => {
    it('filters out empty choices and marks isCorrect accurately without shuffling', () => {
      const prepared = prepareQuizQuestions(sampleQuestions, {
        shuffleQuestions: false,
        shuffleChoices: false,
      });

      expect(prepared).toHaveLength(3);
      expect(prepared[0].choices).toEqual([
        { originalNumber: 1, text: '〇', isCorrect: true },
        { originalNumber: 2, text: '✕', isCorrect: false },
      ]);
      expect(prepared[1].choices).toEqual([
        { originalNumber: 1, text: '赤', isCorrect: false },
        { originalNumber: 2, text: '青', isCorrect: false },
        { originalNumber: 3, text: '黄', isCorrect: true },
      ]);
      expect(prepared[2].choices).toHaveLength(4);
      expect(prepared[2].choices[3]).toEqual({
        originalNumber: 4,
        text: 'D',
        isCorrect: true,
      });
    });

    it('shuffles questions and choices deterministically while preserving isCorrect and not mutating input', () => {
      const snapshot = JSON.stringify(sampleQuestions);
      // Fixed deterministic RNG returning 0 (moves each element to index 0 in Fisher-Yates)
      const deterministicRng = () => 0;

      const prepared = prepareQuizQuestions(
        sampleQuestions,
        {
          shuffleQuestions: true,
          shuffleChoices: true,
        },
        deterministicRng,
      );

      expect(JSON.stringify(sampleQuestions)).toBe(snapshot);
      // Question order changed
      expect(prepared.map((q) => q.source.id)).not.toEqual(['q1', 'q2', 'q3']);
      // Each question still has exactly 1 isCorrect choice matching its original answer
      for (const item of prepared) {
        const correctChoices = item.choices.filter((c) => c.isCorrect);
        expect(correctChoices).toHaveLength(1);
        expect(correctChoices[0].originalNumber).toBe(item.source.answer);
      }
    });
  });

  describe('calculateQuizResult & extractWrongQuestions', () => {
    it('calculates score, accuracy percentage, review items, and extracts wrong questions', () => {
      const prepared = prepareQuizQuestions(sampleQuestions, {
        shuffleQuestions: false,
        shuffleChoices: false,
      });

      // q1: answer 1 (correct), q2: answer 2 (wrong, correct is 3), q3: answer 4 (correct)
      const answersByQuestionId: Record<string, number> = {
        q1: 1,
        q2: 2,
        q3: 4,
      };

      const result = calculateQuizResult(prepared, answersByQuestionId);
      expect(result.totalCount).toBe(3);
      expect(result.correctCount).toBe(2);
      expect(result.accuracyPercent).toBe(67);
      expect(result.items).toHaveLength(3);

      expect(result.items[0]).toMatchObject({
        questionId: 'q1',
        questionText: '2択の問題',
        selectedText: '〇',
        correctText: '〇',
        isCorrect: true,
        explanation: '〇が正解です',
      });

      expect(result.items[1]).toMatchObject({
        questionId: 'q2',
        questionText: '3択の問題',
        selectedText: '青',
        correctText: '黄',
        isCorrect: false,
        explanation: null,
      });

      const wrong = extractWrongQuestions(prepared, answersByQuestionId);
      expect(wrong).toHaveLength(1);
      expect(wrong[0].id).toBe('q2');
    });

    it('returns empty wrong questions list when all answers are correct', () => {
      const prepared = prepareQuizQuestions(sampleQuestions, {
        shuffleQuestions: false,
        shuffleChoices: false,
      });
      const answers = { q1: 1, q2: 3, q3: 4 };
      const result = calculateQuizResult(prepared, answers);
      expect(result.correctCount).toBe(3);
      expect(result.accuracyPercent).toBe(100);
      expect(extractWrongQuestions(prepared, answers)).toEqual([]);
    });
  });
});
