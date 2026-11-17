import type { Cell, Row, Sheet, SheetData } from 'write-excel-file/universal';
import { REQUIRED_CSV_HEADERS } from './csvParser';
import {
  CSV_COLUMN_GUIDES,
  CSV_TEMPLATE_SAMPLE_ROWS,
  triggerFileDownload,
} from './csvTemplate';

export const XLSX_TEMPLATE_FILENAME = 'quiz_template.xlsx';
export const XLSX_QUIZ_SHEET_NAME = '問題データ';
export const XLSX_GUIDE_SHEET_NAME = '書き方ガイド';

function headerCell(value: string): Cell {
  return {
    value,
    fontWeight: 'bold',
    backgroundColor: '#4F46E5',
    textColor: '#FFFFFF',
    alignVertical: 'center',
    height: 24,
    borderColor: '#C7D2FE',
    borderStyle: 'thin',
  };
}

function buildQuizSheetData(): SheetData {
  const headerRow: Row = REQUIRED_CSV_HEADERS.map((header) => headerCell(header));

  const sampleRows: Row[] = CSV_TEMPLATE_SAMPLE_ROWS.map((row) =>
    REQUIRED_CSV_HEADERS.map((col): Cell => {
      if (col === 'answer') {
        return {
          value: Number(row.answer),
          align: 'center',
          alignVertical: 'top',
          borderColor: '#E2E8F0',
          borderStyle: 'thin',
        };
      }
      const rawValue = row[col];
      return {
        value: rawValue === '' ? undefined : rawValue,
        wrap: true,
        alignVertical: 'top',
        borderColor: '#E2E8F0',
        borderStyle: 'thin',
      };
    }),
  );

  return [headerRow, ...sampleRows];
}

function buildGuideSheetData(): SheetData {
  const headerRow: Row = [
    headerCell('列名（1行目固定）'),
    headerCell('入力'),
    headerCell('説明'),
  ];

  const guideRows: Row[] = CSV_COLUMN_GUIDES.map((guide) => [
    {
      value: guide.name,
      fontWeight: 'bold',
      alignVertical: 'center',
      borderColor: '#E2E8F0',
      borderStyle: 'thin',
    },
    {
      value: guide.required ? '必須' : '任意',
      align: 'center',
      alignVertical: 'center',
      textColor: guide.required ? '#BE123C' : '#475569',
      backgroundColor: guide.required ? '#FFF1F2' : '#F8FAFC',
      fontWeight: guide.required ? 'bold' : undefined,
      borderColor: '#E2E8F0',
      borderStyle: 'thin',
    },
    {
      value: guide.description,
      wrap: true,
      alignVertical: 'center',
      borderColor: '#E2E8F0',
      borderStyle: 'thin',
    },
  ]);

  const noteRows: Row[] = [
    [null, null, null],
    [
      { value: '作成のポイント', fontWeight: 'bold', textColor: '#312E81' },
      null,
      null,
    ],
    [
      '1行目のヘッダー',
      null,
      '「問題データ」シートの1行目（question 〜 explanation）は変更しないでください。',
    ],
    [
      '選択肢の数',
      null,
      '2択・3択の問題にする場合は choice3 や choice4 を空欄にしてください。',
    ],
    [
      'スプレッドシート利用',
      null,
      'Excel や Google スプレッドシートで編集し、.xlsx 形式で保存するとそのままアップロードできます。',
    ],
  ];

  return [headerRow, ...guideRows, ...noteRows];
}

export async function buildXlsxTemplateBlob(): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/universal');

  const sheets: Sheet<Blob>[] = [
    {
      sheet: XLSX_QUIZ_SHEET_NAME,
      stickyRowsCount: 1,
      columns: [
        { width: 44 },
        { width: 22 },
        { width: 22 },
        { width: 22 },
        { width: 22 },
        { width: 12 },
        { width: 44 },
      ],
      data: buildQuizSheetData(),
    },
    {
      sheet: XLSX_GUIDE_SHEET_NAME,
      stickyRowsCount: 1,
      columns: [{ width: 22 }, { width: 12 }, { width: 58 }],
      data: buildGuideSheetData(),
    },
  ];

  return writeXlsxFile(sheets, {
    fontFamily: 'Hiragino Sans',
    fontSize: 11,
  }).toBlob();
}

export async function downloadXlsxTemplate(): Promise<void> {
  const blob = await buildXlsxTemplateBlob();
  triggerFileDownload(blob, XLSX_TEMPLATE_FILENAME);
}
