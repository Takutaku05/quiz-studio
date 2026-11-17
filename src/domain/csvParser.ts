import Papa from 'papaparse';
import type { AnswerNumber, ParsedQuestion } from './types';

export const REQUIRED_CSV_HEADERS = [
  'question',
  'choice1',
  'choice2',
  'choice3',
  'choice4',
  'answer',
  'explanation',
] as const;

export interface CsvValidationError {
  row: number;
  field?: string;
  message: string;
}

export interface CsvParseResult {
  ok: boolean;
  questions: ParsedQuestion[];
  errors: CsvValidationError[];
}

export function decodeCsvBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('shift_jis').decode(bytes);
  }
  return text.replace(/^\uFEFF/, '');
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('ファイルの読み込みに失敗しました。'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('ファイルの読み込みに失敗しました。'));
    reader.readAsArrayBuffer(file);
  });
}

export async function parseCsvFile(file: File): Promise<CsvParseResult> {
  const buffer = await readFileAsArrayBuffer(file);
  const csvText = decodeCsvBuffer(buffer);
  return parseAndValidateCsv(csvText);
}

type RawCsvRow = Record<string, string | undefined>;

export interface RawQuestionRowEntry {
  rowNumber: number;
  data: RawCsvRow;
}

export function validateQuestionRows(
  headers: string[],
  entries: RawQuestionRowEntry[],
): CsvParseResult {
  const missingHeaders = REQUIRED_CSV_HEADERS.filter(
    (requiredHeader) => !headers.includes(requiredHeader),
  );

  if (missingHeaders.length > 0) {
    return {
      ok: false,
      questions: [],
      errors: [
        {
          row: 1,
          message: `必須ヘッダーが不足しています: ${missingHeaders.join(', ')}`,
        },
      ],
    };
  }

  if (entries.length === 0) {
    return {
      ok: false,
      questions: [],
      errors: [{ row: 1, message: '問題データが1件もありません。' }],
    };
  }

  const errors: CsvValidationError[] = [];
  const questions: ParsedQuestion[] = [];

  for (const { rowNumber, data: rawRow } of entries) {
    const questionText = (rawRow.question ?? '').trim();
    const choice1 = (rawRow.choice1 ?? '').trim();
    const choice2 = (rawRow.choice2 ?? '').trim();
    const choice3 = (rawRow.choice3 ?? '').trim();
    const choice4 = (rawRow.choice4 ?? '').trim();
    const answerRaw = (rawRow.answer ?? '').trim();
    const explanation = (rawRow.explanation ?? '').trim();

    let rowHasError = false;

    if (!questionText) {
      errors.push({ row: rowNumber, field: 'question', message: '問題文(question)が必須です。' });
      rowHasError = true;
    }
    if (!choice1) {
      errors.push({ row: rowNumber, field: 'choice1', message: '選択肢1(choice1)が必須です。' });
      rowHasError = true;
    }
    if (!choice2) {
      errors.push({ row: rowNumber, field: 'choice2', message: '選択肢2(choice2)が必須です。' });
      rowHasError = true;
    }
    if (!choice3 && choice4) {
      errors.push({
        row: rowNumber,
        field: 'choice3',
        message: '選択肢4を入力する場合は、先に選択肢3を埋めてください。',
      });
      rowHasError = true;
    }

    if (!answerRaw) {
      errors.push({ row: rowNumber, field: 'answer', message: '正解番号(answer)が必須です。' });
      rowHasError = true;
    } else if (!/^[1-4]$/.test(answerRaw)) {
      errors.push({
        row: rowNumber,
        field: 'answer',
        message: '正解番号(answer)は半角数字の 1〜4 で指定してください。',
      });
      rowHasError = true;
    } else {
      const answerNum = Number(answerRaw) as AnswerNumber;
      const choicesMap: Record<AnswerNumber, string> = {
        1: choice1,
        2: choice2,
        3: choice3,
        4: choice4,
      };
      if (!choicesMap[answerNum]) {
        errors.push({
          row: rowNumber,
          field: 'answer',
          message: `正解番号(${answerNum})に対応する選択肢${answerNum}が空欄です。`,
        });
        rowHasError = true;
      }

      if (!rowHasError) {
        questions.push({
          question: questionText,
          choice1,
          choice2,
          choice3: choice3 || null,
          choice4: choice4 || null,
          answer: answerNum,
          explanation: explanation || null,
        });
      }
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      questions: [],
      errors,
    };
  }

  return {
    ok: true,
    questions,
    errors: [],
  };
}

export function parseAndValidateCsv(csvText: string): CsvParseResult {
  const trimmedInput = csvText.replace(/^\uFEFF/, '').trim();
  if (!trimmedInput) {
    return {
      ok: false,
      questions: [],
      errors: [{ row: 1, message: 'CSVファイルが空です。' }],
    };
  }

  const parsed = Papa.parse<RawCsvRow>(trimmedInput, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const entries: RawQuestionRowEntry[] = parsed.data.map((data, index) => ({
    rowNumber: index + 2, // 1-based row number including header row
    data,
  }));

  return validateQuestionRows(headers, entries);
}
