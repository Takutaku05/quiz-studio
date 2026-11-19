import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../context/AppContext';
import {
  LocalAuthRepository,
  LocalQuizRepository,
} from '../repositories/localStorageRepositories';
import { QuizPlayPage } from './QuizPlayPage';

async function setupQuizPlay() {
  const authRepo = new LocalAuthRepository();
  const quizRepo = new LocalQuizRepository();
  const user = await authRepo.signUp('player@example.com', 'password123');
  const quiz = await quizRepo.create(user.id, {
    title: 'サンプルテスト',
    questions: [
      {
        question: '2択の問題です',
        choice1: 'はい',
        choice2: 'いいえ',
        choice3: null,
        choice4: null,
        answer: 1,
        explanation: '「はい」が正解です。',
      },
      {
        question: '3択の問題です',
        choice1: 'リンゴ',
        choice2: 'バナナ',
        choice3: 'ミカン',
        choice4: null,
        answer: 3,
        explanation: '「ミカン」が正解です。',
      },
    ],
  });

  render(
    <AppProvider authRepository={authRepo} quizRepository={quizRepo}>
      <MemoryRouter initialEntries={[`/quiz/${quiz.id}`]}>
        <Routes>
          <Route path="/quiz/:quizId" element={<QuizPlayPage />} />
          <Route path="/" element={<div>Dashboard Screen</div>} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );

  return { quiz };
}

describe('Bolt 05: QuizPlayPage', () => {
  it('plays in one-by-one mode, hides empty choices, shows immediate feedback, and retries only wrong questions', async () => {
    const user = userEvent.setup();
    await setupQuizPlay();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'サンプルテスト' }),
    ).toBeInTheDocument();

    // Setup phase defaults to one_by_one; start directly
    await user.click(screen.getByRole('button', { name: 'スタート' }));

    // Q1: 2 choices only
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('2択の問題です')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'はい' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'いいえ' })).toBeInTheDocument();

    // Answer Q1 wrongly ("いいえ") -> immediate feedback + explanation
    await user.click(screen.getByRole('button', { name: 'いいえ' }));
    expect(screen.getByText('不正解')).toBeInTheDocument();
    expect(screen.getByText('「はい」が正解です。')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '次へ' }));

    // Q2: 3 choices
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByText('3択の問題です')).toBeInTheDocument();

    // Answer Q2 correctly ("ミカン")
    await user.click(screen.getByRole('button', { name: 'ミカン' }));
    expect(screen.getByText('正解！')).toBeInTheDocument();
    expect(screen.getByText('「ミカン」が正解です。')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '結果を見る' }));

    // Result phase: 1 / 2 (50%)
    expect(await screen.findByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();

    // Retry only wrong questions -> should start with 1 question (Q1)
    await user.click(screen.getByRole('button', { name: '間違えた問題だけ解く' }));
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.getByText('2択の問題です')).toBeInTheDocument();

    // Answer correctly this time
    await user.click(screen.getByRole('button', { name: 'はい' }));
    await user.click(screen.getByRole('button', { name: '結果を見る' }));

    expect(await screen.findByText('100%')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '間違えた問題だけ解く' }),
    ).not.toBeInTheDocument();
  });

  it('plays in test mode without revealing correctness or explanation until result phase', async () => {
    const user = userEvent.setup();
    await setupQuizPlay();

    await screen.findByRole('heading', { level: 1, name: 'サンプルテスト' });

    await user.click(screen.getByLabelText(/テストモード/));
    await user.click(screen.getByRole('button', { name: 'スタート' }));

    // Q1
    await user.click(screen.getByRole('button', { name: 'はい' }));
    expect(screen.queryByText('正解！')).not.toBeInTheDocument();
    expect(screen.queryByText('「はい」が正解です。')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '次へ' }));

    // Q2
    await user.click(screen.getByRole('button', { name: 'ミカン' }));
    expect(screen.queryByText('「ミカン」が正解です。')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '結果を見る' }));

    // Result phase reveals score & explanations
    expect(await screen.findByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('「はい」が正解です。')).toBeInTheDocument();
    expect(screen.getByText('「ミカン」が正解です。')).toBeInTheDocument();

    // Back to dashboard
    await user.click(screen.getByRole('button', { name: 'ダッシュボードへ戻る' }));
    await waitFor(() => {
      expect(screen.getByText('Dashboard Screen')).toBeInTheDocument();
    });
  });

  describe('auto-scroll to the next button', () => {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    afterEach(() => {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    });

    function spyScrollIntoView() {
      const calls: Array<{ element: Element; options: unknown }> = [];
      Element.prototype.scrollIntoView = vi.fn(function (this: Element, options?: unknown) {
        calls.push({ element: this, options });
      });
      return calls;
    }

    it('scrolls the next button into view after a choice is picked in one-by-one mode', async () => {
      const calls = spyScrollIntoView();
      const user = userEvent.setup();
      await setupQuizPlay();
      await screen.findByRole('heading', { level: 1, name: 'サンプルテスト' });
      await user.click(screen.getByRole('button', { name: 'スタート' }));
      expect(calls).toHaveLength(0);

      await user.click(screen.getByRole('button', { name: 'いいえ' }));

      expect(calls).toHaveLength(1);
      expect(calls[0].element).toBe(screen.getByRole('button', { name: '次へ' }));
      expect(calls[0].options).toMatchObject({ block: 'nearest' });

      // Moving on alone must not scroll; the next pick does.
      await user.click(screen.getByRole('button', { name: '次へ' }));
      expect(calls).toHaveLength(1);
      await user.click(screen.getByRole('button', { name: 'ミカン' }));
      expect(calls).toHaveLength(2);
      expect(calls[1].element).toBe(screen.getByRole('button', { name: '結果を見る' }));
    });

    it('scrolls the next button into view on each pick in test mode', async () => {
      const calls = spyScrollIntoView();
      const user = userEvent.setup();
      await setupQuizPlay();
      await screen.findByRole('heading', { level: 1, name: 'サンプルテスト' });
      await user.click(screen.getByLabelText(/テストモード/));
      await user.click(screen.getByRole('button', { name: 'スタート' }));

      await user.click(screen.getByRole('button', { name: 'いいえ' }));
      await user.click(screen.getByRole('button', { name: 'はい' }));

      expect(calls).toHaveLength(2);
      expect(calls.every((c) => c.element === screen.getByRole('button', { name: '次へ' }))).toBe(true);
    });

    it('scrolls the next button into view when skipping in one-by-one mode', async () => {
      const calls = spyScrollIntoView();
      const user = userEvent.setup();
      await setupQuizPlay();
      await screen.findByRole('heading', { level: 1, name: 'サンプルテスト' });
      await user.click(screen.getByRole('button', { name: 'スタート' }));
      expect(calls).toHaveLength(0);

      await user.click(screen.getByRole('button', { name: 'スキップ' }));

      expect(calls).toHaveLength(1);
      expect(calls[0].element).toBe(screen.getByRole('button', { name: '次へ' }));
      expect(calls[0].options).toMatchObject({ block: 'nearest' });

      await user.click(screen.getByRole('button', { name: '次へ' }));
      expect(calls).toHaveLength(1);

      await user.click(screen.getByRole('button', { name: 'スキップ' }));
      expect(calls).toHaveLength(2);
      expect(calls[1].element).toBe(screen.getByRole('button', { name: '結果を見る' }));
    });
  });

  it('shows not-found message when quiz does not exist', async () => {
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();
    await authRepo.signUp('player@example.com', 'password123');

    render(
      <AppProvider authRepository={authRepo} quizRepository={quizRepo}>
        <MemoryRouter initialEntries={['/quiz/non-existent']}>
          <Routes>
            <Route path="/quiz/:quizId" element={<QuizPlayPage />} />
            <Route path="/" element={<div>Dashboard Screen</div>} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );

    expect(
      await screen.findByText('問題集が見つかりませんでした。'),
    ).toBeInTheDocument();
  });
});
