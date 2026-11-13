import { NearestRanker } from './nearest.js';
import { FairnessRanker } from './fairness.js';

export const registry = {
  nearest: new NearestRanker(),
  fairness: new FairnessRanker(),
};

export function registerRanker(name, instance) {
  if (!name || typeof name !== 'string') {
    throw new Error('Ranker name must be a non-empty string');
  }
  if (!instance || typeof instance.rank !== 'function') {
    throw new Error(`Ranker "${name}" must implement a rank(ctx) method`);
  }
  registry[name] = instance;
}

export function getRanker(name) {
  const ranker = registry[name];
  if (!ranker) {
    const available = Object.keys(registry).join(', ');
    throw new Error(`Unknown ranker "${name}". Available rankers: ${available}`);
  }
  return ranker;
}

export function rankWithFallback(ctx) {
  const cfg = ctx?.config ?? {};
  const nearest = getRanker('nearest');

  if (cfg.FAIR_DISPATCH_ENABLED === false) {
    return {
      ranked: nearest.rank(ctx),
      rankerUsed: 'nearest',
      fellBack: false,
    };
  }

  const targetName = cfg.RANKER || 'nearest';
  try {
    const ranker = getRanker(targetName);
    const ranked = ranker.rank(ctx);
    if (!Array.isArray(ranked)) {
      throw new Error(`Ranker "${targetName}" did not return an array`);
    }
    return {
      ranked,
      rankerUsed: targetName,
      fellBack: false,
    };
  } catch (err) {
    console.warn(`Ranker "${targetName}" failed, falling back to nearest:`, err.message);
    return {
      ranked: nearest.rank(ctx),
      rankerUsed: 'nearest',
      fellBack: true,
    };
  }
}
