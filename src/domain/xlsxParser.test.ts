import { describe, expect, it } from 'vitest';
import writeXlsxFile, { type Sheet, type SheetData } from 'write-excel-file/universal';
import { readFileAsArrayBuffer } from './csvParser';
import { parseQuizUploadFile, parseXlsxBuffer, parseXlsxSheetData } from './xlsxParser';

async function buildXlsxFile(
  sheets: Sheet<Blob>[],
  filename = 'quiz.xlsx',
  mimeType = '',
): Promise<File> {
  const blob = await writeXlsxFile(sheets).toBlob();
  return new File([blob], filename, { type: mimeType });
}

describe('xlsxParser', () => {
  it('parses numeric, boolean, and Date cells accurately from .xlsx', async () => {
    const data: SheetData = [
      ['question', 'choice1', 'choice2', 'choice3', 'choice4', 'answer', 'explanation'],
      ['0と1のどちら？', 0, 1, null, null, 2, '数値セルのテスト'],
      ['真偽値のテスト', true, false, null, null, 1, null],
      ['日付セルのテスト', { value: new Date(Date.UTC(2026, 0, 15)), format: 'yyyy-mm-dd' }, '2026-02-01', null, null, 1, null],
    ];
    const file = await buildXlsxFile([{ sheet: 'Quiz', data }], 'types.xlsx');

    const result = await parseQuizUploadFile(file);
    expect(result.ok).toBe(true);
    expect(result.sourceType).toBe('xlsx');
    expect(result.questions).toEqual([
      {
        question: '0と1のどちら？',
        choice1: '0',
        choice2: '1',
        choice3: null,
        choice4: null,
        answer: 2,
        explanation: '数値セルのテスト',
      },
      {
        question: '真偽値のテスト',
        choice1: 'TRUE',
        choice2: 'FALSE',
        choice3: null,
        choice4: null,
        answer: 1,
        explanation: null,
      },
      {
        question: '日付セルのテスト',
        choice1: '2026-01-15',
        choice2: '2026-02-01',
        choice3: null,
        choice4: null,
        answer: 1,
        explanation: null,
      },
    ]);
  });

  it('skips completely blank rows while preserving exact 1-based Excel row numbers for errors', async () => {
    const data: SheetData = [
      ['question', 'choice1', 'choice2', 'choice3', 'choice4', 'answer', 'explanation'],
      ['Q1', 'A', 'B', null, null, 1, null],
      [null, null, null, null, null, null, null], // row 3 blank
      ['Q2', 'A', 'B', null, null, 3, null], // row 4 invalid: answer=3 with empty choice3
    ];
    const file = await buildXlsxFile([{ sheet: 'Sheet1', data }], 'blank-row.xlsx');
    const buffer = await readFileAsArrayBuffer(file);
    const result = await parseXlsxBuffer(buffer);

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(4);
    expect(result.errors[0].message).toContain('選択肢3が空欄です');
  });

  it('auto-selects the first valid quiz sheet in a multi-sheet workbook and retains all sheets', async () => {
    const coverSheet: SheetData = [['説明', 'メモ'], ['表紙シート', '問題ではありません']];
    const chapter1Sheet: SheetData = [
      ['question', 'choice1', 'choice2', 'choice3', 'choice4', 'answer', 'explanation'],
      ['第1章Q1', 'A', 'B', null, null, 1, null],
    ];
    const chapter2Sheet: SheetData = [
      ['question', 'choice1', 'choice2', 'choice3', 'choice4', 'answer', 'explanation'],
      ['第2章Q1', 'X', 'Y', 'Z', null, 2, null],
      ['第2章Q2', 'P', 'Q', null, null, 1, null],
    ];

    const file = await buildXlsxFile([
      { sheet: '表紙', data: coverSheet },
      { sheet: '第1章', data: chapter1Sheet },
      { sheet: '第2章', data: chapter2Sheet },
    ]);

    const result = await parseQuizUploadFile(file);
    expect(result.ok).toBe(true);
    expect(result.selectedSheetName).toBe('第1章');
    expect(result.questions).toHaveLength(1);
    expect(result.sheets).toHaveLength(3);
    expect(result.sheets[0].result.ok).toBe(false);
    expect(result.sheets[2].result.ok).toBe(true);
    expect(result.sheets[2].result.questions).toHaveLength(2);
  });

  it('reports empty sheet and missing headers accurately', () => {
    const emptyResult = parseXlsxSheetData([]);
    expect(emptyResult.ok).toBe(false);
    expect(emptyResult.errors[0].message).toContain('シートが空です');

    const headerOnlyResult = parseXlsxSheetData([
      ['question', 'choice1', 'choice2', 'choice3', 'choice4', 'answer', 'explanation'],
    ]);
    expect(headerOnlyResult.ok).toBe(false);
    expect(headerOnlyResult.errors[0].message).toContain('問題データが1件もありません');

    const missingHeaderResult = parseXlsxSheetData([
      ['question', 'choice1', 'choice2'],
      ['Q1', 'A', 'B'],
    ]);
    expect(missingHeaderResult.ok).toBe(false);
    expect(missingHeaderResult.errors[0].message).toContain('choice3');
  });

  it('handles .csv with Windows Excel MIME type, rejects .xls, unsupported extensions, and corrupt .xlsx', async () => {
    const csv = 'question,choice1,choice2,choice3,choice4,answer,explanation\nQ1,A,B,,,1,';
    const windowsCsvFile = new File([csv], 'win.csv', {
      type: 'application/vnd.ms-excel',
    });
    const csvResult = await parseQuizUploadFile(windowsCsvFile);
    expect(csvResult.ok).toBe(true);
    expect(csvResult.sourceType).toBe('csv');
    expect(csvResult.questions).toHaveLength(1);

    const xlsFile = new File(['dummy'], 'legacy.xls', {
      type: 'application/vnd.ms-excel',
    });
    const xlsResult = await parseQuizUploadFile(xlsFile);
    expect(xlsResult.ok).toBe(false);
    expect(xlsResult.errors[0].message).toContain('.xls');

    const txtFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    const txtResult = await parseQuizUploadFile(txtFile);
    expect(txtResult.ok).toBe(false);
    expect(txtResult.errors[0].message).toContain('.csv');

    const corruptXlsxFile = new File(['not-a-zip-archive'], 'corrupt.xlsx');
    const corruptResult = await parseQuizUploadFile(corruptXlsxFile);
    expect(corruptResult.ok).toBe(false);
    expect(corruptResult.errors[0].message).toContain('.xlsx');
  });
});
