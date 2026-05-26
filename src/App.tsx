import axios from 'axios';
import { useEffect, useState } from 'react';
import { checkSetupStatus, getMe } from './api/auth';
import { CONFIG } from './config';
import Setup from './pages/Setup';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

type AppState = 'loading' | 'setup' | 'login' | 'dashboard';

interface User {
  name: string;
  email: string;
  isAdmin: boolean;
  menuItems: string[];
}

export default function App() {
  const [state, setState] = useState<AppState>('loading');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const { setupRequired } = await checkSetupStatus();
      if (setupRequired) {
        setState('setup');
        return;
      }

      // If no token in storage, try a silent refresh via the httpOnly cookie
      if (!localStorage.getItem('mb_token')) {
        try {
          const res = await axios.post(`${CONFIG.api.baseUrl}/auth/refresh`, {}, { withCredentials: true });
          localStorage.setItem('mb_token', res.data.token);
        } catch {
          setState('login');
          return;
        }
      }

      try {
        const me = await getMe();
        setUser(me);
        setState('dashboard');
      } catch {
        localStorage.removeItem('mb_token');
        setState('login');
      }
    } catch {
      setState('login');
    }
  }

  async function handleAuth(token: string) {
    localStorage.setItem('mb_token', token);
    try {
      const me = await getMe();
      setUser(me);
      setState('dashboard');
    } catch {
      setState('login');
    }
  }

  function handleLogout() {
    localStorage.removeItem('mb_token');
    setUser(null);
    setState('login');
  }

  if (state === 'loading') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F8FAFC',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <p style={{ color: '#94A3B8', fontSize: '14px' }}>Loading...</p>
      </div>
    );
  }

  if (state === 'setup') return <Setup onComplete={handleAuth} />;
  if (state === 'login') return <Login onLogin={handleAuth} />;
  if (state === 'dashboard' && user) return <Dashboard user={user} onLogout={handleLogout} />;

  return null;
}
