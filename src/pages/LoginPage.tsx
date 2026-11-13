import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpenCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function LoginPage() {
  const { signIn, signUp } = useApp();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '認証に失敗しました。');
    } finally {
      setSubmitting(false);
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

          {error && (
            <div
              role="alert"
              className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-sm text-rose-700"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-3 transition-colors cursor-pointer"
          >
            {submitting
              ? '処理中...'
              : mode === 'signin'
                ? 'ログイン'
                : 'アカウント登録'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100 text-center">
          {mode === 'signin' ? (
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
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
