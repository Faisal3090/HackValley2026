import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import defaultConfig from '../config/index.js';
import defaultPool from '../db/pool.js';
import { withTransaction } from '../db/tx.js';

const DEMO_DRIVERS = [
  { username: 'driver1', name: 'Ravi Kumar', phone: '9800000001', vehicleType: 'HATCHBACK', vehicleNumber: 'KA22A1001', dLat: 0.004, dLng: 0.003, offers: 0, rides: 14, acceptRate: 0.95, minsOnline: 45 },
  { username: 'driver2', name: 'Asha Patil', phone: '9800000002', vehicleType: 'SEDAN', vehicleNumber: 'KA22A1002', dLat: -0.007, dLng: 0.005, offers: 3, rides: 22, acceptRate: 0.90, minsOnline: 120 },
  { username: 'driver3', name: 'Vikram Joshi', phone: '9800000003', vehicleType: 'AUTO', vehicleNumber: 'KA22A1003', dLat: 0.011, dLng: -0.004, offers: 8, rides: 35, acceptRate: 0.85, minsOnline: 210 },
  { username: 'driver4', name: 'Meera Desai', phone: '9800000004', vehicleType: 'SUV', vehicleNumber: 'KA22A1004', dLat: -0.013, dLng: -0.008, offers: 1, rides: 9, acceptRate: 0.92, minsOnline: 60 },
  { username: 'driver5', name: 'Suresh Naik', phone: '9800000005', vehicleType: 'HATCHBACK', vehicleNumber: 'KA22A1005', dLat: 0.017, dLng: 0.009, offers: 12, rides: 48, acceptRate: 0.78, minsOnline: 300 },
  { username: 'driver6', name: 'Kavita Rao', phone: '9800000006', vehicleType: 'SEDAN', vehicleNumber: 'KA22A1006', dLat: -0.018, dLng: 0.012, offers: 5, rides: 19, acceptRate: 0.88, minsOnline: 150 },
  { username: 'driver7', name: 'Arjun Shetty', phone: '9800000007', vehicleType: 'AUTO', vehicleNumber: 'KA22A1007', dLat: 0.021, dLng: -0.014, offers: 2, rides: 11, acceptRate: 0.82, minsOnline: 90 },
  { username: 'driver8', name: 'Neha Kulkarni', phone: '9800000008', vehicleType: 'HATCHBACK', vehicleNumber: 'KA22A1008', dLat: -0.023, dLng: -0.016, offers: 10, rides: 40, acceptRate: 0.75, minsOnline: 260 },
  { username: 'driver9', name: 'Manoj Verma', phone: '9800000009', vehicleType: 'SUV', vehicleNumber: 'KA22A1009', dLat: 0.026, dLng: 0.011, offers: 6, rides: 27, acceptRate: 0.84, minsOnline: 180 },
  { username: 'driver10', name: 'Deepa Hegde', phone: '9800000010', vehicleType: 'SEDAN', vehicleNumber: 'KA22A1010', dLat: -0.005, dLng: -0.022, offers: 0, rides: 5, acceptRate: 0.96, minsOnline: 30 },
];

const DEMO_PASSENGERS = [
  { username: 'passenger1', name: 'Ananya Sharma', phone: '9900000001' },
  { username: 'passenger2', name: 'Rohan Mehta', phone: '9900000002' },
  { username: 'passenger3', name: 'Priya Nair', phone: '9900000003' },
];

export async function seedDemoData(pool = defaultPool, cfg = defaultConfig) {
  const passwordHash = await bcrypt.hash('demo1234', 10);

  return withTransaction(async (client) => {
    await client.query(`
      TRUNCATE TABLE
        idempotency_keys,
        notifications,
        ride_events,
        offers,
        rides,
        drivers,
        users
      RESTART IDENTITY CASCADE
    `);

    for (const p of DEMO_PASSENGERS) {
      await client.query(
        `INSERT INTO users (username, password_hash, role, name, phone)
         VALUES ($1, $2, 'passenger', $3, $4)`,
        [p.username, passwordHash, p.name, p.phone]
      );
    }

    await client.query(
      `INSERT INTO users (username, password_hash, role, name, phone)
       VALUES ('admin', $1, 'admin', 'Dispatch Admin', '9700000000')`,
      [passwordHash]
    );

    for (const d of DEMO_DRIVERS) {
      const userRes = await client.query(
        `INSERT INTO users (username, password_hash, role, name, phone)
         VALUES ($1, $2, 'driver', $3, $4)
         RETURNING id`,
        [d.username, passwordHash, d.name, d.phone]
      );
      const userId = userRes.rows[0].id;
      const lat = Number((cfg.CITY_CENTER_LAT + d.dLat).toFixed(6));
      const lng = Number((cfg.CITY_CENTER_LNG + d.dLng).toFixed(6));

      await client.query(
        `INSERT INTO drivers (
           user_id, vehicle_type, vehicle_number, lat, lng, status,
           online_since, last_heartbeat, offers_received, rides_completed, accept_rate
         )
         VALUES (
           $1, $2, $3, $4, $5, 'AVAILABLE',
           now() - ($6 || ' minutes')::interval,
           now(),
           $7, $8, $9
         )`,
        [
          userId,
          d.vehicleType,
          d.vehicleNumber,
          lat,
          lng,
          String(d.minsOnline),
          d.offers,
          d.rides,
          d.acceptRate,
        ]
      );
    }

    return {
      passengers: DEMO_PASSENGERS.map((p) => p.username),
      drivers: DEMO_DRIVERS.map((d) => d.username),
      admin: ['admin'],
      password: 'demo1234',
    };
  }, pool);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDemoData()
    .then((creds) => {
      console.log('Seeded deterministic demo data.');
      console.log('Demo credentials (password: demo1234):');
      console.log(`  Passengers : ${creds.passengers.join(', ')}`);
      console.log(`  Drivers    : ${creds.drivers.join(', ')}`);
      console.log(`  Admin      : ${creds.admin.join(', ')}`);
      return defaultPool.end();
    })
    .catch(async (err) => {
      console.error('Seed failed:', err);
      await defaultPool.end();
      process.exit(1);
    });
}
