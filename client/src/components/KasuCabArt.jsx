import React from 'react';

export function CabMascotSvg({ size = 92 }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.85)}
      viewBox="0 0 120 102"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Taxi roof topper */}
      <path
        d="M42 22C42 14 49 10 60 10C71 10 78 14 78 22V28H42V22Z"
        fill="#FFD426"
        stroke="#1E293B"
        strokeWidth="3"
      />
      <rect x="47" y="16" width="6" height="6" fill="#1E293B" />
      <rect x="53" y="16" width="6" height="6" fill="#FFF9EB" />
      <rect x="59" y="16" width="6" height="6" fill="#1E293B" />
      <rect x="65" y="16" width="6" height="6" fill="#FFF9EB" />

      {/* Side mirrors */}
      <ellipse cx="14" cy="48" rx="6" ry="5" fill="#FFD426" stroke="#1E293B" strokeWidth="3" />
      <ellipse cx="106" cy="48" rx="6" ry="5" fill="#FFD426" stroke="#1E293B" strokeWidth="3" />

      {/* Wheels */}
      <rect x="17" y="75" width="18" height="19" rx="5" fill="#334155" stroke="#1E293B" strokeWidth="3" />
      <rect x="85" y="75" width="18" height="19" rx="5" fill="#334155" stroke="#1E293B" strokeWidth="3" />

      {/* Cab cabin */}
      <path
        d="M25 50L33 27C35 23 41 21 60 21C79 21 85 23 87 27L95 50H25Z"
        fill="#FFD426"
        stroke="#1E293B"
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {/* Windshield */}
      <path
        d="M32 47L37 31C39 28 45 27 60 27C75 27 81 28 83 31L88 47H32Z"
        fill="#BCE3FA"
        stroke="#1E293B"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M40 43L48 31" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
      <path d="M50 43L55 34" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />

      {/* Cab hood & body */}
      <rect
        x="15"
        y="47"
        width="90"
        height="34"
        rx="13"
        fill="#FFD426"
        stroke="#1E293B"
        strokeWidth="3"
      />

      {/* Headlights */}
      <circle cx="29" cy="61" r="8" fill="#FFFBEB" stroke="#1E293B" strokeWidth="2.8" />
      <circle cx="91" cy="61" r="8" fill="#FFFBEB" stroke="#1E293B" strokeWidth="2.8" />
      <circle cx="27" cy="59" r="2.2" fill="#FFFFFF" />
      <circle cx="89" cy="59" r="2.2" fill="#FFFFFF" />

      {/* Smiling grille */}
      <rect
        x="43"
        y="62"
        width="34"
        height="13"
        rx="6.5"
        fill="#FFF9EB"
        stroke="#1E293B"
        strokeWidth="2.5"
      />
      <circle cx="52" cy="68.5" r="2.5" fill="none" stroke="#1E293B" strokeWidth="2" />
      <circle cx="60" cy="68.5" r="2.5" fill="none" stroke="#1E293B" strokeWidth="2" />
      <circle cx="68" cy="68.5" r="2.5" fill="none" stroke="#1E293B" strokeWidth="2" />

      {/* Bumper */}
      <rect
        x="22"
        y="78"
        width="76"
        height="7"
        rx="3.5"
        fill="#CBD5E1"
        stroke="#1E293B"
        strokeWidth="2.5"
      />
    </svg>
  );
}

export function KasuCabLogoBanner({ compact = false }) {
  return (
    <div className={`kasu-banner-card ${compact ? 'compact' : ''}`}>
      <div className="kasu-banner-top">
        <CabMascotSvg size={compact ? 76 : 98} />
        <div className="kasu-wordmark-stack" aria-label="KasuCab">
          <span className="kasu-word-red">KASU</span>
          <span className="kasu-word-blue">CAB</span>
        </div>
      </div>
      <p className="kasu-tagline">The city&apos;s favourite ride squad.</p>
    </div>
  );
}

export function KasuCabSquareBadge() {
  const letters = [
    { ch: 'K', color: '#EF4444' },
    { ch: 'A', color: '#FACC15' },
    { ch: 'S', color: '#38A3F5' },
    { ch: 'U', color: '#F59E0B' },
    { ch: 'C', color: '#38A3F5' },
    { ch: 'A', color: '#EF4444' },
    { ch: 'B', color: '#1E293B' },
  ];

  return (
    <div className="kasu-square-badge">
      <CabMascotSvg size={82} />
      <div className="kasu-rainbow-word" aria-label="KasuCab">
        {letters.map((item, i) => (
          <span key={i} style={{ color: item.color }}>
            {item.ch}
          </span>
        ))}
      </div>
    </div>
  );
}

export function KasuCabCompactBrand() {
  return (
    <span className="kasu-nav-brand">
      <CabMascotSvg size={36} />
      <span className="kasu-nav-text">
        <span style={{ color: '#EF4444' }}>Kasu</span>
        <span style={{ color: '#218CE0' }}>Cab</span>
      </span>
    </span>
  );
}

export function DriverSquadAvatar() {
  return (
    <svg width="88" height="88" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Cap */}
      <path d="M27 32C28 19 37 13 50 13C63 13 72 19 73 32H27Z" fill="#FFD426" stroke="#1E293B" strokeWidth="2.8" />
      <path d="M24 32H75C75 35 66 37 50 37C34 37 24 35 24 32Z" fill="#1E293B" />
      <rect x="44" y="19" width="12" height="5" rx="2" fill="#FFF9EB" stroke="#1E293B" strokeWidth="1.8" />
      {/* Face */}
      <circle cx="50" cy="46" r="16" fill="#FCD5B5" stroke="#1E293B" strokeWidth="2.8" />
      <path d="M40 42C41 39 45 39 46 42" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M54 42C55 39 59 39 60 42" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M44 51C46 55 54 55 56 51" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" fill="#F87171" />
      {/* Shirt */}
      <path d="M31 64C31 59 38 57 50 57C62 57 69 59 69 64V83H31V64Z" fill="#60B2F7" stroke="#1E293B" strokeWidth="2.8" />
      <path d="M50 58V83" stroke="#1E293B" strokeWidth="2.2" />
      <rect x="33" y="83" width="34" height="10" rx="3" fill="#475569" stroke="#1E293B" strokeWidth="2.5" />
      {/* Hand & Key */}
      <circle cx="77" cy="54" r="5" fill="#FCD5B5" stroke="#1E293B" strokeWidth="2.3" />
      <circle cx="83" cy="60" r="4" fill="#CBD5E1" stroke="#1E293B" strokeWidth="2" />
      <path d="M83 64V73M83 69H87M83 72H86" stroke="#1E293B" strokeWidth="2.2" strokeLinecap="round" />
      {/* Spark */}
      <path d="M77 24L80 18M84 26L89 22" stroke="#1E293B" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PassengerSquadAvatar() {
  return (
    <svg width="88" height="88" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Backpack */}
      <rect x="27" y="53" width="46" height="24" rx="8" fill="#38A3F5" stroke="#1E293B" strokeWidth="2.6" />
      {/* Hair & Head */}
      <circle cx="50" cy="40" r="17" fill="#FCD5B5" stroke="#1E293B" strokeWidth="2.8" />
      <path d="M33 37C34 24 44 21 53 22C63 23 67 28 67 37C62 31 41 31 33 37Z" fill="#1E293B" />
      {/* Eyes & Smile */}
      <circle cx="43" cy="39" r="3" fill="#1E293B" />
      <circle cx="57" cy="39" r="3" fill="#1E293B" />
      <circle cx="44" cy="38" r="1" fill="#FFFFFF" />
      <circle cx="58" cy="38" r="1" fill="#FFFFFF" />
      <path d="M46 48C48 51 52 51 54 48" stroke="#1E293B" strokeWidth="2.4" strokeLinecap="round" />
      {/* Waving arm */}
      <path d="M33 63L23 48" stroke="#EF4444" strokeWidth="8" strokeLinecap="round" />
      <path d="M33 63L23 48" stroke="#1E293B" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="22" cy="45" r="5" fill="#FCD5B5" stroke="#1E293B" strokeWidth="2.3" />
      {/* Red Shirt & Yellow Shorts */}
      <path d="M34 57H66V77H34V57Z" fill="#EF4444" stroke="#1E293B" strokeWidth="2.6" />
      <path d="M35 77H65V89H53L50 83L47 89H35V77Z" fill="#FACC15" stroke="#1E293B" strokeWidth="2.6" />
      {/* Phone in hand */}
      <rect x="57" y="56" width="11" height="16" rx="2.5" fill="#FFD426" stroke="#1E293B" strokeWidth="2.2" />
      <circle cx="55" cy="65" r="4.5" fill="#FCD5B5" stroke="#1E293B" strokeWidth="2.2" />
      {/* Spark */}
      <path d="M77 25L80 19M84 28L89 24" stroke="#1E293B" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
