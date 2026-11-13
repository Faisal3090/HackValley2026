export function zoneSurgeModifier(fare, ctx) {
  const multiplier = ctx?.zone?.surgeMultiplier ?? 1;
  return {
    fare: fare * multiplier,
    label: 'Zone surge',
    multiplier,
  };
}

export const fareModifiers = [zoneSurgeModifier];
