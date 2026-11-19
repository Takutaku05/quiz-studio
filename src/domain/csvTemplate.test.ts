import { describe, expect, it, vi } from 'vitest';
import { parseAndValidateCsv } from './csvParser';
import {
  buildCsvTemplateContent,
  CSV_TEMPLATE_FILENAME,
  downloadCsvTemplate,
  escapeCsvCell,
  OBJECT_URL_REVOKE_DELAY_MS,
} from './csvTemplate';

describe('csvTemplate', () => {
  it('generates a valid CSV template that passes parseAndValidateCsv without errors', () => {
    const csv = buildCsvTemplateContent();
    const result = parseAndValidateCsv(csv);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.questions).toEqual([
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
  });

  it('escapes commas, double quotes, and newlines according to RFC 4180', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('downloads UTF-8 BOM CSV with expected filename', async () => {
    let capturedBlob: Blob | undefined;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn((obj: Blob | MediaSource) => {
      capturedBlob = obj as Blob;
      return 'blob:template-url';
    });
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    try {
      vi.useFakeTimers();
      downloadCsvTemplate();

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(capturedBlob).toBeInstanceOf(Blob);
      expect(capturedBlob?.type).toContain('text/csv');
      expect(clickSpy).toHaveBeenCalledTimes(1);
      // Object URL must not be revoked synchronously right after click (Safari/Firefox fix).
      expect(revokeObjectURL).not.toHaveBeenCalled();

      vi.advanceTimersByTime(OBJECT_URL_REVOKE_DELAY_MS);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:template-url');
      vi.useRealTimers();

      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(capturedBlob!);
      });
      const bytes = new Uint8Array(buffer);
      // UTF-8 BOM: EF BB BF
      expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
      const text = new TextDecoder('utf-8').decode(bytes.slice(3));
      expect(text).toBe(buildCsvTemplateContent());
      expect(CSV_TEMPLATE_FILENAME).toBe('quiz_template.csv');
    } finally {
      vi.useRealTimers();
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      clickSpy.mockRestore();
    }
  });
});
