import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LocalAuthRepository,
  LocalQuizRepository,
} from '../repositories/localStorageRepositories';
import { ShareQuizModal } from './ShareQuizModal';

describe('ShareQuizModal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates share link, renders QR code SVG image, copies URL, and downloads QR', async () => {
    const user = userEvent.setup();
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();
    const owner = await authRepo.signUp('share-owner@example.com', 'password123');
    const quiz = await quizRepo.create(owner.id, {
      title: 'QR共有クイズ',
      questions: [
        {
          question: 'Q1',
          choice1: 'A',
          choice2: 'B',
          choice3: null,
          choice4: null,
          answer: 1,
          explanation: null,
        },
      ],
    });

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    let capturedBlob: Blob | undefined;
    const createObjectUrlMock = vi.fn((blob: Blob | MediaSource) => {
      capturedBlob = blob as Blob;
      return 'blob:qr-svg-url';
    });
    const revokeObjectUrlMock = vi.fn();
    URL.createObjectURL = createObjectUrlMock;
    URL.revokeObjectURL = revokeObjectUrlMock;
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    try {
      render(
        <ShareQuizModal
          quiz={quiz}
          userId={owner.id}
          quizRepository={quizRepo}
          onClose={vi.fn()}
        />,
      );

      const urlInput = (await screen.findByLabelText('共有URL')) as HTMLInputElement;
      expect(urlInput.value).toMatch(/\/share\/[a-z0-9]+$/i);

      const qrImg = (await screen.findByAltText('QR共有クイズ の共有QRコード')) as HTMLImageElement;
      expect(qrImg.src).toContain('data:image/svg+xml;charset=utf-8,');
      expect(decodeURIComponent(qrImg.src)).toContain('<svg');

      await user.click(screen.getByRole('button', { name: /URLをコピー/ }));
      expect(writeText).toHaveBeenCalledWith(urlInput.value);
      expect(await screen.findByText('コピーしました')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /QR画像を保存/ }));
      expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
      expect(capturedBlob).toBeInstanceOf(Blob);
      expect(capturedBlob?.type).toContain('image/svg+xml');
      expect(anchorClickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectUrlMock).not.toHaveBeenCalled();
      await waitFor(
        () => {
          expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:qr-svg-url');
        },
        { timeout: 2500 },
      );
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      anchorClickSpy.mockRestore();
    }
  });

  it('regenerates, stops, and resumes sharing', async () => {
    const user = userEvent.setup();
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();
    const owner = await authRepo.signUp('share-owner2@example.com', 'password123');
    const quiz = await quizRepo.create(owner.id, {
      title: '管理テスト問題集',
      questions: [
        {
          question: 'Q1',
          choice1: 'A',
          choice2: 'B',
          choice3: null,
          choice4: null,
          answer: 1,
          explanation: null,
        },
      ],
    });

    render(
      <ShareQuizModal
        quiz={quiz}
        userId={owner.id}
        quizRepository={quizRepo}
        onClose={vi.fn()}
      />,
    );

    const initialInput = (await screen.findByLabelText('共有URL')) as HTMLInputElement;
    const initialUrl = initialInput.value;

    await user.click(screen.getByRole('button', { name: 'リンクを再発行' }));
    await waitFor(() => {
      expect((screen.getByLabelText('共有URL') as HTMLInputElement).value).not.toBe(initialUrl);
    });
    const regeneratedUrl = (screen.getByLabelText('共有URL') as HTMLInputElement).value;

    await user.click(screen.getByRole('button', { name: '共有を停止' }));
    expect(await screen.findByText('共有停止中')).toBeInTheDocument();
    expect(screen.queryByLabelText('共有URL')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '共有を再開する' }));
    expect(await screen.findByText('共有中')).toBeInTheDocument();
    expect((screen.getByLabelText('共有URL') as HTMLInputElement).value).toBe(regeneratedUrl);
  });
});
