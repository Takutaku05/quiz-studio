import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../context/AppContext';
import * as csvTemplate from '../domain/csvTemplate';
import { XLSX_MIME_TYPE } from '../domain/xlsxParser';
import * as xlsxTemplate from '../domain/xlsxTemplate';
import { LocalAuthRepository, LocalQuizRepository } from '../repositories/localStorageRepositories';
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
