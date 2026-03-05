import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { login as apiLogin, getMe, logout as apiLogout } from '@/api/routes';
import type { AuthUser } from '@/types/apiTypes';

interface AuthContextType {
    user: AuthUser | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const stored = localStorage.getItem('sce_token');
        if (stored) {
            setToken(stored);
            getMe()
                .then(setUser)
                .catch(() => {
                    localStorage.removeItem('sce_token');
                    setToken(null);
                })
                .finally(() => setIsLoading(false));
        } else {
            setIsLoading(false);
        }
    }, []);

    const login = async (username: string, password: string) => {
        const data = await apiLogin(username, password);
        localStorage.setItem('sce_token', data.token);
        setToken(data.token);
        setUser(data.user);
    };

    const logout = () => {
        apiLogout();
        localStorage.removeItem('sce_token');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, isAuthenticated: !!token, isLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
