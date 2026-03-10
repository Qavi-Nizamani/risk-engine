// Dev-friendly short TTLs — bump these for production
export const ACTIVE_INCIDENT_TTL_SECONDS = 60; // errors must keep coming to stay OPEN
export const INVESTIGATING_INCIDENT_TTL_SECONDS = 300; // full quiet window; resets on re-spike
export const LOCK_TTL_MS = 10_000; // incident creation lock
export const SWEEP_LOCK_TTL_MS = 30_000; // per-incident sweep lock (> sweep interval of 10 s)
// Resolve when ≤20% of the investigating TTL remains so threshold always
// scales with the TTL and never exceeds it (avoids premature deletion).
export const RESOLVE_THRESHOLD_MS = Math.floor(
  INVESTIGATING_INCIDENT_TTL_SECONDS * 1000 * 0.2,
);
export const ERRORS_COUNT_LIMIT = 51;

/**
 * Lua: atomically read PTTL and conditionally delete the key.
 *
 * Returns:
 *  -2  → key already gone (expired between SCAN and this call) — skip
 *   0  → TTL was within threshold; key deleted — caller should resolve
 *  >0  → TTL still high in ms — caller should skip and check next sweep
 */
export const CHECK_AND_DELETE_LUA = `
local ttl = redis.call('PTTL', KEYS[1])
if ttl == -2 then return -2 end
if ttl <= tonumber(ARGV[1]) then
  redis.call('DEL', KEYS[1])
  return 0
end
return ttl
`;
