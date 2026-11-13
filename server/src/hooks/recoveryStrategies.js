export async function defaultRecoveryStrategy({
  client,
  ride,
  reason,
  events,
  config,
  pool,
  recordEvent,
  markUnfulfilled,
  createOffer,
}) {
  if (ride.attempt_count >= config.MAX_ATTEMPTS) {
    await markUnfulfilled(client, ride, 'max_attempts_reached', events);
    return { recovered: false, status: 'UNFULFILLED' };
  }

  const reassignEvent = await recordEvent(client, {
    eventType: 'RIDE_REASSIGNED',
    rideId: ride.id,
    payload: {
      reason,
      attempt: ride.attempt_count + 1,
    },
  });
  events.push(reassignEvent);

  const offerResult = await createOffer(ride.id, { client, events, config, pool });
  return {
    recovered: offerResult?.rideStatus === 'DRIVER_OFFERED',
    status: offerResult?.rideStatus ?? ride.status,
  };
}

export const recoveryStrategies = {
  default: defaultRecoveryStrategy,
};
