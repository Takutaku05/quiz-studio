import type { ParsedQuestion, Quiz, User } from '../domain/types';

export interface CreateQuizInput {
  title: string;
  questions: ParsedQuestion[];
}

export interface AuthRepository {
  getCurrentUser(): Promise<User | null>;
  signUp(email: string, password: string): Promise<User>;
  signIn(email: string, password: string): Promise<User>;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  onAuthStateChange?(callback: (user: User | null) => void): () => void;
}

export interface QuizRepository {
  listByUser(userId: string): Promise<Quiz[]>;
  getById(quizId: string, userId: string): Promise<Quiz | null>;
  create(userId: string, input: CreateQuizInput): Promise<Quiz>;
  delete(quizId: string, userId: string): Promise<boolean>;
}
