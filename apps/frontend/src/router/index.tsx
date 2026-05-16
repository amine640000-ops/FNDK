import { Navigate, createBrowserRouter } from "react-router-dom";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/layouts/admin-layout";
import { DashboardLayout } from "@/layouts/dashboard-layout";
import { AdminFinancePage } from "@/pages/admin-finance-page";
import { AdminNotificationsPage } from "@/pages/admin-notifications-page";
import { AdminOverviewPage } from "@/pages/admin-overview-page";
import { AdminProfitPage } from "@/pages/admin-profit-page";
import { AdminSettingsPage } from "@/pages/admin-settings-page";
import { AdminUsersPage } from "@/pages/admin-users-page";
import { DepositPage } from "@/pages/deposit-page";
import { LoginPage } from "@/pages/login-page";
import { OverviewPage } from "@/pages/overview-page";
import { ProfilePage } from "@/pages/profile-page";
import { RegisterPage } from "@/pages/register-page";
import { ReferralsPage } from "@/pages/referrals-page";
import { TradeHistoryPage } from "@/pages/trade-history-page";
import { VipPage } from "@/pages/vip-page";
import { WalletPage } from "@/pages/wallet-page";
import { WithdrawPage } from "@/pages/withdraw-page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate replace to="/login" />
  },
  {
    path: "/login",
    element: <LoginPage />
  },
  {
    path: "/register",
    element: <RegisterPage />
  },
  {
    path: "/app",
    element: <AuthGuard allowedRoles={["USER", "ADMIN"]} />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: "wallet", element: <WalletPage /> },
          { path: "wallet/deposit", element: <DepositPage /> },
          { path: "wallet/withdraw", element: <WithdrawPage /> },
          { path: "mission", element: <VipPage /> },
          { path: "vip", element: <VipPage /> },
          { path: "trades", element: <TradeHistoryPage /> },
          { path: "referrals", element: <ReferralsPage /> },
          { path: "profile", element: <ProfilePage /> }
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
          { index: true, element: <AdminOverviewPage /> },
          { path: "users", element: <AdminUsersPage /> },
          { path: "finance", element: <AdminFinancePage /> },
          { path: "profit", element: <AdminProfitPage /> },
          { path: "notifications", element: <AdminNotificationsPage /> },
          { path: "settings", element: <AdminSettingsPage /> }
        ]
      }
    ]
  }
]);
