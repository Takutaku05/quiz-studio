import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import writeXlsxFile, { type SheetData } from 'write-excel-file/universal';
import { CHATGPT_PROJECT_PROMPT } from '../domain/chatgptPrompt';
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

describe('Bolt 14: CsvUploadModal text paste, .json upload, and ChatGPT prompt copy', () => {
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
    vi.restoreAllMocks();
  });

  function setViewportWidth(width: number) {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: width,
    });
  }

  it('defaults to paste tab with collapsed template guide on mobile width (< 640px) and file tab on desktop', () => {
    setViewportWidth(375);
    const { rerender } = render(
      <CsvUploadModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />,
    );

    expect(screen.getByRole('tab', { name: 'テキストを貼り付け' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'ファイルをアップロード' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByRole('button', { name: /クリップボードから貼り付け/ })).toBeVisible();
    // ChatGPT prompt copy button stays visible even when detailed guide is collapsed
    expect(screen.getByRole('button', { name: /ChatGPT用プロンプトをコピー/ })).toBeVisible();
    expect(screen.queryByText('日本の首都はどこですか？')).not.toBeInTheDocument();

    // User can expand guide manually on mobile
    fireEvent.click(screen.getByRole('button', { name: /テンプレートダウンロード・書き方ガイドを見る/ }));
    expect(screen.getByText('日本の首都はどこですか？')).toBeInTheDocument();

    setViewportWidth(1024);
    rerender(<CsvUploadModal isOpen={false} onClose={vi.fn()} onSave={vi.fn()} />);
    rerender(<CsvUploadModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByRole('tab', { name: 'ファイルをアップロード' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('pastes ChatGPT message with preamble and code block from clipboard, auto-fills title, and saves', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    const chatGptReply = [
      '承知しました！AWSの問題を2問作成しました。',
      '```json',
      JSON.stringify({
        title: 'AWS Cloud Practitioner',
        questions: [
          {
            question: 'S3とは何のサービス？',
            choice1: 'オブジェクトストレージ',
            choice2: 'リレーショナルDB',
            answer: 1,
            explanation: 'Simple Storage Service の略です。',
          },
          {
            question: 'EC2は何を提供するか？',
            choice1: '仮想サーバー',
            choice2: 'DNS',
            choice3: 'CDN',
            answer: 1,
          },
        ],
      }),
      '```',
      '引き続き学習頑張ってください！',
    ].join('\n');

    const readTextSpy = vi
      .spyOn(navigator.clipboard, 'readText')
      .mockResolvedValue(chatGptReply);

    setViewportWidth(375);
    render(<CsvUploadModal isOpen={true} onClose={onClose} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: /クリップボードから貼り付け/ }));

    await waitFor(() => {
      expect(readTextSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText('問題集タイトル')).toHaveValue('AWS Cloud Practitioner');
      expect(screen.getByText(/2問の問題を読み込みました/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('AWS Cloud Practitioner', [
        {
          question: 'S3とは何のサービス？',
          choice1: 'オブジェクトストレージ',
          choice2: 'リレーショナルDB',
          choice3: null,
          choice4: null,
          answer: 1,
          explanation: 'Simple Storage Service の略です。',
        },
        {
          question: 'EC2は何を提供するか？',
          choice1: '仮想サーバー',
          choice2: 'DNS',
          choice3: 'CDN',
          choice4: null,
          answer: 1,
          explanation: null,
        },
      ]);
    });
  });

  it('does not overwrite manually entered title and validates pasted CSV/JSON with question numbers', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(<CsvUploadModal isOpen={true} onClose={vi.fn()} onSave={onSave} />);

    await user.click(screen.getByRole('tab', { name: 'テキストを貼り付け' }));
    await user.type(screen.getByLabelText('問題集タイトル'), '自分で付けたタイトル');

    const textarea = screen.getByLabelText(/問題データ（JSON \/ CSV テキスト）/);
    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify({
          title: 'JSON内のタイトル',
          questions: [{ question: 'Q1', choice1: 'A', choice2: 'B', answer: 2 }],
        }),
      },
    });

    expect(screen.getByLabelText('問題集タイトル')).toHaveValue('自分で付けたタイトル');
    expect(screen.getByText(/1問の問題を読み込みました/)).toBeInTheDocument();

    // Invalid JSON question reports 1-based question number and disables Save
    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify([
          { question: 'Q1', choice1: 'A', choice2: 'B', answer: 4 },
        ]),
      },
    });
    expect(screen.getByText(/1問目/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();

    // Clearing textarea returns to waiting state without errors
    fireEvent.change(textarea, { target: { value: '' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Direct CSV paste works too
    fireEvent.change(textarea, {
      target: {
        value: [
          '```csv',
          'question,choice1,choice2,choice3,choice4,answer,explanation',
          'CSV問題,はい,いいえ,,,1,',
          '```',
        ].join('\n'),
      },
    });
    expect(screen.getByText(/1問の問題を読み込みました/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
  });

  it('isolates state across tabs and resets modal state when closed and reopened', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CsvUploadModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />,
    );

    // Put valid CSV file in file tab
    const csv = 'question,choice1,choice2,choice3,choice4,answer,explanation\nQ1,A,B,,,1,';
    const file = new File([csv], 'file-quiz.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('ファイルを選択'), file);
    await waitFor(() => {
      expect(screen.getByText(/1問の問題を読み込みました/)).toBeInTheDocument();
    });

    // Switch to paste tab (empty) -> previous file count must not remain active
    await user.click(screen.getByRole('tab', { name: 'テキストを貼り付け' }));
    expect(screen.queryByText(/1問の問題を読み込みました/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();

    // Paste broken text -> error appears only on paste tab
    fireEvent.change(screen.getByLabelText(/問題データ（JSON \/ CSV テキスト）/), {
      target: { value: '{broken' },
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Switch back to file tab -> file result is active and paste error is gone
    await user.click(screen.getByRole('tab', { name: 'ファイルをアップロード' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/1問の問題を読み込みました/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();

    // Close and reopen -> everything resets
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    rerender(<CsvUploadModal isOpen={false} onClose={vi.fn()} onSave={vi.fn()} />);
    rerender(<CsvUploadModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByLabelText('問題集タイトル')).toHaveValue('');
    expect(screen.queryByText(/1問の問題を読み込みました/)).not.toBeInTheDocument();
  });

  it('uploads .json files prioritizing JSON title over filename, falling back to filename when missing', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CsvUploadModal isOpen={true} onClose={vi.fn()} onSave={onSave} />);

    const jsonWithTitle = new File(
      [
        JSON.stringify({
          title: 'JSON優先タイトル',
          questions: [{ question: 'Q1', choice1: 'A', choice2: 'B', answer: 1 }],
        }),
      ],
      'ignored-name.json',
      { type: 'application/json' },
    );

    await user.upload(screen.getByLabelText('ファイルを選択'), jsonWithTitle);

    await waitFor(() => {
      expect(screen.getByLabelText('問題集タイトル')).toHaveValue('JSON優先タイトル');
      expect(screen.getByText(/1問の問題を読み込みました/)).toBeInTheDocument();
    });

    const jsonArrayFile = new File(
      [JSON.stringify([{ question: 'Q2', choice1: 'C', choice2: 'D', answer: 2 }])],
      'ファイル名タイトル.json',
      { type: 'application/json' },
    );
    await user.upload(screen.getByLabelText('ファイルを選択'), jsonArrayFile);

    await waitFor(() => {
      expect(screen.getByLabelText('問題集タイトル')).toHaveValue('ファイル名タイトル');
    });

    // Manually edited title must not be overwritten by JSON file's embedded title
    const titleInput = screen.getByLabelText('問題集タイトル');
    await user.clear(titleInput);
    await user.type(titleInput, '手動タイトル保持');
    await user.upload(screen.getByLabelText('ファイルを選択'), jsonWithTitle);

    await waitFor(() => {
      expect(screen.getByText(/1問の問題を読み込みました/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText('問題集タイトル')).toHaveValue('手動タイトル保持');
  });

  it('clears pasted text and handles empty clipboard gracefully', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('   ');

    render(<CsvUploadModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />);
    await user.click(screen.getByRole('tab', { name: 'テキストを貼り付け' }));

    await user.click(screen.getByRole('button', { name: /クリップボードから貼り付け/ }));
    expect(await screen.findByText(/クリップボードが空です/)).toBeInTheDocument();

    const textarea = screen.getByLabelText(/問題データ（JSON \/ CSV テキスト）/);
    fireEvent.change(textarea, { target: { value: '{broken' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '入力をクリア' }));
    expect(textarea).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('copies CHATGPT_PROJECT_PROMPT and shows "コピーしました" feedback for 2 seconds', async () => {
    const user = userEvent.setup();
    const writeTextSpy = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);

    render(<CsvUploadModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /ChatGPT用プロンプトをコピー/ }));
    expect(writeTextSpy).toHaveBeenCalledWith(CHATGPT_PROJECT_PROMPT);
    expect(await screen.findByText('コピーしました')).toBeInTheDocument();

    await waitFor(
      () => {
        expect(
          screen.getByRole('button', { name: /ChatGPT用プロンプトをコピー/ }),
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it('provides manual fallback UI without crashing when clipboard API read/write fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('NotAllowedError'));
    vi.spyOn(navigator.clipboard, 'readText').mockRejectedValue(new Error('Permission denied'));

    render(<CsvUploadModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />);

    await user.click(screen.getByRole('tab', { name: 'テキストを貼り付け' }));
    await user.click(screen.getByRole('button', { name: /クリップボードから貼り付け/ }));
    expect(await screen.findByText(/長押しして「ペースト」してください/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /ChatGPT用プロンプトをコピー/ }));
    expect(await screen.findByLabelText('ChatGPT用プロンプト本文')).toHaveValue(
      CHATGPT_PROJECT_PROMPT,
    );
  });
});
