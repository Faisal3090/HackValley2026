# KasuCab RideMatch Platform

## Deep Technical Report and Project Handoff

**Domain:** Full Stack Web Development  
**Product:** Ride-hailing driver-passenger matching platform  
**City context:** Belagavi, Karnataka, India  
**Currency:** Indian Rupees (INR)  
**Document status:** Implementation-aware technical report  
**Audience:** Hackathon judges, developers, reviewers, and maintainers  

> This document describes the current repository honestly. Features labelled simulated, demo, heuristic, or partial must not be presented as live city infrastructure or production machine learning.

## How to read this report

This report is organized in layers so a reader can stop at the depth they need.

- The opening pages explain the product, scope, completion status, and setup.
- The architecture sections explain frontend, backend, database, worker, and event flow.
- The feature sections explain booking, dispatch, fairness, reassignment, routing, fares, and traffic intelligence.
- The operations sections explain demonstrations, testing, troubleshooting, security, and deployment.
- The roadmap sections identify the remaining work required for full advanced-feature compliance.

## Table of contents

1. Executive summary and product context
2. Completion status and scope boundaries
3. Repository structure and technology stack
4. Runtime architecture and request flow
5. Authentication, roles, and permissions
6. Passenger experience and booking lifecycle
7. Driver experience and offer lifecycle
8. Matching, fairness, batch allocation, and reassignment
9. Routing, ETA, fare calculation, and tariff model
10. Traffic intelligence and map visualization
11. Database schema, migrations, and integrity rules
12. Frontend architecture, animation, and payment demo
13. API reference and configuration reference
14. Local setup, demo scripts, and troubleshooting
15. Testing, security, privacy, performance, and deployment
16. Remaining advanced work and roadmap
17. Final handoff and judge-facing narrative

## Project status at a glance

| Area | Status | Evidence or limitation |
|---|---|---|
| Passenger authentication | Complete | Auth routes, JWT session, passenger screens |
| Driver authentication | Complete | Driver profile, role checks, Driver Console |
| Driver availability | Complete | AVAILABLE, BUSY, and OFFLINE states |
| Driver location | Complete for prototype | Map click updates and heartbeat polling |
| Nearby-driver discovery | Complete | Radius filter and ETA matrix |
| Fare estimation | Complete | Belagavi tariff table and live vehicle cards |
| Basic matching | Complete | Eligibility and ranking pipeline |
| Fairness scoring | Implemented heuristic | ETA, distance, idle time, workload, acceptance |
| Batch allocation | Implemented prototype | Up to ten rides, greedy assignment |
| Dynamic reassignment | Implemented prototype | ETA degradation and stale heartbeat |
| Ride cancellation recovery | Implemented | Passenger and driver cancellation paths |
| Ride pooling | Not implemented | Required future advanced feature |
| Demand forecasting | Partial | Traffic simulation exists; demand model is missing |
| Zone intelligence | Partial | Service and fare hook exist; data source is a stub |
| Traffic map | Implemented simulation | Seeded geometry, density styling, simulated forecasts |
| Real traffic provider | Not integrated | Provider adapter remains future work |
| Real payment gateway | Not integrated | Payment animation is frontend-only |
| Automated tests | Core suite passing | Advanced browser scenarios need dedicated tests |

## Completion interpretation

The baseline ride-hailing prototype is effectively complete.

The implemented system can demonstrate passenger booking, driver discovery, offer acceptance, ride progression, fare calculation, history, notifications, animated movement, and payment presentation.

The advanced marketplace features are implemented at prototype level.

The advanced requirements that remain incomplete are predictive demand forecasting, full zone intelligence, and multi-passenger pooling.

The traffic intelligence page should be described as a simulation and decision-support demonstration.

The system is appropriate for a hackathon prototype and technical demonstration.

It is not yet an Uber-scale production marketplace, a certified emergency routing system, a live traffic-control system, or a real payment processor.

## Document conventions

The word **complete** means the feature exists in the current code and can be exercised through the application.

The word **prototype** means the feature has a working flow but simplified assumptions, limited scale, or deterministic data.

The word **simulated** means the result is generated for demonstration and is not sourced from a live external system.

The word **partial** means some interfaces or building blocks exist, but the complete problem-statement requirement is not covered.

The word **future** means implementation is still required before claiming full compliance.

The rest of the report uses these meanings consistently.

## 01. Report purpose
This report documents the KasuCab RideMatch project as implemented in the shared workspace.
It is intended for developers, hackathon judges, reviewers, and future maintainers.
The report distinguishes completed functionality from simulated or future functionality.
All descriptions reflect the current repository rather than a generic ride-hailing design.
The project is a full-stack ride-hailing dispatch prototype for Belagavi, Karnataka.
Its main objective is to reduce passenger waiting time and improve driver allocation.
The system combines booking, routing, fare estimation, dispatch, and ride lifecycle tracking.
Advanced traffic intelligence and marketplace simulations are included for demonstration.
The report should be updated whenever the architecture or feature status changes.

## 02. Executive summary
KasuCab lets passengers register, choose pickup and destination points, estimate fares, and request rides.
Drivers register, go online, publish location, receive offers, and accept or reject requests.
The backend uses Node.js, Express, PostgreSQL, JWT authentication, and transactional updates.
The client uses React, React Router, Vite, Leaflet, and a shared API helper.
OSRM is used when available and Haversine fallback routing keeps demos functional offline.
Fare calculations use the supplied Belagavi vehicle tariff model.
The dispatch engine filters eligible drivers and ranks them using fairness-aware scoring.
Ride states are persisted and exposed to passenger, driver, and admin views.
The project is hackathon-ready as a working prototype, not an Uber-scale production system.
The remaining work is concentrated in true demand forecasting, pooling, and provider integrations.

## 03. Problem statement context
Ride-hailing systems must match passengers with suitable nearby drivers quickly.
A poor match increases pickup wait, driver idle time, empty kilometres, and operating cost.
The platform therefore needs more than a simple nearest-driver lookup.
It needs location awareness, vehicle compatibility, ETA calculation, and lifecycle consistency.
The project also needs clear demonstrations so judges can see matching decisions.
KasuCab addresses the baseline problem with an end-to-end booking and dispatch workflow.
The advanced layer adds fairness, batch matching, reassignment, and traffic simulations.
The design keeps dispatch decisions explainable through factor values and reasons.
The system uses simulated data where live city infrastructure is unavailable.
This makes it suitable for a hackathon demonstration while leaving a production roadmap.

## 04. Repository layout
The root repository contains the primary application, server, client, simulation, and public assets.
The server directory contains the Node.js API, database migrations, worker, and tests.
The client directory contains the standalone React and Vite frontend.
The root src directory is a separate React application used by the broader workspace setup.
The current development workflow described in this report uses server and client directories.
The server package defines dev, start, migrate, seed, worker, and test scripts.
The client package defines dev, build, and preview scripts.
The .env files provide local database, routing, authentication, and feature configuration.
The migration folder is the source of truth for database structure.
The existing README remains useful for the basic setup; this report is the deep companion.

## 05. Technology stack
Frontend framework: React with JSX and React Router.
Frontend build tool: Vite with a development proxy to the API.
Mapping library: Leaflet with react-leaflet.
Icons and interface symbols: lucide-react and custom HTML map icons.
Backend runtime: Node.js using ES modules.
Backend framework: Express with JSON middleware and route composition.
Database access: pg with a PGlite-compatible test path in the repository.
Validation: Zod schemas at API boundaries.
Authentication: bcryptjs for password hashing and jsonwebtoken for sessions.
Testing: Vitest and Supertest-style application tests.

## 06. Authentication
Users are stored in the users table with username, password hash, role, name, and contact data.
Supported roles are passenger, driver, and admin.
Passwords are hashed with bcryptjs before storage.
Login returns a JWT containing user identity and role information.
The client stores the JWT in localStorage through the AuthProvider.
Protected routes reject requests without a valid Bearer token.
Role middleware prevents passengers from invoking driver-only actions.
Admin or service-key protection is used for dispatch control operations.
Notifications are filtered by the authenticated user unless admin demo visibility is enabled.
Production deployment should add refresh tokens, rotation, revocation, and stronger secret management.

## 07. Passenger registration and login
Passenger signup is available from the public role selection and login screens.
Passenger accounts can use username, name, phone, and optional email fields where supported.
Login redirects passenger users to the booking screen.
The AuthProvider fetches /auth/me to restore a session after reload.
An invalid or expired token clears the local session.
Passenger pages include booking, live map, history, demo, and traffic intelligence access.
A passenger can have only one active ride because of a database partial unique index.
The client displays API errors in an alert area instead of silently failing.
Demo credentials are generated by the seed script and use the password demo1234.
Production authentication should add rate limiting, password reset, and audit logging.

## 08. Driver registration and login
Driver accounts have a linked driver profile in the drivers table.
The profile stores vehicle type, vehicle number, coordinates, status, heartbeat, and statistics.
Supported vehicle classes are AUTO, HATCHBACK, SEDAN, and SUV.
The Driver Console displays driver status and current vehicle data.
A driver can toggle between AVAILABLE and OFFLINE when not busy.
A BUSY driver cannot go offline through the normal availability endpoint.
The driver can update location by clicking on the driver map.
The driver portal polls /drivers/me, /drivers/me/offer, and /drivers/me/active-ride.
The /drivers/me request refreshes the heartbeat while the portal is open.
A disconnected driver becomes eligible for stale-heartbeat reassignment after the configured threshold.

## 09. Booking flow
The passenger selects pickup and destination through search or map clicks.
Browser geolocation can select the current position as pickup when permission is available.
The passenger can choose a vehicle preference or leave it as any available vehicle.
Changing pickup triggers nearby-driver discovery and ETA lookup.
Changing destination triggers route and fare estimation.
Changing vehicle type triggers a new vehicle-specific estimate.
The client shows estimate metrics and a direct fare comparison for all vehicle classes.
Clicking Request Ride creates an idempotent ride request.
The backend calculates the trip route, fare, zone data, and initial dispatch offer.
The returned ride object starts the passenger tracking state.

## 10. Nearby driver discovery
The /drivers/nearby endpoint accepts latitude, longitude, radius, and optional vehicle type.
Only AVAILABLE drivers with coordinates are considered by the default query.
Haversine distance limits candidates to the configured search radius.
The ETA matrix service requests road travel estimates when OSRM is configured.
If OSRM is unavailable, the service falls back to Haversine distance and average speed.
The client shows nearby driver cards with distance, ETA, name, and vehicle type.
The map shows nearby drivers as labeled vehicle markers.
The driver list is informational before booking and does not reserve a driver.
Eligibility during actual dispatch is recalculated in the transaction.
Production should use geospatial indexing rather than filtering a broad driver query in memory.

## 11. ETA calculation
ETA is calculated by the routing service rather than distance alone when OSRM succeeds.
OSRM route responses provide distance, duration, and GeoJSON geometry.
The server converts metres to kilometres and seconds to minutes.
Route caching reduces repeated requests for identical coordinate pairs.
The ETA matrix supports multiple drivers traveling to a common pickup.
The Haversine fallback applies a road factor and configured average speed.
The frontend displays nearest pickup ETA before a ride is requested.
Driver ranking receives both distanceKm and etaMin values.
ETA is a prediction and should be presented with confidence or uncertainty in production.
Traffic-aware ETA should eventually consume real-time segment speeds and incident effects.

## 12. Fare model
The fare engine is in server/src/services/fare.js.
AUTO uses base â‚¹37, included distance 1.6 km, and â‚¹15 per additional kilometre.
HATCHBACK uses base â‚¹100, included distance 4 km, and â‚¹24 per additional kilometre.
SEDAN uses base â‚¹115, included distance 4 km, and â‚¹28 per additional kilometre.
SUV uses base â‚¹130, included distance 4 km, and â‚¹32 per additional kilometre.
The formula is base plus max(0, distance minus included distance) multiplied by per-kilometre rate.
The fare is rounded to the nearest rupee.
Driver payout defaults to 80 percent of the final fare.
The fare breakdown records regulated fare, billable distance, modifiers, payout, and platform fee.

## 13. Fare frontend behavior
The passenger fare estimate calls /rides/estimate whenever pickup, drop, or vehicle selection changes.
The server-selected estimate is the authoritative amount used by the booking request.
The frontend now displays AUTO, HATCHBACK, SEDAN, and SUV fare cards together.
Clicking a fare card changes the selected vehicle type.
AnimatedMetric smoothly transitions fare, pickup ETA, distance, and duration values.
A Live estimate indicator communicates that the estimate came from a fresh API response.
The fare breakdown shows base fare, per-kilometre rate, vehicle class, and route source.
The frontend does not invent prices independently of the backend.
Surge and night pricing remain disabled or configurable according to the current configuration.
A production fare screen should also show tolls, parking, waiting, tax, and cancellation fees when applicable.

## 14. Ride database model
The rides table stores passenger, pickup, destination, vehicle, status, timestamps, and fare data.
Ride status values include REQUESTED, DRIVER_OFFERED, ACCEPTED, ARRIVING, ONGOING, and COMPLETED.
UNFULFILLED and CANCELLED are terminal exception states.
The current driver is represented by current_driver_id.
Version values support optimistic or transactional state progression.
Trip distance and duration are stored for history and display.
Fare breakdown is persisted as JSONB for later explanation.
Accepted, arriving, started, completed, and cancelled timestamps are recorded.
Partial unique indexes prevent multiple active rides for one passenger or driver.
The schema is intentionally relational and supports audit-friendly event records.

## 15. Ride lifecycle
A new ride begins in REQUESTED.
The createRide service immediately attempts to create an offer.
If a driver is selected, the ride becomes DRIVER_OFFERED.
Driver acceptance moves the ride to ACCEPTED and marks the driver BUSY.
The driver can advance ACCEPTED to ARRIVING.
The driver can advance ARRIVING to ONGOING.
The driver can advance ONGOING to COMPLETED.
Completion releases the driver and increments rides_completed.
Passenger cancellation is allowed before the trip is ongoing.
Driver cancellation before the trip starts resets the ride to REQUESTED and creates a new offer.

## 16. Offer handling
Offers are stored separately from rides so every attempt can be audited.
A ride can have only one pending offer at a time.
An offer has expiration, score, rank position, decision ID, and response timestamps.
The driver portal polls for its pending offer.
The OfferCard shows pickup, drop, fare, distance, passenger, and remaining seconds.
Accepting an offer uses a transaction that locks the offer and ride.
Rejecting an offer records the decision and triggers recovery.
The worker expires pending offers whose time has elapsed.
Late accept and duplicate accept paths are protected by status checks.
The system records DRIVER_OFFERED, DRIVER_ACCEPTED, DRIVER_REJECTED, and expiration events.

## 17. Driver offer UI
The driver portal displays a pending offer when one is available.
The driver sees the passenger, pickup, destination, fare, and trip distance.
The accept button calls /offers/:id/respond with action accept.
The reject button calls the same endpoint with action reject.
The portal refreshes state after each response.
A successful accept reveals the active ride control panel.
A reject returns the driver to an available state when recovery completes.
The driver can cancel an accepted or arriving ride through Cancel & Reassign Ride.
The UI shows informational and error alerts around each action.
The portal is suitable for a two-browser passenger-driver hackathon demonstration.

## 18. Dispatch ranking
The dispatch engine first filters candidates for availability, heartbeat, vehicle compatibility, and radius.
The configured ranker receives the ride, candidates, zone, configuration, and current time.
The fairness ranker combines ETA, distance, idle time, completed rides, and acceptance rate.
The score is normalized to a 0â€“100 range.
The ranker produces factor values that can be shown in explanations.
The reason string includes ETA, fairness, and idle-time context.
The current .env selects fairness as the default ranker.
FAIR_DISPATCH_ENABLED=false forces the nearest ranker for comparison testing.
If a configured ranker fails, the system falls back to nearest and records fellBack.
A future ranker can be registered through the ranker registry without replacing dispatch code.

## 19. Fairness scoring
Idle time receives a positive fairness contribution.
Drivers with fewer completed rides receive a modest opportunity contribution.
Acceptance rate contributes to confidence but does not dominate proximity.
ETA remains the strongest factor so passenger wait is not sacrificed completely.
Distance remains a separate factor from road ETA.
The ranker explains its factor values in the driver-ranking event.
Fairness is a heuristic, not a legally validated marketplace policy.
The weights should be calibrated against passenger wait and driver utilization metrics.
The system currently supports fairness-aware selection but not a full historical fairness dashboard.
Future work should compare allocation outcomes against a nearest-only baseline.

## 20. Batched matching
The /dispatch/batch-allocate endpoint accepts one to ten ride IDs.
Only REQUESTED rides are selected for the batch.
Available drivers are locked with SKIP LOCKED to reduce race conflicts.
Each ride is matched against compatible drivers within the search radius.
The ETA matrix is calculated for the current batch candidate set.
The fairness ranker scores each ride-driver combination.
A driver used for one assignment is excluded from later assignments in the batch.
Each assignment creates a pending offer and updates the ride to DRIVER_OFFERED.
The response includes assignments, ETA, score, reason, offer ID, and unmatched ride IDs.
The current implementation is a greedy batch allocator; Hungarian optimization remains future work.

## 21. Batch matching limitations
The batch endpoint is admin or service-key protected.
The current UI control is on the Traffic AI page for demonstration convenience.
The batch uses a sequential greedy selection rather than a global optimum solver.
It does not reserve demand beyond the selected ride IDs.
It does not currently show a before/after total waiting-time comparison in the UI.
It does not use a queueing model for future requests.
It does preserve database constraints and avoids assigning one driver twice in the same batch.
A stronger version should compute total cost matrices and compare alternative assignments.
A stronger version should show aggregate wait saved compared with independent dispatch.
For a hackathon, the current batch flow is sufficient to demonstrate simultaneous allocation.

## 22. Dynamic reassignment
The marketplace service checks active ACCEPTED and ARRIVING rides.
It calculates the current driver's route ETA to pickup.
It finds other available compatible drivers in the configured radius.
It uses the ETA matrix and fairness ranker for alternative candidates.
Reassignment happens only when the alternative saves the configured minimum time.
The default minimum saving is five minutes.
The old accepted offer is marked rejected and a new accepted offer is recorded.
The old driver becomes AVAILABLE unless the heartbeat is stale.
The new driver becomes BUSY and the ride current_driver_id changes.
A RIDE_REASSIGNED event and passenger notification are created.

## 23. Stale connection handling
Drivers expose last_heartbeat in their profile.
The Driver Console refreshes the heartbeat while the portal remains open.
The worker checks delayed active rides periodically.
A driver beyond STALE_HEARTBEAT_SECONDS is treated as disconnected.
A stale current driver is set OFFLINE during reassignment.
An available alternative is selected using vehicle compatibility and ETA.
The passenger receives a message that the driver was reassigned.
The current default threshold is 45 seconds for a responsive demo.
A real mobile app should send heartbeats independently of UI polling.
Production should use websocket presence, device timestamps, and network-quality signals.

## 24. Driver cancellation recovery
A driver can cancel an accepted or arriving ride from DriverHome.
The API verifies that the authenticated driver is assigned to that ride.
The accepted offer is marked rejected with a response timestamp.
The old driver becomes AVAILABLE.
The ride is reset to REQUESTED and current_driver_id is cleared.
A DRIVER_CANCELLED event is recorded.
A new createOffer call selects another eligible driver.
The passenger receives a cancellation-and-reassignment notification.
The trip cannot be driver-cancelled after it reaches ONGOING.
This covers a major ride exception scenario required by the problem statement.

## 25. Timeout and rejection recovery
A rejected offer triggers the recovery strategy.
An expired pending offer is found by the worker.
The offer is marked EXPIRED before recovery proceeds.
The ride attempts another eligible driver while attempt_count is below the limit.
The same driver is prevented from being offered again for the same ride.
The ride becomes UNFULFILLED after the configured maximum attempts.
The passenger receives a no-driver notification for an unfulfilled ride.
Recovery strategy hooks can be customized for future products.
The event timeline records each offer attempt and status transition.
This is one of the most complete production-like parts of the prototype.

## 26. Passenger animation
The passenger map uses AnimatedDriverMarker for status-driven movement.
No movement begins while the passenger waits for a driver to accept.
ACCEPTED and ARRIVING use the driverToPickup route geometry.
ONGOING uses the pickupToDrop route geometry.
The marker interpolates across the full LineString using requestAnimationFrame.
The pickup phase takes approximately twelve seconds for demonstration.
The trip phase takes approximately eighteen seconds for demonstration.
A pulsing taxi marker makes the simulated movement visible.
The animation is visual and does not mutate the driver's database coordinates.

## 27. Driver animation
The Driver Console also uses the animated marker for the active driver.
The driver-to-pickup route is shown after acceptance or while arriving.
The pickup-to-drop route is shown during ONGOING.
The normal self-driver marker is hidden while the animated marker is active.
The map popup identifies whether the driver is heading to pickup or on trip.
The backend route geometry remains the source for the animation.
If geometry is temporarily unavailable, the marker falls back to the known driver coordinate.
The animation is intended for demonstration rather than GPS navigation.
A production mobile client would use live location events instead of simulated interpolation.

## 28. Payment demonstration
After the driver completes the ride, the passenger sees a payment card.
The payment card displays the final or estimated fare.
Clicking Pay starts a local processing animation.
A spinner is shown for approximately 1.6 seconds.
A check animation confirms payment completion.
The demo does not connect to a payment gateway.
No financial data is sent by the payment demonstration.
A production payment flow requires provider tokenization and server-side confirmation.
The local state is intentionally sufficient for a hackathon presentation.
The payment UI is separate from ride completion so the lifecycle remains auditable.

## 29. Traffic intelligence overview
Traffic AI is available from the main navigation after authentication.
The page loads fifteen-minute or thirty-minute prediction horizons.
Each prediction includes score, risk level, confidence, factors, and recommendation.
The traffic map uses road-style lines and density bubbles rather than isolated markers.
Green means low density, amber means medium, and red means high.
The map popup shows estimated vehicles per hour and road capacity.
The service can read database predictions or use deterministic demo fallback data.
The worker refreshes prediction rows periodically.
Traffic AI complements dispatch but does not replace demand forecasting.
The current traffic map is a simulation and should be described honestly in a demo.

## 30. Traffic prediction implementation
The current prediction service creates deterministic segment forecasts.
The score includes a simulated historical component.
The score includes a time-of-day rush component.
The score includes a simulated weather component.
The score includes an incident component for a demonstration segment.
The score is converted into LOW, MEDIUM, or HIGH risk.
Predictions are stored in traffic_predictions when the road graph is present.
The road_segments table contains seeded demonstration geometry.
The current implementation does not train Prophet or gradient boosting.
Real demand forecasting is a remaining feature for the exact advanced rubric.

## 31. Traffic map rendering
The map receives GeoJSON LineString geometry for each segment.
A dark casing is drawn below the traffic line to resemble a road surface.
The inner line becomes wider as density increases.
A density bubble is placed near the segment midpoint.
The popup reports density percentage and vehicles per hour.
The map legend explains the three density states.
The seeded geometry is now connected horizontal and vertical demonstration geometry.
It is not a complete Belagavi road network.
OSM or a city road GeoJSON should replace the seeded geometry for a polished final demo.
The current rendering is materially clearer than random thin grid lines.

## 32. Incident handling
The incidents table stores type, location, severity, lanes blocked, source, and status.
Reports within a small spatial range and matching type are merged.
Merged incidents increment report_count.
A high-severity duplicate can promote the stored severity to HIGH.
The incident endpoint returns whether the report was duplicated.
The Traffic AI page can submit a demonstration accident report.
Closure simulation returns affected roads and diversion guidance.
The current impact model is simplified and deterministic.
A graph-based connected-road analysis is a future improvement.
Real incident feeds should be normalized through provider adapters.

## 33. Signal simulation
The signal optimizer accepts approach vehicle counts or arrival rates.
Phases can specify which approaches receive green time.
Green seconds are allocated proportionally to demand.
Minimum and maximum green bounds prevent extreme values.
The response includes before average wait and maximum queue.
The response includes after average wait and maximum queue.
The response includes an improvement percentage.
The Traffic AI page shows the before/after result.
The system simulates signal timing and does not control real signal hardware.
Calibration should use measured junction flow and signal-cycle data.

## 34. Emergency routing
The emergency route endpoint accepts origin and destination points.
It returns a normal route and a priority route.
The demo currently applies a simulated priority time reduction.
The response includes time saved and junction priority extensions.
The UI shows the number of simulated priority junctions.
The current implementation does not contact a city signal controller.
The current implementation does not guarantee emergency passage in real traffic.
A production version should route around closures and use verified emergency corridors.
Ambulance and fire-service vehicle types should be explicitly modeled.
The feature is suitable as a transparent simulation for a hackathon.

## 35. Route comparison
The route-options endpoint returns three route candidates.
Each candidate contains distance, ETA, congestion, closure penalty, fuel, reliability, and score.
The recommended route has the lowest calculated score.
The response includes reasons explaining the ranking.
The UI renders route cards after clicking Compare routes.
The current alternatives are generated variations of a base route.
They are not independent road-network alternatives from OSRM.
Fuel is estimated using a simple distance factor.
Reliability is currently simulated rather than learned from historical completion data.
A production route optimizer should request alternative geometries and score segments directly.

## 36. Zone intelligence current state
The zone intelligence service currently returns a normal default zone.
zoneId is null in the default implementation.
demandLevel is NORMAL.
demandSupplyRatio is 1.
surgeMultiplier is 1.
The fare modifier hook is already prepared to consume a zone multiplier.
Rides persist zone_id when a zone service returns one.
No real zone polygon lookup is currently implemented.
No driver repositioning recommendation is currently implemented.
This is one of the major remaining advanced features.

## 37. Demand forecasting current state
The exact problem statement requests simulated historical demand by zone and hour.
The current repository does not yet contain a demand history table.
The current traffic prediction is not a demand forecast.
There is no Prophet model in the current dependency set.
There is no gradient boosting model in the current server code.
There is no predicted-versus-actual demand chart.
There is no proactive idle-driver positioning queue.
A hackathon implementation could start with seeded hourly demand arrays.
A stronger version would train a small model offline and serve predictions from a table.
This feature should be prioritized if the rubric treats advanced items as mandatory.

## 38. Ride pooling current state
The current ride model represents one passenger per ride.
The database has no pooled group or ride-leg table.
The API has no compatible-request matching endpoint.
There is no capacity-aware pooled vehicle assignment.
There is no pickup/drop-off ordering optimizer for multiple passengers.
There is no pooled fare split or separate-ride comparison UI.
The existing routing service can provide building blocks for pooled routing.
A prototype could support two passengers and a maximum detour threshold.
Pooling should be implemented only after the normal lifecycle remains stable.
This is currently the largest functional gap against the advanced statement.

## 39. Driver utilization metrics
The drivers table stores rides_completed and accept_rate.
The dispatch ranking uses those values for fairness scoring.
The live map shows vehicle status and active rides.
The system does not yet calculate historical utilization percentages.
The system does not display total idle minutes by driver.
The system does not compare fairness allocation with nearest-only allocation in a chart.
The event history contains enough data to derive basic utilization later.
A dashboard can compute busy time divided by online time.
The metric should be calculated per zone, vehicle type, and time window.
Utilization is important for explaining marketplace efficiency to judges.

## 40. Notification system
Events are recorded in ride_events after transactional state changes.
The subscriber listens to the event bus and creates notifications.
Drivers receive new offer notifications.
Passengers receive accepted, cancelled, completed, and reassigned messages.
The client notification bell polls or consumes the notification API through its hook.
Notifications are stored in the notifications table.
Event IDs prevent duplicate handling in the subscriber.
The system does not yet use websockets for instant delivery.
The polling design is adequate for a prototype.
Production should use durable event delivery and push notifications.

## 41. Event timeline
The ride event table stores event type, ride ID, driver ID, offer ID, payload, and timestamp.
The event timeline component renders ride-specific events.
Ranking decisions include factor and reason information.
Offer events expose which driver was selected and why.
Reassignment events can explain previous and new ETA values.
Cancellation and completion events support auditing.
The timeline helps judges understand the lifecycle rather than only seeing a final state.
Events are written inside transactions before publication.
Event payloads should be versioned if the product grows.
The timeline is useful evidence for exception-handling demonstrations.

## 42. Worker process
The worker expires stale offers approximately every second.
It refreshes traffic predictions at a longer interval.
It checks for slow or stale active rides approximately every fifteen seconds.
It publishes reassignment events after successful transactions.
The worker uses the same database pool and configuration as the API.
The worker can be stopped independently from the API.
The API can still serve normal requests without the worker, but timeout behavior will not progress.
A production deployment should run the worker under a process supervisor.
Metrics and structured logs should be added for operational visibility.
The worker is essential to demonstrate automatic timeout and stale-driver recovery.

## 43. Configuration
The server configuration is validated with Zod.
PORT controls the API listener.
DATABASE_URL selects the PostgreSQL database.
JWT_SECRET controls session signing.
ROUTING_PROVIDER chooses OSRM or Haversine fallback.
OSRM_BASE_URL and ROUTING_TIMEOUT_MS control routing behavior.
RANKER selects fairness or nearest dispatch ranking.
FAIR_DISPATCH_ENABLED can force nearest ranking for comparison.
STALE_HEARTBEAT_SECONDS controls stale-driver detection.
REASSIGNMENT_MIN_SAVINGS_MIN controls dynamic reassignment sensitivity.

## 44. Database migrations
Migration 001 creates the core users, drivers, rides, offers, events, notifications, and idempotency tables.
Migration 002 adds user email support.
Migration 003 adds driver license number support.
Migration 004 creates traffic road, observation, prediction, incident, and signal tables.
Migration 004 also seeds demonstration road segments.
Migration 005 updates demonstration geometry into connected road-style paths.
The migration runner records applied filenames in schema_migrations.
Migrations are applied in sorted filename order.
The seed script resets demo transactional data but preserves schema structure.
Production migrations should be reviewed and backed up before deployment.

## 45. Database constraints
users.role is constrained to passenger, driver, or admin.
drivers.vehicle_type is constrained to supported vehicle classes.
drivers.status is constrained to OFFLINE, AVAILABLE, or BUSY.
rides.status is constrained to known lifecycle and exception states.
The one_pending_offer_per_ride index prevents conflicting pending offers.
The one_offer_per_driver_per_ride constraint prevents duplicate driver offers for one ride.
The one_active_ride_per_passenger index prevents overlapping passenger rides.
The one_active_ride_per_driver index prevents a driver from holding multiple active rides.
Foreign keys protect related records and use sensible delete behavior.
These constraints are central to race safety and should remain enabled.

## 46. Idempotency
Ride creation accepts an Idempotency-Key header.
The middleware stores the response by key, user, and endpoint.
Retrying a request with the same key returns the original response.
This prevents accidental duplicate bookings during network retries.
The database primary key protects uniqueness across concurrent requests.
The idempotency table stores response status and JSON body.
The client creates a unique key per booking attempt.
Production should expire old idempotency records periodically.
Other mutating endpoints may need the same protection later.
Idempotency is especially important for mobile networks and payment flows.

## 47. Error handling
The API uses asyncHandler to route rejected promises into the error middleware.
AppError provides HTTP status, code, and message fields.
Validation errors are returned as structured API failures.
Not-found routes return a consistent error response.
The client displays error messages in page alerts or toast notifications.
Transient polling errors are generally ignored to avoid noisy UI.
Important production errors should be logged with request IDs.
The current implementation does not yet have a centralized observability service.
Errors from external routing fall back instead of failing the booking outright.
Security-sensitive errors should avoid exposing database details.

## 48. Map implementation
MapView is the shared map component for passenger, driver, and live fleet pages.
Leaflet marker assets are configured for Vite bundling.
Pickup and destination use distinct icons.
Vehicle markers display status, offer, or assignment state.
Route geometries are converted from GeoJSON LineStrings to Leaflet positions.
The map can focus on selected points with flyTo.
Map clicks are used for passenger point selection and driver location updates.
Tile failures show a readable offline fallback.
OpenStreetMap attribution is included.
A production map should use provider terms and usage limits appropriate to scale.

## 49. Frontend routing
App.jsx defines public landing, login, signup, and protected application routes.
Passenger users are redirected to /passenger.
Driver users are redirected to /driver.
Admin users are redirected to /demo.
The shared ShellLayout provides navigation, notifications, and sign-out.
Live Map shows fleet and active ride state.
Traffic AI shows traffic and marketplace simulations.
History shows completed and previous rides.
The client uses BrowserRouter and Vite fallback behavior.
Deployment should configure server-side fallback for deep links.

## 50. Frontend state management
The project uses React state and effects rather than a global state library.
AuthProvider owns token, user, driver, login, register, and logout state.
PassengerHome owns pickup, drop, estimate, activeRide, route, and payment demo state.
DriverHome owns offers, active ride, route, and driver status state.
Polling keeps ride and driver data current in the demo.
Route fetches are guarded by keys to avoid unnecessary calls.
Animated markers use local requestAnimationFrame state.
Errors are kept close to the relevant page for readable feedback.
A larger production client may benefit from React Query or a websocket store.
The current state model is understandable for hackathon maintenance.

## 51. Demo setup
Run npm run migrate in the server directory before the first start.
Run npm run seed to create deterministic demo accounts and drivers.
Run npm run dev in the server directory for the API.
Run npm run worker in a second server terminal.
Run npm run dev in the client directory for Vite.
Open http://localhost:5173 in a browser.
Passenger credentials are passenger1 through passenger3 with demo1234.
Driver credentials are driver1 through driver10 with demo1234.
Admin credentials are admin with demo1234.
Use separate browser windows to demonstrate passenger and driver roles.

## 52. Demo booking script
Log in as passenger1 in the first browser window.
Set or search a pickup location.
Set or search a destination location.
Select AUTO, HATCHBACK, SEDAN, or SUV and show the fare cards changing.
Click Request Ride.
Log in as driver1 in the second browser window and keep the driver online.
Accept the offer in Driver Console.
Return to passenger view and show the animated approach.
Advance the driver through Start trip and Complete trip to show payment.

## 53. Demo rejection script
Create a fresh passenger booking.
Leave the driver portal online so the heartbeat remains fresh.
When the offer appears, click Reject.
The recovery logic creates another offer if an eligible driver exists.
The passenger status remains active while matching continues.
The notification area reports the updated dispatch state.
The event timeline records the rejection and the new attempt.
The second driver can accept the replacement offer.
This demonstrates exception handling without manually editing the database.
For a clean repeat, use a newly seeded demo database or another passenger account.

## 54. Demo cancellation script
Create a booking and accept it from the driver portal.
Before starting the trip, click Cancel & Reassign Ride.
The driver-cancel endpoint verifies that the driver owns the ride.
The accepted offer becomes rejected in the audit trail.
The ride returns to REQUESTED with no current driver.
The previous driver becomes AVAILABLE.
A new offer is created for another eligible driver.
The passenger is notified that another driver is being found.
The replacement driver can accept and continue the lifecycle.
This demonstrates an exception required in the advanced specification.

## 55. Demo stale-driver script
Start the API and worker processes.
Create a booking and accept it with a driver portal.
Close the driver portal or stop its heartbeat updates.
Wait beyond STALE_HEARTBEAT_SECONDS.
The worker identifies the assigned driver as stale.
An available compatible driver is selected if one exists.
The old driver is marked OFFLINE.
The passenger receives a reassignment notification.
The actual timeout is intentionally short for a hackathon demo.
Do not use a short threshold in production without mobile heartbeat design.

## 56. Demo traffic script
Open the Traffic AI page while logged in.
Toggle between fifteen-minute and thirty-minute horizons.
Explain the density percentage and capacity values on the map.
Click Report / deduplicate incident twice to show report merging.
Click Simulate closure impact to show affected roads and diversion delay.
Click Optimize junction to show before and after waiting time.
Click Compare routes to show multi-factor route reasons.
Click Emergency route to show simulated priority passage and time saved.
Use the traffic page as an operations-control demonstration.

## 57. Demo marketplace script
Log in as admin for dispatch controls.
Create several REQUESTED rides using different passenger accounts or seeded records.
Open Traffic AI and click Batch match waiting rides.
Show assignments, ETAs, scores, and explanations.
Use driver consoles to accept or reject the resulting offers.
Select an active ride and cause an ETA or heartbeat problem for reassignment.
Click Recheck delayed assignments when using the admin control.
The worker also performs periodic checks automatically.
Explain that the current batch allocator is greedy and transparent.

## 58. Testing status
The server test suite covers authentication and role permissions.
The server suite covers fare calculations.
The suite covers ride lifecycle transitions.
The suite covers offer expiry and dispatch race safety.
The suite covers idempotent ride creation.
The suite covers routing fallback behavior.
The suite covers places provider behavior.
The client production build has passed after the animation and fare UI changes.
Advanced marketplace and animation behavior should receive dedicated automated tests next.
The current test count is 39 passing tests in the existing suite.

## 59. Test gaps
There are not yet dedicated tests for batch allocation assignment optimality.
There are not yet dedicated tests for fairness score ordering.
There are not yet dedicated tests for stale-heartbeat reassignment.
There are not yet dedicated tests for driver cancellation recovery.
There are not yet browser automation tests for marker animation timing.
There are not yet tests for payment demo state transitions.
There are not yet tests for fare option comparison rendering.
There are not yet tests for traffic density rendering with database predictions.
Adding these tests would reduce regression risk before final submission.
The most valuable next tests are backend transaction tests for reassignment.

## 60. Performance considerations
The current app is designed for a small demonstration city and low request volume.
OSRM calls have timeout and cache controls.
The ETA matrix prevents one route request per driver in some discovery flows.
In-memory route caches are bounded by size and TTL.
Traffic prediction refresh is periodic rather than request-triggered.
Batch allocation currently performs ranking sequentially for clarity.
Large fleets need spatial indexes and partitioned geospatial queries.
Large marketplaces need a queue or stream for dispatch work.
The worker should not run duplicate copies without coordination.
Load testing should measure booking latency, offer latency, and reassignment latency.

## 61. Security considerations
JWT secrets must be changed from development defaults in deployment.
Database credentials must never be committed to source control.
Service API keys must be stored in a secret manager.
Admin-only dispatch endpoints must remain protected.
CORS should be restricted to the deployed frontend origin.
Input validation should remain active on all route bodies and queries.
Rate limiting should protect login, booking, incident, and dispatch endpoints.
Audit events should avoid storing unnecessary personal data.
Payment providers should receive tokens rather than raw card data.
Production deployments should use HTTPS and secure cookie or token policies.

## 62. Privacy considerations
Driver location is sensitive operational data.
Passenger pickup and destination locations are also sensitive.
The demo exposes broad fleet visibility when DEMO_MODE is enabled.
Production visibility should be restricted by role and ride relationship.
Location history should have retention and deletion policies.
Event payloads should avoid unnecessary precise location persistence.
Notifications should not expose private information to the wrong user.
Analytics should aggregate locations where exact coordinates are not required.
The project currently prioritizes transparent demo visibility.
Privacy review is required before any real-user pilot.

## 63. Real traffic integration roadmap
Choose a traffic provider with coverage for Belagavi and acceptable licensing.
Normalize provider speeds, incidents, and road identifiers into internal segment IDs.
Map-match provider observations to road_segments.
Store observations with source and observed_at timestamps.
Calculate occupancy or density consistently across providers.
Feed recent observations into predictions.
Use incident severity and lane closures as route penalties.
Expire stale provider data rather than treating it as current.
Display the provider timestamp and confidence in the UI.
Keep the demo provider adapter as a fallback for offline judging.

## 64. Demand model roadmap
Create a demand_observations table by zone and time bucket.
Seed simulated historical rides across morning, afternoon, evening, and weekend periods.
Aggregate requests per zone and hour.
Train a small gradient boosting model or Prophet forecast offline.
Store predicted demand with horizon and confidence.
Compare predicted demand with actual completed or requested rides.
Render both values on a heatmap.
Generate a shortage score from predicted demand minus available supply.
Use the score to recommend idle-driver movement.
Expose the forecast through a dedicated demand API and dashboard.

## 65. Zone engine roadmap
Define Belagavi service zones using polygons or grid cells.
Count active requests and available drivers per zone.
Calculate demand-supply ratio for each time bucket.
Map ratio to a configurable surge multiplier.
Respect the current legal and product decision to keep surge disabled if required.
Return zone name, demand level, ratio, multiplier, and recommended movement.
Use the same zone data in fare, dispatch, and repositioning services.
Show zone overlays on the map with a legend.
Store zone decisions for later audit.
Do not present simulated surge as an actual regulatory fare without review.

## 66. Repositioning roadmap
Identify idle drivers with fresh heartbeats.
Find zones with predicted shortages.
Estimate movement ETA from each idle driver to the target zone.
Recommend moves only when the expected benefit exceeds movement cost.
Avoid moving too many drivers into one zone.
Show the recommendation in Driver Console.
Track whether a recommended move was accepted.
Measure subsequent passenger wait and driver idle time.
Add an admin map layer for supply and demand balance.
Keep repositioning advisory until driver consent and safety rules are established.

## 67. Ride pooling roadmap
Add a pool_requests or ride_groups table.
Define maximum passenger count and vehicle capacity.
Search for requests with nearby pickup points and compatible destinations.
Apply maximum pickup detour and maximum passenger delay constraints.
Build a pickup/drop-off sequence using insertion or route optimization.
Compare pooled ETA with separate ride ETAs.
Calculate a transparent pooled fare split.
Show pooled passengers and sequence on the map.
Keep pooling opt-in and explain the tradeoff to users.
Test cancellation and partial acceptance carefully.

## 68. Allocation evaluation roadmap
Record assignment decision metrics at offer and acceptance time.
Calculate passenger wait from request to acceptance and pickup.
Calculate driver utilization from online, available, and busy intervals.
Calculate empty kilometres before pickup.
Compare fairness ranker outcomes with nearest ranker outcomes.
Show median and percentile wait rather than only averages.
Track rejection rate, timeout rate, and reassignment rate.
Create an admin analytics panel for evaluation.
Use repeated seeded simulations for reproducible comparisons.
Present evaluation evidence in the hackathon final demo.

## 69. Production routing roadmap
Use a routing backend with alternatives and traffic support.
Store route segments and provider route IDs.
Request independent alternative paths rather than scaling one route.
Apply closures and incident penalties per segment.
Estimate fuel from vehicle class and route profile.
Calculate reliability from historical ETA error.
Cache route results with traffic-aware expiry.
Fallback gracefully when the provider is unavailable.
Audit route provider terms and usage limits.
Keep Haversine fallback only as a degraded demo mode.

## 70. UX improvements remaining
Show a visible matching timer while waiting for driver acceptance.
Show the selected driver's fairness and ETA explanation to the passenger.
Show a reassignment banner with the reason and saved time.
Add a replay or simulation control for presentation mode.
Add a clear route legend for traffic and driver movement.
Show fare options while estimate requests are pending.
Add disabled and loading states to all traffic action buttons.
Show payment method selection in the demo payment card.
Improve mobile layout for small screens.
Add accessibility labels and keyboard focus states to map controls.

## 71. Current known limitations
The demo traffic geometry is not a complete road network.
The traffic prediction model is deterministic rather than trained AI.
Weather and incident impacts are simulated unless provider adapters are added.
Zone intelligence currently returns a normal default zone.
Ride pooling is not implemented.
Batch allocation is greedy rather than globally optimized.
Emergency signal priority is simulated.
Payment is a frontend-only demonstration.
The map animation does not update database GPS coordinates.
These limitations should be disclosed in a project presentation.

## 72. What is complete now
Core passenger and driver authentication is complete.
Availability and driver location flows are complete.
Nearby-driver discovery and ETA calculation are complete.
Fare calculation follows the supplied vehicle tariff table.
Offer acceptance and rejection are complete.
Ride lifecycle and history are complete.
Fairness-aware ranking is active by default.
Batch allocation and dynamic reassignment are implemented.
Frontend driver and payment animations are implemented.
Traffic intelligence demo controls and map density rendering are implemented.

## 73. What is partially complete now
Predictive traffic is implemented as a deterministic simulation.
Incident analysis supports duplicate merging and simplified impact estimation.
Signal optimization simulates before and after wait changes.
Emergency priority routing simulates priority passage.
Multi-factor route scoring returns explainable simulated alternatives.
Zone surge hooks exist but use default normal data.
Stale-driver reassignment works when the worker is running.
Browser animation depends on receiving route geometry from the API.
The payment animation does not process a real payment.
These partial features are suitable for a prototype narrative.

## 74. What remains for full statement compliance
Implement demand forecasting by zone and hour.
Render predicted versus actual demand heatmaps.
Implement proactive driver positioning recommendations.
Implement real zone supply and demand calculations.
Implement configurable surge simulation from zone ratios.
Implement compatible passenger pooling.
Implement pooled route order and fare comparison.
Add allocation evaluation charts for wait and utilization.
Add dedicated advanced-feature tests.
Replace simulated provider data where the rubric requires real model evidence.

## 75. Suggested final hackathon priority
First, implement the demand forecast data table and a seeded forecast chart.
Second, implement a zone dashboard with demand, supply, ratio, and movement suggestions.
Third, implement a two-passenger pooling demo with a simple detour threshold.
Fourth, add before and after allocation metrics to the admin panel.
Fifth, add screenshots and a narrated demo script.
Sixth, add tests for the highest-risk database transitions.
Seventh, verify all environment setup steps on a clean machine.
Eighth, update the main README with the final scope.
Ninth, prepare a limitation slide to avoid overclaiming AI or live control.
Tenth, record the complete passenger-driver-admin workflow.

## 76. Suggested presentation narrative
Start by describing the marketplace problem rather than the visual interface.
Show a passenger selecting a destination and seeing vehicle-specific fares.
Show nearby drivers and explain ETA-based eligibility.
Request a ride and move to the driver portal.
Show the offer explanation and fairness-aware selection.
Accept the ride and show the animated approach to pickup.
Start and complete the trip, then show the payment animation.
Open Traffic AI and demonstrate route, incident, signal, and emergency simulations.
Finish with the roadmap for demand forecasting, zones, and pooling.

## 77. API conventions
API routes are mounted below /api/v1.
JSON request and response bodies are used throughout.
Authorization uses Bearer JWT unless a service key is documented.
Zod schemas validate important request bodies.
IDs are numeric for rides, drivers, offers, and notifications.
Coordinates use lat and lng fields in client-facing responses.
Some internal database fields use snake_case and are mapped at service boundaries.
Errors include an error message and code when available.
Mutating requests should use idempotency when duplicate retries are possible.
The API is intentionally simple enough for frontend integration.

## 78. Core API list
POST /api/v1/auth/register creates a user and optional driver profile.
POST /api/v1/auth/login creates an authenticated session.
GET /api/v1/auth/me returns the current user and driver profile.
POST /api/v1/rides/estimate calculates route, fare, and nearby-driver ETA.
POST /api/v1/rides creates a booking and initial offer.
GET /api/v1/rides/active returns the passenger active ride.
GET /api/v1/rides/:id returns ride detail.
GET /api/v1/rides/:id/route returns driver and trip geometries.
POST /api/v1/rides/:id/advance progresses a driver-owned ride.
POST /api/v1/rides/:id/driver-cancel resets and reassigns a ride.

## 79. Driver API list
POST /api/v1/drivers/me/availability toggles availability.
POST /api/v1/drivers/me/location updates coordinates and heartbeat.
GET /api/v1/drivers/me returns driver profile and refreshes heartbeat.
GET /api/v1/drivers/me/offer returns the current pending offer.
GET /api/v1/drivers/me/active-ride returns the current assigned ride.
GET /api/v1/drivers/nearby returns drivers near a passenger point.
GET /api/v1/drivers/live returns fleet and active ride data in demo mode.
POST /api/v1/offers/:id/respond accepts or rejects an offer.
GET /api/v1/notifications returns user notifications.
POST /api/v1/notifications/:id/read marks a notification read.

## 80. Dispatch API list
POST /api/v1/dispatch/allocate ranks supplied candidates for a ride.
POST /api/v1/dispatch/batch-allocate assigns up to ten requested rides.
POST /api/v1/dispatch/reassign-slow-rides checks delayed active rides.
Dispatch allocation requires an admin JWT or service API key.
The response includes selected driver and ranked driver explanations.
Batch responses include unmatched ride IDs.
Reassignment responses include old driver, new driver, ETA, and time saved.
The worker invokes reassignment automatically without an HTTP call.
These endpoints are useful for integration tests and admin dashboards.

## 81. Traffic API list
GET /api/v1/traffic/overview returns fifteen or thirty-minute predictions.
POST /api/v1/traffic/incidents reports or merges an incident.
POST /api/v1/traffic/incidents/simulate estimates closure impact.
POST /api/v1/traffic/signals/optimize simulates signal timing changes.
POST /api/v1/traffic/emergency-route returns normal and priority route simulations.
POST /api/v1/traffic/route-options returns scored route candidates.
Traffic endpoints require authentication.
Traffic map response data includes geometry, score, risk, density, and capacity.
Provider integrations can be added behind service adapters.
The current endpoints are sufficient for a hackathon walkthrough.

## 82. Fare API examples
A 2.58 km AUTO trip uses â‚¹37 plus charge beyond 1.6 km.
That produces approximately â‚¹52 before any multiplier.
A 2.58 km HATCHBACK trip remains at the â‚¹100 minimum.
A 2.58 km SEDAN trip remains at the â‚¹115 minimum.
A 2.58 km SUV trip remains at the â‚¹130 minimum.
At 5 km, AUTO is approximately â‚¹88.
At 5 km, HATCHBACK is approximately â‚¹124.
At 5 km, SEDAN is approximately â‚¹143.
At 5 km, SUV is approximately â‚¹162.
These examples follow the supplied fare document and nearest-rupee rounding.

## 83. Environment variables
DATABASE_URL points to the local PostgreSQL database.
TEST_DATABASE_URL points to the test database.
JWT_SECRET signs access tokens.
OFFER_TIMEOUT_SECONDS controls pending offer duration.
MAX_ATTEMPTS controls retry count.
SEARCH_RADIUS_KM controls candidate radius.
ROUTING_PROVIDER selects osrm or haversine.
RANKER selects fairness or nearest.
STALE_HEARTBEAT_SECONDS controls disconnected-driver detection.
REASSIGNMENT_MIN_SAVINGS_MIN controls traffic reassignment sensitivity.

## 84. Seed data
The seed script creates three passengers.
It creates one admin account.
It creates ten drivers across four vehicle types.
Drivers receive deterministic coordinates around the city center.
Drivers receive initial offer, completion, and acceptance statistics.
The seed password is demo1234 for local demonstration only.
The seed resets transactional tables and restarts identities.
It does not replace production data seeding or migration strategy.
After seeding, keep a driver portal open to refresh heartbeats during demos.
Use a fresh seed when a previous demonstration leaves active rides.

## 85. Browser demo troubleshooting
If the frontend is stale, use Ctrl+F5.
If the API is not reachable, verify port 4000 is listening.
If Vite moves to port 5174, use the port printed in the terminal.
If a ride becomes unfulfilled, check that at least one driver is online.
Keep the driver portal open so heartbeat remains fresh.
If no route animation appears, inspect /rides/:id/route for route geometry.
If the map tiles fail, the marker and route demo can still run offline.
If fare cards do not change, verify pickup and destination are both set.
If an active ride blocks a passenger, cancel it or use another seeded passenger.
If worker actions do not happen, start npm run worker separately.

## 86. Browser animation troubleshooting
Animation begins only after a driver accepts the offer.
The passenger must remain on the active ride screen.
The route API must return driverToPickup for the pickup phase.
The driver portal controls status transitions manually.
Start trip changes the ride to ONGOING and switches the geometry.
Complete trip opens the payment demo card.
The animation is time-based and does not represent real elapsed driving time.
Closing the page stops the visual animation but not the server ride state.
Reloading restores the ride state from the backend and restarts the current phase animation.
Production animation should use websocket location events instead of local interpolation.

## 87. Quality assurance checklist
Run npm run migrate against a clean database.
Run npm run seed and confirm demo credentials.
Start API, worker, and client separately.
Verify passenger login and driver login.
Verify vehicle fares differ on the fare cards.
Verify an offer reaches the driver portal.
Verify acceptance changes passenger status.
Verify pickup and trip animations display.
Verify driver rejection, cancellation, stale heartbeat, and payment flows.

## 88. Deployment considerations
Build the client with npm run build.
Serve the client dist directory from a suitable static host.
Run the API with NODE_ENV=production.
Run the worker as a separate supervised process.
Use a managed PostgreSQL instance with backups.
Configure a real routing provider and usage limits.
Set strong JWT and service secrets.
Restrict CORS to the frontend domain.
Add health checks for API, database, worker, and routing provider.
Monitor error rates, offer timeouts, and reassignment counts.

## 89. Product safety
The driver animation is a simulation and must not be represented as real GPS.
The emergency route feature simulates signal priority and must not imply actual control.
Traffic predictions are not safety-critical guidance in the current prototype.
The payment UI is a demonstration and does not charge a card.
Fare regulations should be verified before public pricing claims.
Driver and passenger location data must be protected in production.
Incident reports should include source and confidence.
Reassignment should not happen without user-visible messaging.
Pooling should be opt-in and transparent about detours.
All hackathon claims should match the implemented behavior.

## 90. Final completion assessment
The baseline ride-hailing prototype is effectively complete.
The booking and fare workflow is working end to end.
The driver offer and ride lifecycle are working end to end.
Fairness-aware dispatch, batch matching, and reassignment are implemented.
Frontend driver movement and payment animations are implemented.
Traffic intelligence is implemented as a transparent simulation.
Demand forecasting and proactive positioning remain incomplete.
Zone intelligence remains mostly a placeholder.
Multi-passenger pooling remains incomplete.
The project is strong for a prototype but should not claim full production or full advanced-rubric completion.

## 91. Immediate next coding tasks
Add a demand_observations migration.
Seed simulated hourly demand by zone.
Create a demand forecast service.
Add a demand heatmap UI.
Implement zone polygon lookup.
Return supply-demand ratios per zone.
Add repositioning recommendations for idle drivers.
Create pool_requests and ride_groups tables.
Implement two-passenger compatibility and route insertion.
Add backend and frontend tests for each new advanced feature.

## 92. Long-term architecture
A real marketplace can separate request intake from dispatch workers.
A message queue can distribute offer and reassignment work.
A geospatial database can store road and zone geometries efficiently.
A feature store can provide ETA and demand-model inputs.
A model service can serve forecasts independently of Express.
A notification service can deliver push events reliably.
A payment service can confirm transactions asynchronously.
An analytics warehouse can calculate wait and utilization metrics.
A policy service can manage pricing and regulatory constraints.
The current modular services are a reasonable starting boundary.

## 93. Maintenance guidance
Keep fare tables configurable and documented.
Keep database migrations append-only after shared deployment.
Keep API response shapes stable for the client.
Add tests before changing ride state transitions.
Do not bypass database locks for dispatch mutations.
Do not expose service keys to the frontend.
Use the event timeline when diagnosing lifecycle bugs.
Use worker logs when diagnosing timeout or stale-driver behavior.
Use route response geometry when diagnosing animations.
Update this report after each major feature addition.

## 94. Judge-facing value
The project demonstrates more than a static cab-booking form.
It demonstrates eligibility, ETA, dispatch, fairness, recovery, and lifecycle control.
The map provides visible spatial context for drivers and routes.
The fare cards make vehicle pricing transparent and explainable.
The admin and Traffic AI pages provide an operations story.
The driver portal makes the passenger-driver interaction concrete.
The animation makes the simulation understandable to nontechnical judges.
The event and notification layers demonstrate backend completeness.
The limitations are clearly stated rather than hidden.
The project can be evaluated through repeatable seeded scenarios.

## 95. Final handoff
Start with the main README for quick setup.
Use this readme_deep.md for architecture and feature context.
Use server/src/services for business logic review.
Use server/src/routes for API contract review.
Use server/src/db/migrations for schema review.
Use client/src/pages for workflow review.
Use client/src/components for visual and map behavior.
Run the existing test suite before submission.
Run the full demo script with passenger, driver, and admin sessions.
Treat real-world integrations and regulatory claims as future production work.

