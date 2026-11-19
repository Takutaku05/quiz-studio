import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PasskeyCredential } from '../domain/types';
import { LocalAuthRepository } from '../repositories/localStorageRepositories';
import type { AuthRepository } from '../repositories/types';
import { PasskeySettingsModal } from './PasskeySettingsModal';

function createPasskeyRepo(initial: PasskeyCredential[] = [], supported = true): AuthRepository {
  const base = new LocalAuthRepository();
  let items = [...initial];
  return {
    getCurrentUser: () => base.getCurrentUser(),
    signUp: (e, p) => base.signUp(e, p),
    signIn: (e, p) => base.signIn(e, p),
    signInWithGoogle: () => base.signInWithGoogle(),
    signOut: () => base.signOut(),
    isPasskeySupported: () => supported,
    listPasskeys: vi.fn(async () => [...items]),
    registerPasskey: vi.fn(async (friendlyName?: string) => {
      const created: PasskeyCredential = {
        id: `pk-${items.length + 1}`,
        friendlyName: friendlyName?.trim() || null,
        createdAt: '2026-11-13T00:00:00Z',
        lastUsedAt: null,
      };
      items = [...items, created];
      return created;
    }),
    updatePasskeyName: vi.fn(async (passkeyId: string, friendlyName: string) => {
      const target = items.find((item) => item.id === passkeyId);
      if (!target) throw new Error('Not found');
      const updated = { ...target, friendlyName: friendlyName.trim() };
      items = items.map((item) => (item.id === passkeyId ? updated : item));
      return updated;
    }),
    deletePasskey: vi.fn(async (passkeyId: string) => {
      items = items.filter((item) => item.id !== passkeyId);
    }),
  };
}

describe('Bolt 07: PasskeySettingsModal', () => {
  it('lists, registers, renames, and deletes passkeys with confirmation', async () => {
    const user = userEvent.setup();
    const repo = createPasskeyRepo([
      {
        id: 'pk-1',
        friendlyName: 'MacBook Touch ID',
        createdAt: '2026-11-10T00:00:00Z',
        lastUsedAt: '2026-11-12T00:00:00Z',
      },
    ]);

    render(
      <PasskeySettingsModal
        isOpen={true}
        onClose={vi.fn()}
        authRepository={repo}
      />,
    );

    expect(await screen.findByText('MacBook Touch ID')).toBeInTheDocument();

    // Register a new passkey with a friendly name
    await user.type(screen.getByLabelText('パスキーの表示名（任意）'), 'iPhone Face ID');
    await user.click(screen.getByRole('button', { name: 'この端末にパスキーを登録' }));
    expect(await screen.findByText('iPhone Face ID')).toBeInTheDocument();

    // Rename the newly registered passkey
    const renameButtons = screen.getAllByRole('button', { name: '名前変更' });
    await user.click(renameButtons[1]);
    const editInput = screen.getByLabelText('新しいパスキー名');
    await user.clear(editInput);
    await user.type(editInput, '仕事用 iPhone');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('仕事用 iPhone')).toBeInTheDocument();

    // Delete with 2-step confirmation
    const deleteButtons = screen.getAllByRole('button', { name: '削除' });
    await user.click(deleteButtons[0]);
    await user.click(screen.getByRole('button', { name: '削除を確定' }));

    await waitFor(() => {
      expect(screen.queryByText('MacBook Touch ID')).not.toBeInTheDocument();
    });
    expect(screen.getByText('仕事用 iPhone')).toBeInTheDocument();
  });

  it('shows unsupported message and disables registration when WebAuthn is unsupported', async () => {
    const repo = createPasskeyRepo([], false);
    render(
      <PasskeySettingsModal
        isOpen={true}
        onClose={vi.fn()}
        authRepository={repo}
      />,
    );

    expect(
      await screen.findByText(/このブラウザはパスキー（WebAuthn）に対応していません/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'この端末にパスキーを登録' }),
    ).toBeDisabled();
  });

  it('shows localStorage notice when Supabase is not configured', async () => {
    const repo = new LocalAuthRepository();
    render(
      <PasskeySettingsModal
        isOpen={true}
        onClose={vi.fn()}
        authRepository={repo}
      />,
    );

    expect(
      await screen.findByText('パスキー認証はSupabase連携時のみ利用できます。'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'この端末にパスキーを登録' }),
    ).toBeDisabled();
  });

  it('shows fallback notice when friendlyName update fails during registration', async () => {
    const user = userEvent.setup();
    const repo = createPasskeyRepo();
    repo.registerPasskey = vi.fn(async () => ({
      id: 'pk-fallback',
      friendlyName: null,
      createdAt: '2026-11-13T00:00:00Z',
      lastUsedAt: null,
    }));

    render(<PasskeySettingsModal isOpen={true} onClose={vi.fn()} authRepository={repo} />);

    await screen.findByText('登録済みのパスキーはまだありません');
    await user.type(screen.getByLabelText('パスキーの表示名（任意）'), 'My MacBook');
    await user.click(screen.getByRole('button', { name: 'この端末にパスキーを登録' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'パスキーを登録しましたが、表示名の設定に失敗しました。一覧の「名前変更」から設定できます。',
    );
    expect(screen.getByText('名称未設定のパスキー')).toBeInTheDocument();
  });

  it('supports Enter to save rename, Escape to cancel inline edit before closing, backdrop click, and clears draft on reopen', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const repo = createPasskeyRepo([
      {
        id: 'pk-1',
        friendlyName: 'Old Name',
        createdAt: '2026-11-10T00:00:00Z',
        lastUsedAt: null,
      },
    ]);

    const { rerender } = render(
      <PasskeySettingsModal isOpen={true} onClose={onClose} authRepository={repo} />,
    );

    expect(await screen.findByText('Old Name')).toBeInTheDocument();

    // Enter submits inline rename form
    await user.click(screen.getByRole('button', { name: '名前変更' }));
    const editInput = screen.getByLabelText('新しいパスキー名');
    await user.clear(editInput);
    await user.type(editInput, 'Keyboard Renamed{Enter}');
    expect(await screen.findByText('Keyboard Renamed')).toBeInTheDocument();

    // First Escape cancels inline editing without closing modal; second Escape closes modal
    await user.click(screen.getByRole('button', { name: '名前変更' }));
    expect(screen.getByLabelText('新しいパスキー名')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('新しいパスキー名')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    // Clicking inside dialog does not close, clicking backdrop closes
    const dialog = screen.getByRole('dialog');
    await user.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);

    // Unsubmitted friendlyName is cleared when modal closes and reopens
    await user.type(screen.getByLabelText('パスキーの表示名（任意）'), 'Draft Key');
    rerender(<PasskeySettingsModal isOpen={false} onClose={onClose} authRepository={repo} />);
    rerender(<PasskeySettingsModal isOpen={true} onClose={onClose} authRepository={repo} />);
    expect(await screen.findByLabelText('パスキーの表示名（任意）')).toHaveValue('');
  });

  it('displays role="alert" when register, rename, or delete API calls fail', async () => {
    const user = userEvent.setup();
    const repo = createPasskeyRepo([
      {
        id: 'pk-1',
        friendlyName: 'Work Key',
        createdAt: '2026-11-10T00:00:00Z',
        lastUsedAt: null,
      },
    ]);
    repo.registerPasskey = vi.fn().mockRejectedValue(new Error('登録エラー'));
    repo.updatePasskeyName = vi.fn().mockRejectedValue(new Error('名前変更エラー'));
    repo.deletePasskey = vi.fn().mockRejectedValue(new Error('削除エラー'));

    render(<PasskeySettingsModal isOpen={true} onClose={vi.fn()} authRepository={repo} />);
    expect(await screen.findByText('Work Key')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'この端末にパスキーを登録' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('登録エラー');

    await user.click(screen.getByRole('button', { name: '名前変更' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('名前変更エラー');
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    await user.click(screen.getByRole('button', { name: '削除' }));
    await user.click(screen.getByRole('button', { name: '削除を確定' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('削除エラー');
  });

  it('moves focus into the modal on open and restores focus to the trigger button on close', async () => {
    const user = userEvent.setup();
    const repo = createPasskeyRepo();

    function Wrapper() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            パスキー設定を開く
          </button>
          <PasskeySettingsModal isOpen={open} onClose={() => setOpen(false)} authRepository={repo} />
        </div>
      );
    }

    render(<Wrapper />);
    const trigger = screen.getByRole('button', { name: 'パスキー設定を開く' });
    await user.click(trigger);

    const closeButton = await screen.findByRole('button', { name: '閉じる' });
    expect(closeButton).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });
});
