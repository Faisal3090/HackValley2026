import React from 'react';
import {
  BrowserRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import { KasuCabCompactBrand } from './components/KasuCabArt.jsx';
import NotificationBell from './components/NotificationBell.jsx';
import ToastContainer from './components/ToastContainer.jsx';
import { useDispatchToastNotifications } from './hooks/useDispatchToastNotifications.js';
import DemoPanel from './pages/DemoPanel.jsx';
import DriverHome from './pages/DriverHome.jsx';
import History from './pages/History.jsx';
import Landing from './pages/Landing.jsx';
import LiveMap from './pages/LiveMap.jsx';
import Login from './pages/Login.jsx';
import PassengerHome from './pages/PassengerHome.jsx';
import RoleSelect from './pages/RoleSelect.jsx';
import TrafficIntelligence from './pages/TrafficIntelligence.jsx';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="page-container">
        <p style={{ color: 'var(--ink-muted)' }}>Loading session...</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;
  return children;
}

function DefaultRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;
  if (user.role === 'driver') return <Navigate to="/driver" replace />;
  if (user.role === 'admin') return <Navigate to="/demo" replace />;
  return <Navigate to="/passenger" replace />;
}

function ShellLayout({ children }) {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    toasts,
    notifications,
    dismissToast,
    clearAllToasts,
    pauseToastTimer,
    resumeToastTimer,
    markRead,
  } = useDispatchToastNotifications({ token, user });

  const handleInspectRide = (toast) => {
    if (!toast?.ride_id) return;
    dismissToast(toast);
    const targetPath = location.pathname === '/live-map' ? '/live-map' : '/demo';
    navigate(`${targetPath}?rideId=${toast.ride_id}`);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="topbar-brand" aria-label="KasuCab Home">
          <KasuCabCompactBrand />
        </NavLink>

        <nav className="topbar-nav" aria-label="Primary">
          {user?.role === 'passenger' && (
            <NavLink to="/passenger" className={({ isActive }) => `topbar-link ${isActive ? 'active' : ''}`}>
              Book Ride
            </NavLink>
          )}
          {user?.role === 'driver' && (
            <NavLink to="/driver" className={({ isActive }) => `topbar-link ${isActive ? 'active' : ''}`}>
              Driver Console
            </NavLink>
          )}
          <NavLink to="/live-map" className={({ isActive }) => `topbar-link ${isActive ? 'active' : ''}`}>
            Live Map
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => `topbar-link ${isActive ? 'active' : ''}`}>
            History
          </NavLink>
          <NavLink to="/demo" className={({ isActive }) => `topbar-link ${isActive ? 'active' : ''}`}>
            Demo Panel
          </NavLink>
          <NavLink to="/traffic" className={({ isActive }) => `topbar-link ${isActive ? 'active' : ''}`}>
            Traffic AI
          </NavLink>
        </nav>

        <div className="topbar-actions">
          {user && <NotificationBell notifications={notifications} onMarkRead={markRead} />}
          {user && (
            <span className="user-meta">
              {user.name} ({user.role})
            </span>
          )}
          <button type="button" className="btn btn-sm" onClick={logout}>
            Sign Out
          </button>
        </div>
      </header>

      {children}

      <ToastContainer
        toasts={toasts}
        onDismiss={dismissToast}
        onInspectRide={handleInspectRide}
        onPause={pauseToastTimer}
        onResume={resumeToastTimer}
        onClearAll={clearAllToasts}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/join" element={<RoleSelect />} />
          <Route path="/login" element={<Login initialView="login" />} />
          <Route path="/signup/passenger" element={<Login initialView="passenger-signup" />} />
          <Route path="/signup/driver" element={<Login initialView="driver-signup" />} />
          <Route
            path="/passenger"
            element={
              <ProtectedRoute>
                <ShellLayout>
                  <PassengerHome />
                </ShellLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/driver"
            element={
              <ProtectedRoute>
                <ShellLayout>
                  <DriverHome />
                </ShellLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/live-map"
            element={
              <ProtectedRoute>
                <ShellLayout>
                  <LiveMap />
                </ShellLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <ShellLayout>
                  <History />
                </ShellLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/demo"
            element={
              <ProtectedRoute>
                <ShellLayout>
                  <DemoPanel />
                </ShellLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/traffic"
            element={<ProtectedRoute><ShellLayout><TrafficIntelligence /></ShellLayout></ProtectedRoute>}
          />
          <Route path="*" element={<DefaultRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
