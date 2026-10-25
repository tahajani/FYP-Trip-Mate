import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import api, { setOnUnauthorized } from '../services/api';
import { saveToken, getToken, removeToken } from '../services/tokenStorage';

type User = {
  id: string;
  name: string;
  email: string;
  interests: string[];
  pace: 'relaxed' | 'moderate' | 'fast';
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  updateProfile: (interests: string[], pace: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = async () => {
    await removeToken();
    setUser(null);
  };

  useEffect(() => {
    setOnUnauthorized(logout);

    (async () => {
      try {
        const token = await getToken();
        if (token) {
          const { data } = await api.get('/auth/me');
          setUser(data.user);
        }
      } catch {
        await removeToken();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    await saveToken(data.token);
    setUser(data.user);
  };

  const register = async (name: string, email: string, password: string) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    await saveToken(data.token);
    setUser(data.user);
  };

  const updateProfile = async (interests: string[], pace: string) => {
    const { data } = await api.put('/users/profile', { interests, pace });
    setUser(data.user);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, updateProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};