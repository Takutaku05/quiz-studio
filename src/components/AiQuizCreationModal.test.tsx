import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHATGPT_PROJECT_PROMPT } from '../domain/chatgptPrompt';
import { AiQuizCreationModal } from './AiQuizCreationModal';

describe('Bolt 15: AiQuizCreationModal 2-step flow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows step 1 guide, toggles prompt preview, and hides paste form initially', async () => {
    const user = userEvent.setup();
    render(<AiQuizCreationModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'AIで問題集を作る' })).toBeInTheDocument();
    expect(screen.getByText(/① 下のボタンで ChatGPT 用のプロンプトをコピーします/)).toBeInTheDocument();
    expect(
      screen.getByText(/② ChatGPT に貼り付けて問題を作ってもらい、出力結果を次の画面に貼り付けます/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /ChatGPT用のプロンプトをコピー/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /すでに生成結果をお持ちの場合はこちら/ }),
    ).toBeInTheDocument();

    expect(screen.queryByLabelText('問題集タイトル')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /クリップボードから貼り付け/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'プロンプトの内容を確認する' }));
    expect(screen.getByLabelText('ChatGPT用プロンプト本文')).toHaveValue(
      CHATGPT_PROJECT_PROMPT,
    );

    await user.click(screen.getByRole('button', { name: 'プロンプトの内容を隠す' }));
    expect(screen.queryByLabelText('ChatGPT用プロンプト本文')).not.toBeInTheDocument();
  });

  it('copies prompt and transitions automatically to step 2 with top re-copy bar above form fields', async () => {
    const user = userEvent.setup();
    const writeTextSpy = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);

    render(<AiQuizCreationModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /ChatGPT用のプロンプトをコピー/ }));

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith(CHATGPT_PROJECT_PROMPT);
      expect(screen.getByLabelText('問題集タイトル')).toBeInTheDocument();
    });

    expect(screen.getByRole('status')).toHaveTextContent(/プロンプトをコピーしました/);

    const recopyBtn = screen.getByRole('button', { name: /ChatGPT用のプロンプトをコピー/ });
    const titleInput = screen.getByLabelText('問題集タイトル');
    const pasteInput = screen.getByLabelText(/問題データ（JSON \/ CSV テキスト）/);

    // Verify re-copy button is placed above title and paste inputs in DOM order
    expect(
      recopyBtn.compareDocumentPosition(titleInput) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      recopyBtn.compareDocumentPosition(pasteInput) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('transitions to step 2 with manual prompt box open when clipboard write fails on step 1', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('NotAllowedError'));

    render(<AiQuizCreationModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /ChatGPT用のプロンプトをコピー/ }));

    expect(await screen.findByLabelText('問題集タイトル')).toBeInTheDocument();
    expect(screen.getByLabelText('ChatGPT用プロンプト本文')).toHaveValue(
      CHATGPT_PROJECT_PROMPT,
    );
    expect(
      screen.getByText(/自動コピーできない場合は、下のプロンプト本文をすべて選択してコピーしてください/),
    ).toBeInTheDocument();
  });

  it('allows skipping step 1 to go directly to paste screen without overwriting clipboard', async () => {
    const user = userEvent.setup();
    const writeTextSpy = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);

    render(<AiQuizCreationModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />);

    await user.click(
      screen.getByRole('button', { name: /すでに生成結果をお持ちの場合はこちら/ }),
    );

    expect(writeTextSpy).not.toHaveBeenCalled();
    expect(screen.getByLabelText('問題集タイトル')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /ChatGPT用のプロンプトをコピー/ }),
    ).toBeInTheDocument();
  });

  it('re-copies prompt from step 2 top bar with 2s feedback and manual fallback on failure', async () => {
    const user = userEvent.setup();
    const writeTextSpy = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Clipboard unavailable'));

    render(<AiQuizCreationModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />);

    await user.click(
      screen.getByRole('button', { name: /すでに生成結果をお持ちの場合はこちら/ }),
    );

    await user.click(screen.getByRole('button', { name: /ChatGPT用のプロンプトをコピー/ }));
    expect(writeTextSpy).toHaveBeenCalledWith(CHATGPT_PROJECT_PROMPT);
    expect(await screen.findByText('コピーしました')).toBeInTheDocument();

    await waitFor(
      () => {
        expect(
          screen.getByRole('button', { name: /ChatGPT用のプロンプトをコピー/ }),
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Second click fails -> opens manual fallback box
    await user.click(screen.getByRole('button', { name: /ChatGPT用のプロンプトをコピー/ }));
    expect(await screen.findByLabelText('ChatGPT用プロンプト本文')).toHaveValue(
      CHATGPT_PROJECT_PROMPT,
    );
  });

  it('pastes ChatGPT output via clipboard or textarea, validates, auto-fills title, and saves', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue(
      [
        '問題を作成しました。',
        '```json',
        JSON.stringify({
          title: 'TypeScript 基礎',
          questions: [
            {
              question: '型注釈に使う記号は？',
              choice1: ':',
              choice2: ';',
              answer: 1,
              explanation: 'コロンを使います。',
            },
          ],
        }),
        '```',
      ].join('\n'),
    );

    render(<AiQuizCreationModal isOpen={true} onClose={onClose} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: /ChatGPT用のプロンプトをコピー/ }));
    await screen.findByLabelText('問題集タイトル');

    await user.click(screen.getByRole('button', { name: /クリップボードから貼り付け/ }));

    await waitFor(() => {
      expect(screen.getByLabelText('問題集タイトル')).toHaveValue('TypeScript 基礎');
      expect(screen.getByText(/1問の問題を読み込みました/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('TypeScript 基礎', [
        {
          question: '型注釈に使う記号は？',
          choice1: ':',
          choice2: ';',
          choice3: null,
          choice4: null,
          answer: 1,
          explanation: 'コロンを使います。',
        },
      ]);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('preserves manually entered title, reports JSON/CSV validation errors, and supports clearing', async () => {
    const user = userEvent.setup();
    render(<AiQuizCreationModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />);

    await user.click(
      screen.getByRole('button', { name: /すでに生成結果をお持ちの場合はこちら/ }),
    );

    await user.type(screen.getByLabelText('問題集タイトル'), 'マイタイトル');
    const textarea = screen.getByLabelText(/問題データ（JSON \/ CSV テキスト）/);

    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify({
          title: '上書きされないタイトル',
          questions: [{ question: 'Q1', choice1: 'A', choice2: 'B', answer: 4 }],
        }),
      },
    });

    expect(screen.getByLabelText('問題集タイトル')).toHaveValue('マイタイトル');
    expect(screen.getByText(/1問目/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '入力をクリア' }));
    expect(textarea).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.change(textarea, {
      target: {
        value: 'question,choice1,choice2,choice3,choice4,answer,explanation\nQ,A,B,,,2,',
      },
    });
    expect(screen.getByText(/1問の問題を読み込みました/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
  });

  it('shows clipboard read fallback guidance and resets to step 1 when closed and reopened', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'readText').mockRejectedValue(new Error('Permission denied'));

    const { rerender } = render(
      <AiQuizCreationModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />,
    );

    await user.click(
      screen.getByRole('button', { name: /すでに生成結果をお持ちの場合はこちら/ }),
    );

    await user.click(screen.getByRole('button', { name: /クリップボードから貼り付け/ }));
    expect(await screen.findByText(/長押しして「ペースト」してください/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    rerender(<AiQuizCreationModal isOpen={false} onClose={vi.fn()} onSave={vi.fn()} />);
    rerender(<AiQuizCreationModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />);

    expect(
      screen.getByText(/① 下のボタンで ChatGPT 用のプロンプトをコピーします/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('問題集タイトル')).not.toBeInTheDocument();
  });

  it('shows saveError alert and keeps modal open when onSave fails', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi.fn().mockRejectedValue(new Error('ネットワークエラーで保存できませんでした'));

    render(<AiQuizCreationModal isOpen={true} onClose={onClose} onSave={onSave} />);

    await user.click(
      screen.getByRole('button', { name: /すでに生成結果をお持ちの場合はこちら/ }),
    );
    await user.type(screen.getByLabelText('問題集タイトル'), 'エラー確認クイズ');
    fireEvent.change(screen.getByLabelText(/問題データ（JSON \/ CSV テキスト）/), {
      target: {
        value: JSON.stringify([{ question: 'Q1', choice1: 'A', choice2: 'B', answer: 1 }]),
      },
    });

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ネットワークエラーで保存できませんでした',
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
  });
});
