import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/layouts/admin-layout";
import { DashboardLayout } from "@/layouts/dashboard-layout";

const AdminFinancePage = lazy(() => import("@/pages/admin-finance-page").then(({ AdminFinancePage }) => ({ default: AdminFinancePage })));
const AdminKycPage = lazy(() => import("@/pages/admin-kyc-page").then(({ AdminKycPage }) => ({ default: AdminKycPage })));
const AdminNotificationsPage = lazy(() =>
  import("@/pages/admin-notifications-page").then(({ AdminNotificationsPage }) => ({ default: AdminNotificationsPage }))
);
const AdminOverviewPage = lazy(() => import("@/pages/admin-overview-page").then(({ AdminOverviewPage }) => ({ default: AdminOverviewPage })));
const AdminProfitPage = lazy(() => import("@/pages/admin-profit-page").then(({ AdminProfitPage }) => ({ default: AdminProfitPage })));
const AdminSettingsPage = lazy(() => import("@/pages/admin-settings-page").then(({ AdminSettingsPage }) => ({ default: AdminSettingsPage })));
const AdminUsersPage = lazy(() => import("@/pages/admin-users-page").then(({ AdminUsersPage }) => ({ default: AdminUsersPage })));
const DepositPage = lazy(() => import("@/pages/deposit-page").then(({ DepositPage }) => ({ default: DepositPage })));
const ForgotPasswordPage = lazy(() => import("@/pages/forgot-password-page").then(({ ForgotPasswordPage }) => ({ default: ForgotPasswordPage })));
const LoginPage = lazy(() => import("@/pages/login-page").then(({ LoginPage }) => ({ default: LoginPage })));
const OverviewPage = lazy(() => import("@/pages/overview-page").then(({ OverviewPage }) => ({ default: OverviewPage })));
const ProfilePage = lazy(() => import("@/pages/profile-page").then(({ ProfilePage }) => ({ default: ProfilePage })));
const RegisterPage = lazy(() => import("@/pages/register-page").then(({ RegisterPage }) => ({ default: RegisterPage })));
const ReferralsPage = lazy(() => import("@/pages/referrals-page").then(({ ReferralsPage }) => ({ default: ReferralsPage })));
const TradeHistoryPage = lazy(() => import("@/pages/trade-history-page").then(({ TradeHistoryPage }) => ({ default: TradeHistoryPage })));
const VipPage = lazy(() => import("@/pages/vip-page").then(({ VipPage }) => ({ default: VipPage })));
const WalletPage = lazy(() => import("@/pages/wallet-page").then(({ WalletPage }) => ({ default: WalletPage })));
const WithdrawPage = lazy(() => import("@/pages/withdraw-page").then(({ WithdrawPage }) => ({ default: WithdrawPage })));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050849] px-4 text-sm font-semibold text-cyan-100">
      Loading...
    </div>
  );
}

const withSuspense = (element: ReactNode) => <Suspense fallback={<RouteFallback />}>{element}</Suspense>;

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate replace to="/login" />
  },
  {
    path: "/login",
    element: withSuspense(<LoginPage />)
  },
  {
    path: "/register",
    element: withSuspense(<RegisterPage />)
  },
  {
    path: "/forgot-password",
    element: withSuspense(<ForgotPasswordPage />)
  },
  {
    path: "/app",
    element: <AuthGuard allowedRoles={["USER", "ADMIN"]} />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { index: true, element: withSuspense(<OverviewPage />) },
          { path: "wallet", element: withSuspense(<WalletPage />) },
          { path: "wallet/deposit", element: withSuspense(<DepositPage />) },
          { path: "wallet/withdraw", element: withSuspense(<WithdrawPage />) },
          { path: "mission", element: withSuspense(<VipPage />) },
          { path: "strategy", element: withSuspense(<VipPage />) },
          { path: "vip", element: withSuspense(<VipPage />) },
          { path: "trades", element: withSuspense(<TradeHistoryPage />) },
          { path: "referrals", element: withSuspense(<ReferralsPage />) },
          { path: "profile", element: withSuspense(<ProfilePage />) }
        ]
      }
    ]
  },
  {
    path: "/admin",
    element: <AuthGuard allowedRoles={["ADMIN"]} />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: withSuspense(<AdminOverviewPage />) },
          { path: "users", element: withSuspense(<AdminUsersPage />) },
          { path: "kyc", element: withSuspense(<AdminKycPage />) },
          { path: "finance", element: withSuspense(<AdminFinancePage />) },
          { path: "profit", element: withSuspense(<AdminProfitPage />) },
          { path: "notifications", element: withSuspense(<AdminNotificationsPage />) },
          { path: "settings", element: withSuspense(<AdminSettingsPage />) }
        ]
      }
    ]
  }
]);
