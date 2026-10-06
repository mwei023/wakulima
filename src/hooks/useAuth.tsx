import { useState, useEffect, createContext, useContext } from 'react';
import { USERS, getSession, setSession, type LocalUser } from '@/lib/backend';

interface AuthContextType {
  user: LocalUser | null;
  loading: boolean;
  signIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Instant local session; default to admin so a fresh demo is fully usable.
    const existing = getSession() ?? USERS[0];
    setSession(existing);
    setUser(existing);
    setLoading(false);
  }, []);

  const signIn = async (email: string) => {
    const normalized = email.trim().toLowerCase();
    const found = USERS.find(u => u.email === normalized)
      ?? (normalized.includes('cashier') ? USERS[1] : USERS[0]);
    setSession(found);
    setUser(found);
  };

  const signOut = async () => {
    // Local app: signing out returns to the default admin instead of a dead login wall.
    setSession(USERS[0]);
    setUser(USERS[0]);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
