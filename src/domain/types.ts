export type AnswerNumber = 1 | 2 | 3 | 4;

export interface ParsedQuestion {
  question: string;
  choice1: string;
  choice2: string;
  choice3: string | null;
  choice4: string | null;
  answer: AnswerNumber;
  explanation: string | null;
}

export interface Question extends ParsedQuestion {
  id: string;
  quizId: string;
  orderIndex: number;
}

export interface Quiz {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  questions: Question[];
}

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface PasskeyCredential {
  id: string;
  friendlyName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export type QuizMode = 'one_by_one' | 'test';

export interface QuizSettings {
  mode: QuizMode;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
}

export interface QuizShare {
  id: string;
  quizId: string;
  token: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SharedQuizSummary {
  title: string;
  questionCount: number;
}

export type ImportSharedQuizStatus = 'imported' | 'already_imported' | 'own_quiz';

export interface ImportSharedQuizResult {
  quizId: string;
  title: string;
  questionCount: number;
  status: ImportSharedQuizStatus;
}

export type ReviewFilter = 'all' | 'recent_wrong' | 'low_accuracy' | 'retry_wrong';

export interface QuestionStat {
  quizId: string;
  questionId: string;
  attemptsCount: number;
  correctCount: number;
  lastIsCorrect: boolean;
  lastAnsweredAt: string;
}

export interface QuizSession {
  quizId: string;
  mode: QuizMode;
  targetFilter: ReviewFilter;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
  /** 出題順の問題ID */
  questionIds: string[];
  /** 問題IDごとの表示順の選択肢番号（originalNumber） */
  choicesOrder: Record<string, AnswerNumber[]>;
  answers: Record<string, AnswerNumber>;
  /** 次に出題する位置（= 回答済みの問題数） */
  currentIndex: number;
  updatedAt: string;
}

export type SaveQuizSessionInput = Omit<QuizSession, 'updatedAt'>;
