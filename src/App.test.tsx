import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from './App';
import { AppProvider } from './context/AppContext';
import type { User } from './domain/types';
import {
  LocalAuthRepository,
  LocalQuizRepository,
} from './repositories/localStorageRepositories';
import type { AuthRepository } from './repositories/types';

describe('App route protection & auth state sync', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('redirects unauthenticated users from / to /login', async () => {
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();

    render(
      <AppProvider authRepository={authRepo} quizRepository={quizRepo}>
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      </AppProvider>,
    );

    expect(
      await screen.findByText('アカウントにログインして学習を始める'),
    ).toBeInTheDocument();
  });

  it('redirects /login to / when onAuthStateChange emits a signed-in user', async () => {
    let listener: ((user: User | null) => void) | undefined;
    const authRepo: AuthRepository = {
      getCurrentUser: async () => null,
      signUp: async () => {
        throw new Error('unused');
      },
      signIn: async () => {
        throw new Error('unused');
      },
      signInWithGoogle: async () => {},
      signOut: async () => {},
      onAuthStateChange: (cb) => {
        listener = cb;
        return () => {
          listener = undefined;
        };
      },
    };
    const quizRepo = new LocalQuizRepository();

    render(
      <AppProvider authRepository={authRepo} quizRepository={quizRepo}>
        <MemoryRouter initialEntries={['/login']}>
          <AppRoutes />
        </MemoryRouter>
      </AppProvider>,
    );

    expect(
      await screen.findByText('アカウントにログインして学習を始める'),
    ).toBeInTheDocument();

    act(() => {
      listener?.({
        id: 'google-u1',
        email: 'google@example.com',
        createdAt: '2026-11-13T00:00:00Z',
      });
    });

    expect(await screen.findByText('マイ問題集')).toBeInTheDocument();
  });

  it('preserves OAuth redirect error across redirect from / to /login', async () => {
    window.history.replaceState(
      null,
      '',
      '/?error=access_denied&error_description=User+denied+access',
    );
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();

    render(
      <AppProvider authRepository={authRepo} quizRepository={quizRepo}>
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      </AppProvider>,
    );

    expect(
      await screen.findByText('Googleログインがキャンセルされました。'),
    ).toBeInTheDocument();
  });

  it('auto-imports shared quiz after signing up from a /share/:token link', async () => {
    const user = userEvent.setup();
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();
    const owner = await authRepo.signUp('creator@example.com', 'password123');
    const sharedQuiz = await quizRepo.create(owner.id, {
      title: '友だち共有クイズ',
      questions: [
        {
          question: '日本の首都は？',
          choice1: '東京',
          choice2: '大阪',
          choice3: null,
          choice4: null,
          answer: 1,
          explanation: null,
        },
      ],
    });
    const share = await quizRepo.enableShare(sharedQuiz.id, owner.id);
    await authRepo.signOut();

    render(
      <AppProvider authRepository={authRepo} quizRepository={quizRepo}>
        <MemoryRouter initialEntries={[`/share/${share.token}`]}>
          <AppRoutes />
        </MemoryRouter>
      </AppProvider>,
    );

    expect(
      await screen.findByText(/ログインまたは新規登録すると自動でインポートされます/),
    ).toBeInTheDocument();
    expect(screen.getByText('友だち共有クイズ')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '新規登録はこちら' }));
    await user.type(screen.getByLabelText('メールアドレス'), 'friend@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'password123');
    await user.click(screen.getByRole('button', { name: 'アカウント登録' }));

    expect(
      await screen.findByText('「友だち共有クイズ」（1問）をマイ問題集にインポートしました。'),
    ).toBeInTheDocument();
    expect(screen.getByText('友だち共有クイズ')).toBeInTheDocument();
  });

  it('auto-imports shared quiz after signing in via existing account or Google OAuth callback', async () => {
    const user = userEvent.setup();
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();
    const owner = await authRepo.signUp('owner-oauth@example.com', 'password123');
    const sharedQuiz = await quizRepo.create(owner.id, {
      title: 'OAuth共有クイズ',
      questions: [
        {
          question: 'Q1',
          choice1: 'A',
          choice2: 'B',
          choice3: null,
          choice4: null,
          answer: 1,
          explanation: null,
        },
      ],
    });
    const share = await quizRepo.enableShare(sharedQuiz.id, owner.id);
    await authRepo.signUp('existing@example.com', 'password123');
    await authRepo.signOut();

    render(
      <AppProvider authRepository={authRepo} quizRepository={quizRepo}>
        <MemoryRouter initialEntries={[`/share/${share.token}`]}>
          <AppRoutes />
        </MemoryRouter>
      </AppProvider>,
    );

    expect(await screen.findByText('OAuth共有クイズ')).toBeInTheDocument();

    await user.type(screen.getByLabelText('メールアドレス'), 'existing@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'password123');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(
        screen.getByText('「OAuth共有クイズ」（1問）をマイ問題集にインポートしました。'),
      ).toBeInTheDocument();
    });
  });

  it('redirects /login?redirect=/share/:token to /share/:token when onAuthStateChange emits OAuth user', async () => {
    const baseQuizRepo = new LocalQuizRepository();
    const baseAuthRepo = new LocalAuthRepository();
    const owner = await baseAuthRepo.signUp('oauth-creator@example.com', 'password123');
    const sharedQuiz = await baseQuizRepo.create(owner.id, {
      title: 'Google経由インポート',
      questions: [
        {
          question: 'Q1',
          choice1: 'A',
          choice2: 'B',
          choice3: null,
          choice4: null,
          answer: 1,
          explanation: null,
        },
      ],
    });
    const share = await baseQuizRepo.enableShare(sharedQuiz.id, owner.id);
    await baseAuthRepo.signOut();

    let listener: ((user: User | null) => void) | undefined;
    const authRepo: AuthRepository = {
      getCurrentUser: async () => null,
      signUp: async () => {
        throw new Error('unused');
      },
      signIn: async () => {
        throw new Error('unused');
      },
      signInWithGoogle: async () => {},
      signOut: async () => {},
      onAuthStateChange: (cb) => {
        listener = cb;
        return () => {
          listener = undefined;
        };
      },
    };

    render(
      <AppProvider authRepository={authRepo} quizRepository={baseQuizRepo}>
        <MemoryRouter
          initialEntries={[`/login?redirect=${encodeURIComponent(`/share/${share.token}`)}`]}
        >
          <AppRoutes />
        </MemoryRouter>
      </AppProvider>,
    );

    expect(await screen.findByText('Google経由インポート')).toBeInTheDocument();

    act(() => {
      listener?.({
        id: 'google-recipient-1',
        email: 'google-recipient@example.com',
        createdAt: '2026-11-17T00:00:00Z',
      });
    });

    expect(
      await screen.findByText('「Google経由インポート」（1問）をマイ問題集にインポートしました。'),
    ).toBeInTheDocument();
  });
});
