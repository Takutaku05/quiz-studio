import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { PasskeyCredential } from '../domain/types';
import type { AuthRepository } from '../repositories/types';

interface PasskeySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  authRepository: AuthRepository;
}

export function PasskeySettingsModal({
  isOpen,
  onClose,
  authRepository,
}: PasskeySettingsModalProps) {
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [friendlyName, setFriendlyName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingRename, setSavingRename] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const webAuthnSupported = authRepository.isPasskeySupported
    ? authRepository.isPasskeySupported()
    : true;

  const loadPasskeys = useCallback(async () => {
    if (!authRepository.listPasskeys) {
      setUnavailableMessage('パスキー認証はこの認証設定では利用できません。');
      return;
    }
    setLoading(true);
    setError(null);
    setUnavailableMessage(null);
    try {
      const list = await authRepository.listPasskeys();
      setPasskeys(list);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'パスキー一覧の取得に失敗しました。';
      if (msg.includes('Supabase連携時のみ')) {
        setUnavailableMessage(msg);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [authRepository]);

  useEffect(() => {
    if (!isOpen) return;
    setNotice(null);
    setError(null);
    setEditingId(null);
    setConfirmDeleteId(null);
    void loadPasskeys();
  }, [isOpen, loadPasskeys]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const canRegister = !unavailableMessage && webAuthnSupported && !registering && Boolean(authRepository.registerPasskey);

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!authRepository.registerPasskey || !canRegister) return;
    setError(null);
    setNotice(null);
    setRegistering(true);
    try {
      const created = await authRepository.registerPasskey(friendlyName);
      setFriendlyName('');
      setPasskeys((prev) => [...prev, created]);
      setNotice('パスキーを登録しました。次回からパスキーでログインできます。');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'パスキーの登録に失敗しました。');
    } finally {
      setRegistering(false);
    }
  };

  const handleRenameSubmit = async (passkeyId: string) => {
    if (!authRepository.updatePasskeyName) return;
    setError(null);
    setNotice(null);
    setSavingRename(true);
    try {
      const updated = await authRepository.updatePasskeyName(passkeyId, editingName);
      setPasskeys((prev) => prev.map((pk) => (pk.id === passkeyId ? updated : pk)));
      setEditingId(null);
      setEditingName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'パスキー名の更新に失敗しました。');
    } finally {
      setSavingRename(false);
    }
  };

  const handleDelete = async (passkeyId: string) => {
    if (!authRepository.deletePasskey) return;
    setError(null);
    setNotice(null);
    setDeletingId(passkeyId);
    try {
      await authRepository.deletePasskey(passkeyId);
      setPasskeys((prev) => prev.filter((pk) => pk.id !== passkeyId));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'パスキーの削除に失敗しました。');
    } finally {
      setDeletingId(null);
    }
  };

  const browserNotice =
    !unavailableMessage && !webAuthnSupported
      ? 'このブラウザはパスキー（WebAuthn）に対応していません。対応ブラウザの HTTPS 環境でご利用ください。'
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="passkey-settings-title"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-indigo-600" />
            <h2 id="passkey-settings-title" className="text-lg font-bold text-slate-900">
              パスキー設定
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          <p className="text-xs text-slate-600 leading-relaxed">
            パスキーを登録すると、次回から端末の生体認証やPINを使ってメールアドレス・パスワードなしでログインできます。
          </p>

          {(unavailableMessage || browserNotice) && (
            <div
              role="status"
              className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-sm text-amber-800"
            >
              {unavailableMessage ?? browserNotice}
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-sm text-emerald-800"
            >
              {notice}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-sm text-rose-700"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-3 rounded-xl bg-slate-50 border border-slate-200 p-4">
            <div>
              <label
                htmlFor="passkey-friendly-name"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                パスキーの表示名（任意）
              </label>
              <input
                id="passkey-friendly-name"
                type="text"
                maxLength={120}
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
                placeholder="例: MacBook Touch ID"
                disabled={Boolean(unavailableMessage) || !webAuthnSupported || registering}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={!canRegister}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white text-sm font-semibold py-2.5 px-4 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              <span>{registering ? 'パスキーを登録中...' : 'この端末にパスキーを登録'}</span>
            </button>
          </form>

          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-2">登録済みパスキー</h3>
            {loading ? (
              <p className="text-sm text-slate-500 py-4 text-center">読み込み中...</p>
            ) : passkeys.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-xl">
                登録済みのパスキーはまだありません
              </p>
            ) : (
              <ul className="space-y-2.5">
                {passkeys.map((pk) => {
                  const isEditing = editingId === pk.id;
                  const isConfirming = confirmDeleteId === pk.id;
                  const createdLabel = new Date(pk.createdAt).toLocaleDateString('ja-JP');
                  const lastUsedLabel = pk.lastUsedAt
                    ? new Date(pk.lastUsedAt).toLocaleDateString('ja-JP')
                    : null;

                  return (
                    <li
                      key={pk.id}
                      className="rounded-xl border border-slate-200 p-3.5 space-y-2.5"
                    >
                      {isEditing ? (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            aria-label="新しいパスキー名"
                            maxLength={120}
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={savingRename}
                              onClick={() => handleRenameSubmit(pk.id)}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(null);
                                setEditingName('');
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {pk.friendlyName || '名称未設定のパスキー'}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              登録日: {createdLabel}
                              {lastUsedLabel ? ` / 最終利用: ${lastUsedLabel}` : ''}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {!isConfirming && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(pk.id);
                                  setEditingName(pk.friendlyName ?? '');
                                }}
                                aria-label="名前変更"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span>名前変更</span>
                              </button>
                            )}

                            {isConfirming ? (
                              <>
                                <button
                                  type="button"
                                  disabled={deletingId === pk.id}
                                  onClick={() => handleDelete(pk.id)}
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                                >
                                  削除を確定
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
                                >
                                  戻る
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(pk.id)}
                                aria-label="削除"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>削除</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
