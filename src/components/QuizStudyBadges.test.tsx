import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { QuestionStat, QuizSession } from '../domain/types';
import { QuizStudyBadges } from './QuizStudyBadges';

function stat(questionId: string, attemptsCount: number, correctCount: number): QuestionStat {
  return { quizId: 'quiz-1', questionId, attemptsCount, correctCount, lastIsCorrect: true, lastAnsweredAt: '2026-11-18T00:00:00Z' };
}

const session: QuizSession = {
  quizId: 'quiz-1',
  mode: 'one_by_one',
  targetFilter: 'all',
  shuffleQuestions: false,
  shuffleChoices: false,
  questionIds: Array.from({ length: 20 }, (_, i) => `q${i}`),
  choicesOrder: {},
  answers: {},
  currentIndex: 3,
  updatedAt: '2026-11-18T00:00:00Z',
};

describe('Bolt 13: QuizStudyBadges', () => {
  it('renders nothing for a quiz without a session or any answers', () => {
    const { container } = render(<QuizStudyBadges session={null} stats={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows in-progress position and the number of weak questions', () => {
    render(<QuizStudyBadges session={session} stats={[stat('a', 5, 3), stat('b', 3, 2), stat('c', 1, 0)]} />);
    expect(screen.getByText('進行中 (3 / 20問)')).toBeInTheDocument();
    expect(screen.getByText('苦手（正答率60%以下）: 2問')).toBeInTheDocument();
  });

  it('shows zero weak questions once something has been answered, without an in-progress badge', () => {
    render(<QuizStudyBadges session={null} stats={[stat('a', 2, 2)]} />);
    expect(screen.getByText('苦手（正答率60%以下）: 0問')).toBeInTheDocument();
    expect(screen.queryByText(/進行中/)).not.toBeInTheDocument();
    expect(screen.queryByText(/正答率 \d+%|全体正答率/)).not.toBeInTheDocument();
  });
});
