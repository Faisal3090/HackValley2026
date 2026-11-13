import React, { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';

// Fix default Leaflet marker asset URLs for Vite bundling
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function createPinIcon({ bg, label, ring = false, isVehicle = false }) {
  const badgeSvg = isVehicle
    ? `<svg width="13" height="11" viewBox="0 0 24 20" fill="none" style="flex-shrink:0" aria-hidden="true">
        <path d="M4 9L6.5 3.5C7 2.5 8 2 12 2C16 2 17 2.5 17.5 3.5L20 9H4Z" fill="#FFD426" stroke="#1E293B" stroke-width="1.8"/>
        <rect x="2" y="8" width="20" height="8" rx="3" fill="#FFD426" stroke="#1E293B" stroke-width="1.8"/>
        <circle cx="6.5" cy="12" r="1.4" fill="#FFFBEB"/>
        <circle cx="17.5" cy="12" r="1.4" fill="#FFFBEB"/>
      </svg>`
    : '';

  return L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="
      display:inline-flex;align-items:center;justify-content:center;gap:4px;
      min-width:${isVehicle ? '46px' : '30px'};height:30px;padding:0 8px;border-radius:999px;
      background:${bg};color:#fff;font-weight:700;font-size:12px;
      font-family:DM Sans,system-ui,sans-serif;white-space:nowrap;
      border:2px solid #fff;
      box-shadow:${ring ? '0 0 0 4px rgba(245,130,49,0.5), 0 3px 8px rgba(0,0,0,0.35)' : '0 2px 6px rgba(0,0,0,0.3)'};
    ">${badgeSvg}<span>${label}</span></div>`,
    iconSize: [isVehicle ? 52 : 32, 32],
    iconAnchor: [isVehicle ? 26 : 16, 16],
  });
}

function ClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      if (onMapClick) {
        onMapClick({ lat: Number(e.latlng.lat.toFixed(6)), lng: Number(e.latlng.lng.toFixed(6)) });
      }
    },
  });
  return null;
}

function MapFocusController({ focusPoint }) {
  const map = useMap();
  useEffect(() => {
    if (focusPoint && focusPoint.lat != null && focusPoint.lng != null) {
      map.flyTo([focusPoint.lat, focusPoint.lng], Math.max(map.getZoom(), 14), {
        duration: 0.45,
      });
    }
  }, [map, focusPoint]);
  return null;
}

function geoJsonToLatLngs(geometry) {
  if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
    return [];
  }
  return geometry.coordinates.map(([lng, lat]) => [lat, lng]);
}

const DEFAULT_CENTER = [15.8497, 74.4977];

export default function MapView({
  center = DEFAULT_CENTER,
  pickup = null,
  drop = null,
  drivers = [],
  activeRides = [],
  selectedRideId = null,
  offeredDriverId = null,
  assignedDriverId = null,
  selfDriver = null,
  route = null,
  focusPoint = null,
  onMapClick = null,
  onSelectDriver = null,
  onSelectRide = null,
  showLegend = false,
  instruction = '',
}) {
  const [tileError, setTileError] = useState(false);

  const pickupIcon = useMemo(
    () => createPinIcon({ bg: '#218ce0', label: 'P' }),
    []
  );
  const dropIcon = useMemo(
    () => createPinIcon({ bg: '#1e293b', label: 'D' }),
    []
  );

  const pickupToDropPositions = useMemo(
    () => geoJsonToLatLngs(route?.pickupToDrop),
    [route]
  );
  const driverToPickupPositions = useMemo(
    () => geoJsonToLatLngs(route?.driverToPickup),
    [route]
  );

  return (
    <div className="map-frame">
      {instruction && (
        <div className="map-overlay-bar">
          <div className="map-instruction">{instruction}</div>
        </div>
      )}

      {showLegend && (
        <div className="map-legend" aria-label="Map legend">
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: '#4f772d' }} />
            Available
          </span>
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: '#f58231' }} />
            Offered
          </span>
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: '#218ce0' }} />
            Busy
          </span>
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: '#64748b' }} />
            Offline
          </span>
        </div>
      )}

      {tileError && (
        <div className="map-tile-fallback">
          Map tiles unavailable (offline or blocked) — coordinates, markers, and routes remain active.
        </div>
      )}

      <MapContainer
        center={center}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{
            tileerror: () => setTileError(true),
          }}
        />
        <ClickHandler onMapClick={onMapClick} />
        <MapFocusController focusPoint={focusPoint} />

        {/* Secondary active ride requests in Live Fleet View */}
        {activeRides.map((r) => {
          if (selectedRideId != null && Number(r.id) === Number(selectedRideId)) return null;
          if (!r.pickup || !r.drop) return null;
          return (
            <React.Fragment key={`active-ride-${r.id}`}>
              <Polyline
                positions={[
                  [r.pickup.lat, r.pickup.lng],
                  [r.drop.lat, r.drop.lng],
                ]}
                pathOptions={{ color: '#64748b', weight: 2, dashArray: '4 6', opacity: 0.7 }}
              />
              <Marker
                position={[r.pickup.lat, r.pickup.lng]}
                icon={createPinIcon({ bg: '#0284c7', label: `R${r.id}` })}
                eventHandlers={
                  onSelectRide ? { click: () => onSelectRide(r.id) } : undefined
                }
              >
                <Popup>
                  <strong>Ride #{r.id} · {r.status}</strong>
                  <div>Passenger: {r.passengerName}</div>
                  <div>Pickup: {r.pickup.label || `${r.pickup.lat.toFixed(4)}, ${r.pickup.lng.toFixed(4)}`}</div>
                  <div>Destination: {r.drop.label || `${r.drop.lat.toFixed(4)}, ${r.drop.lng.toFixed(4)}`}</div>
                  {r.estimatedFare != null && <div>Est. Fare: ₹{r.estimatedFare}</div>}
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}

        {pickup && (
          <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon}>
            <Popup>
              <strong>Pickup</strong>
              <div>{pickup.label || `${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)}`}</div>
            </Popup>
          </Marker>
        )}

        {drop && (
          <Marker position={[drop.lat, drop.lng]} icon={dropIcon}>
            <Popup>
              <strong>Destination</strong>
              <div>{drop.label || `${drop.lat.toFixed(4)}, ${drop.lng.toFixed(4)}`}</div>
            </Popup>
          </Marker>
        )}

        {drivers.map((d) => {
          if (d.lat == null || d.lng == null) return null;
          const isOffered =
            (offeredDriverId != null && Number(d.id) === Number(offeredDriverId)) ||
            d.activeRide?.relation === 'OFFERED';
          const isAssigned =
            (assignedDriverId != null && Number(d.id) === Number(assignedDriverId)) ||
            d.activeRide?.relation === 'ASSIGNED';

          let bg = '#4f772d';
          if (d.status === 'OFFLINE') bg = '#64748b';
          else if (d.status === 'BUSY') bg = '#218ce0';
          if (isOffered) bg = '#f58231';
          if (isAssigned) bg = '#218ce0';

          const icon = createPinIcon({
            bg,
            label: `D${d.id}`,
            ring: isOffered || isAssigned,
            isVehicle: true,
          });

          return (
            <Marker
              key={d.id}
              position={[d.lat, d.lng]}
              icon={icon}
              eventHandlers={
                onSelectDriver ? { click: () => onSelectDriver(d) } : undefined
              }
            >
              <Popup>
                <strong>{d.name || `Driver ${d.id}`}</strong>
                <div>
                  {d.vehicleType} {d.vehicleNumber ? `· ${d.vehicleNumber}` : ''} {d.status ? `· ${d.status}` : ''}
                </div>
                <div style={{ fontSize: '12px', color: '#475569' }}>
                  {Number(d.lat).toFixed(4)}, {Number(d.lng).toFixed(4)}
                </div>
                {d.activeRide && (
                  <div style={{ marginTop: '4px', fontWeight: 600 }}>
                    {d.activeRide.relation === 'OFFERED' ? 'Offered' : 'Assigned'} Ride #{d.activeRide.id} ({d.activeRide.status})
                  </div>
                )}
                {typeof d.distanceKm === 'number' && (
                  <div>
                    {d.distanceKm} km · ETA {d.etaMin} min
                  </div>
                )}
              </Popup>
            </Marker>
          );
        })}

        {selfDriver && selfDriver.lat != null && selfDriver.lng != null && (
          <Marker
            position={[selfDriver.lat, selfDriver.lng]}
            icon={createPinIcon({
              bg: selfDriver.status === 'OFFLINE' ? '#64748b' : selfDriver.status === 'BUSY' ? '#218ce0' : '#4f772d',
              label: 'YOU',
              ring: true,
              isVehicle: true,
            })}
          >
            <Popup>
              <strong>{selfDriver.name || 'You'}</strong>
              <div>
                {selfDriver.vehicleType} · {selfDriver.status}
              </div>
            </Popup>
          </Marker>
        )}

        {driverToPickupPositions.length > 1 && (
          <Polyline
            positions={driverToPickupPositions}
            pathOptions={{ color: '#f58231', weight: 4, dashArray: '8 6' }}
          />
        )}

        {pickupToDropPositions.length > 1 && (
          <Polyline
            positions={pickupToDropPositions}
            pathOptions={{ color: '#218ce0', weight: 5 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
