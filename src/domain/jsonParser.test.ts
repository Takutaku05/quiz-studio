import { describe, expect, it } from 'vitest';
import {
  extractImportPayloadFromText,
  MAX_TEXT_IMPORT_LENGTH,
  parseAndValidateJson,
  parseQuizTextInput,
} from './jsonParser';

describe('Bolt 14: jsonParser & text import', () => {
  describe('extractImportPayloadFromText', () => {
    it('returns trimmed original text when no Markdown code fences exist', () => {
      const raw = '  \n[{"question":"Q1","choice1":"A","choice2":"B","answer":1}] \n ';
      expect(extractImportPayloadFromText(raw)).toBe(
        '[{"question":"Q1","choice1":"A","choice2":"B","answer":1}]',
      );
    });

    it('strips conversational preamble/postscript and extracts json/csv/plain code fences', () => {
      const jsonMessage = [
        '承知しました。以下がクイズデータです。',
        '',
        '```json',
        '{"title":"AWS基礎","questions":[{"question":"Q1","choice1":"A","choice2":"B","answer":1}]}',
        '```',
        '',
        '必要に応じて修正してください。',
      ].join('\n');

      expect(extractImportPayloadFromText(jsonMessage)).toBe(
        '{"title":"AWS基礎","questions":[{"question":"Q1","choice1":"A","choice2":"B","answer":1}]}',
      );

      const csvMessage = [
        'CSV形式でお出しします！',
        '```csv',
        'question,choice1,choice2,choice3,choice4,answer,explanation',
        'Q1,A,B,,,1,',
        '```',
        '以上です。',
      ].join('\n');

      expect(extractImportPayloadFromText(csvMessage)).toBe(
        'question,choice1,choice2,choice3,choice4,answer,explanation\nQ1,A,B,,,1,',
      );

      const plainFence = ['```', '[{"question":"Q1","choice1":"A","choice2":"B","answer":1}]', '```'].join(
        '\n',
      );
      expect(extractImportPayloadFromText(plainFence)).toBe(
        '[{"question":"Q1","choice1":"A","choice2":"B","answer":1}]',
      );
    });

    it('extracts code block content even when the closing fence is missing', () => {
      const truncated = [
        '以下が出力です：',
        '```json',
        '{"title":"途中切れ","questions":[{"question":"Q1","choice1":"A","choice2":"B","answer":1}]}',
      ].join('\n');

      expect(extractImportPayloadFromText(truncated)).toBe(
        '{"title":"途中切れ","questions":[{"question":"Q1","choice1":"A","choice2":"B","answer":1}]}',
      );
    });

    it('picks the first valid code block when multiple code blocks exist', () => {
      const multiBlock = [
        'まずは例示メモです：',
        '```text',
        'これは問題データではありません',
        '```',
        '続いて本番データです：',
        '```json',
        '{"title":"本番","questions":[{"question":"Q1","choice1":"A","choice2":"B","answer":2}]}',
        '```',
      ].join('\n');

      expect(extractImportPayloadFromText(multiBlock)).toBe(
        '{"title":"本番","questions":[{"question":"Q1","choice1":"A","choice2":"B","answer":2}]}',
      );
    });
  });

  describe('parseAndValidateJson', () => {
    it('parses root array format with numeric/string answers and mixed 2-to-4 choices', () => {
      const json = JSON.stringify([
        {
          question: ' 4択問題 ',
          choice1: ' A ',
          choice2: 'B',
          choice3: 'C',
          choice4: 'D',
          answer: 4,
          explanation: ' 解説です ',
        },
        {
          question: '2択問題',
          choice1: 'はい',
          choice2: 'いいえ',
          choice3: null,
          choice4: '',
          answer: '1',
          explanation: null,
        },
        {
          question: '3択問題',
          choice1: 'X',
          choice2: 'Y',
          choice3: 'Z',
          answer: '3',
        },
      ]);

      const result = parseAndValidateJson(json);
      expect(result.ok).toBe(true);
      expect(result.suggestedTitle).toBeNull();
      expect(result.errors).toEqual([]);
      expect(result.questions).toEqual([
        {
          question: '4択問題',
          choice1: 'A',
          choice2: 'B',
          choice3: 'C',
          choice4: 'D',
          answer: 4,
          explanation: '解説です',
        },
        {
          question: '2択問題',
          choice1: 'はい',
          choice2: 'いいえ',
          choice3: null,
          choice4: null,
          answer: 1,
          explanation: null,
        },
        {
          question: '3択問題',
          choice1: 'X',
          choice2: 'Y',
          choice3: 'Z',
          choice4: null,
          answer: 3,
          explanation: null,
        },
      ]);
    });

    it('parses wrapper object format and extracts trimmed suggestedTitle', () => {
      const json = JSON.stringify({
        title: '  ITパスポート模擬問題  ',
        questions: [
          {
            question: 'CPUとは？',
            choice1: '中央処理装置',
            choice2: '記憶装置',
            answer: 1,
          },
        ],
      });

      const result = parseAndValidateJson(json);
      expect(result.ok).toBe(true);
      expect(result.suggestedTitle).toBe('ITパスポート模擬問題');
      expect(result.questions).toHaveLength(1);

      const blankTitleResult = parseAndValidateJson(
        JSON.stringify({
          title: '   ',
          questions: [{ question: 'Q1', choice1: 'A', choice2: 'B', answer: 1 }],
        }),
      );
      expect(blankTitleResult.ok).toBe(true);
      expect(blankTitleResult.suggestedTitle).toBeNull();
    });

    it('reuses validateQuestionRows rules and reports 1-based question index as row', () => {
      const json = JSON.stringify({
        title: 'エラー例',
        questions: [
          { question: '正常', choice1: 'A', choice2: 'B', answer: 1 },
          { question: '', choice1: 'A', choice2: 'B', answer: 1 }, // row 2: missing question
          { question: 'Q3', choice1: 'A', choice2: 'B', choice4: 'D', answer: 2 }, // row 3: choice3 gap
          { question: 'Q4', choice1: 'A', choice2: 'B', answer: 3 }, // row 4: answer points to empty choice3
          { question: 'Q5', choice1: 'A', choice2: 'B', answer: 5 }, // row 5: answer out of range
          { question: 'Q6', choice1: 'A', choice2: 'B', answer: 1.5 }, // row 6: non-integer answer
        ],
      });

      const result = parseAndValidateJson(json);
      expect(result.ok).toBe(false);
      expect(result.questions).toEqual([]);
      expect(result.errors.find((e) => e.row === 2)?.message).toContain('問題文');
      expect(result.errors.find((e) => e.row === 3)?.message).toContain('選択肢3');
      expect(result.errors.find((e) => e.row === 4)?.message).toContain('選択肢3が空欄です');
      expect(result.errors.find((e) => e.row === 5)?.message).toContain('1〜4');
      expect(result.errors.find((e) => e.row === 6)?.message).toContain('1〜4');
    });

    it('returns Japanese error messages for invalid JSON syntax, empty input, wrong root shape, or empty questions', () => {
      const emptyRes = parseAndValidateJson('   ');
      expect(emptyRes.ok).toBe(false);
      expect(emptyRes.errors[0].message).toContain('空');

      const syntaxRes = parseAndValidateJson('{"title": "broken", "questions": [');
      expect(syntaxRes.ok).toBe(false);
      expect(syntaxRes.errors[0].message).toContain('JSON');

      const wrongShapeRes = parseAndValidateJson('{"title":"missing questions"}');
      expect(wrongShapeRes.ok).toBe(false);
      expect(wrongShapeRes.errors[0].message).toContain('questions');

      const emptyArrayRes = parseAndValidateJson('[]');
      expect(emptyArrayRes.ok).toBe(false);
      expect(emptyArrayRes.errors[0].message).toContain('問題データが1件もありません');

      const nonObjectItemRes = parseAndValidateJson(
        JSON.stringify([null, { question: { nested: true }, choice1: 'A', choice2: 'B', answer: 1 }]),
      );
      expect(nonObjectItemRes.ok).toBe(false);
      expect(nonObjectItemRes.errors.find((e) => e.row === 1)?.message).toContain('オブジェクト');
      expect(nonObjectItemRes.errors.find((e) => e.row === 2)?.message).toContain('文字列');
    });
  });

  describe('parseQuizTextInput', () => {
    it('auto-detects JSON and CSV payloads including BOM and code fences', () => {
      const singleLineFence =
        '\uFEFF```json [{"question":"1行Q","choice1":"A","choice2":"B","answer":1}]```';
      const singleLineRes = parseQuizTextInput(singleLineFence);
      expect(singleLineRes.ok).toBe(true);
      expect(singleLineRes.format).toBe('json');
      expect(singleLineRes.questions[0].question).toBe('1行Q');
      const jsonInput = [
        'こちらが問題集です。',
        '```json',
        '{"title":"ネットワーク","questions":[{"question":"HTTPの既定ポートは？","choice1":"80","choice2":"22","answer":1}]}',
        '```',
        '頑張ってください！',
      ].join('\n');

      const jsonRes = parseQuizTextInput(jsonInput);
      expect(jsonRes.ok).toBe(true);
      expect(jsonRes.format).toBe('json');
      expect(jsonRes.suggestedTitle).toBe('ネットワーク');
      expect(jsonRes.questions).toHaveLength(1);

      const csvInput = [
        'CSV形式です：',
        '```csv',
        'question,choice1,choice2,choice3,choice4,answer,explanation',
        '日本の首都は？,東京,大阪,,,1,東京です',
        '```',
      ].join('\n');

      const csvRes = parseQuizTextInput(csvInput);
      expect(csvRes.ok).toBe(true);
      expect(csvRes.format).toBe('csv');
      expect(csvRes.suggestedTitle).toBeNull();
      expect(csvRes.questions).toHaveLength(1);
    });

    it('selects the first valid block among multiple blocks, and falls back to the first block errors if all fail', () => {
      const secondValid = [
        '```text',
        'これはダミーブロック',
        '```',
        '```json',
        '[{"question":"有効問題","choice1":"A","choice2":"B","answer":2}]',
        '```',
      ].join('\n');

      const res = parseQuizTextInput(secondValid);
      expect(res.ok).toBe(true);
      expect(res.format).toBe('json');
      expect(res.questions[0].question).toBe('有効問題');

      const allInvalid = [
        '```json',
        '{"title":"壊れた1つ目","questions":[{"question":"","choice1":"A","choice2":"B","answer":1}]}',
        '```',
        '```csv',
        'invalid,header',
        '```',
      ].join('\n');

      const errRes = parseQuizTextInput(allInvalid);
      expect(errRes.ok).toBe(false);
      expect(errRes.format).toBe('json');
      expect(errRes.errors[0].row).toBe(1);
      expect(errRes.errors[0].message).toContain('問題文');
    });

    it('parses truncated code block when closing fence is missing and rejects empty input', () => {
      const truncatedCsv = [
        '以下です',
        '```csv',
        'question,choice1,choice2,choice3,choice4,answer,explanation',
        'Q1,A,B,,,1,',
      ].join('\n');

      const res = parseQuizTextInput(truncatedCsv);
      expect(res.ok).toBe(true);
      expect(res.format).toBe('csv');
      expect(res.questions).toHaveLength(1);

      const emptyRes = parseQuizTextInput('   \n  ');
      expect(emptyRes.ok).toBe(false);
      expect(emptyRes.errors[0].message).toContain('空');
    });

    it('recovers fenced payloads when question or explanation contains inner ``` lines', () => {
      const csvWithInnerFence = [
        '問題を作りました：',
        '```csv',
        'question,choice1,choice2,choice3,choice4,answer,explanation',
        '"次のコードの出力は？',
        '```js',
        'console.log(1)',
        '```",1,2,,,1,"解説内にも',
        '```',
        'があります"',
        '```',
        '以上です。',
      ].join('\n');

      const csvRes = parseQuizTextInput(csvWithInnerFence);
      expect(csvRes.ok).toBe(true);
      expect(csvRes.format).toBe('csv');
      expect(csvRes.questions).toHaveLength(1);
      expect(csvRes.questions[0].question).toContain('console.log(1)');

      const jsonWithInnerExampleFence = [
        'まずは例示です：',
        '```',
        '例',
        '```',
        '以下が問題集です：',
        '{"title":"コードクイズ","questions":[{"question":"```js\\nconsole.log(1)\\n```","choice1":"1","choice2":"2","answer":1}]}',
      ].join('\n');

      const jsonRes = parseQuizTextInput(jsonWithInnerExampleFence);
      expect(jsonRes.ok).toBe(true);
      expect(jsonRes.format).toBe('json');
      expect(jsonRes.suggestedTitle).toBe('コードクイズ');
      expect(jsonRes.questions).toHaveLength(1);
    });

    it('rejects pasted text exceeding MAX_TEXT_IMPORT_LENGTH', () => {
      const tooLong = 'a'.repeat(MAX_TEXT_IMPORT_LENGTH + 1);
      const res = parseQuizTextInput(tooLong);

      expect(res.ok).toBe(false);
      expect(res.questions).toEqual([]);
      expect(res.errors[0].message).toContain('500,000');
    });
  });
});
