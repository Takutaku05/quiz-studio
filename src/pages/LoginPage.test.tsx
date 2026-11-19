import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../context/AppContext';
import { LocalAuthRepository, LocalQuizRepository } from '../repositories/localStorageRepositories';
import { EmailConfirmationRequiredError } from '../repositories/supabaseRepositories';
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

  it('re-enables login buttons when the page is restored from bfcache during Google redirect', async () => {
    const user = userEvent.setup();
    const baseRepo = new LocalAuthRepository();
    const mockAuthRepo: AuthRepository = {
      getCurrentUser: () => baseRepo.getCurrentUser(),
      signUp: (e, p) => baseRepo.signUp(e, p),
      signIn: (e, p) => baseRepo.signIn(e, p),
      signOut: () => baseRepo.signOut(),
      // 成功時はリダイレクトされる想定のため pendingMethod は解除されない
      signInWithGoogle: vi.fn().mockResolvedValue(undefined),
    };

    renderLogin(['/login'], mockAuthRepo);

    await user.click(await screen.findByRole('button', { name: /Googleでログイン/ }));
    expect(
      await screen.findByRole('button', { name: /Googleへリダイレクト中/ }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeDisabled();

    // 通常の pageshow（bfcache 以外）では状態を変えない
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    });
    expect(screen.getByRole('button', { name: /Googleへリダイレクト中/ })).toBeDisabled();

    // bfcache からの復元では保留状態をリセットしてボタンを再操作可能にする
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });

    expect(await screen.findByRole('button', { name: /Googleでログイン/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeEnabled();
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

  it('displays shared quiz summary banner, passes redirectPath to signUp & Google OAuth, and supports cancel', async () => {
    const user = userEvent.setup();
    const baseAuthRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();
    const owner = await baseAuthRepo.signUp('banner-owner@example.com', 'password123');
    const quiz = await quizRepo.create(owner.id, {
      title: '線形代数まとめ',
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
    const share = await quizRepo.enableShare(quiz.id, owner.id);
    await baseAuthRepo.signOut();

    const signUpSpy = vi.fn(baseAuthRepo.signUp.bind(baseAuthRepo));
    const signInWithGoogleSpy = vi.fn().mockResolvedValue(undefined);
    const mockAuthRepo: AuthRepository = {
      getCurrentUser: () => baseAuthRepo.getCurrentUser(),
      signUp: signUpSpy,
      signIn: (e, p) => baseAuthRepo.signIn(e, p),
      signInWithGoogle: signInWithGoogleSpy,
      signOut: () => baseAuthRepo.signOut(),
    };

    const sharePath = `/share/${share.token}`;
    render(
      <AppProvider authRepository={mockAuthRepo} quizRepository={quizRepo}>
        <MemoryRouter initialEntries={[`/login?redirect=${encodeURIComponent(sharePath)}`]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/share/:token" element={<div>Share Import Route</div>} />
            <Route path="/" element={<div>Dashboard Home</div>} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );

    expect(await screen.findByText('線形代数まとめ')).toBeInTheDocument();
    expect(screen.getByText(/全1問/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Googleでログイン/ }));
    expect(signInWithGoogleSpy).toHaveBeenCalledWith(sharePath);

    await user.click(screen.getByRole('button', { name: '新規登録はこちら' }));
    await user.type(screen.getByLabelText('メールアドレス'), 'student@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'password123');
    await user.click(screen.getByRole('button', { name: 'アカウント登録' }));

    expect(signUpSpy).toHaveBeenCalledWith('student@example.com', 'password123', sharePath);
    expect(await screen.findByText('Share Import Route')).toBeInTheDocument();
  });

  it('shows email confirmation notice with role="status" instead of error alert on signUp', async () => {
    const user = userEvent.setup();
    const baseRepo = new LocalAuthRepository();
    const mockAuthRepo: AuthRepository = {
      getCurrentUser: () => baseRepo.getCurrentUser(),
      signUp: vi.fn().mockRejectedValueOnce(new EmailConfirmationRequiredError()),
      signIn: (e, p) => baseRepo.signIn(e, p),
      signInWithGoogle: () => baseRepo.signInWithGoogle(),
      signOut: () => baseRepo.signOut(),
    };

    renderLogin(['/login'], mockAuthRepo);

    await user.click(screen.getByRole('button', { name: '新規登録はこちら' }));
    await user.type(screen.getByLabelText('メールアドレス'), 'confirm@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'password123');
    await user.click(screen.getByRole('button', { name: 'アカウント登録' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('確認メールを送信しました');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps Google button in redirecting state after signInWithGoogle succeeds without changing email button label', async () => {
    const user = userEvent.setup();
    const baseRepo = new LocalAuthRepository();
    const mockAuthRepo: AuthRepository = {
      getCurrentUser: () => baseRepo.getCurrentUser(),
      signUp: (e, p) => baseRepo.signUp(e, p),
      signIn: (e, p) => baseRepo.signIn(e, p),
      signInWithGoogle: vi.fn().mockResolvedValueOnce(undefined),
      signOut: () => baseRepo.signOut(),
    };

    renderLogin(['/login'], mockAuthRepo);

    await user.click(await screen.findByRole('button', { name: /Googleでログイン/ }));

    expect(
      await screen.findByRole('button', { name: /Googleへリダイレクト中\.\.\./ }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '処理中...' })).not.toBeInTheDocument();
  });
});
