import { DriverRanker } from './base.js';

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export class FairnessRanker extends DriverRanker {
  rank(ctx) {
    const candidates = Array.isArray(ctx?.candidates) ? [...ctx.candidates] : [];
    const radiusKm = ctx?.config?.SEARCH_RADIUS_KM || 5;
    const now = ctx?.now ? new Date(ctx.now) : new Date();

    return candidates
      .map(({ driver, distanceKm, etaMin }) => {
        const idleMinutes = driver.onlineSince
          ? Math.max(0, (now.getTime() - new Date(driver.onlineSince).getTime()) / 60000)
          : 0;
        const etaScore = 1 - clamp(etaMin / 30);
        const distanceScore = 1 - clamp(distanceKm / radiusKm);
        const idleScore = clamp(idleMinutes / 30);
        const completionLoad = clamp(Number(driver.ridesCompleted || 0) / 50);
        const acceptanceScore = clamp(Number(driver.acceptRate ?? 0.8));
        const fairnessScore = clamp(idleScore * 0.55 + (1 - completionLoad) * 0.25 + acceptanceScore * 0.20);
        const score = 100 * (
          etaScore * 0.50 +
          distanceScore * 0.20 +
          fairnessScore * 0.30
        );

        return {
          driver,
          score: Number(score.toFixed(2)),
          distanceKm: Number(distanceKm.toFixed(2)),
          etaMin: Number(etaMin.toFixed(1)),
          factors: {
            eta: Number((etaScore * 100).toFixed(1)),
            distance: Number((distanceScore * 100).toFixed(1)),
            idleTime: Number((idleScore * 100).toFixed(1)),
            fairness: Number((fairnessScore * 100).toFixed(1)),
          },
          reason: `ETA ${Number(etaMin).toFixed(1)} min; fairness ${Math.round(fairnessScore * 100)}%; idle ${Math.round(idleMinutes)} min`,
        };
      })
      .sort((a, b) => b.score - a.score || a.etaMin - b.etaMin || Number(a.driver.id) - Number(b.driver.id));
  }
}
