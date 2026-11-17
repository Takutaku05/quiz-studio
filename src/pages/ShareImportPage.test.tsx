import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProvider } from '../context/AppContext';
import type { ImportSharedQuizResult } from '../domain/types';
import { getPendingShareToken } from '../lib/shareRedirect';
import {
  LocalAuthRepository,
  LocalQuizRepository,
} from '../repositories/localStorageRepositories';
import { ShareImportPage } from './ShareImportPage';

function DashboardEcho() {
  const location = useLocation();
  const state = location.state as { importNotice?: ImportSharedQuizResult } | null;
  return (
    <div>
      <p>Dashboard Target</p>
      {state?.importNotice && (
        <p data-testid="notice">
          {state.importNotice.status}:{state.importNotice.title}:{state.importNotice.questionCount}
        </p>
      )}
    </div>
  );
}

function LoginEcho() {
  const location = useLocation();
  return <p data-testid="login-redirect">{`${location.pathname}${location.search}`}</p>;
}

describe('ShareImportPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('redirects unauthenticated users to /login?redirect=/share/:token and stores pending token', async () => {
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();

    render(
      <AppProvider authRepository={authRepo} quizRepository={quizRepo}>
        <MemoryRouter initialEntries={['/share/tok-xyz']}>
          <Routes>
            <Route path="/share/:token" element={<ShareImportPage />} />
            <Route path="/login" element={<LoginEcho />} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );

    expect(await screen.findByTestId('login-redirect')).toHaveTextContent(
      '/login?redirect=%2Fshare%2Ftok-xyz',
    );
    expect(getPendingShareToken()).toBe('tok-xyz');
  });

  it('auto-imports the shared quiz when authenticated and navigates to / with notice', async () => {
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();
    const owner = await authRepo.signUp('owner-share@example.com', 'password123');
    const quiz = await quizRepo.create(owner.id, {
      title: '自動インポート問題集',
      questions: [
        {
          question: 'Q1',
          choice1: '1',
          choice2: '2',
          choice3: null,
          choice4: null,
          answer: 1,
          explanation: null,
        },
      ],
    });
    const share = await quizRepo.enableShare(quiz.id, owner.id);
    await authRepo.signUp('reader@example.com', 'password123');

    render(
      <AppProvider authRepository={authRepo} quizRepository={quizRepo}>
        <MemoryRouter initialEntries={[`/share/${share.token}`]}>
          <Routes>
            <Route path="/share/:token" element={<ShareImportPage />} />
            <Route path="/" element={<DashboardEcho />} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Dashboard Target')).toBeInTheDocument();
    });
    expect(screen.getByTestId('notice')).toHaveTextContent('imported:自動インポート問題集:1');
    expect(getPendingShareToken()).toBeNull();
  });

  it('displays an error message when the share token is invalid or disabled', async () => {
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();
    await authRepo.signUp('reader2@example.com', 'password123');

    render(
      <AppProvider authRepository={authRepo} quizRepository={quizRepo}>
        <MemoryRouter initialEntries={['/share/nonexistent-token']}>
          <Routes>
            <Route path="/share/:token" element={<ShareImportPage />} />
            <Route path="/" element={<DashboardEcho />} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );

    expect(
      await screen.findByText('問題集をインポートできませんでした'),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('共有リンクが見つからない');
    expect(screen.getByRole('link', { name: 'ダッシュボードへ戻る' })).toHaveAttribute('href', '/');
  });
});
