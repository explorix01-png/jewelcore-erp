import { useEffect } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { buildLoginUrl, sanitizeInternalPath } from '@/lib/authReturnTo';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    const safeTarget = sanitizeInternalPath(location.pathname + location.search, '');
    const loginUrl = buildLoginUrl(safeTarget);
    return unauthenticatedElement || <Navigate to={loginUrl} replace />;
  }

  if (!isAuthenticated) {
    const safeTarget = sanitizeInternalPath(location.pathname + location.search, '');
    const loginUrl = buildLoginUrl(safeTarget);
    return unauthenticatedElement || <Navigate to={loginUrl} replace />;
  }

  return <Outlet />;
}
