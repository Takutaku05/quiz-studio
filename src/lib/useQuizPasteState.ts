import { useCallback, useRef, useState } from 'react';
import type { CsvValidationError } from '../domain/csvParser';
import { parseQuizTextInput } from '../domain/jsonParser';
import type { ParsedQuestion } from '../domain/types';
import { readTextFromClipboard } from './clipboard';

interface UseQuizPasteStateOptions {
  onSuggestTitle?: (suggestedTitle: string) => void;
  onBeforeApply?: () => void;
}

export function useQuizPasteState({ onSuggestTitle, onBeforeApply }: UseQuizPasteStateOptions = {}) {
  const [pastedText, setPastedText] = useState('');
  const [pasteFormat, setPasteFormat] = useState<'json' | 'csv' | null>(null);
  const [pasteQuestions, setPasteQuestions] = useState<ParsedQuestion[]>([]);
  const [pasteErrors, setPasteErrors] = useState<CsvValidationError[]>([]);
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null);

  const onSuggestTitleRef = useRef(onSuggestTitle);
  onSuggestTitleRef.current = onSuggestTitle;
  const onBeforeApplyRef = useRef(onBeforeApply);
  onBeforeApplyRef.current = onBeforeApply;

  const applyPastedText = useCallback((nextText: string) => {
    setPastedText(nextText);
    onBeforeApplyRef.current?.();

    if (!nextText.trim()) {
      setPasteFormat(null);
      setPasteQuestions([]);
      setPasteErrors([]);
      return;
    }

    const result = parseQuizTextInput(nextText);
    setPasteFormat(result.format);

    if (result.format === 'json' && result.suggestedTitle) {
      onSuggestTitleRef.current?.(result.suggestedTitle);
    }

    if (result.ok) {
      setPasteQuestions(result.questions);
      setPasteErrors([]);
    } else {
      setPasteQuestions([]);
      setPasteErrors(result.errors);
    }
  }, []);

  const handlePasteFromClipboard = useCallback(async () => {
    setClipboardNotice(null);
    const clipResult = await readTextFromClipboard();
    if (!clipResult.ok) {
      setClipboardNotice(clipResult.message);
      return;
    }
    applyPastedText(clipResult.text);
  }, [applyPastedText]);

  const resetPasteState = useCallback(() => {
    setPastedText('');
    setPasteFormat(null);
    setPasteQuestions([]);
    setPasteErrors([]);
    setClipboardNotice(null);
  }, []);

  return {
    pastedText,
    pasteFormat,
    pasteQuestions,
    pasteErrors,
    clipboardNotice,
    applyPastedText,
    handlePasteFromClipboard,
    resetPasteState,
  };
}
