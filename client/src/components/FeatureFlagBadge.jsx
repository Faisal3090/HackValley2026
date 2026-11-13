import React from 'react';

export default function FeatureFlagBadge({ config }) {
  if (!config) return null;

  return (
    <div
      className="meta-row"
      style={{
        padding: '8px 12px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
      }}
    >
      <span>
        Ranker: <strong>{config.ranker}</strong>
      </span>
      <span aria-hidden="true">·</span>
      <span>
        Fair Dispatch:{' '}
        <strong style={{ color: config.fairDispatchEnabled ? 'var(--success)' : 'var(--warning)' }}>
          {config.fairDispatchEnabled ? 'ENABLED' : 'DISABLED (nearest forced)'}
        </strong>
      </span>
      <span aria-hidden="true">·</span>
      <span>
        Routing: <strong>{config.routingProvider}</strong>
      </span>
      <span aria-hidden="true">·</span>
      <span className="tabular">
        Timeout: <strong>{config.offerTimeoutSeconds}s</strong>
      </span>
    </div>
  );
}
