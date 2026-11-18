export type ClipboardReadResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'unsupported' | 'empty' | 'denied'; message: string };

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function readTextFromClipboard(): Promise<ClipboardReadResult> {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.readText !== 'function') {
    return {
      ok: false,
      reason: 'unsupported',
      message: '自動読み取りに対応していません。下の入力欄を長押しして「ペースト」してください。',
    };
  }

  try {
    const clipText = await navigator.clipboard.readText();
    if (!clipText.trim()) {
      return {
        ok: false,
        reason: 'empty',
        message: 'クリップボードが空です。ChatGPTの回答をコピーしてからもう一度お試しください。',
      };
    }
    return { ok: true, text: clipText };
  } catch {
    return {
      ok: false,
      reason: 'denied',
      message: '自動読み取りが許可されていません。下の入力欄を長押しして「ペースト」してください。',
    };
  }
}
