import {
  createContext,
  useState,
  useContext,
  ReactNode,
  useEffect
} from 'react';
import { User } from '../types';
import { api, setAuthToken, loadStoredToken } from '../api/client';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (
    email: string,
    password: string,
    shippingAddress?: string
  ) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function decodeJwtPayload(token: string): User | null {
  try {
    const [, payload] = token.split('.');
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return {
      id: json.sub,
      email: json.email,
      role: json.role
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = loadStoredToken();
    if (stored) {
      const decoded = decodeJwtPayload(stored);
      if (decoded) setUser(decoded);
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const result = await api.login(email, password);
    setAuthToken(result.token);
    setUser(result.user);
    return result.user;
  };

  const register = async (
    email: string,
    password: string,
    shippingAddress?: string
  ) => {
    const result = await api.register(email, password, shippingAddress);
    setAuthToken(result.token);
    setUser(result.user);
    return result.user;
  };

  const logout = () => {
    setAuthToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
