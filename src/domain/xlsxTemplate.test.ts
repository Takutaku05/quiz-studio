import { describe, expect, it, vi } from 'vitest';
import { readFileAsArrayBuffer } from './csvParser';
import { parseQuizUploadFile, parseXlsxBuffer, XLSX_MIME_TYPE } from './xlsxParser';
import {
  buildXlsxTemplateBlob,
  downloadXlsxTemplate,
  XLSX_GUIDE_SHEET_NAME,
  XLSX_QUIZ_SHEET_NAME,
  XLSX_TEMPLATE_FILENAME,
} from './xlsxTemplate';

describe('xlsxTemplate', () => {
  it('generates an .xlsx template workbook that round-trips cleanly through parseXlsxBuffer', async () => {
    const blob = await buildXlsxTemplateBlob();

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe(XLSX_MIME_TYPE);

    const file = new File([blob], XLSX_TEMPLATE_FILENAME, { type: XLSX_MIME_TYPE });
    const buffer = await readFileAsArrayBuffer(file);
    const parsed = await parseXlsxBuffer(buffer);

    expect(parsed.ok).toBe(true);
    expect(parsed.errors).toEqual([]);
    expect(parsed.selectedSheetName).toBe(XLSX_QUIZ_SHEET_NAME);
    expect(parsed.sheets.map((s) => s.name)).toEqual([
      XLSX_QUIZ_SHEET_NAME,
      XLSX_GUIDE_SHEET_NAME,
    ]);
    expect(parsed.questions).toEqual([
      {
        question: '日本の首都はどこですか？',
        choice1: '東京',
        choice2: '大阪',
        choice3: '名古屋',
        choice4: '福岡',
        answer: 1,
        explanation: '日本の首都は東京です。（4択の例）',
      },
      {
        question: '太陽は東から昇る。',
        choice1: 'はい',
        choice2: 'いいえ',
        choice3: null,
        choice4: null,
        answer: 1,
        explanation: 'choice3・choice4を空欄にすると2択問題になります。',
      },
      {
        question: 'カンマ,や"引用符"を含む問題文の例です。どれが正しいですか？',
        choice1: '選択肢A',
        choice2: '選択肢B',
        choice3: '選択肢C',
        choice4: null,
        answer: 2,
        explanation: null,
      },
    ]);

    const guideSheet = parsed.sheets.find((s) => s.name === XLSX_GUIDE_SHEET_NAME);
    expect(guideSheet?.result.ok).toBe(false);

    const uploadParsed = await parseQuizUploadFile(file);
    expect(uploadParsed.ok).toBe(true);
    expect(uploadParsed.sourceType).toBe('xlsx');
    expect(uploadParsed.questions).toHaveLength(3);
  });

  it('downloads the .xlsx template with expected filename and MIME type', async () => {
    let capturedBlob: Blob | undefined;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn((obj: Blob | MediaSource) => {
      capturedBlob = obj as Blob;
      return 'blob:xlsx-template-url';
    });
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    try {
      await downloadXlsxTemplate();

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(capturedBlob).toBeInstanceOf(Blob);
      expect(capturedBlob?.type).toBe(XLSX_MIME_TYPE);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:xlsx-template-url');
      expect(XLSX_TEMPLATE_FILENAME).toBe('quiz_template.xlsx');
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      clickSpy.mockRestore();
    }
  });
});
