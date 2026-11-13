import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppProvider } from '../context/AppContext';
import { LocalAuthRepository, LocalQuizRepository } from '../repositories/localStorageRepositories';
import { LoginPage } from './LoginPage';

function renderLogin(initialEntries = ['/login']) {
  const authRepository = new LocalAuthRepository();
  const quizRepository = new LocalQuizRepository();
  return render(
    <AppProvider authRepository={authRepository} quizRepository={quizRepository}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>Dashboard Home</div>} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
}

describe('Bolt 04: LoginPage', () => {
  it('allows switching to sign up mode, registering a user, and redirecting to dashboard', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: '新規登録はこちら' }));
    await user.type(screen.getByLabelText('メールアドレス'), 'new@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'password123');
    await user.click(screen.getByRole('button', { name: 'アカウント登録' }));

    await waitFor(() => {
      expect(screen.getByText('Dashboard Home')).toBeInTheDocument();
    });
  });

  it('shows error message when signing in with invalid credentials', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('メールアドレス'), 'missing@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(
      await screen.findByText('メールアドレスまたはパスワードが正しくありません。'),
    ).toBeInTheDocument();
  });
});
