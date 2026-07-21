import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { Shell } from './components/Shell';
import { Loading } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { AccountsPage } from './pages/AccountsPage';
import { AssetsPage } from './pages/AssetsPage';
import { PlanningPage } from './pages/PlanningPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

function AppRoutes() {
  const { user, loading } = useApp();
  if (loading) return <div className="screen-center"><Loading/></div>;
  if (!user) return <LoginPage/>;
  return <Routes><Route element={<Shell/>}><Route index element={<DashboardPage/>}/><Route path="transactions" element={<TransactionsPage/>}/><Route path="accounts" element={<AccountsPage/>}/><Route path="assets" element={<AssetsPage/>}/><Route path="planning" element={<PlanningPage/>}/><Route path="reports" element={<ReportsPage/>}/><Route path="settings" element={<SettingsPage/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Route></Routes>;
}

export default function App() { return <AppProvider><BrowserRouter><AppRoutes/></BrowserRouter></AppProvider>; }

