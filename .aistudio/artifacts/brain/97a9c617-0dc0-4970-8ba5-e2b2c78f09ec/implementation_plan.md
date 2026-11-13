# RideMatch Phase 2 Implementation Plan — Dispatch Engine & Ride Lifecycle

Deliver the race-safe dispatch engine, swappable driver ranker registry, transactional ride and offer state machine, background offer-expiration worker, ride history, and external allocation contract on top of the Phase 1 foundation.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Phase 1 (PostgreSQL schema, auth, driver availability/nearby search, OSRM/haversine routing, fare pipeline, and seeding) is complete and verified. Approving this plan proceeds directly into **Phase 2** execution and verification, keeping Phase 3 (React + Leaflet frontend) as the final confirmation phase per the staged build workflow.

- **Confirmed Architecture**: Raw parameterized SQL via `pg` inside explicit database transactions (`withTransaction`), enforcing single-pending-offer, single-active-passenger-ride, and single-active-driver-ride invariants at both the service and database constraint levels.
- **Confirmed Dispatch Strategy**: Offer-first assignment (`REQUESTED -> DRIVER_OFFERED -> ACCEPTED`) with configurable timeouts, max reassignment attempts (`MAX_ATTEMPTS`), automatic recovery on rejection/expiry, and fallback to nearest-driver scoring whenever a custom ranker fails or `FAIR_DISPATCH_ENABLED=false`.
- **Upcoming Visual Direction (Phase 3 Preview)**: High-contrast, projector-friendly operational interface using `Plus Jakarta Sans` + `DM Sans` + tabular monospace numerals, neutral slate surfaces, and Leaflet OpenStreetMap views (full frontend build in Phase 3).

---

## 1. Overview & Core Concept

- **What It Does**: Automates matching a passenger ride request to the best eligible driver through a sequential offer-and-recovery loop, tracks the complete trip lifecycle (`REQUESTED` → `DRIVER_OFFERED` → `ACCEPTED` → `ARRIVING` → `ONGOING` → `COMPLETED`), logs every state change as an immutable event, and exposes a stateless allocation API for parallel modules.
- **Target Personas**:
  - **Passengers**: Request rides, track real-time dispatch progress and driver arrival, view route geometry, cancel eligible rides, receive notifications, and review past fares.
  - **Drivers**: Poll and respond (`Accept` / `Reject`) to time-bounded ride offers, advance active trips step-by-step, and review completed earnings.
  - **Operators / Parallel Teams**: Inspect ranking explanations and event timelines in demo mode and integrate external matching services via `/api/v1/dispatch/allocate`.
- **Key Value**: Strict transactional integrity prevents double-assignments and stale-offer races while keeping rankers, eligibility rules, fare modifiers, and recovery strategies decoupled behind clean extension hooks.

---

## 2. User Experience & Visual Design (Phase 2 API Readiness & Phase 3 Preview)

- **Key User Flows Supported in Phase 2**:
  1. **Booking & Matching**: Passenger submits a ride request (with optional `Idempotency-Key`) → backend locks ride, gathers eligible drivers, scores via `rankWithFallback`, creates a timed `PENDING` offer, and emits `RIDE_REQUESTED`, `DRIVER_RANKED`, `DRIVER_OFFERED`, and `RIDE_STATUS_CHANGED`.
  2. **Offer Acceptance & Race Protection**: Driver accepts before expiry → atomic conditional update moves offer `PENDING -> ACCEPTED`, transitions ride `DRIVER_OFFERED -> ACCEPTED`, marks driver `BUSY`, and emits `DRIVER_ACCEPTED`, `DRIVER_ASSIGNED`, and `RIDE_STATUS_CHANGED`. Late responses after expiry or timeout emit `LATE_RESPONSE_REJECTED` and return HTTP `409`.
  3. **Rejection, Expiry & Recovery**: Driver rejection or 1-second worker expiry invokes `recoverRide`, which looks up the registered recovery strategy, records `RIDE_REASSIGNED`, and offers the next eligible driver—or transitions to `UNFULFILLED` with a passenger notification once attempts or candidates are exhausted.
  4. **Trip Progression & History**: Assigned driver advances forward-only (`ACCEPTED -> ARRIVING -> ONGOING -> COMPLETED`), setting timestamps, `final_fare`, `rides_completed`, and returning driver status to `AVAILABLE`. Both roles query filtered ride history and notifications.
- **Phase 3 Visual Identity Alignment**: Clean light/neutral operational surfaces (`#FFFFFF` / `#F8FAFC` canvas, `#0F172A` primary ink, `#2563EB` / `#16A34A` / `#D97706` / `#DC2626` semantic accents with explicit text labels), tabular figures for fares, ETAs, and countdowns, and unboxed typographic metadata separators.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Conditional SQL Updates vs. Application Locks**
  - *Chosen Approach*: Single-statement conditional updates (`WHERE id=$1 AND status='PENDING' AND expires_at > now() RETURNING *`) inside `withTransaction` paired with PostgreSQL partial unique indexes.
  - *Why*: Eliminates TOCTOU race conditions between concurrent driver accept requests and the background expiry worker without distributed lock infrastructure.
  - *Alternatives Considered*: Redis distributed locks or read-then-write checks (rejected per MVP constraints and race susceptibility).
- **Decision 2: Registry + Hook Pipelines for Extensibility**
  - *Chosen Approach*: Isolate swappable algorithms into a ranker registry (`rankers`), eligibility rule pipeline (`eligibilityRules`), fare modifier pipeline (`fareModifiers`), and recovery strategy map (`recoveryStrategies`).
  - *Why*: Allows adding fairness-aware scoring, radius expansion, or new constraints without modifying core offer/ride transition code.
  - *Alternatives Considered*: Conditional branching inside route handlers (rejected as brittle and hard to test).
- **Decision 3: Polling-Ready Read Models & Stateless Integration Contract**
  - *Chosen Approach*: Rich ride detail payload embedding `currentOffer`, `latestRanking`, and `lastExpiredOfferId`, plus a stateless `POST /api/v1/dispatch/allocate` endpoint protected by admin JWT or `X-Service-Key`.
  - *Why*: Supports 1.5-second client polling cleanly without WebSockets and allows teammate services to consume ranking explanations without mutating core ride state.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Dispatch Pipeline Diagram

```
┌───────────────────────────┐       ┌──────────────────────────────────┐
│  REST API (/api/v1/*)     │       │  Background Worker (1s interval) │
│  Rides / Offers / History │       │  FOR UPDATE SKIP LOCKED expiry   │
└─────────────┬─────────────┘       └────────────────┬─────────────────┘
              │                                      │
              ▼                                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Transactional Services (withTransaction + conditional SQL updates)  │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────────┐   ┌────────┐ │
│  │ Eligibility │──▶│ Ranker       │──▶│ Offer Engine  │──▶│ Rides  │ │
│  │ Pipeline    │   │ Registry +   │   │ Create /      │   │ Advance│ │
│  │             │   │ Fallback     │   │ Respond       │   │ Cancel │ │
│  └─────────────┘   └──────┬───────┘   └───────┬───────┘   └────┬───┘ │
│                           │                   │                │     │
│                           │                   ▼                ▼     │
│                    ┌──────┴───────┐   ┌────────────────────────────┐ │
│                    │ Hooks:       │   │ Recovery Strategy Registry │ │
│                    │ Rules / Fare │   │ Reassign or Mark           │ │
│                    │ / Strategies │   │ UNFULFILLED                │ │
│                    └──────────────┘   └────────────────────────────┘ │
└─────────────────────────────────┬────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│  PostgreSQL (rides, offers, drivers, ride_events, idempotency_keys)  │
│  + Post-Commit EventBus ──▶ Notifications Subscriber                 │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Model & State Transitions

- **Ride Transition Table**: `REQUESTED -> DRIVER_OFFERED -> ACCEPTED -> ARRIVING -> ONGOING -> COMPLETED`, with recovery transitions from `DRIVER_OFFERED` back to `DRIVER_OFFERED` or terminal `UNFULFILLED`, and passenger cancellation from `REQUESTED | DRIVER_OFFERED | ACCEPTED -> CANCELLED`.
- **Idempotency Layer**: `idempotency_keys` table keyed by `(key, user_id, endpoint)` wraps ride creation and offer responses so retried requests replay the original status and JSON body safely.
- **Event Envelope**: Every state change inserts a `ride_events` row (`event_id`, `event_type`, `ride_id`, `driver_id`, `offer_id`, `payload`) inside the same transaction and emits on `eventBus` only after `COMMIT`.

### Interactive Component & API Mapping (Phase 2 Endpoints)

- **Ride Lifecycle**: `POST /rides` (idempotent create + initial offer), `GET /rides/history`, `GET /rides/:id` (hydrated with offer, latest ranking, and last expired offer), `GET /rides/:id/events`, `GET /rides/:id/route`, `POST /rides/:id/advance`, `POST /rides/:id/cancel`.
- **Driver Offer & Active Trip**: `GET /drivers/me/offer`, `GET /drivers/me/active-ride`, `POST /offers/:id/respond`.
- **Notifications & Demo/Integration**: `GET /notifications`, `POST /notifications/:id/read`, `POST /dispatch/allocate` (stateless ranking via service key or admin JWT), `POST /dev/reset` (gated by `DEMO_MODE`).
- **Automated Verification**: Complete all remaining tests (Tests 3–14, 16, 18–19, 21–25) covering concurrency races, late responses, max attempts, idempotency, custom ranker registration/fallback, eligibility/recovery hooks, and service-key allocation.
