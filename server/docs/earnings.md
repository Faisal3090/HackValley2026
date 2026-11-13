# Expense-aware driver earnings

The driver console lets each driver save fuel and maintenance costs in INR/km and an optional home/base coordinate. Unknown costs or missing distances withhold the profit estimate; explicit zero costs are supported.

Commission uses the existing `DRIVER_PAYOUT_PERCENT` server setting: `0.8` means an 80% payout / 20% commission. This feature does not change fares or settlement behavior.

Optionally configure `EARNINGS_DEMAND_ZONES` as a JSON array of curated, suitable destinations, for example:

```dotenv
EARNINGS_DEMAND_ZONES=[{"name":"Central demand zone","lat":15.8497,"lng":74.4977}]
```

The engine chooses the configured zone with the shortest route from drop-off, or the driver's base if no zone route is available. Without zones, a base is needed. These are configured destinations, not live demand predictions. Routing fallback distances are labelled in the breakdown.

Total distance = pickup + passenger + estimated empty return. Fuel and maintenance apply to total distance; commission applies to passenger fare. Net profit = fare minus these expenses. Amounts are rounded to two decimals and losses remain negative.

Acceptance saves costs, commission, distances and destination on the ride. Subsequent settings changes do not change the accepted ride. On completion, the optional `actualPassengerDistanceKm` field on `POST /api/v1/rides/:id/advance` replaces the passenger route estimate for expenses only. The console labels this as driver-reported actual distance; it is not verified GPS telemetry. Without it, the route estimate remains. Empty return and operating expenses remain estimates. Driver ride history displays the saved breakdown; older rides have no saved estimate.

Migration `006_expense_earnings.sql` runs through the existing migration runner at startup. Restart the server after updating. For a separately managed server, use its existing `npm run migrate` command before serving requests.
