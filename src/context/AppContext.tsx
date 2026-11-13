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
import type { AuthRepository, QuizRepository } from '../repositories/types';

interface AppContextValue {
  user: User | null;
  authLoading: boolean;
  authRepository: AuthRepository;
  quizRepository: QuizRepository;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (email: string, password: string) => Promise<User>;
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
    () => customAuthRepo ?? new LocalAuthRepository(),
    [customAuthRepo],
  );
  const quizRepository = useMemo(
    () => customQuizRepo ?? new LocalQuizRepository(),
    [customQuizRepo],
  );

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let active = true;
    authRepository
      .getCurrentUser()
      .then((currentUser) => {
        if (active) {
          setUser(currentUser);
          setAuthLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setUser(null);
          setAuthLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [authRepository]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const signedIn = await authRepository.signIn(email, password);
      setUser(signedIn);
      return signedIn;
    },
    [authRepository],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const created = await authRepository.signUp(email, password);
      setUser(created);
      return created;
    },
    [authRepository],
  );

  const signOut = useCallback(async () => {
    await authRepository.signOut();
    setUser(null);
  }, [authRepository]);

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      authLoading,
      authRepository,
      quizRepository,
      signIn,
      signUp,
      signOut,
    }),
    [user, authLoading, authRepository, quizRepository, signIn, signUp, signOut],
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
