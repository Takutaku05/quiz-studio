import { REQUIRED_CSV_HEADERS } from './csvParser';

export const CSV_TEMPLATE_FILENAME = 'quiz_template.csv';

export interface CsvColumnGuide {
  name: (typeof REQUIRED_CSV_HEADERS)[number];
  label: string;
  required: boolean;
  description: string;
}

export const CSV_COLUMN_GUIDES: readonly CsvColumnGuide[] = [
  {
    name: 'question',
    label: '問題文',
    required: true,
    description: '出題する問題文（1文字以上）',
  },
  {
    name: 'choice1',
    label: '選択肢1',
    required: true,
    description: '1つ目の選択肢（1文字以上）',
  },
  {
    name: 'choice2',
    label: '選択肢2',
    required: true,
    description: '2つ目の選択肢（1文字以上）',
  },
  {
    name: 'choice3',
    label: '選択肢3',
    required: false,
    description: '3つ目の選択肢（空欄で2択問題）',
  },
  {
    name: 'choice4',
    label: '選択肢4',
    required: false,
    description: '4つ目の選択肢（入力時は選択肢3も必須）',
  },
  {
    name: 'answer',
    label: '正解番号',
    required: true,
    description: '半角数字 1〜4（空欄の選択肢は指定不可）',
  },
  {
    name: 'explanation',
    label: '解説',
    required: false,
    description: '回答後に表示する解説文（空欄可）',
  },
] as const;

export interface CsvTemplateRow {
  question: string;
  choice1: string;
  choice2: string;
  choice3: string;
  choice4: string;
  answer: '1' | '2' | '3' | '4';
  explanation: string;
}

export const CSV_TEMPLATE_SAMPLE_ROWS: readonly CsvTemplateRow[] = [
  {
    question: '日本の首都はどこですか？',
    choice1: '東京',
    choice2: '大阪',
    choice3: '名古屋',
    choice4: '福岡',
    answer: '1',
    explanation: '日本の首都は東京です。（4択の例）',
  },
  {
    question: '太陽は東から昇る。',
    choice1: 'はい',
    choice2: 'いいえ',
    choice3: '',
    choice4: '',
    answer: '1',
    explanation: 'choice3・choice4を空欄にすると2択問題になります。',
  },
  {
    question: 'カンマ,や"引用符"を含む問題文の例です。どれが正しいですか？',
    choice1: '選択肢A',
    choice2: '選択肢B',
    choice3: '選択肢C',
    choice4: '',
    answer: '2',
    explanation: '',
  },
] as const;

export function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsvTemplateContent(): string {
  const headerLine = REQUIRED_CSV_HEADERS.join(',');
  const dataLines = CSV_TEMPLATE_SAMPLE_ROWS.map((row) =>
    REQUIRED_CSV_HEADERS.map((col) => escapeCsvCell(row[col])).join(','),
  );
  return [headerLine, ...dataLines].join('\r\n');
}

export const OBJECT_URL_REVOKE_DELAY_MS = 1000;

export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Delay revoking so browsers like Safari/Firefox finish starting the download first.
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_REVOKE_DELAY_MS);
}

export function downloadCsvTemplate(): void {
  const csvWithBom = `\uFEFF${buildCsvTemplateContent()}`;
  const blob = new Blob([csvWithBom], { type: 'text/csv;charset=utf-8;' });
  triggerFileDownload(blob, CSV_TEMPLATE_FILENAME);
}
