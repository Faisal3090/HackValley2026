import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest } from './api.js';

const STORAGE_KEY = 'ridematch_token';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [user, setUser] = useState(null);
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(STORAGE_KEY)));

  const clearSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken('');
    setUser(null);
    setDriver(null);
  }, []);

  const refreshMe = useCallback(
    async (activeToken = token) => {
      if (!activeToken) {
        setUser(null);
        setDriver(null);
        setLoading(false);
        return null;
      }
      try {
        const data = await apiRequest('/auth/me', { token: activeToken });
        setUser(data.user);
        setDriver(data.driver || null);
        return data;
      } catch {
        clearSession();
        return null;
      } finally {
        setLoading(false);
      }
    },
    [token, clearSession]
  );

  useEffect(() => {
    if (token) {
      void refreshMe(token);
    } else {
      setLoading(false);
    }
  }, [token, refreshMe]);

  const login = async ({ username, password }) => {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    localStorage.setItem(STORAGE_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    setDriver(data.driver || null);
    return data;
  };

  const register = async (payload) => {
    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: payload,
    });
    localStorage.setItem(STORAGE_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    setDriver(data.driver || null);
    return data;
  };

  const logout = () => {
    clearSession();
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        driver,
        setDriver,
        loading,
        login,
        register,
        logout,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
