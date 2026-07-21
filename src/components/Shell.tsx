import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Bell, ChevronDown, CircleDollarSign, FolderKanban, LayoutDashboard, Menu, Plus, Search, Settings, Shapes, WalletCards, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TransactionDialog } from './TransactionDialog';

export type ShellContext = { openTransaction: (type?: 'MONEY_IN' | 'MONEY_OUT' | 'TRANSFER') => void; refreshKey: number; refresh: () => void };

const navigation = [
  ['Home', '/', LayoutDashboard], ['Transactions', '/transactions', FolderKanban], ['Accounts', '/accounts', WalletCards],
  ['Assets', '/assets', Shapes], ['Planning', '/planning', CircleDollarSign], ['Reports', '/reports', BarChart3],
] as const;

export function Shell() {
  const { user, profiles, selectedProfileId, selectedProfile, selectProfile, logout } = useApp();
  const [mobileMenu, setMobileMenu] = useState(false); const [profileMenu, setProfileMenu] = useState(false);
  const [dialog, setDialog] = useState<false | 'MONEY_IN' | 'MONEY_OUT' | 'TRANSFER'>(false); const [refreshKey, setRefreshKey] = useState(0);
  const location = useLocation(); const navigate = useNavigate();
  useEffect(() => { setMobileMenu(false); }, [location.pathname]);
  const openTransaction = (type: 'MONEY_IN' | 'MONEY_OUT' | 'TRANSFER' = 'MONEY_OUT') => { if (!selectedProfileId) { navigate('/'); return; } setDialog(type); };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark">M</div><div><strong>Money Manager</strong><span>Financial command centre</span></div><button className="icon-button mobile-only" onClick={() => setMobileMenu(false)} aria-label="Close navigation"><X/></button></div>
      <nav>{navigation.map(([label, to, Icon]) => <NavLink key={to} to={to} end={to === '/'}><Icon size={20}/><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-footer"><NavLink to="/settings"><Settings size={20}/><span>Settings</span></NavLink><div className="owner"><div className="avatar">{user?.name.charAt(0)}</div><div><strong>{user?.name}</strong><span>{user?.email}</span></div><button className="text-button" onClick={logout}>Sign out</button></div></div>
    </aside>
    {mobileMenu && <button aria-label="Close navigation" className="sidebar-scrim" onClick={() => setMobileMenu(false)}/>}
    <div className="main-column">
      <header className="topbar">
        <button className="icon-button mobile-only" onClick={() => setMobileMenu(true)} aria-label="Open navigation"><Menu/></button>
        <div className="profile-control">
          <button onClick={() => setProfileMenu(!profileMenu)}><span className="profile-icon">{selectedProfile ? selectedProfile.name.charAt(0) : 'A'}</span><span><small>Viewing</small><strong>{selectedProfile?.name ?? 'All Profiles'}</strong></span><ChevronDown size={16}/></button>
          {profileMenu && <div className="profile-menu"><span className="menu-label">Financial profiles</span>{profiles.map((profile) => <button key={profile.id} className={selectedProfileId === profile.id ? 'selected' : ''} onClick={() => { selectProfile(profile.id); setProfileMenu(false); navigate('/'); }}><span>{profile.name.charAt(0)}</span><div><strong>{profile.name}</strong><small>{profile.type.toLowerCase()}</small></div></button>)}<div className="menu-divider"/><button className={!selectedProfileId ? 'selected' : ''} onClick={() => { selectProfile(null); setProfileMenu(false); navigate('/'); }}><span>∞</span><div><strong>All Profiles</strong><small>Consolidated view</small></div></button><button onClick={() => { setProfileMenu(false); navigate('/settings'); }}><Plus size={17}/><div><strong>Create profile</strong></div></button></div>}
        </div>
        <button className="search-trigger" onClick={() => navigate('/transactions')}><Search size={18}/><span>Search transactions</span></button>
        <div className="top-actions"><button className="icon-button notification" aria-label="View attention items" onClick={() => navigate('/')}><Bell size={19}/><i/></button><button className="button primary" onClick={() => openTransaction()} disabled={!selectedProfileId} aria-label="New transaction"><Plus size={18}/> <span>New</span></button></div>
      </header>
      <main><Outlet context={{ openTransaction, refreshKey, refresh: () => setRefreshKey((key) => key + 1) } satisfies ShellContext}/></main>
    </div>
    {dialog && <TransactionDialog initialType={dialog} onClose={() => setDialog(false)} onCreated={() => setRefreshKey((key) => key + 1)}/>}
  </div>;
}
