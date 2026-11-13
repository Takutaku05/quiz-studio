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
  consumeAuthRedirectError,
} from '../repositories/supabaseRepositories';
import type { AuthRepository, QuizRepository } from '../repositories/types';
import { supabase } from '../lib/supabaseClient';

function createDefaultAuthRepository(): AuthRepository {
  return supabase ? new SupabaseAuthRepository(supabase) : new LocalAuthRepository();
}

function createDefaultQuizRepository(): QuizRepository {
  return supabase ? new SupabaseQuizRepository(supabase) : new LocalQuizRepository();
}

interface AppContextValue {
  user: User | null;
  authLoading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  authRepository: AuthRepository;
  quizRepository: QuizRepository;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (email: string, password: string) => Promise<User>;
  signInWithGoogle: () => Promise<void>;
  signInWithPasskey: () => Promise<User>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: ReactNode;
  authRepository?: AuthRepository;
  quizRepository?: QuizRepository;
}

export function AppProvider({
  children,
  authRepository: customAuthRepo,
  quizRepository: customQuizRepo,
}: AppProviderProps) {
  const authRepository = useMemo(
    () => customAuthRepo ?? createDefaultAuthRepository(),
    [customAuthRepo],
  );
  const quizRepository = useMemo(
    () => customQuizRepo ?? createDefaultQuizRepository(),
    [customQuizRepo],
  );

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(() => consumeAuthRedirectError());

  useEffect(() => {
    let active = true;
    let resolvedByListener = false;

    const unsubscribe = authRepository.onAuthStateChange?.((nextUser) => {
      if (!active) return;
      resolvedByListener = true;
      setUser(nextUser);
      setAuthLoading(false);
    });

    authRepository
      .getCurrentUser()
      .then((currentUser) => {
        if (active && !resolvedByListener) {
          setUser(currentUser);
          setAuthLoading(false);
        }
      })
      .catch(() => {
        if (active && !resolvedByListener) {
          setUser(null);
          setAuthLoading(false);
        }
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [authRepository]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setAuthError(null);
      const signedIn = await authRepository.signIn(email, password);
      setUser(signedIn);
      return signedIn;
    },
    [authRepository],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      setAuthError(null);
      const created = await authRepository.signUp(email, password);
      setUser(created);
      return created;
    },
    [authRepository],
  );

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    await authRepository.signInWithGoogle();
  }, [authRepository]);

  const signInWithPasskey = useCallback(async () => {
    setAuthError(null);
    if (!authRepository.signInWithPasskey) {
      throw new Error('パスキー認証はこの認証設定では利用できません。');
    }
    const signedIn = await authRepository.signInWithPasskey();
    setUser(signedIn);
    return signedIn;
  }, [authRepository]);

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
