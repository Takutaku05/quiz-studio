import type { SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
import type {
  AnswerNumber,
  ImportSharedQuizResult,
  PasskeyCredential,
  Question,
  Quiz,
  QuizShare,
  SharedQuizSummary,
  User,
} from '../domain/types';
import { sanitizeRedirectPath } from '../lib/shareRedirect';
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

interface QuizShareRow {
  id: string;
  quiz_id: string;
  token: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function toQuizShare(row: QuizShareRow): QuizShare {
  return {
    id: row.id,
    quizId: row.quiz_id,
    token: row.token,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const QUIZ_SELECT =
  'id, user_id, title, created_at, questions(id, quiz_id, order_index, question, choice1, choice2, choice3, choice4, answer, explanation)';

function toUser(u: SupabaseUser): User {
  return { id: u.id, email: u.email ?? '', createdAt: u.created_at };
}

function toPasskeyCredential(item: {
  id: string;
  friendly_name?: string | null;
  created_at: string;
  last_used_at?: string | null;
}): PasskeyCredential {
  return {
    id: item.id,
    friendlyName: item.friendly_name ?? null,
    createdAt: item.created_at,
    lastUsedAt: item.last_used_at ?? null,
  };
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

const MAX_PASSKEY_NAME_LENGTH = 120;

function validatePasskeyFriendlyName(friendlyName: string, required: boolean): string {
  const trimmed = friendlyName.trim();
  if (required && !trimmed) {
    throw new Error('パスキー名を入力してください。');
  }
  if (trimmed.length > MAX_PASSKEY_NAME_LENGTH) {
    throw new Error(`パスキー名は${MAX_PASSKEY_NAME_LENGTH}文字以内で入力してください。`);
  }
  return trimmed;
}

/** Map WebAuthn and Supabase Passkey errors to user-friendly Japanese messages. */
export function toPasskeyErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return toPasskeyErrorMessage({ message: error });
  }
  if (!error || typeof error !== 'object') {
    return 'パスキー認証に失敗しました。';
  }

  const errObj = error as {
    code?: string;
    name?: string;
    message?: string;
    cause?: { name?: string };
  };
  const code = (errObj.code ?? '').toLowerCase();
  const name = (errObj.name ?? '').toLowerCase();
  const causeName = (errObj.cause?.name ?? '').toLowerCase();
  const msg = (errObj.message ?? '').toLowerCase();

  if (
    name === 'notallowederror' ||
    causeName === 'notallowederror' ||
    msg.includes('notallowederror') ||
    msg.includes('timed out or was not allowed')
  ) {
    return 'パスキーの操作がキャンセルされたか、タイムアウトしました。';
  }
  if (code === 'error_ceremony_aborted') {
    return 'パスキーの処理が中断されました。もう一度お試しください。';
  }
  if (code === 'error_authenticator_previously_registered') {
    return 'この認証器のパスキーは既に登録されています。';
  }
  if (code === 'error_invalid_domain' || code === 'error_invalid_rp_id') {
    return 'このドメインではパスキーを使用できません（Relying Party設定を確認してください）。';
  }
  if (
    code === 'error_authenticator_missing_discoverable_credential_support' ||
    code === 'error_authenticator_missing_user_verification_support'
  ) {
    return 'ご利用の認証器はパスキーの要件（生体認証・PIN等）に対応していません。';
  }
  if (code === 'webauthn_challenge_expired' || msg.includes('challenge_expired')) {
    return 'パスキー認証の有効期限が切れました。もう一度お試しください。';
  }
  if (msg.includes('browser does not support webauthn')) {
    return 'このブラウザはパスキー（WebAuthn）に対応していません。';
  }
  if (
    code === 'provider_disabled' ||
    (msg.includes('passkey') && (msg.includes('disabled') || msg.includes('not enabled') || msg.includes('not supported')))
  ) {
    return 'パスキー認証が有効になっていません。SupabaseダッシュボードのPasskeys設定を確認してください。';
  }
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials') || msg.includes('passkey not found')) {
    return '登録済みのパスキーが見つからないか、認証に失敗しました。';
  }
  return errObj.message ? toAuthErrorMessage(errObj.message) : 'パスキー認証に失敗しました。';
}

export class SupabaseAuthRepository implements AuthRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getCurrentUser(): Promise<User | null> {
    const { data } = await this.client.auth.getSession();
    return data.session ? toUser(data.session.user) : null;
  }

  async signUp(email: string, password: string, redirectPath?: string): Promise<User> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error('有効なメールアドレスを入力してください。');
    }
    if (password.length < 6) {
      throw new Error('パスワードは6文字以上で入力してください。');
    }

    const safeRedirectPath = sanitizeRedirectPath(redirectPath);
    const emailRedirectTo =
      typeof window !== 'undefined'
        ? safeRedirectPath
          ? `${window.location.origin}${safeRedirectPath}`
          : `${window.location.origin}/login`
        : undefined;

    const { data, error } = await this.client.auth.signUp({
      email: normalizedEmail,
      password,
      // Send the confirmation link back to whichever origin (and optional share path) the user signed up from.
      options: emailRedirectTo ? { emailRedirectTo } : undefined,
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

  async signInWithGoogle(redirectPath?: string): Promise<void> {
    const safeRedirectPath = sanitizeRedirectPath(redirectPath);
    const redirectTo =
      typeof window !== 'undefined'
        ? safeRedirectPath
          ? `${window.location.origin}/login?redirect=${encodeURIComponent(safeRedirectPath)}`
          : `${window.location.origin}/login`
        : undefined;

    const { error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: redirectTo ? { redirectTo } : undefined,
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

  isPasskeySupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.PublicKeyCredential !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      Boolean(navigator.credentials)
    );
  }

  private assertPasskeySupported(): void {
    if (!this.isPasskeySupported()) {
      throw new Error('このブラウザはパスキー（WebAuthn）に対応していません。');
    }
  }

  async signInWithPasskey(): Promise<User> {
    this.assertPasskeySupported();
    const { data, error } = await this.client.auth.signInWithPasskey();
    if (error || !data?.user || !data?.session) {
      throw new Error(toPasskeyErrorMessage(error ?? '登録済みのパスキーが見つからないか、認証に失敗しました。'));
    }
    return toUser(data.user);
  }

  async registerPasskey(friendlyName?: string): Promise<PasskeyCredential> {
    this.assertPasskeySupported();
    const trimmedName = friendlyName ? validatePasskeyFriendlyName(friendlyName, false) : '';

    const { data, error } = await this.client.auth.registerPasskey();
    if (error || !data) {
      throw new Error(toPasskeyErrorMessage(error ?? 'パスキーの登録に失敗しました。'));
    }

    if (trimmedName) {
      const { data: updated, error: updateError } = await this.client.auth.passkey.update({
        passkeyId: data.id,
        friendlyName: trimmedName,
      });
      if (!updateError && updated) {
        return toPasskeyCredential(updated);
      }
    }
    return toPasskeyCredential(data);
  }

  async listPasskeys(): Promise<PasskeyCredential[]> {
    const { data, error } = await this.client.auth.passkey.list();
    if (error) {
      throw new Error(toPasskeyErrorMessage(error));
    }
    return (data ?? []).map(toPasskeyCredential);
  }

  async updatePasskeyName(passkeyId: string, friendlyName: string): Promise<PasskeyCredential> {
    const trimmedName = validatePasskeyFriendlyName(friendlyName, true);
    const { data, error } = await this.client.auth.passkey.update({
      passkeyId,
      friendlyName: trimmedName,
    });
    if (error || !data) {
      throw new Error(toPasskeyErrorMessage(error ?? 'パスキー名の更新に失敗しました。'));
    }
    return toPasskeyCredential(data);
  }

  async deletePasskey(passkeyId: string): Promise<void> {
    const { error } = await this.client.auth.passkey.delete({ passkeyId });
    if (error) {
      throw new Error(toPasskeyErrorMessage(error));
    }
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

  async getShare(quizId: string, userId: string): Promise<QuizShare | null> {
    const { data, error } = await this.client
      .from('quiz_shares')
      .select('id, quiz_id, token, is_active, created_at, updated_at')
      .eq('quiz_id', quizId)
      .eq('owner_id', userId)
      .maybeSingle();
    if (error) {
      if (error.code === '22P02') return null;
      throw new Error(error.message);
    }
    return data ? toQuizShare(data as QuizShareRow) : null;
  }

  async enableShare(quizId: string, _userId: string): Promise<QuizShare> {
    const { data, error } = await this.client.rpc('enable_quiz_share', {
      p_quiz_id: quizId,
    });
    if (error || !data) {
      throw new Error(error?.message ?? '共有リンクの作成に失敗しました。');
    }
    return data as QuizShare;
  }

  async disableShare(quizId: string, _userId: string): Promise<QuizShare> {
    const { data, error } = await this.client.rpc('disable_quiz_share', {
      p_quiz_id: quizId,
    });
    if (error || !data) {
      throw new Error(error?.message ?? '共有の停止に失敗しました。');
    }
    return data as QuizShare;
  }

  async regenerateShare(quizId: string, _userId: string): Promise<QuizShare> {
    const { data, error } = await this.client.rpc('regenerate_quiz_share', {
      p_quiz_id: quizId,
    });
    if (error || !data) {
      throw new Error(error?.message ?? '共有リンクの再発行に失敗しました。');
    }
    return data as QuizShare;
  }

  async getSharedQuizSummary(token: string): Promise<SharedQuizSummary | null> {
    const trimmed = token.trim();
    if (!trimmed) return null;
    const { data, error } = await this.client.rpc('get_shared_quiz_summary', {
      p_token: trimmed,
    });
    if (error) throw new Error(error.message);
    return (data as SharedQuizSummary | null) ?? null;
  }

  async importByShareToken(token: string, _userId: string): Promise<ImportSharedQuizResult> {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new Error('共有リンクが見つからないか、共有が停止されています。');
    }
    const { data, error } = await this.client.rpc('import_shared_quiz', {
      p_token: trimmed,
    });
    if (error || !data) {
      throw new Error(error?.message ?? '共有問題集のインポートに失敗しました。');
    }
    return data as ImportSharedQuizResult;
  }
}
