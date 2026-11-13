import { DriverRanker } from './base.js';

export class NearestRanker extends DriverRanker {
  rank(ctx) {
    const radiusKm = ctx?.config?.SEARCH_RADIUS_KM || 5;
    const candidates = Array.isArray(ctx?.candidates) ? [...ctx.candidates] : [];

    candidates.sort(
      (a, b) =>
        a.distanceKm - b.distanceKm ||
        a.etaMin - b.etaMin ||
        Number(a.driver.id) - Number(b.driver.id)
    );

    return candidates.map(({ driver, distanceKm, etaMin }) => {
      const rawScore = 100 * (1 - distanceKm / radiusKm);
      const score = Math.max(0, Math.min(100, Number(rawScore.toFixed(2))));
      const roundedEta = Math.max(1, Math.round(etaMin));

      return {
        driver,
        score,
        distanceKm: Number(distanceKm.toFixed(2)),
        etaMin: Number(etaMin.toFixed(1)),
        factors: { distance: score },
        reason: `Nearest available driver (${distanceKm.toFixed(1)} km, ETA ${roundedEta} min)`,
      };
    });
  }
}
