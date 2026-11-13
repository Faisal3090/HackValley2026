import React from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import {
  DriverSquadAvatar,
  KasuCabLogoBanner,
  PassengerSquadAvatar,
} from '../components/KasuCabArt.jsx';

export default function RoleSelect() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (!loading && user) {
    if (user.role === 'driver') return <Navigate to="/driver" replace />;
    if (user.role === 'admin') return <Navigate to="/demo" replace />;
    return <Navigate to="/passenger" replace />;
  }

  return (
    <div className="kasu-screen">
      <main className="kasu-center-col">
        <KasuCabLogoBanner compact />

        <h1 className="kasu-blue-heading">
          Who&apos;s joining the squad today?
        </h1>

        <div className="kasu-role-grid">
          <button
            type="button"
            className="kasu-role-card"
            onClick={() => navigate('/signup/driver')}
          >
            <div className="kasu-role-frame">
              <DriverSquadAvatar />
            </div>
            <span className="kasu-role-label">Driver</span>
          </button>

          <button
            type="button"
            className="kasu-role-card"
            onClick={() => navigate('/signup/passenger')}
          >
            <div className="kasu-role-frame">
              <PassengerSquadAvatar />
            </div>
            <span className="kasu-role-label">Passenger</span>
          </button>
        </div>

        <p className="kasu-inline-prompt" style={{ marginTop: '24px' }}>
          Already have an account?{' '}
          <Link to="/login" className="kasu-link-red">
            Login
          </Link>
        </p>
      </main>
    </div>
  );
}
