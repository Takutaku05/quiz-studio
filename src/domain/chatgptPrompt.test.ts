import { describe, expect, it } from 'vitest';
import { CHATGPT_PROJECT_PROMPT } from './chatgptPrompt';
import { REQUIRED_CSV_HEADERS } from './csvParser';
import { parseQuizTextInput } from './jsonParser';

describe('Bolt 14: chatgptPrompt', () => {
  it('defines the fileless ChatGPT Project prompt with JSON primary format and CSV fallback', () => {
    expect(CHATGPT_PROJECT_PROMPT).toContain('Quiz Studio');
    expect(CHATGPT_PROJECT_PROMPT).toContain('```json');
    expect(CHATGPT_PROJECT_PROMPT).toContain('"title"');
    expect(CHATGPT_PROJECT_PROMPT).toContain('"questions"');
    expect(CHATGPT_PROJECT_PROMPT).toContain(REQUIRED_CSV_HEADERS.join(','));
    expect(CHATGPT_PROJECT_PROMPT).toContain('```csv');
    expect(CHATGPT_PROJECT_PROMPT).toContain('1〜4');
  });

  it('has a valid JSON example structure inside the prompt template', () => {
    // Verify that the JSON schema example inside the prompt uses valid field names
    const match = CHATGPT_PROJECT_PROMPT.match(/(\{\s*"title"[\s\S]*?"questions":\s*\[[\s\S]*?\]\s*\})/);
    expect(match).not.toBeNull();
    const parsed = parseQuizTextInput(match![1]);
    expect(parsed.ok).toBe(true);
    expect(parsed.suggestedTitle).toBe('問題集の簡潔なタイトル');
    expect(parsed.questions).toHaveLength(1);
  });
});
