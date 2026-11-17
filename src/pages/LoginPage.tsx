import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpenCheck, KeyRound, Share2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { SharedQuizSummary } from '../domain/types';
import {
  buildSharePath,
  clearPendingShareToken,
  resolvePendingShareToken,
  resolvePostAuthRedirect,
  savePendingShareToken,
} from '../lib/shareRedirect';

function GoogleIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

export function LoginPage() {
  const {
    signIn,
    signUp,
    signInWithGoogle,
    signInWithPasskey,
    quizRepository,
    authError,
    clearAuthError,
  } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingMethod, setPendingMethod] = useState<'password' | 'google' | 'passkey' | null>(
    null,
  );
  const [sharedSummary, setSharedSummary] = useState<SharedQuizSummary | null>(null);
  const [summaryLoaded, setSummaryLoaded] = useState(false);

  const pendingShareToken = resolvePendingShareToken(location.search);
  const redirectTarget = resolvePostAuthRedirect(location.search);
  const shareRedirectPath = pendingShareToken ? buildSharePath(pendingShareToken) : undefined;

  useEffect(() => {
    if (!pendingShareToken) {
      setSharedSummary(null);
      setSummaryLoaded(false);
      return;
    }

    savePendingShareToken(pendingShareToken);

    let active = true;
    setSummaryLoaded(false);
    if (!quizRepository.getSharedQuizSummary) {
      setSummaryLoaded(true);
      return;
    }

    quizRepository
      .getSharedQuizSummary(pendingShareToken)
      .then((summary) => {
        if (!active) return;
        setSharedSummary(summary);
        setSummaryLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setSharedSummary(null);
        setSummaryLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [pendingShareToken, quizRepository]);

  const submitting = pendingMethod !== null;
  const displayError = error ?? authError;

  const handleCancelShare = () => {
    clearPendingShareToken();
    setSharedSummary(null);
    setSummaryLoaded(false);
    navigate('/login', { replace: true });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    clearAuthError();
    setPendingMethod('password');
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else if (shareRedirectPath) {
        await signUp(email, password, shareRedirectPath);
      } else {
        await signUp(email, password);
      }
      navigate(redirectTarget, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '認証に失敗しました。');
    } finally {
      setPendingMethod(null);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    clearAuthError();
    setPendingMethod('google');
    try {
      if (shareRedirectPath) {
        await signInWithGoogle(shareRedirectPath);
      } else {
        await signInWithGoogle();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google認証に失敗しました。');
    } finally {
      setPendingMethod(null);
    }
  };

  const handlePasskeySignIn = async () => {
    setError(null);
    clearAuthError();
    setPendingMethod('passkey');
    try {
      await signInWithPasskey();
      navigate(redirectTarget, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'パスキー認証に失敗しました。');
    } finally {
      setPendingMethod(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
            <BookOpenCheck className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">CSV Quiz Studio</h1>
          <p className="text-sm text-slate-500 mt-1">
            {mode === 'signin'
              ? 'アカウントにログインして学習を始める'
              : '新しいアカウントを作成して問題集を管理'}
          </p>
        </div>

        {pendingShareToken && (
          <div className="mb-5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs sm:text-sm text-indigo-900 space-y-2">
            <div className="flex items-start gap-2">
              <Share2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                {!summaryLoaded ? (
                  <p>共有された問題集を確認しています...</p>
                ) : sharedSummary ? (
                  <p>
                    「<span className="font-semibold">{sharedSummary.title}</span>」（全
                    {sharedSummary.questionCount}
                    問）が共有されています。ログインまたは新規登録すると自動でインポートされます。
                  </p>
                ) : (
                  <p className="text-rose-700">
                    この共有リンクは無効か、共有が停止されています。
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancelShare}
              className="text-xs font-medium text-indigo-700 hover:text-indigo-900 underline underline-offset-2 cursor-pointer"
            >
              共有をキャンセルして通常ログイン
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              パスワード
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6文字以上"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {displayError && (
            <div
              role="alert"
              className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-sm text-rose-700"
            >
              {displayError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-3 transition-colors cursor-pointer"
          >
            {pendingMethod === 'password'
              ? '処理中...'
              : mode === 'signin'
                ? 'ログイン'
                : 'アカウント登録'}
          </button>
        </form>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-3 text-slate-400">または</span>
          </div>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-700 font-medium py-2.5 px-4 transition-colors cursor-pointer"
          >
            <GoogleIcon />
            <span>
              {pendingMethod === 'google' ? 'Googleへリダイレクト中...' : 'Googleでログイン'}
            </span>
          </button>

          {mode === 'signin' && (
            <>
              <button
                type="button"
                onClick={handlePasskeySignIn}
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-700 font-medium py-2.5 px-4 transition-colors cursor-pointer"
              >
                <KeyRound className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>
                  {pendingMethod === 'passkey' ? 'パスキーを確認中...' : 'パスキーでログイン'}
                </span>
              </button>
              <p className="text-[11px] text-slate-400 text-center">
                ※ パスキーはログイン後にダッシュボードの「パスキー設定」から登録できます
              </p>
            </>
          )}
        </div>

        <div className="mt-6 pt-5 border-t border-slate-100 text-center">
          {mode === 'signin' ? (
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
                clearAuthError();
              }}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700 cursor-pointer"
            >
              新規登録はこちら
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
                clearAuthError();
              }}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700 cursor-pointer"
            >
              すでにアカウントをお持ちの方（ログイン）
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
