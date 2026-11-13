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
});
