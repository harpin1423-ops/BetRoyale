import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: number;
  email: string;
  role: string;
  subscriptions?: { plan_id: string; expires_at: string }[];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    const savedToken = localStorage.getItem('token');
    // Guard against common invalid token strings
    if (savedToken === 'null' || savedToken === 'undefined' || savedToken === '') {
      localStorage.removeItem('token');
      return null;
    }
    return savedToken;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        setLoading(false); // Force loading to false on timeout
      }, 10000); // 10s timeout

      try {
        console.log('Fetching user data with token:', token ? 'Token exists' : 'No token');
        const response = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal
        });

        if (response.ok) {
          const userData = await response.json();
          console.log('Auth check success for user:', userData.email);
          setUser(userData);
        } else {
          console.warn('Auth check failed, status:', response.status);
          // Only set user to null if it's definitely an auth error
          if (response.status === 401 || response.status === 403) {
            console.warn('Unauthorized access, setting user to null');
            setUser(null);
            setToken(null);
            localStorage.removeItem('token');
          }
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.error('Auth check timed out');
        } else {
          console.error('Failed to fetch user', error);
          // On other errors, we might want to keep the token but stop loading
        }
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    };

    fetchUser();
  }, [token]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
