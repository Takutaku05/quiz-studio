import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { resolvePostAuthRedirect } from './lib/shareRedirect';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { QuizPlayPage } from './pages/QuizPlayPage';
import { ShareImportPage } from './pages/ShareImportPage';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, authLoading } = useApp();
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm">
        読み込み中...
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, authLoading } = useApp();
  const location = useLocation();
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm">
        読み込み中...
      </div>
    );
  }
  if (user) {
    return <Navigate to={resolvePostAuthRedirect(location.search)} replace />;
  }
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route path="/share/:token" element={<ShareImportPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/quiz/:quizId"
        element={
          <ProtectedRoute>
            <QuizPlayPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
