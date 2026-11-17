import type {
  ImportSharedQuizResult,
  ParsedQuestion,
  PasskeyCredential,
  Quiz,
  QuizShare,
  SharedQuizSummary,
  User,
} from '../domain/types';

export interface CreateQuizInput {
  title: string;
  questions: ParsedQuestion[];
}

export interface AuthRepository {
  getCurrentUser(): Promise<User | null>;
  signUp(email: string, password: string, redirectPath?: string): Promise<User>;
  signIn(email: string, password: string): Promise<User>;
  signInWithGoogle(redirectPath?: string): Promise<void>;
  signOut(): Promise<void>;
  onAuthStateChange?(callback: (user: User | null) => void): () => void;
  isPasskeySupported?(): boolean;
  signInWithPasskey?(): Promise<User>;
  registerPasskey?(friendlyName?: string): Promise<PasskeyCredential>;
  listPasskeys?(): Promise<PasskeyCredential[]>;
  updatePasskeyName?(passkeyId: string, friendlyName: string): Promise<PasskeyCredential>;
  deletePasskey?(passkeyId: string): Promise<void>;
}

export interface QuizRepository {
  listByUser(userId: string): Promise<Quiz[]>;
  getById(quizId: string, userId: string): Promise<Quiz | null>;
  create(userId: string, input: CreateQuizInput): Promise<Quiz>;
  delete(quizId: string, userId: string): Promise<boolean>;
  getShare?(quizId: string, userId: string): Promise<QuizShare | null>;
  enableShare?(quizId: string, userId: string): Promise<QuizShare>;
  disableShare?(quizId: string, userId: string): Promise<QuizShare>;
  regenerateShare?(quizId: string, userId: string): Promise<QuizShare>;
  getSharedQuizSummary?(token: string): Promise<SharedQuizSummary | null>;
  importByShareToken?(token: string, userId: string): Promise<ImportSharedQuizResult>;
}
