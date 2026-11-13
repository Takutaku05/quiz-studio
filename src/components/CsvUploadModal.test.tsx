import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

    const fileInput = screen.getByLabelText('CSVファイルを選択');
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

    await user.upload(screen.getByLabelText('CSVファイルを選択'), file);

    await waitFor(() => {
      expect(screen.getByText(/2行目/)).toBeInTheDocument();
      expect(screen.getByText(/選択肢3が空欄です/)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
