import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, BookOpenCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  buildSharePath,
  clearPendingShareToken,
  savePendingShareToken,
} from '../lib/shareRedirect';

export function ShareImportPage() {
  const { token } = useParams<{ token: string }>();
  const { user, authLoading, quizRepository } = useApp();
  const navigate = useNavigate();

  const [error, setError] = useState<string | null>(null);
  const startedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    const cleanToken = token?.trim() ?? '';
    if (!cleanToken) {
      clearPendingShareToken();
      setError('共有リンクが見つからないか、共有が停止されています。');
      return;
    }

    if (!user) {
      savePendingShareToken(cleanToken);
      const redirect = encodeURIComponent(buildSharePath(cleanToken));
      navigate(`/login?redirect=${redirect}`, { replace: true });
      return;
    }

    const runKey = `${user.id}:${cleanToken}`;
    if (startedKeyRef.current === runKey) return;
    startedKeyRef.current = runKey;

    if (!quizRepository.importByShareToken) {
      clearPendingShareToken();
      setError('この環境では共有問題集のインポートに対応していません。');
      return;
    }

    let active = true;
    setError(null);
    quizRepository
      .importByShareToken(cleanToken, user.id)
      .then((result) => {
        clearPendingShareToken();
        if (!active) return;
        navigate('/', {
          replace: true,
          state: { importNotice: result },
        });
      })
      .catch((err) => {
        clearPendingShareToken();
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : '共有リンクが見つからないか、共有が停止されています。',
        );
      });

    return () => {
      active = false;
    };
  }, [authLoading, navigate, quizRepository, token, user]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">問題集をインポートできませんでした</h1>
          <p role="alert" className="text-sm text-slate-600">
            {error}
          </p>
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>ダッシュボードへ戻る</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
          <BookOpenCheck className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">共有された問題集を読み込んでいます</h1>
        <p className="text-sm text-slate-500">しばらくお待ちください...</p>
      </div>
    </div>
  );
}
