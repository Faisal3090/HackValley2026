import React from 'react';

export default function DecisionPanel({ ride }) {
  if (!ride) {
    return (
      <div className="panel">
        <h3 className="panel-title">Dispatch Decision</h3>
        <p style={{ margin: 0, color: 'var(--ink-muted)' }}>
          Select or create a ride to inspect driver scoring and ranking decisions.
        </p>
      </div>
    );
  }

  const ranked = Array.isArray(ride.latestRanking) ? ride.latestRanking : [];
  const selected = ranked.find((r) => r.selected) || ranked[0] || null;

  return (
    <div className="panel">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          marginBottom: '12px',
        }}
      >
        <h3 className="panel-title" style={{ margin: 0 }}>
          Dispatch Decision · Ride #{ride.id}
        </h3>
        <div className="meta-row tabular">
          <span>
            Status: <strong>{ride.status}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Attempt: <strong>{ride.attemptCount}/{ride.maxAttempts}</strong>
          </span>
          {ride.currentOffer && (
            <>
              <span aria-hidden="true">·</span>
              <span style={{ color: 'var(--warning)' }}>
                Countdown: <strong>{ride.currentOffer.secondsLeft}s</strong>
              </span>
            </>
          )}
        </div>
      </div>

      <div className="meta-row" style={{ marginBottom: '12px' }}>
        <span>
          Ranker used: <strong>{ride.rankerUsed || 'nearest'}</strong>
        </span>
        <span aria-hidden="true">·</span>
        <span>
          Fell back:{' '}
          <strong style={{ color: ride.fellBack ? 'var(--warning)' : 'var(--success)' }}>
            {ride.fellBack ? 'YES' : 'NO'}
          </strong>
        </span>
        {selected?.reason && (
          <>
            <span aria-hidden="true">·</span>
            <span>Reason: {selected.reason}</span>
          </>
        )}
      </div>

      {ranked.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--ink-muted)' }}>
          No eligible drivers were ranked on the latest attempt.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Driver</th>
                <th className="num">Distance</th>
                <th className="num">ETA</th>
                <th className="num">Score</th>
                <th>Factors</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((row) => {
                const factors = Object.entries(row.factors || {});
                return (
                  <tr
                    key={row.driverId}
                    className={row.selected ? 'selected-row' : undefined}
                  >
                    <td className="tabular">#{row.rank}</td>
                    <td>
                      <strong>{row.name}</strong>{' '}
                      <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                        (ID {row.driverId}{row.selected ? ' · Selected' : ''})
                      </span>
                    </td>
                    <td className="num">{row.distanceKm} km</td>
                    <td className="num">{row.etaMin} min</td>
                    <td className="num">
                      <strong>{row.score}</strong>
                    </td>
                    <td style={{ minWidth: '170px' }}>
                      {factors.map(([k, v]) => {
                        const pct = Math.max(0, Math.min(100, Number(v) || 0));
                        return (
                          <div key={k} style={{ marginBottom: '4px' }}>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '12px',
                              }}
                            >
                              <span>{k}</span>
                              <span className="tabular">{v}</span>
                            </div>
                            <div className="factor-bar-track">
                              <div
                                className="factor-bar-fill"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
