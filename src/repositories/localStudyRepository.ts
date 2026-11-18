import type { QuestionStat, QuizSession, SaveQuizSessionInput } from '../domain/types';
import type { RecordAnswerInput, StudyRepository } from './types';

const STUDY_STORAGE_KEYS = {
  STATS: 'csv_quiz_studio_question_stats',
  SESSIONS: 'csv_quiz_studio_quiz_sessions',
} as const;

interface StoredQuestionStat extends QuestionStat {
  userId: string;
}

interface StoredQuizSession extends QuizSession {
  userId: string;
}

function readList<T>(key: string): T[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, value: T[]): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function toPublicStat({ userId: _userId, ...stat }: StoredQuestionStat): QuestionStat {
  return stat;
}

function toPublicSession({ userId: _userId, ...session }: StoredQuizSession): QuizSession {
  return session;
}

/** 問題集の削除に合わせて、その問題集の成績と中断セッションを消す（DB の on delete cascade 相当）。 */
export function purgeLocalStudyData(quizId: string): void {
  const stats = readList<StoredQuestionStat>(STUDY_STORAGE_KEYS.STATS);
  const nextStats = stats.filter((s) => s.quizId !== quizId);
  if (nextStats.length !== stats.length) writeList(STUDY_STORAGE_KEYS.STATS, nextStats);

  const sessions = readList<StoredQuizSession>(STUDY_STORAGE_KEYS.SESSIONS);
  const nextSessions = sessions.filter((s) => s.quizId !== quizId);
  if (nextSessions.length !== sessions.length) writeList(STUDY_STORAGE_KEYS.SESSIONS, nextSessions);
}

export class LocalStudyRepository implements StudyRepository {
  async recordAnswer(userId: string, input: RecordAnswerInput): Promise<void> {
    const stats = readList<StoredQuestionStat>(STUDY_STORAGE_KEYS.STATS);
    const now = new Date().toISOString();
    const index = stats.findIndex((s) => s.userId === userId && s.questionId === input.questionId);
    const correctIncrement = input.isCorrect ? 1 : 0;

    if (index >= 0) {
      const current = stats[index];
      stats[index] = {
        ...current,
        attemptsCount: current.attemptsCount + 1,
        correctCount: current.correctCount + correctIncrement,
        lastIsCorrect: input.isCorrect,
        lastAnsweredAt: now,
      };
    } else {
      stats.push({
        userId,
        quizId: input.quizId,
        questionId: input.questionId,
        attemptsCount: 1,
        correctCount: correctIncrement,
        lastIsCorrect: input.isCorrect,
        lastAnsweredAt: now,
      });
    }
    writeList(STUDY_STORAGE_KEYS.STATS, stats);
  }

  async listStats(userId: string, quizId?: string): Promise<QuestionStat[]> {
    return readList<StoredQuestionStat>(STUDY_STORAGE_KEYS.STATS)
      .filter((s) => s.userId === userId && (quizId === undefined || s.quizId === quizId))
      .map(toPublicStat);
  }

  async getSession(userId: string, quizId: string): Promise<QuizSession | null> {
    const found = readList<StoredQuizSession>(STUDY_STORAGE_KEYS.SESSIONS).find(
      (s) => s.userId === userId && s.quizId === quizId,
    );
    return found ? toPublicSession(found) : null;
  }

  async listSessions(userId: string): Promise<QuizSession[]> {
    return readList<StoredQuizSession>(STUDY_STORAGE_KEYS.SESSIONS)
      .filter((s) => s.userId === userId)
      .map(toPublicSession);
  }

  async saveSession(userId: string, session: SaveQuizSessionInput): Promise<void> {
    const sessions = readList<StoredQuizSession>(STUDY_STORAGE_KEYS.SESSIONS).filter(
      (s) => !(s.userId === userId && s.quizId === session.quizId),
    );
    sessions.push({ ...session, userId, updatedAt: new Date().toISOString() });
    writeList(STUDY_STORAGE_KEYS.SESSIONS, sessions);
  }

  async deleteSession(userId: string, quizId: string): Promise<void> {
    const sessions = readList<StoredQuizSession>(STUDY_STORAGE_KEYS.SESSIONS);
    const next = sessions.filter((s) => !(s.userId === userId && s.quizId === quizId));
    if (next.length !== sessions.length) writeList(STUDY_STORAGE_KEYS.SESSIONS, next);
  }
}
