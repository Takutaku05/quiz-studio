import { AlertCircle, CheckCircle2, ClipboardPaste } from 'lucide-react';
import { CHATGPT_PROJECT_PROMPT } from '../domain/chatgptPrompt';
import type { CsvValidationError } from '../domain/csvParser';

export const PROMPT_MANUAL_COPY_FALLBACK_NOTICE =
  '自動コピーできない場合は、下のプロンプト本文をすべて選択してコピーしてください。';

interface PromptPreviewBoxProps {
  textareaId: string;
  fallbackNotice: string | null;
}

export function PromptPreviewBox({ textareaId, fallbackNotice }: PromptPreviewBoxProps) {
  return (
    <div className="rounded-lg border border-indigo-200 bg-white p-3 space-y-2">
      {fallbackNotice && (
        <p className="text-xs text-amber-700 font-medium">{fallbackNotice}</p>
      )}
      <label htmlFor={textareaId} className="block text-xs font-semibold text-slate-700">
        ChatGPT用プロンプト本文
      </label>
      <textarea
        id={textareaId}
        readOnly
        rows={6}
        value={CHATGPT_PROJECT_PROMPT}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  );
}

interface QuizTextPastePanelProps {
  inputId: string;
  pastedText: string;
  clipboardNotice: string | null;
  onChangeText: (text: string) => void;
  onPasteFromClipboard: () => void;
}

export function QuizTextPastePanel({
  inputId,
  pastedText,
  clipboardNotice,
  onChangeText,
  onPasteFromClipboard,
}: QuizTextPastePanelProps) {
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPasteFromClipboard}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-sm font-semibold transition-colors cursor-pointer"
        >
          <ClipboardPaste className="w-4 h-4" />
          <span>クリップボードから貼り付け</span>
        </button>
        {pastedText && (
          <button
            type="button"
            onClick={() => onChangeText('')}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            入力をクリア
          </button>
        )}
      </div>

      {clipboardNotice && (
        <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          {clipboardNotice}
        </p>
      )}

      <div>
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-1">
          問題データ（JSON / CSV テキスト）
        </label>
        <textarea
          id={inputId}
          rows={6}
          value={pastedText}
          onChange={(e) => onChangeText(e.target.value)}
          placeholder={
            'ChatGPT の回答をそのまま貼り付けてください（前後の文章や ```json / ```csv ごとでも取り込めます）'
          }
          className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
    </div>
  );
}

interface QuizImportFeedbackProps {
  parsing?: boolean;
  errors: CsvValidationError[];
  questionCount: number;
  rowLabelUnit: '問目' | '行目';
}

export function QuizImportFeedback({
  parsing = false,
  errors,
  questionCount,
  rowLabelUnit,
}: QuizImportFeedbackProps) {
  return (
    <>
      {parsing && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-sm text-slate-600">
          ファイルを読み込み中...
        </div>
      )}

      {errors.length > 0 && (
        <div role="alert" className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>読み込みエラーがあります（{errors.length}件）</span>
          </div>
          <ul className="text-xs text-rose-700 space-y-1 max-h-40 overflow-y-auto list-disc list-inside">
            {errors.map((err, idx) => (
              <li key={`${err.row}-${idx}`}>
                {err.row}
                {rowLabelUnit}: {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {questionCount > 0 && errors.length === 0 && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{questionCount}問の問題を読み込みました。</span>
        </div>
      )}
    </>
  );
}
