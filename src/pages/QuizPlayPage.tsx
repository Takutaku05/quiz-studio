import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Play,
  RotateCcw,
  Shuffle,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  calculateQuizResult,
  extractWrongQuestions,
  prepareQuizQuestions,
  type PreparedChoice,
  type PreparedQuestion,
} from '../domain/quizEngine';
import type { AnswerNumber, Question, Quiz, QuizMode } from '../domain/types';

type PlayPhase = 'setup' | 'playing' | 'result';

export function QuizPlayPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const { user, quizRepository } = useApp();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);

  // Setup state
  const [phase, setPhase] = useState<PlayPhase>('setup');
  const [mode, setMode] = useState<QuizMode>('one_by_one');
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleChoices, setShuffleChoices] = useState(false);

  // Playing state
  const [preparedQuestions, setPreparedQuestions] = useState<PreparedQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerNumber>>({});

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user || !quizId) {
        if (active) setLoading(false);
        return;
      }
      setLoading(true);
      const found = await quizRepository.getById(quizId, user.id);
      if (active) {
        setQuiz(found);
        setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [quizId, quizRepository, user]);

  const startSession = (sourceQuestions: readonly Question[]) => {
    const prepared = prepareQuizQuestions(sourceQuestions, {
      shuffleQuestions,
      shuffleChoices,
    });
    setPreparedQuestions(prepared);
    setCurrentIndex(0);
    setAnswers({});
    setPhase('playing');
  };

  const currentQuestion = preparedQuestions[currentIndex];
  const selectedAnswer = currentQuestion
    ? answers[currentQuestion.source.id]
    : undefined;
  const hasAnsweredCurrent = selectedAnswer !== undefined;

  const result = useMemo(() => {
    if (phase !== 'result') return null;
    return calculateQuizResult(preparedQuestions, answers);
  }, [phase, preparedQuestions, answers]);

  const wrongQuestions = useMemo(() => {
    if (phase !== 'result') return [];
    return extractWrongQuestions(preparedQuestions, answers);
  }, [phase, preparedQuestions, answers]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm">
        読み込み中...
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-md w-full text-center space-y-4">
          <p className="text-slate-800 font-semibold">問題集が見つかりませんでした。</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>ダッシュボードへ戻る</span>
          </button>
        </div>
      </div>
    );
  }

  const handleSelectChoice = (choice: PreparedChoice) => {
    if (!currentQuestion) return;
    if (mode === 'one_by_one' && hasAnsweredCurrent) return;
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.source.id]: choice.originalNumber,
    }));
  };

  const handleNext = () => {
    if (currentIndex + 1 < preparedQuestions.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setPhase('result');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>戻る</span>
          </button>
          <h1 className="font-bold text-slate-900 truncate text-sm sm:text-base">
            {quiz.title}
          </h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
        {phase === 'setup' && (
          <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-xs">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{quiz.title}</h2>
              <p className="text-sm text-slate-500 mt-1">
                全 {quiz.questions.length} 問・出題設定を選んでスタートしてください
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">出題モード</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={`flex flex-col gap-1 rounded-xl border p-4 cursor-pointer transition-colors ${
                    mode === 'one_by_one'
                      ? 'border-indigo-600 bg-indigo-50/70'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="quizMode"
                      value="one_by_one"
                      checked={mode === 'one_by_one'}
                      onChange={() => setMode('one_by_one')}
                      className="accent-indigo-600"
                    />
                    <span className="font-semibold text-slate-900">
                      一問一答モード
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 pl-6">
                    解答直後に正誤と解説を表示
                  </span>
                </label>

                <label
                  className={`flex flex-col gap-1 rounded-xl border p-4 cursor-pointer transition-colors ${
                    mode === 'test'
                      ? 'border-indigo-600 bg-indigo-50/70'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="quizMode"
                      value="test"
                      checked={mode === 'test'}
                      onChange={() => setMode('test')}
                      className="accent-indigo-600"
                    />
                    <span className="font-semibold text-slate-900">
                      テストモード
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 pl-6">
                    全問終了後にまとめて採点
                  </span>
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">シャッフル設定</p>
              <div className="space-y-2.5">
                <label className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 cursor-pointer hover:bg-slate-50">
                  <div className="flex items-center gap-2.5">
                    <Shuffle className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-800">
                      問題順をシャッフル
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={shuffleQuestions}
                    onChange={(e) => setShuffleQuestions(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600"
                  />
                </label>

                <label className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 cursor-pointer hover:bg-slate-50">
                  <div className="flex items-center gap-2.5">
                    <Shuffle className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-800">
                      選択肢順をシャッフル
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={shuffleChoices}
                    onChange={(e) => setShuffleChoices(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600"
                  />
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={() => startSession(quiz.questions)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 transition-colors cursor-pointer"
            >
              <Play className="w-4 h-4" />
              <span>スタート</span>
            </button>
          </section>
        )}

        {phase === 'playing' && currentQuestion && (
          <section className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>
                  {mode === 'one_by_one' ? '一問一答モード' : 'テストモード'}
                </span>
                <span>
                  {currentIndex + 1} / {preparedQuestions.length}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-indigo-600 transition-all duration-300"
                  style={{
                    width: `${((currentIndex + 1) / preparedQuestions.length) * 100}%`,
                  }}
                />
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5 shadow-xs">
              <p className="text-base sm:text-lg font-bold text-slate-900 whitespace-pre-wrap leading-relaxed">
                {currentQuestion.source.question}
              </p>

              <div className="space-y-3">
                {currentQuestion.choices.map((choice) => {
                  const isSelected = selectedAnswer === choice.originalNumber;
                  let buttonStyle =
                    'border-slate-200 bg-white text-slate-800 hover:border-indigo-300 hover:bg-indigo-50/40';

                  if (mode === 'one_by_one' && hasAnsweredCurrent) {
                    if (choice.isCorrect) {
                      buttonStyle =
                        'border-emerald-500 bg-emerald-50 text-emerald-900 font-semibold';
                    } else if (isSelected && !choice.isCorrect) {
                      buttonStyle =
                        'border-rose-500 bg-rose-50 text-rose-900 font-semibold';
                    } else {
                      buttonStyle = 'border-slate-200 bg-slate-50 text-slate-400';
                    }
                  } else if (mode === 'test' && isSelected) {
                    buttonStyle =
                      'border-indigo-600 bg-indigo-50 text-indigo-900 font-semibold ring-1 ring-indigo-600';
                  }

                  return (
                    <button
                      key={choice.originalNumber}
                      type="button"
                      disabled={mode === 'one_by_one' && hasAnsweredCurrent}
                      onClick={() => handleSelectChoice(choice)}
                      className={`w-full text-left rounded-xl border px-4 py-4 text-sm sm:text-base transition-colors cursor-pointer disabled:cursor-default ${buttonStyle}`}
                    >
                      {choice.text}
                    </button>
                  );
                })}
              </div>

              {mode === 'one_by_one' && hasAnsweredCurrent && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                  {currentQuestion.choices.find(
                    (c) => c.originalNumber === selectedAnswer,
                  )?.isCorrect ? (
                    <div className="flex items-center gap-2 text-emerald-700 font-bold">
                      <CheckCircle2 className="w-5 h-5" />
                      <span>正解！</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-rose-700 font-bold">
                      <XCircle className="w-5 h-5" />
                      <span>不正解</span>
                    </div>
                  )}
                  {currentQuestion.source.explanation && (
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {currentQuestion.source.explanation}
                    </p>
                  )}
                </div>
              )}

              {hasAnsweredCurrent && (
                <button
                  type="button"
                  onClick={handleNext}
                  className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 transition-colors cursor-pointer"
                >
                  {currentIndex + 1 < preparedQuestions.length
                    ? '次へ'
                    : '結果を見る'}
                </button>
              )}
            </div>
          </section>
        )}

        {phase === 'result' && result && (
          <section className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-4 shadow-xs">
              <p className="text-sm font-semibold text-slate-500">テスト結果</p>
              <div className="flex items-baseline justify-center gap-4">
                <span className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                  {result.correctCount} / {result.totalCount}
                </span>
                <span className="text-2xl sm:text-3xl font-bold text-indigo-600">
                  {result.accuracyPercent}%
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => startSession(quiz.questions)}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-3 px-4 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>もう一度解く</span>
                </button>

                {wrongQuestions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => startSession(wrongQuestions)}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold py-3 px-4 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>間違えた問題だけ解く</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold py-3 px-4 cursor-pointer"
                >
                  <span>ダッシュボードへ戻る</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-base font-bold text-slate-900">全問の振り返り</h2>
              {result.items.map((item, idx) => (
                <article
                  key={`${item.questionId}-${idx}`}
                  className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm sm:text-base font-bold text-slate-900 whitespace-pre-wrap">
                      Q{idx + 1}. {item.questionText}
                    </p>
                    <span
                      className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        item.isCorrect
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {item.isCorrect ? '正解' : '不正解'}
                    </span>
                  </div>

                  <div className="text-xs sm:text-sm space-y-1 text-slate-600">
                    <p>
                      あなたの回答:{' '}
                      <span
                        className={
                          item.isCorrect
                            ? 'text-emerald-700 font-semibold'
                            : 'text-rose-700 font-semibold'
                        }
                      >
                        {item.selectedText}
                      </span>
                    </p>
                    <p>
                      正解:{' '}
                      <span className="text-emerald-700 font-semibold">
                        {item.correctText}
                      </span>
                    </p>
                  </div>

                  {item.explanation && (
                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs sm:text-sm text-slate-700 whitespace-pre-wrap">
                      {item.explanation}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
