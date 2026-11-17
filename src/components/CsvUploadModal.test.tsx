import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import writeXlsxFile, { type SheetData } from 'write-excel-file/universal';
import * as csvTemplate from '../domain/csvTemplate';
import { XLSX_MIME_TYPE } from '../domain/xlsxParser';
import * as xlsxTemplate from '../domain/xlsxTemplate';
import { CsvUploadModal } from './CsvUploadModal';

describe('Bolt 04: CsvUploadModal', () => {
  it('auto-fills title from filename, shows valid count, and calls onSave on submit', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(<CsvUploadModal isOpen={true} onClose={onClose} onSave={onSave} />);

    const saveBtn = screen.getByRole('button', { name: '保存' });
    expect(saveBtn).toBeDisabled();

    const csvContent = [
      'question,choice1,choice2,choice3,choice4,answer,explanation',
      '日本の首都は？,東京,大阪,,,1,東京です',
    ].join('\n');
    const file = new File([csvContent], '地理テスト.csv', { type: 'text/csv' });

    const fileInput = screen.getByLabelText('ファイルを選択');
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByLabelText('問題集タイトル')).toHaveValue('地理テスト');
      expect(screen.getByText(/1問の問題を読み込みました/)).toBeInTheDocument();
    });

    expect(saveBtn).toBeEnabled();
    await user.click(saveBtn);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('地理テスト', [
        {
          question: '日本の首都は？',
          choice1: '東京',
          choice2: '大阪',
          choice3: null,
          choice4: null,
          answer: 1,
          explanation: '東京です',
        },
      ]);
    });
  });

  it('displays row-level validation errors and disables Save button when CSV is invalid', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CsvUploadModal isOpen={true} onClose={vi.fn()} onSave={onSave} />);

    const invalidCsv = [
      'question,choice1,choice2,choice3,choice4,answer,explanation',
      'Q1,A,B,,,3,',
    ].join('\n');
    const file = new File([invalidCsv], 'broken.csv', { type: 'text/csv' });

    await user.upload(screen.getByLabelText('ファイルを選択'), file);

    await waitFor(() => {
      expect(screen.getByText(/2行目/)).toBeInTheDocument();
      expect(screen.getByText(/選択肢3が空欄です/)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('imports .xlsx workbooks, allows switching sheets, and submits the chosen sheet', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CsvUploadModal isOpen={true} onClose={vi.fn()} onSave={onSave} />);

    const sheet1: SheetData = [
      ['question', 'choice1', 'choice2', 'choice3', 'choice4', 'answer', 'explanation'],
      ['シート1の問題', 'A', 'B', null, null, 1, '解説1'],
    ];
    const sheet2: SheetData = [
      ['question', 'choice1', 'choice2', 'choice3', 'choice4', 'answer', 'explanation'],
      ['シート2の問題1', 'X', 'Y', 'Z', null, 3, null],
      ['シート2の問題2', 'P', 'Q', null, null, 2, '解説2'],
    ];
    const blob = await writeXlsxFile([
      { sheet: '基礎編', data: sheet1 },
      { sheet: '応用編', data: sheet2 },
    ]).toBlob();
    const xlsxFile = new File([blob], '英語テスト.xlsx', { type: XLSX_MIME_TYPE });

    await user.upload(screen.getByLabelText('ファイルを選択'), xlsxFile);

    await waitFor(() => {
      expect(screen.getByLabelText('問題集タイトル')).toHaveValue('英語テスト');
      expect(screen.getByText(/1問の問題を読み込みました/)).toBeInTheDocument();
    });

    const sheetSelect = screen.getByLabelText('読み込むシート');
    expect(sheetSelect).toHaveValue('基礎編');

    await user.selectOptions(sheetSelect, '応用編');

    await waitFor(() => {
      expect(screen.getByText(/2問の問題を読み込みました/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('英語テスト', [
        {
          question: 'シート2の問題1',
          choice1: 'X',
          choice2: 'Y',
          choice3: 'Z',
          choice4: null,
          answer: 3,
          explanation: null,
        },
        {
          question: 'シート2の問題2',
          choice1: 'P',
          choice2: 'Q',
          choice3: null,
          choice4: null,
          answer: 2,
          explanation: '解説2',
        },
      ]);
    });
  });

  it('shows template guide, downloads .xlsx and CSV templates, and copies sample CSV', async () => {
    const user = userEvent.setup();
    const downloadCsvSpy = vi
      .spyOn(csvTemplate, 'downloadCsvTemplate')
      .mockImplementation(() => {});
    const downloadXlsxSpy = vi
      .spyOn(xlsxTemplate, 'downloadXlsxTemplate')
      .mockResolvedValue(undefined);

    render(<CsvUploadModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByText('鋳型（テンプレート）と書き方')).toBeInTheDocument();
    expect(screen.getByText('日本の首都はどこですか？')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /テンプレートExcel（\.xlsx）をダウンロード/ }),
    );
    expect(downloadXlsxSpy).toHaveBeenCalledTimes(1);
    downloadXlsxSpy.mockRestore();

    await user.click(
      screen.getByRole('button', { name: /テンプレートCSVをダウンロード/ }),
    );
    expect(downloadCsvSpy).toHaveBeenCalledTimes(1);
    downloadCsvSpy.mockRestore();

    const writeTextSpy = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: /サンプルCSVをコピー/ }));

    expect(writeTextSpy).toHaveBeenCalledWith(csvTemplate.buildCsvTemplateContent());
    expect(await screen.findByText('コピーしました')).toBeInTheDocument();
    writeTextSpy.mockRestore();
  });
});
