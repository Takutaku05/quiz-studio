import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  PauseCircle,
  PlayCircle,
  QrCode,
  RefreshCw,
  Share2,
  X,
} from 'lucide-react';
import { toString as renderQrSvg } from 'qrcode';
import type { Quiz, QuizShare } from '../domain/types';
import { buildShareUrl } from '../lib/shareRedirect';
import type { QuizRepository } from '../repositories/types';

interface ShareQuizModalProps {
  quiz: Quiz | null;
  userId: string;
  quizRepository: QuizRepository;
  onClose: () => void;
}

function sanitizeFileName(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]/g, '_');
  return cleaned || 'quiz';
}

export function ShareQuizModal({
  quiz,
  userId,
  quizRepository,
  onClose,
}: ShareQuizModalProps) {
  const [share, setShare] = useState<QuizShare | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSupported = Boolean(
    quizRepository.getShare &&
      quizRepository.enableShare &&
      quizRepository.disableShare &&
      quizRepository.regenerateShare,
  );

  const loadOrCreateShare = useCallback(async () => {
    if (!quiz || !userId) return;
    if (!quizRepository.getShare || !quizRepository.enableShare) {
      setError('この保存設定では問題集の共有機能を利用できません。');
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);
    setCopied(false);
    try {
      const existing = await quizRepository.getShare(quiz.id, userId);
      if (existing) {
        setShare(existing);
      } else {
        const created = await quizRepository.enableShare(quiz.id, userId);
        setShare(created);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '共有リンクの取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [quiz, quizRepository, userId]);

  useEffect(() => {
    if (!quiz) {
      setShare(null);
      setQrSvg(null);
      setQrDataUrl(null);
      setError(null);
      setNotice(null);
      setCopied(false);
      return;
    }
    void loadOrCreateShare();
  }, [quiz, loadOrCreateShare]);

  useEffect(() => {
    if (!quiz) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quiz, onClose]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const shareUrl = share ? buildShareUrl(share.token) : '';

  useEffect(() => {
    let active = true;
    if (!share || !share.isActive) {
      setQrSvg(null);
      setQrDataUrl(null);
      return;
    }

    renderQrSvg(shareUrl, {
      type: 'svg',
      width: 220,
      margin: 2,
      errorCorrectionLevel: 'M',
    })
      .then((svg) => {
        if (!active) return;
        setQrSvg(svg);
        setQrDataUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      })
      .catch(() => {
        if (!active) return;
        setQrSvg(null);
        setQrDataUrl(null);
      });

    return () => {
      active = false;
    };
  }, [share, shareUrl]);

  if (!quiz) return null;

  const handleCopyUrl = async () => {
    if (!shareUrl) return;
    setError(null);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
      } else {
        setError('クリップボードへのコピーに対応していない環境です。URLを直接選択してコピーしてください。');
      }
    } catch {
      setError('URLのコピーに失敗しました。URL欄から手動でコピーしてください。');
    }
  };

  const handleDownloadQr = () => {
    if (!qrSvg) return;
    const blob = new Blob([qrSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeFileName(quiz.title)}-qr.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const runShareMutation = async (
    action: ((quizId: string, userId: string) => Promise<QuizShare>) | undefined,
    successNotice: string,
    fallbackError: string,
    clearCopied = false,
  ) => {
    if (!action || updating) return;
    setUpdating(true);
    setError(null);
    setNotice(null);
    if (clearCopied) setCopied(false);
    try {
      const updated = await action(quiz.id, userId);
      setShare(updated);
      setNotice(successNotice);
    } catch (err) {
      setError(err instanceof Error ? err.message : fallbackError);
    } finally {
      setUpdating(false);
    }
  };

  const handleEnable = () =>
    runShareMutation(
      quizRepository.enableShare?.bind(quizRepository),
      '共有を再開しました。',
      '共有の再開に失敗しました。',
    );

  const handleDisable = () =>
    runShareMutation(
      quizRepository.disableShare?.bind(quizRepository),
      '共有を停止しました。このURL・QRコードからはインポートできなくなります。',
      '共有の停止に失敗しました。',
      true,
    );

  const handleRegenerate = () =>
    runShareMutation(
      quizRepository.regenerateShare?.bind(quizRepository),
      '新しい共有URL・QRコードを発行しました（以前のリンクは無効になります）。',
      '共有リンクの再発行に失敗しました。',
      true,
    );

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-quiz-modal-title"
        className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <Share2 className="w-5 h-5 text-indigo-600 shrink-0" />
            <h2
              id="share-quiz-modal-title"
              className="text-lg font-bold text-slate-900 truncate"
            >
              問題集を共有
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{quiz.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{quiz.questions.length}問</p>
            </div>
            {share && (
              <span
                className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                  share.isActive
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {share.isActive ? '共有中' : '共有停止中'}
              </span>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-sm text-rose-700"
            >
              {error}
            </div>
          )}

          {notice && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-sm text-emerald-700">
              {notice}
            </div>
          )}

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">
              共有リンクを準備しています...
            </div>
          ) : !isSupported ? null : share && share.isActive ? (
            <>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5 text-center space-y-3">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <QrCode className="w-4 h-4 text-indigo-600" />
                  <span>QRコードを読み取ってインポート</span>
                </div>

                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`${quiz.title} の共有QRコード`}
                    className="w-52 h-52 mx-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xs"
                  />
                ) : (
                  <div className="w-52 h-52 mx-auto rounded-xl border border-slate-200 bg-white flex items-center justify-center text-xs text-slate-400">
                    QRコードを生成中...
                  </div>
                )}

                {qrSvg && (
                  <button
                    type="button"
                    onClick={handleDownloadQr}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-600" />
                    <span>QR画像を保存（SVG）</span>
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="share-quiz-url"
                  className="block text-xs font-semibold text-slate-700"
                >
                  共有URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="share-quiz-url"
                    type="text"
                    readOnly
                    value={shareUrl}
                    aria-label="共有URL"
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-0 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs sm:text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void handleCopyUrl();
                    }}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>コピーしました</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>URLをコピー</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                相手がこのURLを開くかQRコードを読み取り、アカウント作成またはログインを完了すると、問題集のコピーが相手のアカウントへ自動でインポートされます（インポート後に元の問題集を削除しても相手側のコピーは残ります）。
              </p>

              <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => {
                    void handleRegenerate();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-medium text-slate-700 disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>リンクを再発行</span>
                </button>
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => {
                    void handleDisable();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-medium text-rose-700 disabled:opacity-60 cursor-pointer"
                >
                  <PauseCircle className="w-3.5 h-3.5" />
                  <span>共有を停止</span>
                </button>
              </div>
            </>
          ) : share ? (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5 text-center space-y-4">
              <p className="text-sm text-slate-700">
                この問題集の共有リンク・QRコードは現在停止されています。
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => {
                    void handleEnable();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-60 cursor-pointer"
                >
                  <PlayCircle className="w-4 h-4" />
                  <span>共有を再開する</span>
                </button>
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => {
                    void handleRegenerate();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-sm font-medium disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>新しいリンクを発行して再開</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
