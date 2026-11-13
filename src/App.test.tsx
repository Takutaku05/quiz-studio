import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from './App';
import { AppProvider } from './context/AppContext';
import {
  LocalAuthRepository,
  LocalQuizRepository,
} from './repositories/localStorageRepositories';

describe('App route protection', () => {
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
});
