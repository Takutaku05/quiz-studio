import type { CellValue, SheetData } from 'read-excel-file/universal';
import {
  type CsvParseResult,
  type CsvValidationError,
  decodeCsvBuffer,
  parseAndValidateCsv,
  readFileAsArrayBuffer,
  REQUIRED_CSV_HEADERS,
  type RawQuestionRowEntry,
  validateQuestionRows,
} from './csvParser';
import { parseAndValidateJson } from './jsonParser';
import type { ParsedQuestion } from './types';

export const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const MAX_UPLOAD_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const FILE_TOO_LARGE_MESSAGE =
  'ファイルサイズが大きすぎます（上限 5MB）。5MB 以下のファイルを選択してください。';

export interface ParsedSheetResult {
  name: string;
  result: CsvParseResult;
}

export interface XlsxParseResult {
  ok: boolean;
  sheets: ParsedSheetResult[];
  selectedSheetName: string | null;
  questions: ParsedQuestion[];
  errors: CsvValidationError[];
}

export type QuizUploadSourceType = 'csv' | 'xlsx' | 'json';

export interface QuizUploadParseResult extends XlsxParseResult {
  sourceType: QuizUploadSourceType;
  suggestedTitle: string | null;
}

function cellValueToString(value: CellValue | Date | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return '';
    }
    const iso = value.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }
  return String(value);
}

function extractHeadersFromRow(headerRow: SheetData[number] | undefined): {
  headers: string[];
  columnMappings: Array<{ colIndex: number; header: string }>;
} {
  const columnMappings: Array<{ colIndex: number; header: string }> = [];
  const seenHeaders = new Set<string>();
  (headerRow ?? []).forEach((cell, colIndex) => {
    const header = cellValueToString(cell).trim();
    if (header && !seenHeaders.has(header)) {
      seenHeaders.add(header);
      columnMappings.push({ colIndex, header });
    }
  });
  return {
    headers: columnMappings.map((m) => m.header),
    columnMappings,
  };
}

export function parseXlsxSheetData(sheetData: SheetData): CsvParseResult {
  const hasAnyContent = sheetData.some((row) =>
    row.some((cell) => cellValueToString(cell).trim() !== ''),
  );

  if (!hasAnyContent) {
    return {
      ok: false,
      questions: [],
      errors: [{ row: 1, message: 'シートが空です。' }],
    };
  }

  const { headers, columnMappings } = extractHeadersFromRow(sheetData[0]);

  const entries: RawQuestionRowEntry[] = [];
  for (let rowIndex = 1; rowIndex < sheetData.length; rowIndex += 1) {
    const row = sheetData[rowIndex] ?? [];
    const isBlankRow = row.every((cell) => cellValueToString(cell).trim() === '');
    if (isBlankRow) {
      continue;
    }

    const data: Record<string, string | undefined> = {};
    for (const { colIndex, header } of columnMappings) {
      data[header] = cellValueToString(row[colIndex]);
    }

    entries.push({
      rowNumber: rowIndex + 1, // 1-based Excel row number (header row = 1)
      data,
    });
  }

  return validateQuestionRows(headers, entries);
}

function pickDefaultSheet(
  parsedSheets: ParsedSheetResult[],
  rawSheets: Array<{ sheet: string; data: SheetData }>,
): ParsedSheetResult {
  const validSheet = parsedSheets.find((sheet) => sheet.result.ok);
  if (validSheet) {
    return validSheet;
  }

  const sheetWithRequiredHeaders = parsedSheets.find((_, index) => {
    const { headers } = extractHeadersFromRow(rawSheets[index]?.data[0]);
    return REQUIRED_CSV_HEADERS.every((required) => headers.includes(required));
  });
  if (sheetWithRequiredHeaders) {
    return sheetWithRequiredHeaders;
  }

  return parsedSheets[0];
}

export async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<XlsxParseResult> {
  try {
    const { default: readXlsxFile } = await import('read-excel-file/universal');
    const rawSheets = await readXlsxFile(buffer);

    if (!rawSheets || rawSheets.length === 0) {
      return {
        ok: false,
        sheets: [],
        selectedSheetName: null,
        questions: [],
        errors: [{ row: 1, message: 'Excelファイルにシートが見つかりませんでした。' }],
      };
    }

    const parsedSheets: ParsedSheetResult[] = rawSheets.map((sheet) => ({
      name: sheet.sheet,
      result: parseXlsxSheetData(sheet.data),
    }));

    const selected = pickDefaultSheet(parsedSheets, rawSheets);

    return {
      ok: selected.result.ok,
      sheets: parsedSheets,
      selectedSheetName: selected.name,
      questions: selected.result.questions,
      errors: selected.result.errors,
    };
  } catch {
    return {
      ok: false,
      sheets: [],
      selectedSheetName: null,
      questions: [],
      errors: [
        {
          row: 1,
          message:
            'Excel（.xlsx）ファイルの読み込みに失敗しました。有効な .xlsx ファイルか確認してください。',
        },
      ],
    };
  }
}

function inferUploadSourceType(file: File): QuizUploadSourceType {
  const lowerName = file.name.trim().toLowerCase();
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || file.type === XLSX_MIME_TYPE) {
    return 'xlsx';
  }
  if (lowerName.endsWith('.json') || file.type === 'application/json' || file.type === 'text/json') {
    return 'json';
  }
  return 'csv';
}

export async function parseXlsxFile(file: File): Promise<XlsxParseResult> {
  if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
    return {
      ok: false,
      sheets: [],
      selectedSheetName: null,
      questions: [],
      errors: [{ row: 1, message: FILE_TOO_LARGE_MESSAGE }],
    };
  }
  const buffer = await readFileAsArrayBuffer(file);
  return parseXlsxBuffer(buffer);
}

function isZipMagicBytes(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 4));
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

export async function parseQuizUploadFile(file: File): Promise<QuizUploadParseResult> {
  if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
    return {
      ok: false,
      sourceType: inferUploadSourceType(file),
      suggestedTitle: null,
      sheets: [],
      selectedSheetName: null,
      questions: [],
      errors: [{ row: 1, message: FILE_TOO_LARGE_MESSAGE }],
    };
  }

  const lowerName = file.name.trim().toLowerCase();

  if (lowerName.endsWith('.xls')) {
    return {
      ok: false,
      sourceType: 'xlsx',
      suggestedTitle: null,
      sheets: [],
      selectedSheetName: null,
      questions: [],
      errors: [
        {
          row: 1,
          message:
            '旧形式の .xls には対応していません。Excel や Google スプレッドシートで .xlsx 形式として保存し直してください。',
        },
      ],
    };
  }

  if (lowerName.endsWith('.xlsx') || file.type === XLSX_MIME_TYPE) {
    const result = await parseXlsxFile(file);
    return {
      ...result,
      sourceType: 'xlsx',
      suggestedTitle: null,
    };
  }

  const hasExtension = /\.[a-z0-9]+$/i.test(lowerName);
  if (
    lowerName.endsWith('.json') ||
    (!hasExtension && (file.type === 'application/json' || file.type === 'text/json'))
  ) {
    const buffer = await readFileAsArrayBuffer(file);
    const jsonResult = parseAndValidateJson(decodeCsvBuffer(buffer));
    return {
      ...jsonResult,
      sourceType: 'json',
      sheets: [],
      selectedSheetName: null,
    };
  }

  if (lowerName.endsWith('.csv') || (!hasExtension && (file.type === 'text/csv' || file.type === 'text/plain'))) {
    const buffer = await readFileAsArrayBuffer(file);
    const csvResult = parseAndValidateCsv(decodeCsvBuffer(buffer));
    return {
      ...csvResult,
      sourceType: 'csv',
      suggestedTitle: null,
      sheets: [],
      selectedSheetName: null,
    };
  }

  if (!hasExtension) {
    const buffer = await readFileAsArrayBuffer(file);
    if (isZipMagicBytes(buffer)) {
      const xlsxResult = await parseXlsxBuffer(buffer);
      return {
        ...xlsxResult,
        sourceType: 'xlsx',
        suggestedTitle: null,
      };
    }
    const csvResult = parseAndValidateCsv(decodeCsvBuffer(buffer));
    return {
      ...csvResult,
      sourceType: 'csv',
      suggestedTitle: null,
      sheets: [],
      selectedSheetName: null,
    };
  }

  return {
    ok: false,
    sourceType: 'csv',
    suggestedTitle: null,
    sheets: [],
    selectedSheetName: null,
    questions: [],
    errors: [
      {
        row: 1,
        message: '対応しているファイル形式は CSV（.csv）、Excel（.xlsx）、JSON（.json）です。',
      },
    ],
  };
}
