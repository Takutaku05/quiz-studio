import { act, render, screen } from '@testing-library/react';
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
});
