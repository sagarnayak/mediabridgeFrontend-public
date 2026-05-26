import { useState } from 'react';
import { logout } from '../api/auth';
import UserManagement from './UserManagement';
import Resources from './Resources';

interface Props {
  user: { name: string; email: string; isAdmin: boolean; menuItems: string[] };
  onLogout: () => void;
}

const MENU_LABELS: Record<string, string> = {
  'resources': 'Resources',
  'user-management': 'User Management',
};

export default function Dashboard({ user, onLogout }: Props) {
  const [activeMenu, setActiveMenu] = useState(user.menuItems[0]);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      sessionStorage.clear();
      onLogout();
    }
  }

  return (
    <div style={styles.shell}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarTop}>
          <div style={styles.logo}>MB</div>
          <span style={styles.logoText}>MediaBridge</span>
        </div>

        <nav style={styles.nav}>
          {user.menuItems.map((item) => (
            <button
              key={item}
              style={{
                ...styles.navItem,
                ...(activeMenu === item ? styles.navItemActive : {}),
              }}
              onClick={() => setActiveMenu(item)}
            >
              <span style={styles.navIcon}>{item === 'resources' ? '◫' : '⊞'}</span>
              {MENU_LABELS[item] || item}
            </button>
          ))}
        </nav>

        <div style={styles.sidebarBottom}>
          <div style={styles.userInfo}>
            <div style={styles.userAvatar}>{user.name.charAt(0).toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <p style={styles.userName}>{user.name}</p>
              <p style={styles.userEmail}>{user.email}</p>
            </div>
          </div>
          <button
            style={{ ...styles.logoutBtn, opacity: loggingOut ? 0.6 : 1 }}
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? 'Signing out...' : 'Sign Out'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={styles.main}>
        <div style={styles.topBar}>
          <h1 style={styles.pageTitle}>{MENU_LABELS[activeMenu]}</h1>
        </div>

        <div style={styles.content}>
          {activeMenu === 'resources' && <Resources isAdmin={user.isAdmin} />}
          {activeMenu === 'user-management' && <UserManagement />}
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'flex',
    height: '100vh',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    background: '#F8FAFC',
  },
  sidebar: {
    width: '240px',
    minWidth: '240px',
    background: '#0F172A',
    display: 'flex',
    flexDirection: 'column',
    padding: '0',
    overflowY: 'auto' as const,
  },
  sidebarTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '24px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  logo: {
    width: '32px',
    height: '32px',
    background: '#3B82F6',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: '700',
    fontSize: '13px',
    flexShrink: 0,
  },
  logoText: {
    color: '#F1F5F9',
    fontWeight: '700',
    fontSize: '15px',
  },
  nav: {
    flex: 1,
    padding: '16px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 12px',
    borderRadius: '8px',
    border: 'none',
    background: 'transparent',
    color: '#94A3B8',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    transition: 'background 0.15s, color 0.15s',
  },
  navItemActive: {
    background: '#1E3A5F',
    color: '#3B82F6',
  },
  navIcon: {
    fontSize: '16px',
  },
  sidebarBottom: {
    padding: '16px 12px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '4px',
  },
  userAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: '#334155',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94A3B8',
    fontWeight: '700',
    fontSize: '13px',
    flexShrink: 0,
  },
  userName: {
    margin: 0,
    color: '#F1F5F9',
    fontSize: '13px',
    fontWeight: '600',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  userEmail: {
    margin: 0,
    color: '#64748B',
    fontSize: '11px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  logoutBtn: {
    padding: '8px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#64748B',
    fontSize: '13px',
    cursor: 'pointer',
    width: '100%',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  topBar: {
    padding: '20px 32px',
    borderBottom: '1px solid #E2E8F0',
    background: '#fff',
  },
  pageTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '700',
    color: '#1E293B',
  },
  content: {
    flex: 1,
    padding: 'clamp(16px, 3vw, 32px)',
    overflow: 'auto',
    minWidth: 0,
  },
  placeholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '200px',
    border: '2px dashed #E2E8F0',
    borderRadius: '12px',
    background: '#fff',
  },
  placeholderText: {
    color: '#94A3B8',
    fontSize: '15px',
    margin: 0,
  },
};
