import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errors.js';
import { createRequireAuth } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';

const searchSchema = z.object({
  text: z.string().trim().min(3).max(200),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export function createPlacesRouter({ pool, config }) {
  const router = Router();
  const requireAuth = createRequireAuth({ pool, cfg: config });

  router.get(
    '/search',
    requireAuth,
    validateQuery(searchSchema),
    asyncHandler(async (req, res) => {
      if (!config.GEOAPIFY_API_KEY) {
        throw new AppError(
          503,
          'PLACE_SEARCH_NOT_CONFIGURED',
          'Place search is not configured. Set GEOAPIFY_API_KEY on the server.'
        );
      }

      const { text, lat, lng } = req.validatedQuery;
      const url = new URL('https://api.geoapify.com/v1/geocode/autocomplete');
      url.searchParams.set('text', text);
      url.searchParams.set('limit', '5');
      url.searchParams.set('apiKey', config.GEOAPIFY_API_KEY);
      if (lat !== undefined && lng !== undefined) {
        url.searchParams.set('bias', `proximity:${lng},${lat}`);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      let response;
      try {
        response = await fetch(url, { signal: controller.signal });
      } catch (error) {
        if (error.name === 'AbortError') {
          throw new AppError(504, 'PLACE_SEARCH_TIMEOUT', 'Place search timed out');
        }
        throw new AppError(502, 'PLACE_SEARCH_UNAVAILABLE', 'Place search is unavailable');
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        console.error(`Geoapify place search failed with HTTP ${response.status}`);
        throw new AppError(502, 'PLACE_SEARCH_PROVIDER_ERROR', 'Place search provider failed');
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new AppError(502, 'PLACE_SEARCH_INVALID_RESPONSE', 'Place search returned invalid data');
      }

      const results = (Array.isArray(payload?.features) ? payload.features : [])
        .map((feature) => feature?.properties)
        .filter(
          (place) =>
            typeof place?.formatted === 'string' &&
            Number.isFinite(place.lat) &&
            Number.isFinite(place.lon)
        )
        .map((place) => ({
          label: place.formatted,
          lat: place.lat,
          lng: place.lon,
        }));

      res.json({ results });
    })
  );

  return router;
}
