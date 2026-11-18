import type { PreparedChoice, PreparedQuestion } from './quizEngine';
import type { AnswerNumber, Question, QuizSession } from './types';

export type SessionSnapshot = Pick<QuizSession, 'questionIds' | 'choicesOrder'>;

/** 出題開始時に確定した問題順・選択肢順を、保存できる形に変換する。 */
export function toSessionSnapshot(prepared: readonly PreparedQuestion[]): SessionSnapshot {
  const choicesOrder: Record<string, AnswerNumber[]> = {};
  for (const item of prepared) {
    choicesOrder[item.source.id] = item.choices.map((c) => c.originalNumber);
  }
  return {
    questionIds: prepared.map((item) => item.source.id),
    choicesOrder,
  };
}

function choiceText(question: Question, num: AnswerNumber): string | null {
  const texts = [question.choice1, question.choice2, question.choice3, question.choice4];
  return texts[num - 1] ?? null;
}

function hasText(text: string | null): text is string {
  return typeof text === 'string' && text.trim().length > 0;
}

function restoreChoices(question: Question, order: readonly AnswerNumber[] | undefined): PreparedChoice[] | null {
  if (!Array.isArray(order)) return null;

  const expected = ([1, 2, 3, 4] as const).filter((num) => hasText(choiceText(question, num)));
  const isPermutation =
    order.length === expected.length &&
    new Set(order).size === order.length &&
    order.every((num) => (expected as readonly number[]).includes(num));
  if (!isPermutation) return null;

  return order.map((num) => ({
    originalNumber: num,
    text: choiceText(question, num) as string,
    isCorrect: num === question.answer,
  }));
}

/**
 * 保存されたスナップショットから、中断前と同じ問題順・選択肢順の出題データを組み立て直す。
 * 問題が消えている・選択肢の並びが問題と合わない・空のセッション、のいずれかなら null を返す。
 */
export function restorePreparedQuestions(
  questions: readonly Question[],
  snapshot: SessionSnapshot,
): PreparedQuestion[] | null {
  if (!Array.isArray(snapshot.questionIds) || snapshot.questionIds.length === 0) return null;

  const byId = new Map(questions.map((q) => [q.id, q]));
  const restored: PreparedQuestion[] = [];
  for (const id of snapshot.questionIds) {
    const source = byId.get(id);
    if (!source) return null;
    const choices = restoreChoices(source, snapshot.choicesOrder?.[id]);
    if (!choices) return null;
    restored.push({ source, choices });
  }
  return restored;
}
