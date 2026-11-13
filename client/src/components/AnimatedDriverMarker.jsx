import React, { useEffect, useMemo, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

function coordinatesFromGeometry(geometry) {
  if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) return [];
  return geometry.coordinates
    .filter((item) => Array.isArray(item) && item.length >= 2)
    .map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }));
}

function interpolate(points, progress) {
  if (!points.length) return null;
  if (points.length === 1) return points[0];
  const scaled = Math.min(0.999999, Math.max(0, progress)) * (points.length - 1);
  const index = Math.floor(scaled);
  const remainder = scaled - index;
  const start = points[index];
  const end = points[Math.min(index + 1, points.length - 1)];
  return {
    lat: start.lat + (end.lat - start.lat) * remainder,
    lng: start.lng + (end.lng - start.lng) * remainder,
  };
}

function vehicleIcon() {
  return L.divIcon({
    className: 'animated-driver-marker',
    html: '<div class="animated-driver-bubble"><span class="animated-driver-pulse"></span><span class="animated-driver-car">🚕</span></div>',
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
}

export default function AnimatedDriverMarker({ geometry, driver, phase = 'pickup', durationMs = 12000 }) {
  const points = useMemo(() => coordinatesFromGeometry(geometry), [geometry]);
  const [position, setPosition] = useState(() => points[0] || driver || null);

  useEffect(() => {
    if (!points.length) {
      setPosition(driver || null);
      return undefined;
    }

    let frame;
    const startedAt = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      setPosition(interpolate(points, progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [points, durationMs, phase]);

  if (!position) return null;

  return (
    <Marker position={[position.lat, position.lng]} icon={vehicleIcon()}>
      <Popup>
        <strong>{phase === 'trip' ? 'Trip in progress' : 'Driver heading to pickup'}</strong>
        <div>{driver?.name || 'Assigned driver'}</div>
      </Popup>
    </Marker>
  );
}
