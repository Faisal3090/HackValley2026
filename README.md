# KasuCab — Extensible Ride Matching Platform

A ride-hailing and dispatch platform built with React + Vite + Leaflet/OpenStreetMap (`client/`), Node.js + Express ESM (`server/`), and PostgreSQL (`pg` raw parameterized SQL, no ORM).

## Project Structure

- `server/` — Node.js + Express REST API (`/api/v1/`), SQL migrations, seed script, 1-second expiry worker, and Vitest test suite (25 tests)
- `client/` — React + Vite + Leaflet/OSM frontend (Passenger booking & tracking, Driver console, Ride history, Dispatch Inspector & Demo Panel)
- `simulation/` — Headless dispatch simulation hook reusing `server/src/rankers`

## Prerequisites

- Node.js 20+
- PostgreSQL 14+

## Setup (First Time)

1. **Create PostgreSQL databases** (PowerShell; enter your PostgreSQL password when prompted):
   ```powershell
   createdb -U postgres ridematch
   createdb -U postgres ridematch_test
   ```

2. **Configure the backend and install its dependencies:**
   ```powershell
   Set-Location .\server
   Copy-Item .env.example .env
   ```
   Set `DATABASE_URL` and `TEST_DATABASE_URL` in `server/.env` to your PostgreSQL credentials and port. URL-encode reserved password characters (for example, `#` as `%23`). Then run:
   ```powershell
   npm install
   npm run migrate
   npm run seed
   ```
   Demo credentials printed by `npm run seed` (password `demo1234` for all):
   - Passengers: `passenger1`, `passenger2`, `passenger3`
   - Drivers: `driver1`..`driver10` (8 `AVAILABLE`, 2 `OFFLINE`)
   - Admin: `admin`
   New signups require and save username, email, and phone separately; login accepts any of those identifiers. Driver signups also save an optional license number to the driver profile. Existing demo accounts may have a null email or license number.

3. **Install frontend dependencies:**
   ```powershell
   Set-Location ..\client
   npm install
   ```

## 3-Terminal Run Instructions

Run these three terminals in parallel for the full live demo:

```powershell
# Terminal 1 — API Server (short 8s offer timeout for live expiry demo)
Set-Location .\server
$env:OFFER_TIMEOUT_SECONDS = '8'
npm run dev

# Terminal 2 — Background Expiry Worker (polls every 1s)
Set-Location .\server
$env:OFFER_TIMEOUT_SECONDS = '8'
npm run worker

# Terminal 3 — React + Vite Frontend (port 5173, proxies /api -> http://localhost:4000)
Set-Location .\client
npm run dev
```

Open `http://localhost:5173` in your browser.
*(If running inside AI Studio preview on port 3000, the root Vite server renders the same app and proxies `/api` to `http://127.0.0.1:4000`.)*

Passenger pickup is selected from browser location permission when available. Pickup and destination can also be chosen from Geoapify autocomplete suggestions (type at least 3 characters) or by clicking the map. Add `GEOAPIFY_API_KEY` to `server/.env`; the key is used only by the backend and is not included in frontend code. Browser location requires localhost or a secure (HTTPS) origin.

### Testing `FAIR_DISPATCH_ENABLED=false` Fallback Toggle

To verify the feature-flag kill switch in ~30 seconds:
1. Restart Terminal 1 with:
   ```bash
   cd server
   PORT=4000 OFFER_TIMEOUT_SECONDS=8 FAIR_DISPATCH_ENABLED=false npm run dev
   ```
2. Open **Demo Panel** (`http://localhost:5173/demo`) and confirm the top status bar displays `Fair Dispatch: DISABLED (nearest forced)`.

## Demo Script (Exact Clicks)

### Scenario A: Full Dispatch, Reject, Timeout, Late-Accept & Lifecycle (~30–45s)

1. **Sign in as passenger**: Open `/login`, click the **passenger1** quick-fill button, click **Sign In** -> lands on `/passenger` (**Book a Ride**).
2. **Select pickup & destination**: Click once on the Belagavi map for **Pickup** (blue `P` pin) and click a second spot for **Destination** (dark `D` pin). Observe nearby available drivers (`AVAILABLE` green pins + list) and calculated **Estimated Fare (INR)** + **Nearest Pickup ETA**.
3. **Request ride**: Click **Request Ride · ₹...** -> status moves to **DRIVER_OFFERED** with attempt `1/3` and an 8-second countdown; orange `D#` marker shows the offered driver and dashed route to pickup.
4. **Inspect & Reject**: Click **Demo Panel** in the top nav -> inspect **Dispatch Decision** table (score, distance, ETA, factor bars) and **Event Timeline** (`RIDE_REQUESTED`, `DRIVER_RANKED`, `DRIVER_OFFERED`). Click **Driver Rejects** -> watch `attempt 2/3` immediately reassign to the next-ranked driver (never re-offering driver 1), emitting `DRIVER_REJECTED` and `RIDE_REASSIGNED`.
5. **Timeout & Late Accept**: Click **Ignore (Let Expire)** and wait ~8 seconds until the 1-second worker expires Offer #2 -> `attempt 3/3` offers to a third driver (`OFFER_EXPIRED` + `RIDE_REASSIGNED` appear in the timeline). Now click **Late Accept (#...)** -> observe HTTP `409` warning alert (`Cannot accept offer in status EXPIRED`) and `LATE_RESPONSE_REJECTED` recorded in the timeline while attempt 3 remains intact.
6. **Accept & Complete**: Click **Driver Accepts** -> ride enters `ACCEPTED` (`DRIVER_ACCEPTED`, `DRIVER_ASSIGNED`). Click **Sign Out**, sign in as that assigned driver (or click **driver3** / whichever driver accepted on `/login` -> **Driver Console** `/driver`), and click **Start heading to pickup** -> **Start trip** -> **Complete trip**.
7. **History**: Click **History** in the top nav -> verify the `COMPLETED` ride row with pickup/drop route, distance, estimated fare, and final fare in INR (plus driver total completed earnings).

### Scenario B: `FAIR_DISPATCH_ENABLED=false` Kill Switch (~30s)

1. Stop Terminal 1 and restart with `PORT=4000 OFFER_TIMEOUT_SECONDS=8 FAIR_DISPATCH_ENABLED=false npm run dev`.
2. In the browser, click **Demo Panel** -> verify the config strip shows `Fair Dispatch: DISABLED (nearest forced)`.
3. Click **Reset Demo Data** so all 10 drivers reset to clean coordinates and counts.
4. Switch to **passenger1** (`/passenger`), click near city center for Pickup and Destination, click **Request Ride**.
5. Open **Demo Panel** -> verify `Ranker used: nearest` and `Fell back: NO` in **Dispatch Decision**, confirming the kill switch bypasses any custom/fair ranker and dispatches strictly by shortest distance/ETA.

## Extensibility Checklist

Verified extension points in the codebase:

- [x] **Custom Ranker (`server/src/rankers/`)**: Extend `DriverRanker` (`server/src/rankers/base.js`), implement `rank(ctx)` returning `[{ driver, score, distanceKm, etaMin, factors, reason }]`, and call `registerRanker(name, instance)` in `server/src/rankers/index.js`. Activate with `RANKER=<name>`. Automatic fallback to `nearest` (`fellBack: true`) if a custom ranker throws or `FAIR_DISPATCH_ENABLED=false`.
- [x] **Eligibility Rules (`server/src/hooks/eligibilityRules.js`)**: Append predicate `(driver, ride, ctx) => boolean` to `eligibilityRules`. Applied by both live dispatch (`server/src/services/eligibility.js`) and stateless allocation (`server/src/routes/dispatch.js`).
- [x] **Fare Modifiers (`server/src/hooks/fareModifiers.js`)**: Append modifier `(fare, ctx) => { fare, label, multiplier }` to `fareModifiers`. Executed sequentially by `calculateFare` (`server/src/services/fare.js`) and recorded in `rides.fare_breakdown`.
- [x] **Recovery Strategies (`server/src/hooks/recoveryStrategies.js`)**: Register named async handlers on `recoveryStrategies` invoked by `recoverRide` (`server/src/services/recovery.js`) on `driver_rejected`, `offer_timeout`, or custom escalation reasons.
- [x] **Zone Intelligence (`server/src/services/zoneIntelligence.js`)**: Swap `getZoneIntelligence(lat, lng)` to feed real surge/demand multipliers into ranking (`ctx.zone`) and fare calculation without touching dispatch or ride routes.
- [x] **Routing Provider (`server/src/services/routing.js`)**: Configure `ROUTING_PROVIDER=osrm|haversine` and `OSRM_BASE_URL`; includes TTL route cache and automatic haversine fallback.
- [x] **Event Subscribers (`server/src/services/subscribers.js`)**: Register post-commit listeners via `subscribe(eventType, handler)` in `server/src/services/events.js` (e.g., `RIDE_UNFULFILLED` -> passenger notification).
- [x] **Stateless External Dispatch (`POST /api/v1/dispatch/allocate`)**: Authenticated via `X-Service-Key` (`server/src/routes/dispatch.js`); ranks external candidate lists without writing to `offers` or `rides`.

## Running Tests

```bash
cd server
npm test
```
Runs all 25 integration & extensibility tests (`tests/auth.test.js`, `tests/dispatch.test.js`, `tests/lifecycle.test.js`, `tests/extensibility.test.js`).
