import type { PasskeyCredential, Question, Quiz, User } from '../domain/types';
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
  private readonly listeners = new Set<(user: User | null) => void>();

  private notify(user: User | null): void {
    for (const listener of this.listeners) {
      listener(user);
    }
  }

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
    const publicUser = toPublicUser(newUser);
    this.notify(publicUser);
    return publicUser;
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
    const publicUser = toPublicUser(found);
    this.notify(publicUser);
    return publicUser;
  }

  async signInWithGoogle(): Promise<void> {
    throw new Error('GoogleログインはSupabase連携時のみ利用できます。');
  }

  async signOut(): Promise<void> {
    localStorage.removeItem(STORAGE_KEYS.SESSION_USER_ID);
    this.notify(null);
  }

  onAuthStateChange(callback: (user: User | null) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  isPasskeySupported(): boolean {
    return false;
  }

  async signInWithPasskey(): Promise<User> {
    throw new Error('パスキー認証はSupabase連携時のみ利用できます。');
  }

  async registerPasskey(_friendlyName?: string): Promise<PasskeyCredential> {
    throw new Error('パスキー認証はSupabase連携時のみ利用できます。');
  }

  async listPasskeys(): Promise<PasskeyCredential[]> {
    throw new Error('パスキー認証はSupabase連携時のみ利用できます。');
  }

  async updatePasskeyName(_passkeyId: string, _friendlyName: string): Promise<PasskeyCredential> {
    throw new Error('パスキー認証はSupabase連携時のみ利用できます。');
  }

  async deletePasskey(_passkeyId: string): Promise<void> {
    throw new Error('パスキー認証はSupabase連携時のみ利用できます。');
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
