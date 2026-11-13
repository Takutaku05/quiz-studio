import type { Question, Quiz, User } from '../domain/types';
import type { AuthRepository, CreateQuizInput, QuizRepository } from './types';

const STORAGE_KEYS = {
  USERS: 'csv_quiz_studio_users',
  SESSION_USER_ID: 'csv_quiz_studio_session_user_id',
  QUIZZES: 'csv_quiz_studio_quizzes',
} as const;

interface StoredUser extends User {
  password: string;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function toPublicUser(stored: StoredUser): User {
  return {
    id: stored.id,
    email: stored.email,
    createdAt: stored.createdAt,
  };
}

export class LocalAuthRepository implements AuthRepository {
  async getCurrentUser(): Promise<User | null> {
    const userId = localStorage.getItem(STORAGE_KEYS.SESSION_USER_ID);
    if (!userId) return null;
    const users = readJson<StoredUser[]>(STORAGE_KEYS.USERS, []);
    const found = users.find((u) => u.id === userId);
    return found ? toPublicUser(found) : null;
  }

  async signUp(email: string, password: string): Promise<User> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error('有効なメールアドレスを入力してください。');
    }
    if (password.length < 6) {
      throw new Error('パスワードは6文字以上で入力してください。');
    }

    const users = readJson<StoredUser[]>(STORAGE_KEYS.USERS, []);
    if (users.some((u) => u.email === normalizedEmail)) {
      throw new Error('このメールアドレスは既に登録されています。');
    }

    const newUser: StoredUser = {
      id: generateId(),
      email: normalizedEmail,
      password,
      createdAt: new Date().toISOString(),
    };

    writeJson(STORAGE_KEYS.USERS, [...users, newUser]);
    localStorage.setItem(STORAGE_KEYS.SESSION_USER_ID, newUser.id);
    return toPublicUser(newUser);
  }

  async signIn(email: string, password: string): Promise<User> {
    const normalizedEmail = email.trim().toLowerCase();
    const users = readJson<StoredUser[]>(STORAGE_KEYS.USERS, []);
    const found = users.find(
      (u) => u.email === normalizedEmail && u.password === password,
    );
    if (!found) {
      throw new Error('メールアドレスまたはパスワードが正しくありません。');
    }
    localStorage.setItem(STORAGE_KEYS.SESSION_USER_ID, found.id);
    return toPublicUser(found);
  }

  async signOut(): Promise<void> {
    localStorage.removeItem(STORAGE_KEYS.SESSION_USER_ID);
  }
}

export class LocalQuizRepository implements QuizRepository {
  async listByUser(userId: string): Promise<Quiz[]> {
    const quizzes = readJson<Quiz[]>(STORAGE_KEYS.QUIZZES, []);
    return quizzes
      .filter((q) => q.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getById(quizId: string, userId: string): Promise<Quiz | null> {
    const quizzes = readJson<Quiz[]>(STORAGE_KEYS.QUIZZES, []);
    const found = quizzes.find((q) => q.id === quizId && q.userId === userId);
    return found ?? null;
  }

  async create(userId: string, input: CreateQuizInput): Promise<Quiz> {
    const title = input.title.trim();
    if (!title) {
      throw new Error('問題集タイトルを入力してください。');
    }
    if (input.questions.length === 0) {
      throw new Error('問題が1問も含まれていません。');
    }

    const quizId = generateId();
    const questions: Question[] = input.questions.map((q, index) => ({
      ...q,
      id: generateId(),
      quizId,
      orderIndex: index,
    }));

    const newQuiz: Quiz = {
      id: quizId,
      userId,
      title,
      createdAt: new Date().toISOString(),
      questions,
    };

    const quizzes = readJson<Quiz[]>(STORAGE_KEYS.QUIZZES, []);
    writeJson(STORAGE_KEYS.QUIZZES, [...quizzes, newQuiz]);
    return newQuiz;
  }

  async delete(quizId: string, userId: string): Promise<boolean> {
    const quizzes = readJson<Quiz[]>(STORAGE_KEYS.QUIZZES, []);
    const target = quizzes.find((q) => q.id === quizId && q.userId === userId);
    if (!target) {
      return false;
    }
    const nextQuizzes = quizzes.filter((q) => q.id !== quizId);
    writeJson(STORAGE_KEYS.QUIZZES, nextQuizzes);
    return true;
  }
}
