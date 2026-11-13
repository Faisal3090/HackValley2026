import React from 'react';

const STEPS = [
  { key: 'REQUESTED', label: 'Requested' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'ARRIVING', label: 'Arriving' },
  { key: 'ONGOING', label: 'Ongoing' },
  { key: 'COMPLETED', label: 'Completed' },
];

function getStepIndex(status) {
  if (status === 'DRIVER_OFFERED') return 0;
  return STEPS.findIndex((s) => s.key === status);
}

export default function RideStatusStepper({ status }) {
  if (status === 'UNFULFILLED') {
    return (
      <div className="alert alert-warning">
        <strong>Unfulfilled:</strong> No driver accepted within available attempts. Please try requesting again.
      </div>
    );
  }

  if (status === 'CANCELLED') {
    return (
      <div className="alert alert-info">
        <strong>Cancelled:</strong> This ride was cancelled.
      </div>
    );
  }

  const activeIdx = getStepIndex(status);

  return (
    <div>
      <div className="stepper" aria-label="Ride progress">
        {STEPS.map((step, idx) => {
          let cls = 'step-node';
          if (idx < activeIdx || (status === 'COMPLETED' && idx === activeIdx)) {
            cls += ' done';
          } else if (idx === activeIdx) {
            cls += ' current';
          }
          return (
            <div key={step.key} className={cls}>
              {step.label}
            </div>
          );
        })}
      </div>
      {status === 'DRIVER_OFFERED' && (
        <div className="meta-row">
          <span>Matching status: Waiting for driver response</span>
        </div>
      )}
    </div>
  );
}
