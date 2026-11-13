import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  LogOut,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import { CsvUploadModal } from '../components/CsvUploadModal';
import { useApp } from '../context/AppContext';
import type { ParsedQuestion, Quiz } from '../domain/types';

export function DashboardPage() {
  const { user, quizRepository, signOut } = useApp();
  const navigate = useNavigate();

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadQuizzes = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const list = await quizRepository.listByUser(user.id);
      setQuizzes(list);
    } finally {
      setLoading(false);
    }
  }, [quizRepository, user]);

  useEffect(() => {
    loadQuizzes();
  }, [loadQuizzes]);

  const handleUploadSave = async (title: string, questions: ParsedQuestion[]) => {
    if (!user) return;
    await quizRepository.create(user.id, { title, questions });
    await loadQuizzes();
  };

  const handleDelete = async (quizId: string) => {
    if (!user) return;
    await quizRepository.delete(quizId, user.id);
    setConfirmDeleteId(null);
    await loadQuizzes();
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BookOpen className="w-6 h-6 text-indigo-600 shrink-0" />
            <span className="font-bold text-slate-900 truncate">CSV Quiz Studio</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-slate-500 truncate max-w-[200px]">
              {user?.email}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>ログアウト</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">マイ問題集</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              CSVをアップロードして反復学習を始めましょう
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>新規CSVアップロード</span>
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500 text-sm">読み込み中...</div>
        ) : quizzes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center">
            <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-700 font-medium">まだ問題集がありません</p>
            <p className="text-sm text-slate-500 mt-1 mb-5">
              「新規CSVアップロード」から問題集を登録してください。
            </p>
            <button
              type="button"
              onClick={() => setIsUploadOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>最初のCSVをアップロード</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {quizzes.map((quiz) => {
              const createdDate = new Date(quiz.createdAt).toLocaleDateString('ja-JP');
              const isConfirming = confirmDeleteId === quiz.id;
              return (
                <article
                  key={quiz.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between gap-4 shadow-xs"
                >
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 line-clamp-2">
                      {quiz.title}
                    </h2>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-medium">
                        {quiz.questions.length}問
                      </span>
                      <span>作成日: {createdDate}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <Link
                      to={`/quiz/${quiz.id}`}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      <span>プレイ</span>
                    </Link>

                    {isConfirming ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDelete(quiz.id)}
                          className="px-3 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          削除を確定
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
                        >
                          戻る
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(quiz.id)}
                        aria-label="削除"
                        className="inline-flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 text-sm transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>削除</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <CsvUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSave={handleUploadSave}
      />
    </div>
  );
}
