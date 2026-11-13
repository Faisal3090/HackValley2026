export async function getZoneIntelligence(_lat, _lng) {
  try {
    return {
      zoneId: null,
      demandLevel: 'NORMAL',
      demandSupplyRatio: 1,
      surgeMultiplier: 1,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('Zone intelligence unavailable, using default:', err.message);
    return {
      zoneId: null,
      demandLevel: 'NORMAL',
      demandSupplyRatio: 1,
      surgeMultiplier: 1,
      generatedAt: new Date().toISOString(),
    };
  }
}
