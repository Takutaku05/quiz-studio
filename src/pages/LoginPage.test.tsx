import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../context/AppContext';
import { LocalAuthRepository, LocalQuizRepository } from '../repositories/localStorageRepositories';
import type { AuthRepository } from '../repositories/types';
import { LoginPage } from './LoginPage';

function renderLogin(
  initialEntries = ['/login'],
  authRepository: AuthRepository = new LocalAuthRepository(),
) {
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

describe('Bolt 04 & 06: LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

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

  it('triggers signInWithGoogle and displays errors if Google login fails', async () => {
    const user = userEvent.setup();
    const baseRepo = new LocalAuthRepository();
    const mockAuthRepo: AuthRepository = {
      getCurrentUser: () => baseRepo.getCurrentUser(),
      signUp: (e, p) => baseRepo.signUp(e, p),
      signIn: (e, p) => baseRepo.signIn(e, p),
      signOut: () => baseRepo.signOut(),
      signInWithGoogle: vi.fn().mockRejectedValueOnce(new Error('Google認証に失敗しました。')),
    };

    renderLogin(['/login'], mockAuthRepo);

    const googleButton = await screen.findByRole('button', { name: /Googleでログイン/ });
    await user.click(googleButton);

    expect(mockAuthRepo.signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Google認証に失敗しました。')).toBeInTheDocument();
  });

  it('displays OAuth redirect error from URL and clears error params', async () => {
    window.history.replaceState(
      null,
      '',
      '/login?error=access_denied&error_description=User+denied+access',
    );
    renderLogin(['/login']);

    expect(
      await screen.findByText('Googleログインがキャンセルされました。'),
    ).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('signs in with passkey in signin mode and hides passkey button in signup mode', async () => {
    const user = userEvent.setup();
    const baseRepo = new LocalAuthRepository();
    const mockAuthRepo: AuthRepository = {
      getCurrentUser: () => baseRepo.getCurrentUser(),
      signUp: (e, p) => baseRepo.signUp(e, p),
      signIn: (e, p) => baseRepo.signIn(e, p),
      signInWithGoogle: () => baseRepo.signInWithGoogle(),
      signOut: () => baseRepo.signOut(),
      isPasskeySupported: () => true,
      signInWithPasskey: vi.fn().mockResolvedValue({
        id: 'pk-user-1',
        email: 'passkey@example.com',
        createdAt: '2026-11-13T00:00:00Z',
      }),
    };

    renderLogin(['/login'], mockAuthRepo);

    const passkeyButton = await screen.findByRole('button', { name: /パスキーでログイン/ });
    await user.click(screen.getByRole('button', { name: '新規登録はこちら' }));
    expect(screen.queryByRole('button', { name: /パスキーでログイン/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /すでにアカウントをお持ちの方/ }));
    await user.click(await screen.findByRole('button', { name: /パスキーでログイン/ }));

    expect(mockAuthRepo.signInWithPasskey).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText('Dashboard Home')).toBeInTheDocument();
    });
    expect(passkeyButton).toBeDefined();
  });

  it('displays error message when passkey login fails', async () => {
    const user = userEvent.setup();
    const baseRepo = new LocalAuthRepository();
    const mockAuthRepo: AuthRepository = {
      getCurrentUser: () => baseRepo.getCurrentUser(),
      signUp: (e, p) => baseRepo.signUp(e, p),
      signIn: (e, p) => baseRepo.signIn(e, p),
      signInWithGoogle: () => baseRepo.signInWithGoogle(),
      signOut: () => baseRepo.signOut(),
      isPasskeySupported: () => true,
      signInWithPasskey: vi
        .fn()
        .mockRejectedValueOnce(new Error('パスキーの操作がキャンセルされたか、タイムアウトしました。')),
    };

    renderLogin(['/login'], mockAuthRepo);

    await user.click(await screen.findByRole('button', { name: /パスキーでログイン/ }));
    expect(
      await screen.findByText('パスキーの操作がキャンセルされたか、タイムアウトしました。'),
    ).toBeInTheDocument();
  });
});
