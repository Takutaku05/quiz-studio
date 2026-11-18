import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  KeyRound,
  LogOut,
  Play,
  Plus,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { CsvUploadModal } from '../components/CsvUploadModal';
import { PasskeySettingsModal } from '../components/PasskeySettingsModal';
import { ShareQuizModal } from '../components/ShareQuizModal';
import { useApp } from '../context/AppContext';
import { downloadCsvTemplate } from '../domain/csvTemplate';
import { downloadXlsxTemplate } from '../domain/xlsxTemplate';
import type {
  ImportSharedQuizResult,
  ParsedQuestion,
  QuestionStat,
  Quiz,
  QuizSession,
} from '../domain/types';
import { QuizStudyBadges } from '../components/QuizStudyBadges';

export function DashboardPage() {
  const { user, authRepository, quizRepository, studyRepository, signOut } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [sessionsByQuiz, setSessionsByQuiz] = useState<Map<string, QuizSession>>(new Map());
  const [statsByQuiz, setStatsByQuiz] = useState<Map<string, QuestionStat[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isPasskeyOpen, setIsPasskeyOpen] = useState(false);
  const [sharingQuiz, setSharingQuiz] = useState<Quiz | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [downloadingXlsx, setDownloadingXlsx] = useState(false);
  const [importNotice, setImportNotice] = useState<ImportSharedQuizResult | null>(() => {
    const state = location.state as { importNotice?: ImportSharedQuizResult } | null;
    return state?.importNotice ?? null;
  });

  useEffect(() => {
    const state = location.state as { importNotice?: ImportSharedQuizResult } | null;
    if (state?.importNotice) {
      setImportNotice(state.importNotice);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

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

  // Study status is secondary: if it cannot be loaded, the list still shows without badges.
  useEffect(() => {
    if (!user) return;
    let active = true;
    Promise.all([studyRepository.listSessions(user.id), studyRepository.listStats(user.id)])
      .then(([sessions, stats]) => {
        if (!active) return;
        setSessionsByQuiz(new Map(sessions.map((s) => [s.quizId, s])));
        const grouped = new Map<string, QuestionStat[]>();
        for (const stat of stats) {
          grouped.set(stat.quizId, [...(grouped.get(stat.quizId) ?? []), stat]);
        }
        setStatsByQuiz(grouped);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [quizzes, studyRepository, user]);

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

  const handleDownloadXlsxTemplate = async () => {
    if (downloadingXlsx) return;
    setDownloadingXlsx(true);
    try {
      await downloadXlsxTemplate();
    } catch {
      // Ignore unexpected blob/download errors in headless environments.
    } finally {
      setDownloadingXlsx(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BookOpen className="w-6 h-6 text-indigo-600 shrink-0" />
            <span className="font-bold text-slate-900 truncate">Quiz Studio</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden sm:inline text-xs text-slate-500 truncate max-w-[200px]">
              {user?.email}
            </span>
            <button
              type="button"
              onClick={() => setIsPasskeyOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
              <span>パスキー設定</span>
            </button>
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
        {importNotice && (
          <div
            role="status"
            className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
              <p className="text-sm font-medium text-emerald-900">
                {importNotice.status === 'imported'
                  ? `「${importNotice.title}」（${importNotice.questionCount}問）をマイ問題集にインポートしました。`
                  : importNotice.status === 'already_imported'
                    ? `「${importNotice.title}」はすでにマイ問題集にインポート済みです。`
                    : `「${importNotice.title}」はあなたが作成した問題集です。`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to={`/quiz/${importNotice.quizId}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{importNotice.status === 'imported' ? '今すぐプレイ' : '問題集を開く'}</span>
              </Link>
              <button
                type="button"
                onClick={() => setImportNotice(null)}
                aria-label="通知を閉じる"
                className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">マイ問題集</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              CSV・Excel（.xlsx）・JSON や ChatGPT の出力テキストを登録して反復学習を始めましょう
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={downloadingXlsx}
              onClick={() => {
                void handleDownloadXlsxTemplate();
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-700 text-sm font-medium transition-colors disabled:opacity-60 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
              <span>{downloadingXlsx ? 'Excel作成中...' : 'テンプレートExcel'}</span>
            </button>
            <button
              type="button"
              onClick={downloadCsvTemplate}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-sm font-medium transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-indigo-600" />
              <span>テンプレートCSV</span>
            </button>
            <button
              type="button"
              onClick={() => setIsUploadOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>新規問題集アップロード</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500 text-sm">読み込み中...</div>
        ) : quizzes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center">
            <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-700 font-medium">まだ問題集がありません</p>
            <p className="text-sm text-slate-500 mt-1 mb-5">
              テンプレート（Excel / CSV）や ChatGPT 出力のテキスト貼り付けで問題を作成し、「最初の問題集をアップロード」から登録してください。
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={downloadingXlsx}
                onClick={() => {
                  void handleDownloadXlsxTemplate();
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-700 text-sm font-medium disabled:opacity-60 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                <span>
                  {downloadingXlsx
                    ? 'Excel作成中...'
                    : 'テンプレートExcel（.xlsx）をダウンロード'}
                </span>
              </button>
              <button
                type="button"
                onClick={downloadCsvTemplate}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium cursor-pointer"
              >
                <Download className="w-4 h-4 text-indigo-600" />
                <span>テンプレートCSVをダウンロード</span>
              </button>
              <button
                type="button"
                onClick={() => setIsUploadOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>最初の問題集をアップロード</span>
              </button>
            </div>
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
                    <QuizStudyBadges
                      session={sessionsByQuiz.get(quiz.id) ?? null}
                      stats={statsByQuiz.get(quiz.id) ?? []}
                    />
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
                      <>
                        <button
                          type="button"
                          onClick={() => setSharingQuiz(quiz)}
                          aria-label="共有"
                          className="inline-flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:text-indigo-700 hover:border-indigo-200 hover:bg-indigo-50 text-sm transition-colors cursor-pointer"
                        >
                          <Share2 className="w-4 h-4" />
                          <span>共有</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(quiz.id)}
                          aria-label="削除"
                          className="inline-flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 text-sm transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>削除</span>
                        </button>
                      </>
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
      <PasskeySettingsModal
        isOpen={isPasskeyOpen}
        onClose={() => setIsPasskeyOpen(false)}
        authRepository={authRepository}
      />
      <ShareQuizModal
        quiz={sharingQuiz}
        userId={user?.id ?? ''}
        quizRepository={quizRepository}
        onClose={() => setSharingQuiz(null)}
      />
    </div>
  );
}
