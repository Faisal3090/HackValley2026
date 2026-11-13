import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { KasuCabSquareBadge } from '../components/KasuCabArt.jsx';

export default function Login({ initialView = 'login' }) {
  const { user, loading, login, register } = useAuth();
  const navigate = useNavigate();

  // Shared login fields
  const [username, setUsername] = useState('passenger1');
  const [password, setPassword] = useState('demo1234');
  const [showForgotHint, setShowForgotHint] = useState(false);

  // Passenger signup fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  // Driver signup fields + required step drawer state
  const [activeStep, setActiveStep] = useState('photo');
  const [completedSteps, setCompletedSteps] = useState({
    photo: false,
    background: false,
    license: false,
  });
  const [driverFullName, setDriverFullName] = useState('');
  const [driverUsername, setDriverUsername] = useState('');
  const [driverEmail, setDriverEmail] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [driverPassword, setDriverPassword] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('HATCHBACK');
  const [vehicleNumber, setVehicleNumber] = useState('');

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    if (user.role === 'driver') return <Navigate to="/driver" replace />;
    if (user.role === 'admin') return <Navigate to="/demo" replace />;
    return <Navigate to="/passenger" replace />;
  }

  const redirectForRole = (userRole) => {
    if (userRole === 'driver') navigate('/driver');
    else if (userRole === 'admin') navigate('/demo');
    else navigate('/passenger');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await login({ username: username.trim(), password });
      redirectForRole(res.user.role);
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  const handlePassengerSignup = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const fullName =
        `${firstName.trim()} ${lastName.trim()}`.trim() || signupUsername.trim();
      const res = await register({
        username: signupUsername.trim(),
        email: signupEmail.trim(),
        password: signupPassword,
        role: 'passenger',
        name: fullName,
        phone: phone.trim(),
      });
      redirectForRole(res.user.role);
    } catch (err) {
      setError(err.message || 'Could not create passenger account');
    } finally {
      setBusy(false);
    }
  };

  const handleDriverSignup = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await register({
        username: driverUsername.trim(),
        email: driverEmail.trim(),
        password: driverPassword,
        role: 'driver',
        name: driverFullName.trim() || driverUsername.trim(),
        phone: driverPhone.trim(),
        vehicleType,
        vehicleNumber: vehicleNumber.trim() || undefined,
        licenseNumber: licenseNumber.trim() || undefined,
      });
      redirectForRole(res.user.role);
    } catch (err) {
      setError(err.message || 'Could not create driver account');
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = (demoUser) => {
    setUsername(demoUser);
    setPassword('demo1234');
    setError('');
  };

  if (initialView === 'passenger-signup') {
    const welcomeLetters = [
      { ch: 'K', color: '#FFD426' },
      { ch: 'A', color: '#FACC15' },
      { ch: 'S', color: '#FDE047' },
      { ch: 'U', color: '#FACC15' },
      { ch: 'C', color: '#EF4444' },
      { ch: 'A', color: '#EF4444' },
      { ch: 'B', color: '#DC2626' },
    ];

    return (
      <div className="kasu-screen">
        <main className="kasu-form-col">
          <div className="kasu-blue-welcome-banner">
            <div className="kasu-welcome-sub">Welcome to</div>
            <div className="kasu-welcome-word" aria-label="KasuCab">
              {welcomeLetters.map((item, i) => (
                <span key={i} style={{ color: item.color }}>
                  {item.ch}
                </span>
              ))}
            </div>
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: '14px', width: '100%' }}>
              {error}
            </div>
          )}

          <form onSubmit={handlePassengerSignup} className="kasu-pill-form">
            <input
              className="kasu-pill-input kasu-pill-input--transparent"
              placeholder="First Name"
              aria-label="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
            <input
              className="kasu-pill-input kasu-pill-input--transparent"
              placeholder="Last Name"
              aria-label="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
            <input
              className="kasu-pill-input kasu-pill-input--transparent"
              placeholder="Username"
              aria-label="Username"
              value={signupUsername}
              onChange={(e) => setSignupUsername(e.target.value)}
              minLength={2}
              maxLength={50}
              required
            />
            <input
              type="email"
              className="kasu-pill-input kasu-pill-input--transparent"
              placeholder="Email Address"
              aria-label="Email Address"
              value={signupEmail}
              onChange={(e) => setSignupEmail(e.target.value)}
              maxLength={254}
              required
            />
            <input
              className="kasu-pill-input kasu-pill-input--transparent"
              placeholder="Phone Number"
              aria-label="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <input
              type="password"
              className="kasu-pill-input kasu-pill-input--transparent"
              placeholder="Password (min 4 chars)"
              aria-label="Password"
              value={signupPassword}
              onChange={(e) => setSignupPassword(e.target.value)}
              minLength={4}
              required
            />

            <button
              type="submit"
              className="kasu-btn-orange kasu-btn-cta"
              disabled={busy}
            >
              {busy ? 'Creating...' : 'Create Account'}
            </button>
          </form>

          <hr className="kasu-divider" />

          <p className="kasu-inline-prompt">
            Already have Account?{' '}
            <Link to="/login" className="kasu-link-red">
              Login
            </Link>
          </p>
        </main>
      </div>
    );
  }

  if (initialView === 'driver-signup') {
    const toggleStep = (key) => {
      setActiveStep((prev) => (prev === key ? '' : key));
    };

    const markStepDone = (key, nextKey) => {
      setCompletedSteps((prev) => ({ ...prev, [key]: true }));
      if (nextKey) setActiveStep(nextKey);
    };

    return (
      <div className="kasu-screen">
        <main className="kasu-form-col kasu-driver-signup-col">
          <div style={{ width: '100%', textAlign: 'left', marginBottom: '16px' }}>
            <h1 className="kasu-driver-hero-title">
              Welcome,
              <br />
              Let&apos;s Get Started and Earn!
            </h1>
            <div className="kasu-required-label">Required Steps</div>
            <p className="kasu-required-sub">
              Complete the Steps below to set up your account and get on the road
            </p>
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: '14px', width: '100%' }}>
              {error}
            </div>
          )}

          <div className="kasu-steps-stack">
            <button
              type="button"
              className="kasu-step-card"
              onClick={() => toggleStep('photo')}
            >
              <div>
                <div className="kasu-step-title">Profile Photo</div>
                <div className="kasu-step-status">
                  {completedSteps.photo ? 'Completed' : 'Recommended Next'}
                </div>
              </div>
              <span className="kasu-step-arrow" aria-hidden="true">
                {completedSteps.photo ? '✓' : '>'}
              </span>
            </button>

            {activeStep === 'photo' && (
              <div className="kasu-step-drawer">
                <p style={{ margin: '0 0 10px', fontSize: '14px' }}>
                  Confirm your squad driver name so passengers recognize you at pickup.
                </p>
                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label className="kasu-field-label" htmlFor="drvFullName">
                    Full Name
                  </label>
                  <input
                    id="drvFullName"
                    className="kasu-pill-input"
                    placeholder="e.g. Ravi Kumar"
                    value={driverFullName}
                    onChange={(e) => setDriverFullName(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-success"
                  onClick={() => markStepDone('photo', 'background')}
                >
                  Confirm Step
                </button>
              </div>
            )}

            <button
              type="button"
              className="kasu-step-card"
              onClick={() => toggleStep('background')}
            >
              <div>
                <div className="kasu-step-title">Background Check</div>
                <div className="kasu-step-status">
                  {completedSteps.background ? 'Completed' : 'Ready to Begin'}
                </div>
              </div>
              <span className="kasu-step-arrow" aria-hidden="true">
                {completedSteps.background ? '✓' : '>'}
              </span>
            </button>

            {activeStep === 'background' && (
              <div className="kasu-step-drawer">
                <p style={{ margin: '0 0 10px', fontSize: '14px' }}>
                  Add your contact phone number for safety verification and trip alerts.
                </p>
                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label className="kasu-field-label" htmlFor="drvPhone">
                    Phone Number
                  </label>
                  <input
                    id="drvPhone"
                    className="kasu-pill-input"
                    placeholder="e.g. 9876543210"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-success"
                  onClick={() => markStepDone('background', 'license')}
                >
                  Confirm Step
                </button>
              </div>
            )}

            <button
              type="button"
              className="kasu-step-card"
              onClick={() => toggleStep('license')}
            >
              <div>
                <div className="kasu-step-title">Driver&apos;s License</div>
                <div className="kasu-step-status">
                  {completedSteps.license ? 'Completed' : 'Ready to Begin'}
                </div>
              </div>
              <span className="kasu-step-arrow" aria-hidden="true">
                {completedSteps.license ? '✓' : '>'}
              </span>
            </button>

            {activeStep === 'license' && (
              <div className="kasu-step-drawer">
                <div className="kv-grid" style={{ marginBottom: '10px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="kasu-field-label" htmlFor="drvVehType">
                      Vehicle Type
                    </label>
                    <select
                      id="drvVehType"
                      className="select"
                      value={vehicleType}
                      onChange={(e) => setVehicleType(e.target.value)}
                    >
                      <option value="AUTO">AUTO</option>
                      <option value="HATCHBACK">HATCHBACK</option>
                      <option value="SEDAN">SEDAN</option>
                      <option value="SUV">SUV</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="kasu-field-label" htmlFor="drvVehNum">
                      Vehicle Plate
                    </label>
                    <input
                      id="drvVehNum"
                      className="kasu-pill-input"
                      placeholder="KA22A9001"
                      value={vehicleNumber}
                      onChange={(e) => setVehicleNumber(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label className="kasu-field-label" htmlFor="drvLicense">
                    License Number (optional)
                  </label>
                  <input
                    id="drvLicense"
                    className="kasu-pill-input"
                    placeholder="KA22-2026-001122"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-success"
                  onClick={() => markStepDone('license', '')}
                >
                  Save Vehicle &amp; License
                </button>
              </div>
            )}
          </div>

          <form onSubmit={handleDriverSignup} className="kasu-pill-form" style={{ marginTop: '16px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="kasu-field-label" htmlFor="drvUser">
                Username
              </label>
              <input
                id="drvUser"
                className="kasu-pill-input"
                placeholder="driver_ravi"
                value={driverUsername}
                onChange={(e) => setDriverUsername(e.target.value)}
                minLength={2}
                maxLength={50}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="kasu-field-label" htmlFor="drvEmail">
                Email Address
              </label>
              <input
                id="drvEmail"
                type="email"
                className="kasu-pill-input"
                placeholder="driver@example.com"
                value={driverEmail}
                onChange={(e) => setDriverEmail(e.target.value)}
                maxLength={254}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="kasu-field-label" htmlFor="drvPass">
                Password
              </label>
              <input
                id="drvPass"
                type="password"
                className="kasu-pill-input"
                placeholder="Min 4 characters"
                value={driverPassword}
                onChange={(e) => setDriverPassword(e.target.value)}
                minLength={4}
                required
              />
            </div>

            <button
              type="submit"
              className="kasu-btn-orange kasu-btn-cta"
              disabled={busy}
            >
              {busy ? 'Setting Up...' : 'Start Driving with KasuCab'}
            </button>
          </form>

          <hr className="kasu-divider" />

          <p className="kasu-inline-prompt">
            Already have Account?{' '}
            <Link to="/login" className="kasu-link-red">
              Login
            </Link>
          </p>
        </main>
      </div>
    );
  }

  // Default: Shared Login view
  return (
    <div className="kasu-screen">
      <main className="kasu-form-col">
        <h1 className="kasu-login-heading">Hey, welcome back!</h1>

        <KasuCabSquareBadge />

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '14px', width: '100%' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLoginSubmit} className="kasu-pill-form">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="kasu-field-label" htmlFor="username">
              Username, Email or Phone Number
            </label>
            <input
              id="username"
              className="kasu-pill-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="kasu-field-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="kasu-pill-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div style={{ textAlign: 'left', width: '100%' }}>
            <button
              type="button"
              className="kasu-text-btn kasu-link-red"
              onClick={() => setShowForgotHint((s) => !s)}
            >
              Forgot Password?
            </button>
            {showForgotHint && (
              <div className="alert alert-info" style={{ marginTop: '8px' }}>
                Demo squad accounts (<code>passenger1</code>, <code>driver1</code>..<code>driver10</code>,{' '}
                <code>admin</code>) all use password <code>demo1234</code>.
              </div>
            )}
          </div>

          <button
            type="submit"
            className="kasu-btn-orange kasu-btn-cta"
            disabled={busy}
          >
            {busy ? 'Signing in...' : 'Login'}
          </button>
        </form>

        <p className="kasu-inline-prompt" style={{ marginTop: '14px' }}>
          Don&apos;t have an account?{' '}
          <Link to="/join" className="kasu-link-red">
            Sign up
          </Link>
        </p>

        <hr className="kasu-divider" />

        <div className="kasu-demo-box">
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: '#334155' }}>
            Quick Squad Sign-In (password: <code>demo1234</code>)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px' }}>
            <button type="button" className="btn btn-sm" onClick={() => fillDemo('passenger1')}>
              passenger1
            </button>
            <button type="button" className="btn btn-sm" onClick={() => fillDemo('driver1')}>
              driver1
            </button>
            <button type="button" className="btn btn-sm" onClick={() => fillDemo('driver2')}>
              driver2
            </button>
            <button type="button" className="btn btn-sm" onClick={() => fillDemo('driver3')}>
              driver3
            </button>
            <button type="button" className="btn btn-sm" onClick={() => fillDemo('admin')}>
              admin
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
