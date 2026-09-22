import { Suspense, lazy, useRef } from "react";
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { I18nProvider } from '@/lib/I18nProvider';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Dashboard from '@/pages/Dashboard';
import NewBill from '@/pages/NewBill';
import BillHistory from '@/pages/BillHistory';
import Customers from '@/pages/Customers';
import CustomerDetail from '@/pages/CustomerDetail';
import Suppliers from '@/pages/Suppliers';
import PurchaseAdd from '@/pages/PurchaseAdd';
import PurchaseManagement from '@/pages/PurchaseManagement';
import Inventory from '@/pages/Inventory';
import Karagir from '@/pages/Karagir';
import Settings from '@/pages/Settings';
import CustomerBillPage from '@/pages/CustomerBillPage';
// Lazy-loaded pages (code splitting for heavy/less-frequent modules)
const CustomerOrders = lazy(() => import("@/pages/CustomerOrders"));
const RateManagement = lazy(() => import("@/pages/RateManagement"));
const MasterConfig = lazy(() => import("@/pages/MasterConfig"));
const AdminControl = lazy(() => import("@/pages/AdminControl"));
const DataManagement = lazy(() => import("@/pages/DataManagement"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const WorkflowGuide = lazy(() => import("@/pages/WorkflowGuide"));
// Add page imports here

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, session, user } = useAuth();
  const location = useLocation();
  // Rate gate ref: fires only once on initial session resolution. Must be declared
  // before any early returns to satisfy the rules-of-hooks lint rule.
  const rateGateDone = useRef(false);

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Onboarding redirect: if authenticated but no shop or onboarding incomplete
  const needsOnboarding = user && (!session?.has_shop || (session?.has_shop && !session.shop?.onboarding_completed));
  if (needsOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  if (!needsOnboarding && session?.has_shop && location.pathname === '/onboarding') {
    return <Navigate to="/" replace />;
  }

  // Daily rate gate: fires ONLY ONCE on initial authenticated landing/session resolution.
  // After the first check, normal navigation (including to /) is never hijacked by this gate.
  // The ref resets on full page reload / new login, so each new session gets exactly one check.
  const isAdmin = session?.user?.active_shop_role === 'admin';
  const needsDailyRates = !rateGateDone.current && !needsOnboarding && isAdmin && session?.has_shop && session.rates_today === false;
  if (needsDailyRates && location.pathname === '/') {
    rateGateDone.current = true;
    return <Navigate to="/rates" replace />;
  }
  // Mark the initial rate check complete once the session is resolved and onboarding is done,
  // so subsequent SPA navigations to / never re-trigger the redirect.
  if (!needsOnboarding && session?.has_shop) {
    rateGateDone.current = true;
  }

  // Role-based landing: cashier goes to billing, others to dashboard
  if (!needsOnboarding && session?.has_shop && location.pathname === '/' && session.user?.active_shop_role === 'cashier') {
    return <Navigate to="/billing" replace />;
  }

  // Render the main app
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/bill/:token" element={<CustomerBillPage />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/billing" element={<NewBill />} />
          <Route path="/bills" element={<BillHistory />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/purchase" element={<Navigate to="/purchase/add" replace />} />
          <Route path="/purchase/add" element={<PurchaseAdd />} />
          <Route path="/purchase/management" element={<PurchaseManagement />} />
          <Route path="/inventory/:metal" element={<Inventory />} />
          <Route path="/orders" element={<CustomerOrders />} />
          <Route path="/karagir" element={<Karagir />} />
          <Route path="/rates" element={<RateManagement />} />
          <Route path="/master" element={<MasterConfig />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<AdminControl />} />
          <Route path="/data" element={<DataManagement />} />
          <Route path="/workflow" element={<WorkflowGuide />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <I18nProvider>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </I18nProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App