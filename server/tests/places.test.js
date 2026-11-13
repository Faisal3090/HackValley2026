import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTestContext,
  resetTestDb,
} from './helpers/testDb.js';

describe('Geoapify place search', () => {
  const { app, pool, config } = createTestContext({
    GEOAPIFY_API_KEY: 'test-geoapify-key',
  });
  let token;

  beforeAll(async () => {
    await resetTestDb(pool);
  });

  beforeEach(async () => {
    await resetTestDb(pool);
    const registration = await request(app).post('/api/v1/auth/register').send({
      username: 'place-search-user',
      email: 'place-search@example.com',
      password: 'secret123',
      role: 'passenger',
      name: 'Place Search User',
    });
    expect(registration.status).toBe(201);
    token = registration.body.token;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('searches Geoapify with the server key and returns normalized places', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        features: [
          {
            properties: {
              formatted: 'Belagavi Railway Station, Belagavi, India',
              lat: 15.85,
              lon: 74.5,
            },
          },
        ],
      }),
    });

    try {
      const response = await request(app)
        .get('/api/v1/places/search')
        .query({ text: 'Belagavi railway station', lat: 15.84, lng: 74.49 })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.results).toEqual([
        {
          label: 'Belagavi Railway Station, Belagavi, India',
          lat: 15.85,
          lng: 74.5,
        },
      ]);

      const requestedUrl = new URL(fetchSpy.mock.calls[0][0]);
      expect(requestedUrl.hostname).toBe('api.geoapify.com');
      expect(requestedUrl.pathname).toBe('/v1/geocode/autocomplete');
      expect(requestedUrl.searchParams.get('text')).toBe('Belagavi railway station');
      expect(requestedUrl.searchParams.get('apiKey')).toBe('test-geoapify-key');
      expect(requestedUrl.searchParams.get('bias')).toBe('proximity:74.49,15.84');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('requires authentication and reports an unconfigured provider', async () => {
    const unauthenticated = await request(app)
      .get('/api/v1/places/search')
      .query({ text: 'Belagavi station' });
    expect(unauthenticated.status).toBe(401);

    const apiKey = config.GEOAPIFY_API_KEY;
    config.GEOAPIFY_API_KEY = '';
    try {
      const response = await request(app)
        .get('/api/v1/places/search')
        .query({ text: 'Belagavi station' })
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(503);
      expect(response.body.code).toBe('PLACE_SEARCH_NOT_CONFIGURED');
    } finally {
      config.GEOAPIFY_API_KEY = apiKey;
    }
  });
});
