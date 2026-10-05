import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import React,{ Suspense,lazy } from 'react';
import { BrowserRouter,Navigate,Route,Routes } from 'react-router-dom';
import { CommonLayout } from './components/layout/CommonLayout';
import { Loader } from './components/ui';
import { ROUTES } from './constants';

import { CustomerPricingPage, DashboardPage } from './pages/PlaceholderPages';

const ItemMasterPage = lazy(() => import('./pages/ItemMasterPage'));
const PricingUpdatePage = lazy(() => import('./pages/PricingUpdatePage'));
const VendorMasterPage = lazy(() => import('./pages/VendorMasterPage'));
const CustomerListPage = lazy(() => import('./pages/CustomerListPage'));
const RMMasterPage = lazy(() => import('./pages/RMMasterPage'));
const FormulasPage = lazy(() => import('./pages/FormulasPage'));
const ItemPricingApprovalPage = lazy(() => import('./pages/ItemPricingApprovalPage'));
const PriceHistoryPage = lazy(() => import('./pages/PriceHistoryPage'));
const PricingComparisonPage = lazy(() => import('./pages/PricingComparisonPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DisputeRegisterPage = lazy(() => import('./pages/DisputeRegisterPage'));

const UserManagementPage = lazy(() => import('./pages/management/UserManagementPage'));
const RoleManagementPage = lazy(() => import('./pages/management/RoleManagementPage'));
const ScreenManagementPage = lazy(() => import('./pages/management/ScreenManagementPage'));
const ApiPermissionPage = lazy(() => import('./pages/management/ApiPermissionPage'));
const AuditLogPage = lazy(() => import('./pages/management/AuditLogPage'));

const OrderPriceAuditPage = lazy(() => import('./pages/OrderPriceAuditPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center" style={{ height: '100%', minHeight: '200px' }}>
    <Loader size="md" />
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  return localStorage.getItem('gk_logged_in')
    ? <>{children}</>
    : <Navigate to="/login" replace />;
};

const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={
          <Suspense fallback={<LoadingFallback />}><LoginPage /></Suspense>
        } />

        <Route element={<ProtectedRoute><CommonLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/items" replace />} />

          {/* VIEWS */}
          <Route path={ROUTES.HOME} element={<DashboardPage />} />
          <Route path={ROUTES.ITEM_MASTER} element={
            <Suspense fallback={<LoadingFallback />}><ItemMasterPage /></Suspense>
          } />
          <Route path={ROUTES.VENDOR_MASTER} element={
            <Suspense fallback={<LoadingFallback />}><VendorMasterPage /></Suspense>
          } />
          <Route path={ROUTES.CUSTOMER_LIST} element={
            <Suspense fallback={<LoadingFallback />}><CustomerListPage /></Suspense>
          } />
          <Route path={ROUTES.RM_MASTER} element={
            <Suspense fallback={<LoadingFallback />}><RMMasterPage /></Suspense>
          } />

          {/* ACTIONS */}
          <Route path={ROUTES.PRICING_UPDATE} element={
            <Suspense fallback={<LoadingFallback />}><PricingUpdatePage /></Suspense>
          } />
          <Route path={ROUTES.ITEM_PRICING_APPROVAL} element={
            <Suspense fallback={<LoadingFallback />}><ItemPricingApprovalPage /></Suspense>
          } />
          <Route path={ROUTES.CUSTOMER_PRICING} element={<CustomerPricingPage />} />
          <Route path={ROUTES.DC_RAISE_DISPUTE} element={
            <Suspense fallback={<LoadingFallback />}><DisputeRegisterPage /></Suspense>
          } />
          <Route path={ROUTES.ORDER_PRICE_AUDIT} element={
            <Suspense fallback={<LoadingFallback />}><OrderPriceAuditPage /></Suspense>
          } />
          <Route path={ROUTES.PRICE_HISTORY} element={
            <Suspense fallback={<LoadingFallback />}><PriceHistoryPage /></Suspense>
          } />
          <Route path={ROUTES.PRICING_COMPARISON} element={
            <Suspense fallback={<LoadingFallback />}><PricingComparisonPage /></Suspense>
          } />

          {/* Legacy */}
          <Route path={ROUTES.FORMULAS} element={
            <Suspense fallback={<LoadingFallback />}><FormulasPage /></Suspense>
          } />

          {/* MANAGEMENT */}
          <Route path={ROUTES.USER_MANAGEMENT} element={
            <Suspense fallback={<LoadingFallback />}><UserManagementPage /></Suspense>
          } />
          <Route path={ROUTES.ROLE_MANAGEMENT} element={
            <Suspense fallback={<LoadingFallback />}><RoleManagementPage /></Suspense>
          } />
          <Route path={ROUTES.SCREEN_MANAGEMENT} element={
            <Suspense fallback={<LoadingFallback />}><ScreenManagementPage /></Suspense>
          } />
          <Route path={ROUTES.API_MANAGEMENT} element={
            <Suspense fallback={<LoadingFallback />}><ApiPermissionPage /></Suspense>
          } />
          <Route path={ROUTES.AUDIT_LOGS} element={
            <Suspense fallback={<LoadingFallback />}><AuditLogPage /></Suspense>
          } />
        </Route>
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
