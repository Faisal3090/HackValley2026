import React from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { KasuCabLogoBanner } from '../components/KasuCabArt.jsx';

export default function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (!loading && user) {
    if (user.role === 'driver') return <Navigate to="/driver" replace />;
    if (user.role === 'admin') return <Navigate to="/demo" replace />;
    return <Navigate to="/passenger" replace />;
  }

  return (
    <div className="kasu-screen kasu-landing">
      <main className="kasu-landing-content">
        <KasuCabLogoBanner />

        <div className="kasu-landing-actions">
          <button
            type="button"
            className="kasu-btn-orange kasu-btn-hero"
            onClick={() => navigate('/login')}
          >
            Slide to Ride!
          </button>

          <p className="kasu-inline-prompt">
            New to the squad?{' '}
            <Link to="/join" className="kasu-link-red">
              Join KasuCab
            </Link>
          </p>
        </div>
      </main>

      <div className="kasu-green-hill" aria-hidden="true" />
    </div>
  );
}
