import { describe, expect, it } from 'vitest';
import { decodeCsvBuffer, parseAndValidateCsv } from './csvParser';

describe('Bolt 01: csvParser', () => {
  describe('decodeCsvBuffer', () => {
    it('decodes UTF-8 CSV and strips BOM', () => {
      const csv = '\uFEFFquestion,choice1,choice2,choice3,choice4,answer,explanation\nQ1,A,B,,,1,';
      const bytes = new TextEncoder().encode(csv);
      const decoded = decodeCsvBuffer(bytes.buffer);
      expect(decoded.startsWith('question,')).toBe(true);
      expect(decoded).toContain('Q1,A,B,,,1,');
    });

    it('falls back to Shift-JIS when bytes are not valid UTF-8', () => {
      // Shift-JIS bytes for "問題文,選択肢A,選択肢B"
      // 問(96 E2) 題(91 E8) 文(95 B6)
      // 選(91 49) 択(91 F0) 肢(8E 88)
      const shiftJisBytes = new Uint8Array([
        0x96, 0xe2, 0x91, 0xe8, 0x95, 0xb6, 0x2c, // 問題文,
        0x91, 0x49, 0x91, 0xf0, 0x8e, 0x88, 0x41, 0x2c, // 選択肢A,
        0x91, 0x49, 0x91, 0xf0, 0x8e, 0x88, 0x42, // 選択肢B
      ]);
      const decoded = decodeCsvBuffer(shiftJisBytes.buffer);
      expect(decoded).toBe('問題文,選択肢A,選択肢B');
    });
  });

  describe('parseAndValidateCsv', () => {
    it('parses valid mixed 2-choice, 3-choice, and 4-choice questions including quoted commas/newlines', () => {
      const csv = [
        'question,choice1,choice2,choice3,choice4,answer,explanation',
        '"日本の首都は？\n(1つ選択)",東京,大阪,名古屋,福岡,1,"東京は日本の首都です。"',
        '地球は丸い？,はい,いいえ,,,1,',
        '"3択問題, カンマあり",A,B,C,,3,"Cが正解, です"',
      ].join('\n');

      const result = parseAndValidateCsv(csv);
      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.questions).toHaveLength(3);

      expect(result.questions[0]).toEqual({
        question: '日本の首都は？\n(1つ選択)',
        choice1: '東京',
        choice2: '大阪',
        choice3: '名古屋',
        choice4: '福岡',
        answer: 1,
        explanation: '東京は日本の首都です。',
      });
      expect(result.questions[1]).toEqual({
        question: '地球は丸い？',
        choice1: 'はい',
        choice2: 'いいえ',
        choice3: null,
        choice4: null,
        answer: 1,
        explanation: null,
      });
      expect(result.questions[2]).toEqual({
        question: '3択問題, カンマあり',
        choice1: 'A',
        choice2: 'B',
        choice3: 'C',
        choice4: null,
        answer: 3,
        explanation: 'Cが正解, です',
      });
    });

    it('returns header error when required columns are missing', () => {
      const csv = 'question,choice1,choice2,answer\nQ1,A,B,1';
      const result = parseAndValidateCsv(csv);
      expect(result.ok).toBe(false);
      expect(result.questions).toEqual([]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].row).toBe(1);
      expect(result.errors[0].message).toContain('choice3');
    });

    it('returns error when CSV has no data rows', () => {
      const csv = 'question,choice1,choice2,choice3,choice4,answer,explanation\n';
      const result = parseAndValidateCsv(csv);
      expect(result.ok).toBe(false);
      expect(result.errors[0].message).toContain('問題データ');
    });

    it('validates all rows and reports exact CSV row numbers for missing required fields, choice3 gap, invalid answer, and mismatched answer choice', () => {
      const csv = [
        'question,choice1,choice2,choice3,choice4,answer,explanation',
        ',A,B,,,1,', // row 2: missing question
        'Q2,,B,,,1,', // row 3: missing choice1
        'Q3,A,,,,1,', // row 4: missing choice2
        'Q4,A,B,,,', // row 5: missing answer
        'Q5,A,B,,D,2,', // row 6: choice3 empty while choice4 filled
        'Q6,A,B,C,D,5,', // row 7: answer out of range
        'Q7,A,B,C,D,１,', // row 8: full-width answer
        'Q8,A,B,,,3,', // row 9: answer=3 but choice3 empty
      ].join('\n');

      const result = parseAndValidateCsv(csv);
      expect(result.ok).toBe(false);
      expect(result.questions).toEqual([]);

      const rowsWithErrors = result.errors.map((e) => e.row);
      expect(rowsWithErrors).toContain(2);
      expect(rowsWithErrors).toContain(3);
      expect(rowsWithErrors).toContain(4);
      expect(rowsWithErrors).toContain(5);
      expect(rowsWithErrors).toContain(6);
      expect(rowsWithErrors).toContain(7);
      expect(rowsWithErrors).toContain(8);
      expect(rowsWithErrors).toContain(9);

      const row6Error = result.errors.find((e) => e.row === 6);
      expect(row6Error?.message).toContain('選択肢3');
      const row9Error = result.errors.find((e) => e.row === 9);
      expect(row9Error?.message).toContain('選択肢3');
    });
  });
});
