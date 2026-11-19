import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../context/AppContext';
import type { Quiz, User } from '../domain/types';
import {
  LocalAuthRepository,
  LocalQuizRepository,
} from '../repositories/localStorageRepositories';
import { LocalStudyRepository } from '../repositories/localStudyRepository';
import type { StudyRepository } from '../repositories/types';
import { QuizPlayPage } from './QuizPlayPage';

interface Fixture {
  authRepo: LocalAuthRepository;
  quizRepo: LocalQuizRepository;
  studyRepo: StudyRepository;
  user: User;
  quiz: Quiz;
}

async function createFixture(studyRepo: StudyRepository = new LocalStudyRepository()): Promise<Fixture> {
  const authRepo = new LocalAuthRepository();
  const quizRepo = new LocalQuizRepository();
  const user = await authRepo.signUp('player@example.com', 'password123');
  const quiz = await quizRepo.create(user.id, {
    title: '学習履歴テスト',
    questions: [
      { question: '2択の問題です', choice1: 'はい', choice2: 'いいえ', choice3: null, choice4: null, answer: 1, explanation: null },
      { question: '3択の問題です', choice1: 'リンゴ', choice2: 'バナナ', choice3: 'ミカン', choice4: null, answer: 3, explanation: null },
    ],
  });
  return { authRepo, quizRepo, studyRepo, user, quiz };
}

function renderPlay({ authRepo, quizRepo, studyRepo, quiz }: Fixture) {
  return render(
    <AppProvider authRepository={authRepo} quizRepository={quizRepo} studyRepository={studyRepo}>
      <MemoryRouter initialEntries={[`/quiz/${quiz.id}`]}>
        <Routes>
          <Route path="/quiz/:quizId" element={<QuizPlayPage />} />
          <Route path="/" element={<div>Dashboard Screen</div>} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
}

async function waitForSetup() {
  await screen.findByRole('heading', { level: 1, name: '学習履歴テスト' });
}

function choiceTexts(): string[] {
  const question = screen.getByTestId('question-card');
  return within(question)
    .getAllByRole('button')
    .map((b) => b.textContent ?? '')
    .filter((t) => t !== '次へ' && t !== '結果を見る' && t !== 'スキップ');
}

describe('Bolt 12: QuizPlayPage study history & resume', () => {
  it('records the result and saves progress the moment a choice is picked in one-by-one mode', async () => {
    const fx = await createFixture();
    const ue = userEvent.setup();
    renderPlay(fx);
    await waitForSetup();

    await ue.click(screen.getByRole('button', { name: 'スタート' }));
    await ue.click(screen.getByRole('button', { name: 'いいえ' }));

    const q1 = fx.quiz.questions[0].id;
    await waitFor(async () => {
      expect(await fx.studyRepo.listStats(fx.user.id, fx.quiz.id)).toEqual([
        expect.objectContaining({ questionId: q1, attemptsCount: 1, correctCount: 0, lastIsCorrect: false }),
      ]);
    });
    await waitFor(async () => {
      expect(await fx.studyRepo.getSession(fx.user.id, fx.quiz.id)).toMatchObject({
        mode: 'one_by_one',
        targetFilter: 'all',
        currentIndex: 1,
        answers: { [q1]: 2 },
      });
    });
  });

  it('records test-mode answers only when moving to the next question', async () => {
    const fx = await createFixture();
    const ue = userEvent.setup();
    renderPlay(fx);
    await waitForSetup();

    await ue.click(screen.getByLabelText(/テストモード/));
    await ue.click(screen.getByRole('button', { name: 'スタート' }));
    await ue.click(screen.getByRole('button', { name: 'いいえ' }));
    await ue.click(screen.getByRole('button', { name: 'はい' }));

    expect(await fx.studyRepo.listStats(fx.user.id, fx.quiz.id)).toEqual([]);

    await ue.click(screen.getByRole('button', { name: '次へ' }));

    const q1 = fx.quiz.questions[0].id;
    await waitFor(async () => {
      expect(await fx.studyRepo.listStats(fx.user.id, fx.quiz.id)).toEqual([
        expect.objectContaining({ questionId: q1, attemptsCount: 1, correctCount: 1, lastIsCorrect: true }),
      ]);
    });
    await waitFor(async () => {
      expect(await fx.studyRepo.getSession(fx.user.id, fx.quiz.id)).toMatchObject({
        mode: 'test',
        currentIndex: 1,
        answers: { [q1]: 1 },
      });
    });
  });

  it('records a skip in one-by-one mode as wrong and reveals the answer without a pick', async () => {
    const fx = await createFixture();
    const ue = userEvent.setup();
    renderPlay(fx);
    await waitForSetup();

    await ue.click(screen.getByRole('button', { name: 'スタート' }));
    expect(screen.queryByRole('button', { name: '次へ' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'スキップ' }));

    expect(screen.getByText('スキップしました（不正解として記録）')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'スキップ' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'はい' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'はい' }).className).toContain('emerald');

    const q1 = fx.quiz.questions[0].id;
    await waitFor(async () => {
      expect(await fx.studyRepo.listStats(fx.user.id, fx.quiz.id)).toEqual([
        expect.objectContaining({ questionId: q1, attemptsCount: 1, correctCount: 0, lastIsCorrect: false }),
      ]);
    });
    await waitFor(async () => {
      expect(await fx.studyRepo.getSession(fx.user.id, fx.quiz.id)).toMatchObject({
        currentIndex: 1,
        answers: {},
      });
    });

    await ue.click(screen.getByRole('button', { name: '次へ' }));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'スキップ' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'ミカン' }));
    await ue.click(screen.getByRole('button', { name: '結果を見る' }));

    expect(await screen.findByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('スキップ', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('スキップ（未回答）')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /間違えた問題だけ解く/ })).toBeInTheDocument();
  });

  it('skips in test mode by discarding the tentative pick and moving on', async () => {
    const fx = await createFixture();
    const ue = userEvent.setup();
    renderPlay(fx);
    await waitForSetup();

    await ue.click(screen.getByLabelText(/テストモード/));
    await ue.click(screen.getByRole('button', { name: 'スタート' }));
    // A tentative (possibly lucky) pick must not count once the user skips.
    await ue.click(screen.getByRole('button', { name: 'はい' }));
    await ue.click(screen.getByRole('button', { name: 'スキップ' }));

    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    const q1 = fx.quiz.questions[0].id;
    await waitFor(async () => {
      expect(await fx.studyRepo.listStats(fx.user.id, fx.quiz.id)).toEqual([
        expect.objectContaining({ questionId: q1, attemptsCount: 1, correctCount: 0, lastIsCorrect: false }),
      ]);
    });
    await waitFor(async () => {
      expect(await fx.studyRepo.getSession(fx.user.id, fx.quiz.id)).toMatchObject({
        mode: 'test',
        currentIndex: 1,
        answers: {},
      });
    });

    await ue.click(screen.getByRole('button', { name: 'スキップ' }));

    expect(await screen.findByText('0 / 2')).toBeInTheDocument();
    expect(screen.getAllByText('スキップ（未回答）')).toHaveLength(2);
    await waitFor(async () => {
      expect(await fx.studyRepo.getSession(fx.user.id, fx.quiz.id)).toBeNull();
    });
  });

  it('deletes the in-progress session when the quiz is completed', async () => {
    const fx = await createFixture();
    const ue = userEvent.setup();
    renderPlay(fx);
    await waitForSetup();

    await ue.click(screen.getByRole('button', { name: 'スタート' }));
    await ue.click(screen.getByRole('button', { name: 'はい' }));
    await ue.click(screen.getByRole('button', { name: '次へ' }));
    await ue.click(screen.getByRole('button', { name: 'ミカン' }));
    await ue.click(screen.getByRole('button', { name: '結果を見る' }));

    expect(await screen.findByText('100%')).toBeInTheDocument();
    await waitFor(async () => {
      expect(await fx.studyRepo.getSession(fx.user.id, fx.quiz.id)).toBeNull();
    });
    expect(await fx.studyRepo.listStats(fx.user.id, fx.quiz.id)).toHaveLength(2);
  });

  it('resumes an interrupted shuffled session with the same order, choices, and earlier answers', async () => {
    const fx = await createFixture();
    const ue = userEvent.setup();
    const first = renderPlay(fx);
    await waitForSetup();

    await ue.click(screen.getByLabelText('問題順をシャッフル'));
    await ue.click(screen.getByLabelText('選択肢順をシャッフル'));
    await ue.click(screen.getByRole('button', { name: 'スタート' }));

    // Answer the first shown question correctly, then leave.
    const firstQuestionText = screen.getByTestId('question-card').querySelector('p')?.textContent;
    const firstQuestion = fx.quiz.questions.find((q) => q.question === firstQuestionText)!;
    const correctText = [firstQuestion.choice1, firstQuestion.choice2, firstQuestion.choice3][firstQuestion.answer - 1]!;
    await ue.click(screen.getByRole('button', { name: correctText }));
    await waitFor(async () => {
      expect((await fx.studyRepo.getSession(fx.user.id, fx.quiz.id))?.currentIndex).toBe(1);
    });
    const saved = (await fx.studyRepo.getSession(fx.user.id, fx.quiz.id))!;
    first.unmount();

    renderPlay(fx);
    await waitForSetup();
    expect(screen.getByText('中断中のセッションがあります')).toBeInTheDocument();
    expect(screen.getByText('2 / 2 問目から・一問一答モード')).toBeInTheDocument();

    await ue.click(screen.getByRole('button', { name: '続きから再開する' }));

    const secondQuestion = fx.quiz.questions.find((q) => q.id === saved.questionIds[1])!;
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByText(secondQuestion.question)).toBeInTheDocument();
    const texts = [secondQuestion.choice1, secondQuestion.choice2, secondQuestion.choice3, secondQuestion.choice4];
    expect(choiceTexts()).toEqual(saved.choicesOrder[secondQuestion.id].map((n) => texts[n - 1]));

    // Answer the remaining question wrongly: the score must include the pre-interruption answer.
    const wrongNumber = saved.choicesOrder[secondQuestion.id].find((n) => n !== secondQuestion.answer)!;
    await ue.click(screen.getByRole('button', { name: texts[wrongNumber - 1]! }));
    await ue.click(screen.getByRole('button', { name: '結果を見る' }));
    expect(await screen.findByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('starts over without a confirmation when "スタート" is pressed while a session is pending', async () => {
    const fx = await createFixture();
    const q1 = fx.quiz.questions[0].id;
    const q2 = fx.quiz.questions[1].id;
    await fx.studyRepo.saveSession(fx.user.id, {
      quizId: fx.quiz.id,
      mode: 'test',
      targetFilter: 'all',
      shuffleQuestions: false,
      shuffleChoices: false,
      questionIds: [q1, q2],
      choicesOrder: { [q1]: [1, 2], [q2]: [1, 2, 3] },
      answers: { [q1]: 1 },
      currentIndex: 1,
    });
    const confirmSpy = vi.spyOn(window, 'confirm');
    const ue = userEvent.setup();
    renderPlay(fx);
    await waitForSetup();
    expect(screen.getByText('2 / 2 問目から・テストモード')).toBeInTheDocument();

    await ue.click(screen.getByRole('button', { name: 'スタート' }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    await waitFor(async () => {
      expect(await fx.studyRepo.getSession(fx.user.id, fx.quiz.id)).toMatchObject({
        mode: 'one_by_one',
        currentIndex: 0,
        answers: {},
      });
    });
    confirmSpy.mockRestore();
  });

  it('shows target counts, disables empty targets, and plays only recently missed questions', async () => {
    const fx = await createFixture();
    const [q1, q2] = fx.quiz.questions;
    await fx.studyRepo.recordAnswer(fx.user.id, { quizId: fx.quiz.id, questionId: q2.id, isCorrect: false });
    await fx.studyRepo.recordAnswer(fx.user.id, { quizId: fx.quiz.id, questionId: q2.id, isCorrect: true });
    await fx.studyRepo.recordAnswer(fx.user.id, { quizId: fx.quiz.id, questionId: q1.id, isCorrect: true });
    await fx.studyRepo.recordAnswer(fx.user.id, { quizId: fx.quiz.id, questionId: q1.id, isCorrect: false });
    // q1: 1/2 (50%, last wrong) / q2: 1/2 (50%, last correct)
    const ue = userEvent.setup();
    renderPlay(fx);
    await waitForSetup();

    const all = screen.getByRole('radio', { name: /すべての問題/ });
    const recent = screen.getByRole('radio', { name: /直近で間違えた問題/ });
    const low = screen.getByRole('radio', { name: /正答率60%以下の問題/ });
    expect(all).toBeChecked();
    expect(within(all.closest('label')!).getByText('2問')).toBeInTheDocument();
    expect(within(recent.closest('label')!).getByText('1問')).toBeInTheDocument();
    expect(within(low.closest('label')!).getByText('2問')).toBeInTheDocument();
    expect(recent).toBeEnabled();

    await ue.click(recent);
    await ue.click(screen.getByRole('button', { name: 'スタート' }));

    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.getByText(q1.question)).toBeInTheDocument();
    await waitFor(async () => {
      expect(await fx.studyRepo.getSession(fx.user.id, fx.quiz.id)).toMatchObject({
        targetFilter: 'recent_wrong',
        questionIds: [q1.id],
      });
    });
  });

  it('disables review targets that have no questions yet', async () => {
    const fx = await createFixture();
    renderPlay(fx);
    await waitForSetup();

    expect(screen.getByRole('radio', { name: /直近で間違えた問題/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /正答率60%以下の問題/ })).toBeDisabled();
  });

  it('labels a pending review session with its target', async () => {
    const fx = await createFixture();
    const q2 = fx.quiz.questions[1].id;
    await fx.studyRepo.saveSession(fx.user.id, {
      quizId: fx.quiz.id,
      mode: 'test',
      targetFilter: 'recent_wrong',
      shuffleQuestions: false,
      shuffleChoices: false,
      questionIds: [q2],
      choicesOrder: { [q2]: [3, 1, 2] },
      answers: {},
      currentIndex: 0,
    });
    renderPlay(fx);
    await waitForSetup();

    expect(screen.getByText('直近で間違えた問題・1 / 1 問目から・テストモード')).toBeInTheDocument();
  });

  it('keeps playing and shows a quiet warning when saving fails', async () => {
    class FailingStudyRepository extends LocalStudyRepository {
      async recordAnswer(): Promise<void> {
        throw new Error('network down');
      }
      async saveSession(): Promise<void> {
        throw new Error('network down');
      }
    }
    const fx = await createFixture(new FailingStudyRepository());
    const ue = userEvent.setup();
    renderPlay(fx);
    await waitForSetup();

    await ue.click(screen.getByRole('button', { name: 'スタート' }));
    await ue.click(screen.getByRole('button', { name: 'はい' }));

    expect(await screen.findByText('学習記録を保存できませんでした')).toBeInTheDocument();
    expect(screen.getByText('正解！')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: '次へ' }));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('shows the result when resuming a session whose last question was already answered', async () => {
    const fx = await createFixture();
    const q1 = fx.quiz.questions[0].id;
    const q2 = fx.quiz.questions[1].id;
    await fx.studyRepo.saveSession(fx.user.id, {
      quizId: fx.quiz.id,
      mode: 'one_by_one',
      targetFilter: 'all',
      shuffleQuestions: false,
      shuffleChoices: false,
      questionIds: [q1, q2],
      choicesOrder: { [q1]: [1, 2], [q2]: [1, 2, 3] },
      answers: { [q1]: 1, [q2]: 1 },
      currentIndex: 2,
    });
    const ue = userEvent.setup();
    renderPlay(fx);
    await waitForSetup();

    await ue.click(screen.getByRole('button', { name: '続きから再開する' }));

    expect(await screen.findByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    await waitFor(async () => {
      expect(await fx.studyRepo.getSession(fx.user.id, fx.quiz.id)).toBeNull();
    });
  });

  it('ignores and discards a session that no longer matches the quiz', async () => {
    const fx = await createFixture();
    await fx.studyRepo.saveSession(fx.user.id, {
      quizId: fx.quiz.id,
      mode: 'one_by_one',
      targetFilter: 'all',
      shuffleQuestions: false,
      shuffleChoices: false,
      questionIds: ['deleted-question'],
      choicesOrder: { 'deleted-question': [1, 2] },
      answers: {},
      currentIndex: 0,
    });
    renderPlay(fx);
    await waitForSetup();

    expect(screen.queryByText('中断中のセッションがあります')).not.toBeInTheDocument();
    await waitFor(async () => {
      expect(await fx.studyRepo.getSession(fx.user.id, fx.quiz.id)).toBeNull();
    });
  });

  it('resets saveFailed warning when starting a new session from the result screen', async () => {
    class ToggleFailingStudyRepository extends LocalStudyRepository {
      shouldFail = true;
      async recordAnswer(
        userId: string,
        input: Parameters<LocalStudyRepository['recordAnswer']>[1],
      ): Promise<void> {
        if (this.shouldFail) throw new Error('network down');
        return super.recordAnswer(userId, input);
      }
      async saveSession(
        userId: string,
        session: Parameters<LocalStudyRepository['saveSession']>[1],
      ): Promise<void> {
        if (this.shouldFail) throw new Error('network down');
        return super.saveSession(userId, session);
      }
    }

    const repo = new ToggleFailingStudyRepository();
    const fx = await createFixture(repo);
    const ue = userEvent.setup();
    renderPlay(fx);
    await waitForSetup();

    await ue.click(screen.getByRole('button', { name: 'スタート' }));
    await ue.click(screen.getByRole('button', { name: 'はい' }));
    expect(await screen.findByText('学習記録を保存できませんでした')).toBeInTheDocument();

    await ue.click(screen.getByRole('button', { name: '次へ' }));
    await ue.click(screen.getByRole('button', { name: 'ミカン' }));
    await ue.click(screen.getByRole('button', { name: '結果を見る' }));

    repo.shouldFail = false;
    await ue.click(await screen.findByRole('button', { name: 'もう一度解く' }));
    expect(screen.queryByText('学習記録を保存できませんでした')).not.toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('resets playing state to setup when quizId route param changes without unmounting', async () => {
    const fx = await createFixture();
    const secondQuiz = await fx.quizRepo.create(fx.user.id, {
      title: '2つ目の問題集',
      questions: [
        {
          question: '第2の問題集のQ1',
          choice1: '〇',
          choice2: '✕',
          choice3: null,
          choice4: null,
          answer: 1,
          explanation: null,
        },
      ],
    });

    function Switcher({ targetQuizId }: { targetQuizId: string }) {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate(`/quiz/${targetQuizId}`)}>
          次の問題集へ切替
        </button>
      );
    }

    const ue = userEvent.setup();
    render(
      <AppProvider
        authRepository={fx.authRepo}
        quizRepository={fx.quizRepo}
        studyRepository={fx.studyRepo}
      >
        <MemoryRouter initialEntries={[`/quiz/${fx.quiz.id}`]}>
          <Switcher targetQuizId={secondQuiz.id} />
          <Routes>
            <Route path="/quiz/:quizId" element={<QuizPlayPage />} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );

    await waitForSetup();
    await ue.click(screen.getByRole('button', { name: 'スタート' }));
    expect(screen.getByText('2択の問題です')).toBeInTheDocument();

    await ue.click(screen.getByRole('button', { name: '次の問題集へ切替' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: '2つ目の問題集' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'スタート' })).toBeInTheDocument();
    expect(screen.queryByText('2択の問題です')).not.toBeInTheDocument();
  });
});
