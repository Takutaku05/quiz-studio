import type {
  ImportSharedQuizResult,
  PasskeyCredential,
  Question,
  Quiz,
  QuizShare,
  SharedQuizSummary,
  User,
} from '../domain/types';
import { purgeLocalStudyData } from './localStudyRepository';
import type { AuthRepository, CreateQuizInput, QuizRepository } from './types';

const STORAGE_KEYS = {
  USERS: 'csv_quiz_studio_users',
  SESSION_USER_ID: 'csv_quiz_studio_session_user_id',
  QUIZZES: 'csv_quiz_studio_quizzes',
  QUIZ_SHARES: 'csv_quiz_studio_quiz_shares',
  QUIZ_SHARE_IMPORTS: 'csv_quiz_studio_quiz_share_imports',
} as const;

interface StoredUser extends User {
  password: string;
}

interface StoredQuizShare extends QuizShare {
  ownerId: string;
}

interface StoredQuizShareImport {
  id: string;
  shareId: string;
  recipientUserId: string;
  importedQuizId: string;
  importedAt: string;
}

function toPublicShare(stored: StoredQuizShare): QuizShare {
  return {
    id: stored.id,
    quizId: stored.quizId,
    token: stored.token,
    isActive: stored.isActive,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
}

function generateShareToken(): string {
  return generateId().replace(/-/g, '');
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
  private readonly inFlightImports = new Map<string, Promise<ImportSharedQuizResult>>();

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

    const shares = readJson<StoredQuizShare[]>(STORAGE_KEYS.QUIZ_SHARES, []);
    const nextShares = shares.filter((s) => s.quizId !== quizId);
    if (nextShares.length !== shares.length) {
      writeJson(STORAGE_KEYS.QUIZ_SHARES, nextShares);
    }

    purgeLocalStudyData(quizId);

    return true;
  }

  async getShare(quizId: string, userId: string): Promise<QuizShare | null> {
    const ownerQuiz = await this.getById(quizId, userId);
    if (!ownerQuiz) return null;
    const shares = readJson<StoredQuizShare[]>(STORAGE_KEYS.QUIZ_SHARES, []);
    const found = shares.find((s) => s.quizId === quizId && s.ownerId === userId);
    return found ? toPublicShare(found) : null;
  }

  async enableShare(quizId: string, userId: string): Promise<QuizShare> {
    const ownerQuiz = await this.getById(quizId, userId);
    if (!ownerQuiz) {
      throw new Error('問題集が見つかりません。');
    }

    const shares = readJson<StoredQuizShare[]>(STORAGE_KEYS.QUIZ_SHARES, []);
    const now = new Date().toISOString();
    const existingIndex = shares.findIndex((s) => s.quizId === quizId && s.ownerId === userId);
    if (existingIndex >= 0) {
      const updated: StoredQuizShare = {
        ...shares[existingIndex],
        isActive: true,
        updatedAt: now,
      };
      const next = [...shares];
      next[existingIndex] = updated;
      writeJson(STORAGE_KEYS.QUIZ_SHARES, next);
      return toPublicShare(updated);
    }

    const created: StoredQuizShare = {
      id: generateId(),
      quizId,
      ownerId: userId,
      token: generateShareToken(),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    writeJson(STORAGE_KEYS.QUIZ_SHARES, [...shares, created]);
    return toPublicShare(created);
  }

  async disableShare(quizId: string, userId: string): Promise<QuizShare> {
    const shares = readJson<StoredQuizShare[]>(STORAGE_KEYS.QUIZ_SHARES, []);
    const existingIndex = shares.findIndex((s) => s.quizId === quizId && s.ownerId === userId);
    if (existingIndex < 0) {
      throw new Error('共有設定が見つかりません。');
    }

    const updated: StoredQuizShare = {
      ...shares[existingIndex],
      isActive: false,
      updatedAt: new Date().toISOString(),
    };
    const next = [...shares];
    next[existingIndex] = updated;
    writeJson(STORAGE_KEYS.QUIZ_SHARES, next);
    return toPublicShare(updated);
  }

  async regenerateShare(quizId: string, userId: string): Promise<QuizShare> {
    const ownerQuiz = await this.getById(quizId, userId);
    if (!ownerQuiz) {
      throw new Error('問題集が見つかりません。');
    }

    const shares = readJson<StoredQuizShare[]>(STORAGE_KEYS.QUIZ_SHARES, []);
    const now = new Date().toISOString();
    const existingIndex = shares.findIndex((s) => s.quizId === quizId && s.ownerId === userId);
    const nextShare: StoredQuizShare =
      existingIndex >= 0
        ? {
            ...shares[existingIndex],
            token: generateShareToken(),
            isActive: true,
            updatedAt: now,
          }
        : {
            id: generateId(),
            quizId,
            ownerId: userId,
            token: generateShareToken(),
            isActive: true,
            createdAt: now,
            updatedAt: now,
          };

    const next =
      existingIndex >= 0
        ? shares.map((s, idx) => (idx === existingIndex ? nextShare : s))
        : [...shares, nextShare];
    writeJson(STORAGE_KEYS.QUIZ_SHARES, next);
    return toPublicShare(nextShare);
  }

  async getSharedQuizSummary(token: string): Promise<SharedQuizSummary | null> {
    const cleanToken = token.trim();
    if (!cleanToken) return null;

    const shares = readJson<StoredQuizShare[]>(STORAGE_KEYS.QUIZ_SHARES, []);
    const share = shares.find((s) => s.token === cleanToken && s.isActive);
    if (!share) return null;

    const quizzes = readJson<Quiz[]>(STORAGE_KEYS.QUIZZES, []);
    const quiz = quizzes.find((q) => q.id === share.quizId);
    if (!quiz) return null;

    return {
      title: quiz.title,
      questionCount: quiz.questions.length,
    };
  }

  async importByShareToken(token: string, userId: string): Promise<ImportSharedQuizResult> {
    const cleanToken = token.trim();
    if (!cleanToken) {
      throw new Error('共有リンクが見つからないか、共有が停止されています。');
    }

    const lockKey = `${cleanToken}:${userId}`;
    const existingPromise = this.inFlightImports.get(lockKey);
    if (existingPromise) {
      return existingPromise;
    }

    const run = this.executeImportByShareToken(cleanToken, userId).finally(() => {
      this.inFlightImports.delete(lockKey);
    });
    this.inFlightImports.set(lockKey, run);
    return run;
  }

  private async executeImportByShareToken(
    cleanToken: string,
    userId: string,
  ): Promise<ImportSharedQuizResult> {
    const shares = readJson<StoredQuizShare[]>(STORAGE_KEYS.QUIZ_SHARES, []);
    const share = shares.find((s) => s.token === cleanToken && s.isActive);
    if (!share) {
      throw new Error('共有リンクが見つからないか、共有が停止されています。');
    }

    const quizzes = readJson<Quiz[]>(STORAGE_KEYS.QUIZZES, []);
    const sourceQuiz = quizzes.find((q) => q.id === share.quizId);
    if (!sourceQuiz) {
      throw new Error('共有元の問題集が見つかりません。');
    }

    if (sourceQuiz.userId === userId) {
      return {
        quizId: sourceQuiz.id,
        title: sourceQuiz.title,
        questionCount: sourceQuiz.questions.length,
        status: 'own_quiz',
      };
    }

    const imports = readJson<StoredQuizShareImport[]>(STORAGE_KEYS.QUIZ_SHARE_IMPORTS, []);
    const existingImport = imports.find(
      (item) => item.shareId === share.id && item.recipientUserId === userId,
    );
    if (existingImport) {
      const existingQuiz = quizzes.find(
        (q) => q.id === existingImport.importedQuizId && q.userId === userId,
      );
      if (existingQuiz) {
        return {
          quizId: existingQuiz.id,
          title: existingQuiz.title,
          questionCount: existingQuiz.questions.length,
          status: 'already_imported',
        };
      }
    }

    const created = await this.create(userId, {
      title: sourceQuiz.title,
      questions: sourceQuiz.questions
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((q) => ({
          question: q.question,
          choice1: q.choice1,
          choice2: q.choice2,
          choice3: q.choice3,
          choice4: q.choice4,
          answer: q.answer,
          explanation: q.explanation,
        })),
    });

    const nextRecord: StoredQuizShareImport = {
      id: generateId(),
      shareId: share.id,
      recipientUserId: userId,
      importedQuizId: created.id,
      importedAt: new Date().toISOString(),
    };
    const filteredImports = imports.filter(
      (item) => !(item.shareId === share.id && item.recipientUserId === userId),
    );
    writeJson(STORAGE_KEYS.QUIZ_SHARE_IMPORTS, [...filteredImports, nextRecord]);

    return {
      quizId: created.id,
      title: created.title,
      questionCount: created.questions.length,
      status: 'imported',
    };
  }
}
