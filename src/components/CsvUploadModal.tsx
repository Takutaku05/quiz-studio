import { useState, type DragEvent, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';
import { parseCsvFile, type CsvValidationError } from '../domain/csvParser';
import type { ParsedQuestion } from '../domain/types';

interface CsvUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, questions: ParsedQuestion[]) => Promise<void>;
}

export function CsvUploadModal({ isOpen, onClose, onSave }: CsvUploadModalProps) {
  const [title, setTitle] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [errors, setErrors] = useState<CsvValidationError[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetState = () => {
    setTitle('');
    setFileName(null);
    setQuestions([]);
    setErrors([]);
    setSaveError(null);
    setSaving(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const processFile = async (file: File) => {
    setFileName(file.name);
    setSaveError(null);
    const defaultTitle = file.name.replace(/\.csv$/i, '');
    setTitle((prev) => (prev.trim() === '' ? defaultTitle : defaultTitle));

    const result = await parseCsvFile(file);
    if (result.ok) {
      setQuestions(result.questions);
      setErrors([]);
    } else {
      setQuestions([]);
      setErrors(result.errors);
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const canSave =
    title.trim().length > 0 && questions.length > 0 && errors.length === 0 && !saving;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(title.trim(), questions);
      resetState();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存に失敗しました。');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-upload-title"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 id="csv-upload-title" className="text-lg font-bold text-slate-900">
            新規CSVアップロード
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="閉じる"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label
              htmlFor="quiz-title"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              問題集タイトル
            </label>
            <input
              id="quiz-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: AWS 基礎問題集"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-slate-300 bg-slate-50 hover:border-indigo-400'
            }`}
          >
            <Upload className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">
              CSVファイルをドラッグ＆ドロップ
            </p>
            <p className="text-xs text-slate-500 mt-1 mb-3">
              必須ヘッダー: question, choice1, choice2, choice3, choice4, answer, explanation
            </p>
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-100 cursor-pointer">
              <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
              <span>CSVファイルを選択</span>
              <input
                type="file"
                accept=".csv,text/csv"
                aria-label="CSVファイルを選択"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    await processFile(file);
                  }
                }}
              />
            </label>
            {fileName && (
              <p className="mt-2 text-xs text-slate-600">選択中: {fileName}</p>
            )}
          </div>

          {errors.length > 0 && (
            <div
              role="alert"
              className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 space-y-2"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-800">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>CSVにエラーがあります（{errors.length}件）</span>
              </div>
              <ul className="text-xs text-rose-700 space-y-1 max-h-40 overflow-y-auto list-disc list-inside">
                {errors.map((err, idx) => (
                  <li key={`${err.row}-${idx}`}>
                    {err.row}行目: {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {questions.length > 0 && errors.length === 0 && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 flex items-center gap-2 text-sm text-emerald-800">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{questions.length}問の問題を読み込みました。</span>
            </div>
          )}

          {saveError && (
            <p role="alert" className="text-sm text-rose-600">
              {saveError}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
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
      </div>
    </div>
  );
}
