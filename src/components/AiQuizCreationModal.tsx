import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  Sparkles,
  X,
} from 'lucide-react';
import { copyTextToClipboard } from '../lib/clipboard';
import { useQuizPasteState } from '../lib/useQuizPasteState';
import { useTransientFlag } from '../lib/useTransientFlag';
import type { ParsedQuestion } from '../domain/types';
import { CHATGPT_PROJECT_PROMPT } from '../domain/chatgptPrompt';
import {
  PROMPT_MANUAL_COPY_FALLBACK_NOTICE,
  PromptPreviewBox,
  QuizImportFeedback,
  QuizTextPastePanel,
} from './QuizImportShared';

type AiCreationStep = 'prompt' | 'paste';

interface AiQuizCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, questions: ParsedQuestion[]) => Promise<void>;
}

export function AiQuizCreationModal({ isOpen, onClose, onSave }: AiQuizCreationModalProps) {
  const [step, setStep] = useState<AiCreationStep>('prompt');
  const [title, setTitle] = useState('');
  const titleManuallyEditedRef = useRef(false);
  const titleRef = useRef(title);
  titleRef.current = title;

  const [copiedFromStep1, setCopiedFromStep1] = useState(false);
  const [copiedPrompt, triggerCopiedPrompt, clearCopiedPrompt] = useTransientFlag(2000);
  const [promptPreviewOpen, setPromptPreviewOpen] = useState(false);
  const [promptFallbackNotice, setPromptFallbackNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    pastedText,
    pasteFormat,
    pasteQuestions,
    pasteErrors,
    clipboardNotice,
    applyPastedText,
    handlePasteFromClipboard,
    resetPasteState,
  } = useQuizPasteState({
    onBeforeApply: () => setSaveError(null),
    onSuggestTitle: (suggestedTitle) => {
      if (!titleManuallyEditedRef.current && titleRef.current.trim() === '') {
        setTitle(suggestedTitle);
      }
    },
  });

  const resetState = useCallback(() => {
    setStep('prompt');
    setTitle('');
    titleManuallyEditedRef.current = false;
    setCopiedFromStep1(false);
    clearCopiedPrompt();
    setPromptPreviewOpen(false);
    setPromptFallbackNotice(null);
    setSaving(false);
    setSaveError(null);
    resetPasteState();
  }, [clearCopiedPrompt, resetPasteState]);

  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);

  if (!isOpen) return null;

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleTitleChange = (nextTitle: string) => {
    setTitle(nextTitle);
    titleManuallyEditedRef.current = nextTitle.trim().length > 0;
  };

  const handleCopyPromptAndProceed = async () => {
    const ok = await copyTextToClipboard(CHATGPT_PROJECT_PROMPT);
    if (ok) {
      setCopiedFromStep1(true);
      setPromptFallbackNotice(null);
      setPromptPreviewOpen(false);
      setStep('paste');
      return;
    }
    setCopiedFromStep1(false);
    setPromptFallbackNotice(PROMPT_MANUAL_COPY_FALLBACK_NOTICE);
    setPromptPreviewOpen(true);
    setStep('paste');
  };

  const handleSkipToPaste = () => {
    setCopiedFromStep1(false);
    setPromptFallbackNotice(null);
    setPromptPreviewOpen(false);
    setStep('paste');
  };

  const handleRecopyPrompt = async () => {
    const ok = await copyTextToClipboard(CHATGPT_PROJECT_PROMPT);
    setCopiedFromStep1(false);
    if (ok) {
      setPromptFallbackNotice(null);
      setPromptPreviewOpen(false);
      triggerCopiedPrompt();
      return;
    }
    setPromptPreviewOpen(true);
    setPromptFallbackNotice(PROMPT_MANUAL_COPY_FALLBACK_NOTICE);
  };

  const rowLabelUnit = pasteFormat === 'json' ? '問目' : '行目';
  const canSave =
    title.trim().length > 0 &&
    pasteQuestions.length > 0 &&
    pasteErrors.length === 0 &&
    !saving;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(title.trim(), pasteQuestions);
      resetState();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存に失敗しました。');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-quiz-creation-title"
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200 max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-5 h-5 text-indigo-600 shrink-0" />
            <h2 id="ai-quiz-creation-title" className="text-lg font-bold text-slate-900 truncate">
              AIで問題集を作る
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="閉じる"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 sm:px-5 pt-3 pb-2 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <ol aria-label="作成ステップ" className="grid grid-cols-2 gap-2 text-xs">
            <li
              aria-current={step === 'prompt' ? 'step' : undefined}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 font-semibold ${
                step === 'prompt'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {step === 'paste' ? (
                <Check className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/20 text-[11px] shrink-0">
                  1
                </span>
              )}
              <span>プロンプトをコピー</span>
            </li>
            <li
              aria-current={step === 'paste' ? 'step' : undefined}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 font-semibold ${
                step === 'paste'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-500 border border-slate-200'
              }`}
            >
              <span
                className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[11px] shrink-0 ${
                  step === 'paste' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                2
              </span>
              <span>結果を貼り付け</span>
            </li>
          </ol>
        </div>

        {step === 'prompt' ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 space-y-2.5">
              <p className="text-sm font-bold text-slate-900">
                ChatGPT を使ってスマホやPCから問題集を作成できます
              </p>
              <ol className="text-sm text-slate-700 space-y-1.5">
                <li>① 下のボタンで ChatGPT 用のプロンプトをコピーします</li>
                <li>② ChatGPT に貼り付けて問題を作ってもらい、出力結果を次の画面に貼り付けます</li>
              </ol>
              <p className="text-xs text-slate-500">
                ※ テンプレートファイルのダウンロードや添付は不要です。出力はコピーしやすい形式で生成されます。
              </p>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  void handleCopyPromptAndProceed();
                }}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-base font-semibold shadow-sm transition-all cursor-pointer"
              >
                <Sparkles className="w-5 h-5 shrink-0" />
                <span>ChatGPT用のプロンプトをコピー</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1">
                <button
                  type="button"
                  aria-expanded={promptPreviewOpen}
                  onClick={() => setPromptPreviewOpen((prev) => !prev)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>
                    {promptPreviewOpen ? 'プロンプトの内容を隠す' : 'プロンプトの内容を確認する'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleSkipToPaste}
                  className="text-xs font-medium text-indigo-700 hover:text-indigo-800 underline underline-offset-2 text-center sm:text-right cursor-pointer"
                >
                  すでに生成結果をお持ちの場合はこちら（貼り付け画面へ進む）
                </button>
              </div>
            </div>

            {promptPreviewOpen && (
              <PromptPreviewBox textareaId="ai-step1-prompt-preview" fallbackNotice={null} />
            )}

            <div className="flex items-center justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            <section
              aria-label="プロンプト再コピー"
              className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5 space-y-2.5"
            >
              {copiedFromStep1 ? (
                <div role="status" className="flex items-start gap-2 text-xs sm:text-sm text-emerald-800 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    プロンプトをコピーしました。ChatGPT に貼り付けて問題を作成し、結果を下に貼り付けてください。
                  </span>
                </div>
              ) : (
                !promptFallbackNotice && (
                  <p className="text-xs text-slate-600">
                    コピーをやり直したい場合・誤って別の文章をコピーした場合も、ここからすぐ再コピーできます。
                  </p>
                )
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleRecopyPrompt();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white transition-colors cursor-pointer"
                >
                  {copiedPrompt ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>コピーしました</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>ChatGPT用のプロンプトをコピー</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  aria-expanded={promptPreviewOpen}
                  onClick={() => setPromptPreviewOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-white border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{promptPreviewOpen ? 'プロンプトを隠す' : 'プロンプトを確認'}</span>
                </button>
              </div>

              {promptPreviewOpen && (
                <PromptPreviewBox
                  textareaId="ai-step2-prompt-preview"
                  fallbackNotice={promptFallbackNotice}
                />
              )}
            </section>

            <div>
              <label
                htmlFor="ai-quiz-title"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                問題集タイトル
              </label>
              <input
                id="ai-quiz-title"
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="例: AWS 基礎問題集（JSON貼り付け時は自動入力）"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <QuizTextPastePanel
              inputId="ai-quiz-paste-input"
              pastedText={pastedText}
              clipboardNotice={clipboardNotice}
              onChangeText={applyPastedText}
              onPasteFromClipboard={() => {
                void handlePasteFromClipboard();
              }}
            />

            <QuizImportFeedback
              errors={pasteErrors}
              questionCount={pasteQuestions.length}
              rowLabelUnit={rowLabelUnit}
            />

            {saveError && (
              <p role="alert" className="text-sm text-rose-600">
                {saveError}
              </p>
            )}

            <div className="sticky bottom-0 bg-white flex items-center justify-end gap-3 pt-3 pb-1 border-t border-slate-100">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={!canSave}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-sm font-semibold text-white transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
