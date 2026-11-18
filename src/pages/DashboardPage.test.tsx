import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../context/AppContext';
import * as csvTemplate from '../domain/csvTemplate';
import { XLSX_MIME_TYPE } from '../domain/xlsxParser';
import * as xlsxTemplate from '../domain/xlsxTemplate';
import { LocalAuthRepository, LocalQuizRepository } from '../repositories/localStorageRepositories';
import { LocalStudyRepository } from '../repositories/localStudyRepository';
import { DashboardPage } from './DashboardPage';

describe('Bolt 04: DashboardPage', () => {
  it('lists quizzes for logged-in user, uploads a new CSV quiz, and deletes a quiz', async () => {
    const user = userEvent.setup();
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();
    const currentUser = await authRepo.signUp('learner@example.com', 'password123');
    await quizRepo.create(currentUser.id, {
      title: '既存問題集',
      questions: [
        {
          question: '1+1は？',
          choice1: '2',
          choice2: '3',
          choice3: null,
          choice4: null,
          answer: 1,
          explanation: null,
        },
      ],
    });

    render(
      <AppProvider authRepository={authRepo} quizRepository={quizRepo}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/quiz/:quizId" element={<div>Quiz Play Screen</div>} />
            <Route path="/login" element={<div>Login Screen</div>} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );

    expect(await screen.findByText('既存問題集')).toBeInTheDocument();
    expect(screen.getByText('1問')).toBeInTheDocument();

    // Open upload modal and add a quiz
    await user.click(screen.getByRole('button', { name: /新規問題集アップロード/ }));
    const csv = 'question,choice1,choice2,choice3,choice4,answer,explanation\nQ,A,B,,,2,Bです';
    const file = new File([csv], '新規クイズ.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('ファイルを選択'), file);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('新規クイズ')).toBeInTheDocument();

    // Delete existing quiz (with confirm button)
    const deleteButtons = screen.getAllByRole('button', { name: '削除' });
    await user.click(deleteButtons[1]); // 既存問題集 (older)
    await user.click(screen.getByRole('button', { name: '削除を確定' }));

    await waitFor(() => {
      expect(screen.queryByText('既存問題集')).not.toBeInTheDocument();
    });
    expect(screen.getByText('新規クイズ')).toBeInTheDocument();
  });

  it('uploads an .xlsx quiz created from the Excel template into the dashboard', async () => {
    const user = userEvent.setup();
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();
    await authRepo.signUp('excel-user@example.com', 'password123');

    render(
      <AppProvider authRepository={authRepo} quizRepository={quizRepo}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/login" element={<div>Login Screen</div>} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );

    await user.click(await screen.findByRole('button', { name: /最初の問題集をアップロード/ }));

    const templateBlob = await xlsxTemplate.buildXlsxTemplateBlob();
    const xlsxFile = new File([templateBlob], 'スプレッドシート問題集.xlsx', {
      type: XLSX_MIME_TYPE,
    });
    await user.upload(screen.getByLabelText('ファイルを選択'), xlsxFile);

    await waitFor(() => {
      expect(screen.getByText(/3問の問題を読み込みました/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('スプレッドシート問題集')).toBeInTheDocument();
    expect(screen.getByText('3問')).toBeInTheDocument();
  });

  it('opens PasskeySettingsModal from the dashboard header button', async () => {
    const user = userEvent.setup();
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();
    await authRepo.signUp('passkey-owner@example.com', 'password123');

    render(
      <AppProvider authRepository={authRepo} quizRepository={quizRepo}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/login" element={<div>Login Screen</div>} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );

    await user.click(await screen.findByRole('button', { name: /パスキー設定/ }));
    expect(
      await screen.findByRole('heading', { name: 'パスキー設定' }),
    ).toBeInTheDocument();
  });

  it('provides Excel and CSV template download buttons in empty state and header', async () => {
    const user = userEvent.setup();
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();
    await authRepo.signUp('starter@example.com', 'password123');
    const downloadCsvSpy = vi
      .spyOn(csvTemplate, 'downloadCsvTemplate')
      .mockImplementation(() => {});
    const downloadXlsxSpy = vi
      .spyOn(xlsxTemplate, 'downloadXlsxTemplate')
      .mockResolvedValue(undefined);

    render(
      <AppProvider authRepository={authRepo} quizRepository={quizRepo}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/login" element={<div>Login Screen</div>} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );

    const emptyXlsxBtn = await screen.findByRole('button', {
      name: 'テンプレートExcel（.xlsx）をダウンロード',
    });
    const headerXlsxBtn = screen.getByRole('button', {
      name: 'テンプレートExcel',
    });
    const emptyCsvBtn = screen.getByRole('button', {
      name: 'テンプレートCSVをダウンロード',
    });
    const headerCsvBtn = screen.getByRole('button', {
      name: 'テンプレートCSV',
    });

    await user.click(emptyXlsxBtn);
    await user.click(headerXlsxBtn);
    expect(downloadXlsxSpy).toHaveBeenCalledTimes(2);

    await user.click(emptyCsvBtn);
    await user.click(headerCsvBtn);
    expect(downloadCsvSpy).toHaveBeenCalledTimes(2);

    downloadXlsxSpy.mockRestore();
    downloadCsvSpy.mockRestore();
  });

  it('opens ShareQuizModal from quiz card and shows/dismisses importNotice banner', async () => {
    const user = userEvent.setup();
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();
    const currentUser = await authRepo.signUp('dash-share@example.com', 'password123');
    const created = await quizRepo.create(currentUser.id, {
      title: '共有する問題集',
      questions: [
        {
          question: '1+1は？',
          choice1: '2',
          choice2: '3',
          choice3: null,
          choice4: null,
          answer: 1,
          explanation: null,
        },
      ],
    });

    render(
      <AppProvider authRepository={authRepo} quizRepository={quizRepo}>
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/',
              state: {
                importNotice: {
                  quizId: created.id,
                  title: created.title,
                  questionCount: 1,
                  status: 'imported',
                },
              },
            },
          ]}
        >
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/quiz/:quizId" element={<div>Quiz Play Screen</div>} />
            <Route path="/login" element={<div>Login Screen</div>} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );

    expect(
      await screen.findByText('「共有する問題集」（1問）をマイ問題集にインポートしました。'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '通知を閉じる' }));
    expect(
      screen.queryByText('「共有する問題集」（1問）をマイ問題集にインポートしました。'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '共有' }));
    expect(await screen.findByRole('heading', { name: '問題集を共有' })).toBeInTheDocument();
    expect(await screen.findByLabelText('共有URL')).toBeInTheDocument();
    expect(await screen.findByAltText('共有する問題集 の共有QRコード')).toBeInTheDocument();
  });
});

describe('Bolt 13: DashboardPage study status', () => {
  it('shows in-progress and weak-question badges only on the quizzes they belong to', async () => {
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();
    const studyRepo = new LocalStudyRepository();
    const currentUser = await authRepo.signUp('learner@example.com', 'password123');
    const questions = [
      { question: 'Q1', choice1: 'A', choice2: 'B', choice3: null, choice4: null, answer: 1 as const, explanation: null },
      { question: 'Q2', choice1: 'A', choice2: 'B', choice3: null, choice4: null, answer: 2 as const, explanation: null },
    ];
    const studied = await quizRepo.create(currentUser.id, { title: '学習中の問題集', questions });
    await quizRepo.create(currentUser.id, { title: '未着手の問題集', questions });
    const [q1, q2] = studied.questions;
    await studyRepo.recordAnswer(currentUser.id, { quizId: studied.id, questionId: q1.id, isCorrect: false });
    await studyRepo.saveSession(currentUser.id, {
      quizId: studied.id,
      mode: 'one_by_one',
      targetFilter: 'all',
      shuffleQuestions: false,
      shuffleChoices: false,
      questionIds: [q1.id, q2.id],
      choicesOrder: { [q1.id]: [1, 2], [q2.id]: [1, 2] },
      answers: { [q1.id]: 2 },
      currentIndex: 1,
    });

    render(
      <AppProvider authRepository={authRepo} quizRepository={quizRepo} studyRepository={studyRepo}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );

    const studiedCard = (await screen.findByRole('heading', { name: '学習中の問題集' })).closest('article')!;
    const freshCard = screen.getByRole('heading', { name: '未着手の問題集' }).closest('article')!;
    expect(await within(studiedCard).findByText('進行中 (1 / 2問)')).toBeInTheDocument();
    expect(within(studiedCard).getByText('苦手（正答率60%以下）: 1問')).toBeInTheDocument();
    expect(within(freshCard).queryByText(/進行中|苦手/)).not.toBeInTheDocument();
  });
});

describe('Bolt 14: DashboardPage text paste import integration', () => {
  it('keeps dashboard header clean of prompt copy button and creates quiz via modal text paste', async () => {
    const user = userEvent.setup();
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();
    await authRepo.signUp('chatgpt-user@example.com', 'password123');

    render(
      <AppProvider authRepository={authRepo} quizRepository={quizRepo}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/login" element={<div>Login Screen</div>} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );

    expect(await screen.findByText('マイ問題集')).toBeInTheDocument();
    // Prompt copy button belongs inside the upload modal only, not on dashboard header
    expect(
      screen.queryByRole('button', { name: /ChatGPT用プロンプトをコピー/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /新規問題集アップロード/ }));
    expect(
      screen.getByRole('button', { name: /ChatGPT用プロンプトをコピー/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'テキストを貼り付け' }));
    const textarea = screen.getByLabelText(/問題データ（JSON \/ CSV テキスト）/);
    fireEvent.change(textarea, {
      target: {
        value: [
          '問題を作りました！',
          '```json',
          JSON.stringify({
            title: 'ChatGPT作成クイズ',
            questions: [
              { question: 'HTTPの200は？', choice1: 'OK', choice2: 'Not Found', answer: 1 },
            ],
          }),
          '```',
        ].join('\n'),
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('ChatGPT作成クイズ')).toBeInTheDocument();
    expect(screen.getByText('1問')).toBeInTheDocument();
  });
});

describe('Bolt 15: DashboardPage AI 2-step quiz creation flow', () => {
  it('shows "AIで問題集を作る" in empty state and completes 2-step flow to create a quiz', async () => {
    const user = userEvent.setup();
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();
    await authRepo.signUp('ai-starter@example.com', 'password123');
    const writeTextSpy = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);

    try {
      render(
        <AppProvider authRepository={authRepo} quizRepository={quizRepo}>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/login" element={<div>Login Screen</div>} />
            </Routes>
          </MemoryRouter>
        </AppProvider>,
      );

      expect(await screen.findByText('まだ問題集がありません')).toBeInTheDocument();
      const aiButtons = screen.getAllByRole('button', { name: 'AIで問題集を作る' });
      expect(aiButtons).toHaveLength(2); // Header action area + empty state card

      // Start from empty-state CTA button
      await user.click(aiButtons[1]);

      // Step 1: Copy prompt -> transitions automatically to step 2
      expect(
        screen.getByText(/① 下のボタンで ChatGPT 用のプロンプトをコピーします/),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /ChatGPT用のプロンプトをコピー/ }));

      await waitFor(() => {
        expect(writeTextSpy).toHaveBeenCalledTimes(1);
        expect(screen.getByLabelText('問題集タイトル')).toBeInTheDocument();
      });

      // Step 2: Re-copy button at top still works without leaving step 2
      await user.click(screen.getByRole('button', { name: /ChatGPT用のプロンプトをコピー/ }));
      expect(writeTextSpy).toHaveBeenCalledTimes(2);
      expect(await screen.findByText('コピーしました')).toBeInTheDocument();

      const textarea = screen.getByLabelText(/問題データ（JSON \/ CSV テキスト）/);
      fireEvent.change(textarea, {
        target: {
          value: [
            '```json',
            JSON.stringify({
              title: 'AI2ステップ作成クイズ',
              questions: [
                { question: 'HTTPSのポート番号は？', choice1: '443', choice2: '80', answer: 1 },
              ],
            }),
            '```',
          ].join('\n'),
        },
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
      });
      await user.click(screen.getByRole('button', { name: '保存' }));

      expect(await screen.findByText('AI2ステップ作成クイズ')).toBeInTheDocument();
      expect(screen.getByText('1問')).toBeInTheDocument();
    } finally {
      writeTextSpy.mockRestore();
    }
  });

  it('creates an additional quiz from header "AIで問題集を作る" when quizzes already exist', async () => {
    const user = userEvent.setup();
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();
    const currentUser = await authRepo.signUp('ai-existing@example.com', 'password123');
    await quizRepo.create(currentUser.id, {
      title: '既存クイズ',
      questions: [
        {
          question: '1+1は？',
          choice1: '2',
          choice2: '3',
          choice3: null,
          choice4: null,
          answer: 1,
          explanation: null,
        },
      ],
    });
    const writeTextSpy = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);

    try {
      render(
        <AppProvider authRepository={authRepo} quizRepository={quizRepo}>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
            </Routes>
          </MemoryRouter>
        </AppProvider>,
      );

      expect(await screen.findByText('既存クイズ')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'AIで問題集を作る' }));
      await user.click(screen.getByRole('button', { name: /ChatGPT用のプロンプトをコピー/ }));

      const textarea = await screen.findByLabelText(/問題データ（JSON \/ CSV テキスト）/);
      fireEvent.change(textarea, {
        target: {
          value: JSON.stringify({
            title: '追加AIクイズ',
            questions: [{ question: 'Q', choice1: 'A', choice2: 'B', answer: 2 }],
          }),
        },
      });

      await user.click(screen.getByRole('button', { name: '保存' }));

      expect(await screen.findByText('追加AIクイズ')).toBeInTheDocument();
      expect(screen.getByText('既存クイズ')).toBeInTheDocument();
    } finally {
      writeTextSpy.mockRestore();
    }
  });
});
