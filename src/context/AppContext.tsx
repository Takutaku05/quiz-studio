import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '../domain/types';
import {
  LocalAuthRepository,
  LocalQuizRepository,
} from '../repositories/localStorageRepositories';
import {
  SupabaseAuthRepository,
  SupabaseQuizRepository,
  clearAuthRedirectErrorParams,
  readAuthRedirectError,
} from '../repositories/supabaseRepositories';
import { LocalStudyRepository } from '../repositories/localStudyRepository';
import { SupabaseStudyRepository } from '../repositories/supabaseStudyRepository';
import type { AuthRepository, QuizRepository, StudyRepository } from '../repositories/types';
import { supabase } from '../lib/supabaseClient';

function createDefaultAuthRepository(): AuthRepository {
  return supabase ? new SupabaseAuthRepository(supabase) : new LocalAuthRepository();
}

function createDefaultQuizRepository(): QuizRepository {
  return supabase ? new SupabaseQuizRepository(supabase) : new LocalQuizRepository();
}

function createDefaultStudyRepository(): StudyRepository {
  return supabase ? new SupabaseStudyRepository(supabase) : new LocalStudyRepository();
}

interface AppContextValue {
  user: User | null;
  authLoading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  authRepository: AuthRepository;
  quizRepository: QuizRepository;
  studyRepository: StudyRepository;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (email: string, password: string, redirectPath?: string) => Promise<User>;
  signInWithGoogle: (redirectPath?: string) => Promise<void>;
  signInWithPasskey: () => Promise<User>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: ReactNode;
  authRepository?: AuthRepository;
  quizRepository?: QuizRepository;
  studyRepository?: StudyRepository;
}

function isSameUser(a: User | null, b: User | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.email === b.email && a.createdAt === b.createdAt;
}

export function AppProvider({
  children,
  authRepository: customAuthRepo,
  quizRepository: customQuizRepo,
  studyRepository: customStudyRepo,
}: AppProviderProps) {
  const authRepository = useMemo(
    () => customAuthRepo ?? createDefaultAuthRepository(),
    [customAuthRepo],
  );
  const quizRepository = useMemo(
    () => customQuizRepo ?? createDefaultQuizRepository(),
    [customQuizRepo],
  );
  const studyRepository = useMemo(
    () => customStudyRepo ?? createDefaultStudyRepository(),
    [customStudyRepo],
  );

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(() => readAuthRedirectError());

  const setStableUser = useCallback((nextUser: User | null) => {
    setUser((prev) => (isSameUser(prev, nextUser) ? prev : nextUser));
  }, []);

  useEffect(() => {
    clearAuthRedirectErrorParams();
  }, []);

  useEffect(() => {
    let active = true;
    let resolvedByListener = false;

    const unsubscribe = authRepository.onAuthStateChange?.((nextUser) => {
      if (!active) return;
      resolvedByListener = true;
      setStableUser(nextUser);
      setAuthLoading(false);
    });

    authRepository
      .getCurrentUser()
      .then((currentUser) => {
        if (active && !resolvedByListener) {
          setStableUser(currentUser);
          setAuthLoading(false);
        }
      })
      .catch(() => {
        if (active && !resolvedByListener) {
          setStableUser(null);
          setAuthLoading(false);
        }
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [authRepository, setStableUser]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setAuthError(null);
      const signedIn = await authRepository.signIn(email, password);
      setStableUser(signedIn);
      return signedIn;
    },
    [authRepository, setStableUser],
  );

  const signUp = useCallback(
    async (email: string, password: string, redirectPath?: string) => {
      setAuthError(null);
      const created = await authRepository.signUp(email, password, redirectPath);
      setStableUser(created);
      return created;
    },
    [authRepository, setStableUser],
  );

  const signInWithGoogle = useCallback(
    async (redirectPath?: string) => {
      setAuthError(null);
      await authRepository.signInWithGoogle(redirectPath);
    },
    [authRepository],
  );

  const signInWithPasskey = useCallback(async () => {
    setAuthError(null);
    if (!authRepository.signInWithPasskey) {
      throw new Error('パスキー認証はこの認証設定では利用できません。');
    }
    const signedIn = await authRepository.signInWithPasskey();
    setStableUser(signedIn);
    return signedIn;
  }, [authRepository, setStableUser]);

  const signOut = useCallback(async () => {
    setAuthError(null);
    await authRepository.signOut();
    setUser(null);
  }, [authRepository]);

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      authLoading,
      authError,
      clearAuthError,
      authRepository,
      quizRepository,
      studyRepository,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithPasskey,
      signOut,
    }),
    [
      user,
      authLoading,
      authError,
      clearAuthError,
      authRepository,
      quizRepository,
      studyRepository,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithPasskey,
      signOut,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within AppProvider');
  }
  return ctx;
}
