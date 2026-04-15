/**
 * Format a duration in seconds as a compact human-readable string.
 *   0    -> "0s"
 *   45   -> "45s"
 *   94   -> "1m 34s"
 *   3600 -> "1h 0m 0s"
 */
export function formatDurationShort(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
