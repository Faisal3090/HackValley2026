import React, { useEffect, useRef, useState } from 'react';

export default function AnimatedMetric({ value, prefix = '', suffix = '', decimals = 1 }) {
  const numericValue = Number(value);
  const [displayValue, setDisplayValue] = useState(Number.isFinite(numericValue) ? numericValue : 0);
  const previousRef = useRef(displayValue);

  useEffect(() => {
    if (!Number.isFinite(numericValue)) return undefined;
    const from = previousRef.current;
    const startedAt = performance.now();
    const duration = 420;
    let frame;
    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(from + (numericValue - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else previousRef.current = numericValue;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [numericValue]);

  return <>{prefix}{displayValue.toFixed(decimals)}{suffix}</>;
}
