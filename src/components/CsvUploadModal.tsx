import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from 'lucide-react';
import { REQUIRED_CSV_HEADERS, type CsvValidationError } from '../domain/csvParser';
import {
  buildCsvTemplateContent,
  CSV_COLUMN_GUIDES,
  CSV_TEMPLATE_SAMPLE_ROWS,
  downloadCsvTemplate,
} from '../domain/csvTemplate';
import {
  parseQuizUploadFile,
  type ParsedSheetResult,
  XLSX_MIME_TYPE,
} from '../domain/xlsxParser';
import { downloadXlsxTemplate } from '../domain/xlsxTemplate';
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
  const [sheets, setSheets] = useState<ParsedSheetResult[]>([]);
  const [selectedSheetName, setSelectedSheetName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [downloadingXlsx, setDownloadingXlsx] = useState(false);
  const parseRequestIdRef = useRef(0);

  useEffect(() => {
    if (!copiedTemplate) return;
    const timer = window.setTimeout(() => setCopiedTemplate(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copiedTemplate]);

  if (!isOpen) return null;

  const resetState = () => {
    parseRequestIdRef.current += 1;
    setTitle('');
    setFileName(null);
    setQuestions([]);
    setErrors([]);
    setSheets([]);
    setSelectedSheetName(null);
    setParsing(false);
    setSaveError(null);
    setSaving(false);
    setCopiedTemplate(false);
    setDownloadingXlsx(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleCopyTemplate = async () => {
    const content = buildCsvTemplateContent();
    try {
      await navigator.clipboard?.writeText(content);
      setCopiedTemplate(true);
    } catch {
      // Clipboard API may be unavailable or denied in some contexts.
    }
  };

  const handleDownloadXlsxTemplate = async () => {
    if (downloadingXlsx) return;
    setDownloadingXlsx(true);
    try {
      await downloadXlsxTemplate();
    } catch {
      setSaveError('テンプレートExcelの生成に失敗しました。');
    } finally {
      setDownloadingXlsx(false);
    }
  };

  const handleSheetChange = (sheetName: string) => {
    const matched = sheets.find((sheet) => sheet.name === sheetName);
    if (!matched) return;
    setSelectedSheetName(matched.name);
    if (matched.result.ok) {
      setQuestions(matched.result.questions);
      setErrors([]);
    } else {
      setQuestions([]);
      setErrors(matched.result.errors);
    }
  };

  const processFile = async (file: File) => {
    const requestId = ++parseRequestIdRef.current;
    setFileName(file.name);
    setSaveError(null);
    setParsing(true);
    setQuestions([]);
    setErrors([]);
    setSheets([]);
    setSelectedSheetName(null);

    const defaultTitle = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
    setTitle(defaultTitle);

    try {
      const result = await parseQuizUploadFile(file);
      if (requestId !== parseRequestIdRef.current) {
        return;
      }

      setParsing(false);
      setSheets(result.sheets);
      setSelectedSheetName(result.selectedSheetName);

      if (result.ok) {
        setQuestions(result.questions);
        setErrors([]);
      } else {
        setQuestions([]);
        setErrors(result.errors);
      }
    } catch (err) {
      if (requestId !== parseRequestIdRef.current) {
        return;
      }
      setParsing(false);
      setQuestions([]);
      setErrors([
        {
          row: 1,
          message:
            err instanceof Error ? err.message : 'ファイルの読み込みに失敗しました。',
        },
      ]);
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
    !parsing &&
    title.trim().length > 0 &&
    questions.length > 0 &&
    errors.length === 0 &&
    !saving;

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
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 id="csv-upload-title" className="text-lg font-bold text-slate-900">
            新規問題集アップロード
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
              CSV または Excel（.xlsx）ファイルをドラッグ＆ドロップ
            </p>
            <p className="text-xs text-slate-500 mt-1 mb-3">
              必須ヘッダー: {REQUIRED_CSV_HEADERS.join(', ')}
            </p>
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-100 cursor-pointer">
              <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
              <span>ファイルを選択（.csv / .xlsx）</span>
              <input
                type="file"
                accept={`.csv,text/csv,.xlsx,${XLSX_MIME_TYPE}`}
                aria-label="ファイルを選択"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
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

          {sheets.length > 1 && (
            <div>
              <label
                htmlFor="xlsx-sheet-select"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                読み込むシート
              </label>
              <select
                id="xlsx-sheet-select"
                value={selectedSheetName ?? ''}
                onChange={(e) => handleSheetChange(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {sheets.map((sheet) => (
                  <option key={sheet.name} value={sheet.name}>
                    {sheet.name}（
                    {sheet.result.ok
                      ? `${sheet.result.questions.length}問`
                      : '形式未一致'}
                    ）
                  </option>
                ))}
              </select>
            </div>
          )}

          {parsing && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-sm text-slate-600">
              ファイルを読み込み中...
            </div>
          )}

          {errors.length > 0 && (
            <div
              role="alert"
              className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 space-y-2"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-800">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>読み込みエラーがあります（{errors.length}件）</span>
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

          <section
            aria-label="鋳型（テンプレート）と書き方"
            className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  鋳型（テンプレート）と書き方
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  見本ファイルをダウンロードして書き換えるとすぐ作成できます（.xlsx / CSV UTF-8・Shift-JIS 対応）
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={downloadingXlsx}
                  onClick={() => {
                    void handleDownloadXlsxTemplate();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-indigo-200 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>
                    {downloadingXlsx
                      ? 'Excel作成中...'
                      : 'テンプレートExcel（.xlsx）をダウンロード'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={downloadCsvTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>テンプレートCSVをダウンロード</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  {copiedTemplate ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">コピーしました</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>サンプルCSVをコピー</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
              {CSV_COLUMN_GUIDES.map((col) => (
                <div
                  key={col.name}
                  className="flex items-start gap-2 rounded-lg bg-white border border-slate-200/80 px-2.5 py-1.5"
                >
                  <code className="font-mono font-semibold text-indigo-700 shrink-0">
                    {col.name}
                  </code>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                      col.required
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {col.required ? '必須' : '任意'}
                  </span>
                  <span className="text-slate-600 leading-snug">{col.description}</span>
                </div>
              ))}
            </div>

            <div>
              <p className="text-xs font-medium text-slate-600 mb-1.5">記入例（1行目はヘッダー固定）</p>
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full text-[11px] text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-mono">
                    <tr>
                      {REQUIRED_CSV_HEADERS.map((header) => (
                        <th key={header} className="px-2 py-1.5 border-b border-slate-200 whitespace-nowrap">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {CSV_TEMPLATE_SAMPLE_ROWS.slice(0, 2).map((row, idx) => (
                      <tr key={idx}>
                        {REQUIRED_CSV_HEADERS.map((col) => (
                          <td
                            key={col}
                            className="px-2 py-1.5 whitespace-nowrap max-w-[160px] truncate"
                            title={row[col]}
                          >
                            {row[col] || <span className="text-slate-300">（空欄）</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

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
