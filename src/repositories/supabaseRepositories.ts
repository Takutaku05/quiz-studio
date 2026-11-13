import type { SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
import type { AnswerNumber, Question, Quiz, User } from '../domain/types';
import type { AuthRepository, CreateQuizInput, QuizRepository } from './types';

interface QuestionRow {
  id: string;
  quiz_id: string;
  order_index: number;
  question: string;
  choice1: string;
  choice2: string;
  choice3: string | null;
  choice4: string | null;
  answer: number;
  explanation: string | null;
}

interface QuizRow {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  questions: QuestionRow[] | null;
}

const QUIZ_SELECT =
  'id, user_id, title, created_at, questions(id, quiz_id, order_index, question, choice1, choice2, choice3, choice4, answer, explanation)';

function toUser(u: SupabaseUser): User {
  return { id: u.id, email: u.email ?? '', createdAt: u.created_at };
}

function toQuestion(row: QuestionRow): Question {
  return {
    id: row.id,
    quizId: row.quiz_id,
    orderIndex: row.order_index,
    question: row.question,
    choice1: row.choice1,
    choice2: row.choice2,
    choice3: row.choice3,
    choice4: row.choice4,
    answer: row.answer as AnswerNumber,
    explanation: row.explanation,
  };
}

function toQuiz(row: QuizRow): Quiz {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    questions: (row.questions ?? [])
      .map(toQuestion)
      .sort((a, b) => a.orderIndex - b.orderIndex),
  };
}

/** Map Supabase Auth error messages to the Japanese messages the UI shows. */
export function toAuthErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('access_denied') || m.includes('user denied')) {
    return 'Googleログインがキャンセルされました。';
  }
  if (
    m.includes('provider is not enabled') ||
    m.includes('provider_disabled') ||
    m.includes('oauth_provider_not_supported')
  ) {
    return 'Googleログインは現在有効になっていません。Supabaseダッシュボードの設定を確認してください。';
  }
  if (m.includes('bad_oauth_state') || m.includes('bad_oauth_callback')) {
    return '認証のコールバック処理に失敗しました。もう一度お試しください。';
  }
  if (m.includes('invalid login credentials')) {
    return 'メールアドレスまたはパスワードが正しくありません。';
  }
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'このメールアドレスは既に登録されています。';
  }
  if (m.includes('email not confirmed')) {
    return 'メールアドレスの確認が完了していません。届いたメールのリンクを開いてください。';
  }
  if (m.includes('password')) {
    return 'パスワードは6文字以上で入力してください。';
  }
  if (m.includes('email')) {
    return '有効なメールアドレスを入力してください。';
  }
  if (m.includes('rate limit')) {
    return '試行回数が多すぎます。しばらく待ってから再度お試しください。';
  }
  return message;
}

/**
 * Extract OAuth redirect error parameters from the current URL (query or hash),
 * clean them from browser history, and return a localized Japanese error message.
 */
export function consumeAuthRedirectError(): string | null {
  if (typeof window === 'undefined') return null;

  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const error = url.searchParams.get('error') ?? hashParams.get('error');
  const errorCode = url.searchParams.get('error_code') ?? hashParams.get('error_code');
  const errorDescription =
    url.searchParams.get('error_description') ?? hashParams.get('error_description');

  if (!error && !errorCode && !errorDescription) {
    return null;
  }

  const hasHashError =
    hashParams.has('error') ||
    hashParams.has('error_code') ||
    hashParams.has('error_description');
  for (const key of ['error', 'error_code', 'error_description']) {
    url.searchParams.delete(key);
    if (hasHashError) {
      hashParams.delete(key);
    }
  }
  if (hasHashError) {
    const nextHash = hashParams.toString();
    url.hash = nextHash ? `#${nextHash}` : '';
  }
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);

  const raw = [errorCode, error, errorDescription].filter(Boolean).join(' ');
  const mapped = toAuthErrorMessage(raw);
  return mapped === raw ? (errorDescription ?? errorCode ?? error) : mapped;
}

export class SupabaseAuthRepository implements AuthRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getCurrentUser(): Promise<User | null> {
    const { data } = await this.client.auth.getSession();
    return data.session ? toUser(data.session.user) : null;
  }

  async signUp(email: string, password: string): Promise<User> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error('有効なメールアドレスを入力してください。');
    }
    if (password.length < 6) {
      throw new Error('パスワードは6文字以上で入力してください。');
    }

    const { data, error } = await this.client.auth.signUp({
      email: normalizedEmail,
      password,
      // Send the confirmation link back to whichever origin the user signed up from.
      options:
        typeof window !== 'undefined'
          ? { emailRedirectTo: `${window.location.origin}/login` }
          : undefined,
    });
    if (error) throw new Error(toAuthErrorMessage(error.message));
    // Supabase returns a user with no identities when the email already exists.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      throw new Error('このメールアドレスは既に登録されています。');
    }
    if (!data.session || !data.user) {
      throw new Error(
        '確認メールを送信しました。メール内のリンクを開いてから、ログインしてください。',
      );
    }
    return toUser(data.user);
  }

  async signIn(email: string, password: string): Promise<User> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error || !data.user) {
      throw new Error(toAuthErrorMessage(error?.message ?? 'invalid login credentials'));
    }
    return toUser(data.user);
  }

  async signInWithGoogle(): Promise<void> {
    const { error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options:
        typeof window !== 'undefined'
          ? { redirectTo: `${window.location.origin}/login` }
          : undefined,
    });
    if (error) {
      throw new Error(toAuthErrorMessage(error.message));
    }
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw new Error(error.message);
  }

  onAuthStateChange(callback: (user: User | null) => void): () => void {
    const {
      data: { subscription },
    } = this.client.auth.onAuthStateChange((_event, session) => {
      callback(session ? toUser(session.user) : null);
    });
    return () => subscription.unsubscribe();
  }
}

export class SupabaseQuizRepository implements QuizRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByUser(userId: string): Promise<Quiz[]> {
    const { data, error } = await this.client
      .from('quizzes')
      .select(QUIZ_SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data as unknown as QuizRow[]).map(toQuiz);
  }

  async getById(quizId: string, userId: string): Promise<Quiz | null> {
    const { data, error } = await this.client
      .from('quizzes')
      .select(QUIZ_SELECT)
      .eq('id', quizId)
      .eq('user_id', userId)
      .maybeSingle();
    // Invalid UUIDs in the URL produce a 22P02 error; treat as "not found".
    if (error) {
      if (error.code === '22P02') return null;
      throw new Error(error.message);
    }
    return data ? toQuiz(data as unknown as QuizRow) : null;
  }

  async create(userId: string, input: CreateQuizInput): Promise<Quiz> {
    const title = input.title.trim();
    if (!title) {
      throw new Error('問題集タイトルを入力してください。');
    }
    if (input.questions.length === 0) {
      throw new Error('問題が1問も含まれていません。');
    }

    const { data: quizId, error } = await this.client.rpc('create_quiz_with_questions', {
      p_title: title,
      p_questions: input.questions,
    });
    if (error) throw new Error(error.message);

    const created = await this.getById(quizId as string, userId);
    if (!created) throw new Error('問題集の保存に失敗しました。');
    return created;
  }

  async delete(quizId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('quizzes')
      .delete()
      .eq('id', quizId)
      .eq('user_id', userId)
      .select('id');
    if (error) {
      if (error.code === '22P02') return false;
      throw new Error(error.message);
    }
    return (data ?? []).length > 0;
  }
}
