import type { AnswerNumber, Question } from './types';

export interface PreparedChoice {
  originalNumber: AnswerNumber;
  text: string;
  isCorrect: boolean;
}

export interface PreparedQuestion {
  source: Question;
  choices: PreparedChoice[];
}

export interface ShuffleOptions {
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
}

export interface QuizResultItem {
  questionId: string;
  questionText: string;
  selectedNumber: AnswerNumber | null;
  selectedText: string;
  correctText: string;
  isCorrect: boolean;
  explanation: string | null;
}

export interface QuizResult {
  totalCount: number;
  correctCount: number;
  accuracyPercent: number;
  items: QuizResultItem[];
}

function fisherYatesShuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function buildPreparedChoices(
  question: Question,
  shuffleChoices: boolean,
  rng: () => number,
): PreparedChoice[] {
  const rawChoices: Array<{ num: AnswerNumber; text: string | null }> = [
    { num: 1, text: question.choice1 },
    { num: 2, text: question.choice2 },
    { num: 3, text: question.choice3 },
    { num: 4, text: question.choice4 },
  ];

  const nonEmptyChoices: PreparedChoice[] = rawChoices
    .filter((entry): entry is { num: AnswerNumber; text: string } => {
      return typeof entry.text === 'string' && entry.text.trim().length > 0;
    })
    .map((entry) => ({
      originalNumber: entry.num,
      text: entry.text,
      isCorrect: entry.num === question.answer,
    }));

  return shuffleChoices ? fisherYatesShuffle(nonEmptyChoices, rng) : nonEmptyChoices;
}

export function prepareQuizQuestions(
  questions: readonly Question[],
  options: ShuffleOptions,
  rng: () => number = Math.random,
): PreparedQuestion[] {
  const orderedQuestions = options.shuffleQuestions
    ? fisherYatesShuffle(questions, rng)
    : [...questions];

  return orderedQuestions.map((source) => ({
    source,
    choices: buildPreparedChoices(source, options.shuffleChoices, rng),
  }));
}

export function calculateQuizResult(
  preparedQuestions: readonly PreparedQuestion[],
  answersByQuestionId: Record<string, number | undefined>,
): QuizResult {
  const items: QuizResultItem[] = preparedQuestions.map((item) => {
    const selectedNum = answersByQuestionId[item.source.id] ?? null;
    const selectedChoice = item.choices.find((c) => c.originalNumber === selectedNum);
    const correctChoice = item.choices.find((c) => c.isCorrect);
    const isCorrect = Boolean(selectedChoice?.isCorrect);

    return {
      questionId: item.source.id,
      questionText: item.source.question,
      selectedNumber: (selectedNum as AnswerNumber | null) ?? null,
      selectedText: selectedChoice?.text ?? '未回答',
      correctText: correctChoice?.text ?? '',
      isCorrect,
      explanation: item.source.explanation,
    };
  });

  const totalCount = items.length;
  const correctCount = items.filter((item) => item.isCorrect).length;
  const accuracyPercent = totalCount === 0 ? 0 : Math.round((correctCount / totalCount) * 100);

  return {
    totalCount,
    correctCount,
    accuracyPercent,
    items,
  };
}

export function extractWrongQuestions(
  preparedQuestions: readonly PreparedQuestion[],
  answersByQuestionId: Record<string, number | undefined>,
): Question[] {
  return preparedQuestions
    .filter((item) => {
      const selectedNum = answersByQuestionId[item.source.id];
      return selectedNum !== item.source.answer;
    })
    .map((item) => item.source);
}
