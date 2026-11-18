import { describe, expect, it } from 'vitest';
import {
  countReviewTargets,
  countWeakQuestions,
  filterQuestionsByReview,
  isLowAccuracy,
} from './studyFilters';
import type { Question, QuestionStat } from './types';

function question(id: string, orderIndex: number): Question {
  return {
    id,
    quizId: 'quiz-1',
    orderIndex,
    question: `問題${id}`,
    choice1: 'A',
    choice2: 'B',
    choice3: null,
    choice4: null,
    answer: 1,
    explanation: null,
  };
}

function stat(questionId: string, attemptsCount: number, correctCount: number, lastIsCorrect: boolean, quizId = 'quiz-1'): QuestionStat {
  return { quizId, questionId, attemptsCount, correctCount, lastIsCorrect, lastAnsweredAt: '2026-11-18T00:00:00Z' };
}

describe('Bolt 11: isLowAccuracy', () => {
  it('treats exactly 60% as weak and above 60% as not weak', () => {
    expect(isLowAccuracy(stat('q', 5, 3, true))).toBe(true); // 60%
    expect(isLowAccuracy(stat('q', 3, 2, true))).toBe(false); // 66.7%
    expect(isLowAccuracy(stat('q', 1, 0, false))).toBe(true); // 0%
    expect(isLowAccuracy(stat('q', 1, 1, true))).toBe(false); // 100%
  });

  it('never treats an unanswered stat as weak', () => {
    expect(isLowAccuracy(stat('q', 0, 0, false))).toBe(false);
  });
});

describe('Bolt 11: filterQuestionsByReview / countReviewTargets', () => {
  const questions = [question('q1', 0), question('q2', 1), question('q3', 2), question('q4', 3)];
  const stats = [
    stat('q1', 4, 1, true), // 25% but last correct -> low_accuracy only
    stat('q2', 3, 2, false), // 66% but last wrong -> recent_wrong only
    stat('q3', 2, 0, false), // both
    // q4 unanswered
    stat('other', 1, 0, false, 'quiz-2'), // other quiz: ignored
  ];

  it('returns every question for "all" in the original order', () => {
    expect(filterQuestionsByReview(questions, stats, 'all').map((q) => q.id)).toEqual(['q1', 'q2', 'q3', 'q4']);
  });

  it('returns questions whose last answer was wrong for "recent_wrong"', () => {
    expect(filterQuestionsByReview(questions, stats, 'recent_wrong').map((q) => q.id)).toEqual(['q2', 'q3']);
  });

  it('returns questions at or below 60% cumulative accuracy for "low_accuracy"', () => {
    expect(filterQuestionsByReview(questions, stats, 'low_accuracy').map((q) => q.id)).toEqual(['q1', 'q3']);
  });

  it('counts targets consistently with the filters and excludes unanswered questions', () => {
    expect(countReviewTargets(questions, stats)).toEqual({ all: 4, recent_wrong: 2, low_accuracy: 2 });
    expect(countReviewTargets(questions, [])).toEqual({ all: 4, recent_wrong: 0, low_accuracy: 0 });
  });
});

describe('Bolt 11: countWeakQuestions', () => {
  it('counts stats at or below 60% accuracy', () => {
    expect(countWeakQuestions([stat('a', 5, 3, true), stat('b', 3, 2, false), stat('c', 1, 0, false)])).toBe(2);
    expect(countWeakQuestions([])).toBe(0);
  });
});
