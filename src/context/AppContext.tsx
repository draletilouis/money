import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api';
import type { Profile } from '../types';

type User = { id: string; name: string; email: string; preference?: { selectedProfileId?: string; allProfiles: boolean } };
type AppContextValue = {
  user: User | null; loading: boolean; profiles: Profile[]; selectedProfileId: string | null;
  selectedProfile: Profile | null; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void>;
  selectProfile: (id: string | null) => Promise<void>; refreshProfiles: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfiles = async () => setProfiles(await api<Profile[]>('/profiles'));

  useEffect(() => {
    api<User>('/me').then(async (current) => {
      setUser(current); setSelectedProfileId(current.preference?.allProfiles ? null : current.preference?.selectedProfileId ?? null);
      const available = await api<Profile[]>('/profiles'); setProfiles(available);
      if (!current.preference?.allProfiles && !current.preference?.selectedProfileId && available[0]) setSelectedProfileId(available[0].id);
    }).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    const current = await api<User>('/me'); const available = await api<Profile[]>('/profiles');
    setUser(current); setProfiles(available); setSelectedProfileId(current.preference?.allProfiles ? null : current.preference?.selectedProfileId ?? available[0]?.id ?? null);
  };
  const logout = async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); setProfiles([]); };
  const selectProfile = async (id: string | null) => { setSelectedProfileId(id); await api('/preferences/profile', { method: 'PUT', body: JSON.stringify({ profileId: id }) }); };
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const value = useMemo(() => ({ user, loading, profiles, selectedProfileId, selectedProfile, login, logout, selectProfile, refreshProfiles }), [user, loading, profiles, selectedProfileId, selectedProfile]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
};

