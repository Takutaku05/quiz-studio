import {
  type CsvParseResult,
  type CsvValidationError,
  parseAndValidateCsv,
  type RawQuestionRowEntry,
  REQUIRED_CSV_HEADERS,
  validateQuestionRows,
} from './csvParser';

export interface JsonParseResult extends CsvParseResult {
  suggestedTitle: string | null;
}

export interface TextImportParseResult extends JsonParseResult {
  format: 'json' | 'csv';
}

const STRING_FIELDS = [
  'question',
  'choice1',
  'choice2',
  'choice3',
  'choice4',
  'explanation',
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Extracts Markdown fenced code blocks from text.
 * Also supports truncated blocks missing their closing fence (e.g. long mobile ChatGPT outputs).
 */
function extractCodeBlocks(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const blocks: string[] = [];

  let activeFence: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (activeFence === null) {
      const openMatch = line.match(/^[ \t]*(`{3,})[a-zA-Z0-9_-]*[ \t]*(.*)$/);
      if (openMatch) {
        const fence = openMatch[1];
        const trailing = openMatch[2] ?? '';
        if (trailing && trailing.endsWith(fence) && trailing.length > fence.length) {
          blocks.push(trailing.slice(0, -fence.length).trim());
        } else {
          activeFence = fence;
          currentLines = trailing ? [trailing] : [];
        }
      }
      continue;
    }

    const closeMatch = line.match(/^[ \t]*(`{3,})[ \t]*$/);
    if (closeMatch && closeMatch[1].length >= activeFence.length) {
      blocks.push(currentLines.join('\n').trim());
      activeFence = null;
      currentLines = [];
      continue;
    }

    currentLines.push(line);
  }

  if (activeFence !== null) {
    blocks.push(currentLines.join('\n').trim());
  }

  return blocks;
}

function toRawTextValue(
  value: unknown,
  field: string,
  rowNumber: number,
  errors: CsvValidationError[],
): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : undefined;
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  errors.push({
    row: rowNumber,
    field,
    message: `${field} は文字列で指定してください。`,
  });
  return undefined;
}

function toRawAnswerValue(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'invalid';
  }
  return 'invalid';
}

export function parseAndValidateJson(text: string): JsonParseResult {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    return {
      ok: false,
      suggestedTitle: null,
      questions: [],
      errors: [{ row: 1, message: 'JSONデータが空です。' }],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      suggestedTitle: null,
      questions: [],
      errors: [
        {
          row: 1,
          message:
            'JSONの形式が正しくありません。括弧・カンマ・引用符の抜けがないか確認してください。',
        },
      ],
    };
  }

  let suggestedTitle: string | null = null;
  let rawItems: unknown[];

  if (Array.isArray(parsed)) {
    rawItems = parsed;
  } else if (isPlainObject(parsed)) {
    if (typeof parsed.title === 'string' && parsed.title.trim().length > 0) {
      suggestedTitle = parsed.title.trim();
    }
    if (!Array.isArray(parsed.questions)) {
      return {
        ok: false,
        suggestedTitle,
        questions: [],
        errors: [
          {
            row: 1,
            message:
              'JSONは問題の配列、または { "title": "...", "questions": [...] } の形式で指定してください。',
          },
        ],
      };
    }
    rawItems = parsed.questions;
  } else {
    return {
      ok: false,
      suggestedTitle: null,
      questions: [],
      errors: [
        {
          row: 1,
          message:
            'JSONは問題の配列、または { "title": "...", "questions": [...] } の形式で指定してください。',
        },
      ],
    };
  }

  if (rawItems.length === 0) {
    const emptyRes = validateQuestionRows([...REQUIRED_CSV_HEADERS], []);
    return {
      ...emptyRes,
      suggestedTitle,
    };
  }

  const preErrors: CsvValidationError[] = [];
  const entries: RawQuestionRowEntry[] = [];

  rawItems.forEach((item, index) => {
    const rowNumber = index + 1;
    if (!isPlainObject(item)) {
      preErrors.push({
        row: rowNumber,
        message: '各問題データは JSON オブジェクト形式で指定してください。',
      });
      return;
    }

    const rowData: Record<string, string | undefined> = {
      answer: toRawAnswerValue(item.answer),
    };
    for (const field of STRING_FIELDS) {
      rowData[field] = toRawTextValue(item[field], field, rowNumber, preErrors);
    }

    entries.push({
      rowNumber,
      data: rowData,
    });
  });

  if (entries.length === 0) {
    return {
      ok: false,
      suggestedTitle,
      questions: [],
      errors: preErrors,
    };
  }

  const validationResult = validateQuestionRows([...REQUIRED_CSV_HEADERS], entries);
  if (preErrors.length > 0) {
    const combinedErrors = [...preErrors, ...validationResult.errors].sort(
      (a, b) => a.row - b.row,
    );
    return {
      ok: false,
      suggestedTitle,
      questions: [],
      errors: combinedErrors,
    };
  }

  return {
    ...validationResult,
    suggestedTitle,
  };
}

function parseSinglePayload(payload: string): TextImportParseResult {
  const trimmed = payload.replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    return {
      ok: false,
      format: 'csv',
      suggestedTitle: null,
      questions: [],
      errors: [{ row: 1, message: '入力テキストが空です。' }],
    };
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const jsonResult = parseAndValidateJson(trimmed);
    return {
      ...jsonResult,
      format: 'json',
    };
  }

  const csvResult = parseAndValidateCsv(trimmed);
  return {
    ...csvResult,
    format: 'csv',
    suggestedTitle: null,
  };
}

function resolveBlockCandidates(text: string): {
  blocks: string[];
  results: TextImportParseResult[];
  chosenIndex: number;
} {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  const blocks = extractCodeBlocks(trimmed);
  if (blocks.length === 0) {
    return {
      blocks: [trimmed],
      results: [parseSinglePayload(trimmed)],
      chosenIndex: 0,
    };
  }

  const results = blocks.map((block) => parseSinglePayload(block));
  const validIndex = results.findIndex((res) => res.ok);
  return {
    blocks,
    results,
    chosenIndex: validIndex >= 0 ? validIndex : 0,
  };
}

export function extractImportPayloadFromText(text: string): string {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return '';
  const { blocks, chosenIndex } = resolveBlockCandidates(trimmed);
  return blocks[chosenIndex]?.trim() ?? '';
}

export function parseQuizTextInput(text: string): TextImportParseResult {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    return {
      ok: false,
      format: 'csv',
      suggestedTitle: null,
      questions: [],
      errors: [{ row: 1, message: '入力テキストが空です。' }],
    };
  }

  const { results, chosenIndex } = resolveBlockCandidates(trimmed);
  return results[chosenIndex];
}
